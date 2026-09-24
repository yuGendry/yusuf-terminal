/**
 * VolumetricShader.js — the torch beam, as actual volume.
 *
 * The game already had "god rays": a translucent cone mesh stuck on the front
 * of some lights. That works from one angle and falls apart from every other —
 * it does not react to what is in the beam, it has a visible silhouette when
 * you look along it, and it cannot be walked through.
 *
 * This raymarches the light instead. For each pixel the ray from the camera to
 * whatever the scene depth says is there is sampled at intervals; at each
 * sample the spotlight's contribution is worked out, tested against the
 * light's own shadow map, and accumulated. So the beam is occluded by the
 * things inside it — a stair rail throws a bar of shadow up the dust, a
 * doorway cuts a hard edge in the air, a puppet standing in the beam casts a
 * solid shaft of darkness behind it. That is the single most atmospheric thing
 * available to a game where you carry a torch through a dark building, and
 * none of it can be faked with a cone.
 *
 * Three things make it affordable:
 *
 *   - It runs at half resolution. Volumetric scattering is very low frequency;
 *     nobody can tell.
 *   - The march start is dithered per pixel, which converts banding into
 *     noise. Banding in a beam is obvious; noise at this amplitude is not.
 *   - The result goes through TAA with the rest of the frame, which cleans the
 *     remaining noise up for free. That is why the step count can be as low as
 *     it is — without the temporal filter this would need three times as many.
 *
 * Henyey-Greenstein for the phase function, strongly forward-scattering, so
 * looking into the beam is much brighter than looking across it. That
 * asymmetry is most of what sells it as a physical medium rather than a fog
 * volume.
 */

export const VolumetricShader = {
  uniforms: {
    tDepth: { value: null },
    tShadow: { value: null },

    uInvViewProj: { value: null },
    uCameraPos: { value: [0, 0, 0] },

    uLightPos: { value: [0, 0, 0] },
    uLightDir: { value: [0, -1, 0] },
    uLightColor: { value: [1, 0.94, 0.84] },
    uLightIntensity: { value: 0 },
    uLightRange: { value: 26 },
    uCosOuter: { value: 0.8 },
    uCosInner: { value: 0.9 },

    uShadowMatrix: { value: null },
    uHasShadow: { value: 0 },

    /**
     * Scattering coefficient.
     *
     * Small because it is multiplied by the light's intensity, which is in
     * candela: the torch is 95, so this number is five orders of magnitude
     * away from anything that looks like a fraction. The first attempt used
     * 0.22 and produced a white screen.
     *
     * Calibrated against the actual integral rather than by eye. Marching a
     * ten-metre corridor, the inverse-square terms sum to about 1.9 and the
     * phase function contributes about 0.6, so the bracket is ~1.2; at a step
     * length of 0.6 and an intensity of 95 that leaves roughly 68x. Targeting
     * a peak near 0.1 — low, because this is *added* to a wall the same torch
     * is already lighting to near white, and the bloom chain then picks up
     * whatever the sum comes to.
     */
    uDensity: { value: 0.0012 },
    /**
     * How far in front of the camera the march starts.
     *
     * The torch is held at the camera, so the first samples sit essentially
     * on top of the light source, where the inverse-square term is at its
     * maximum and the cone test always passes. Marching from zero therefore
     * dumps the brightest possible sample into every pixel of the beam and
     * blows the centre of the screen out. Starting clear of the player's own
     * head costs nothing visible — there is no air to light in there.
     */
    uNearClip: { value: 0.65 },
    uSteps: { value: 24 },
    uTime: { value: 0 },
    uResolution: { value: [640, 360] },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    precision highp float;

    uniform sampler2D tDepth;
    uniform sampler2D tShadow;

    uniform mat4 uInvViewProj;
    uniform vec3 uCameraPos;

    uniform vec3  uLightPos;
    uniform vec3  uLightDir;
    uniform vec3  uLightColor;
    uniform float uLightIntensity;
    uniform float uLightRange;
    uniform float uCosOuter;
    uniform float uCosInner;

    uniform mat4  uShadowMatrix;
    uniform float uHasShadow;

    uniform float uDensity;
    uniform float uNearClip;
    uniform int   uSteps;
    uniform float uTime;
    uniform vec2  uResolution;

    varying vec2 vUv;

    /**
     * three.js packs shadow depth into RGBA rather than using a depth texture,
     * so it has to be put back together by hand. These are the same weights
     * three's own packing.glsl uses; they must match exactly or every shadow
     * test is subtly wrong in a way that looks like acne.
     */
    float unpackDepth(vec4 rgba) {
      return dot(rgba, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
    }

    /** Henyey-Greenstein. g > 0 scatters forward, which is what dust does. */
    float phaseHG(float cosTheta, float g) {
      float g2 = g * g;
      float denom = 1.0 + g2 - 2.0 * g * cosTheta;
      return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 1e-4), 1.5));
    }

    /** Ordered dither for the march offset. Cheap, and stable in screen space. */
    float bayer(vec2 p) {
      return mod(
        4.0 * mod(floor(p.y), 2.0) + 2.0 * mod(floor(p.x), 2.0)
        + mod(floor(p.y * 0.5), 2.0) + 8.0 * mod(floor(p.x * 0.5), 2.0),
        16.0
      ) / 16.0;
    }

    void main() {
      if (uLightIntensity <= 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      float depth = texture2D(tDepth, vUv).x;

      // Reconstruct where the ray ends. At the far plane there is no surface,
      // so the march is capped at the light's range instead — otherwise a
      // pixel looking at nothing marches to the far clip and costs the same as
      // one looking at a wall for no visible gain.
      vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 world = uInvViewProj * clip;
      world /= world.w;

      vec3 rayDir = world.xyz - uCameraPos;
      float rayLen = length(rayDir);
      rayDir /= max(rayLen, 1e-4);
      if (depth >= 1.0) rayLen = uLightRange;
      rayLen = min(rayLen, uLightRange * 1.6);

      // Nothing to march if the surface is closer than the start of the volume.
      if (rayLen <= uNearClip) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      int steps = uSteps;
      float marchLen = rayLen - uNearClip;
      float stepLen = marchLen / float(steps);

      // Start clear of the camera, then dither by a fraction of a step.
      // Without the dither the sample planes are visible as concentric shells.
      float offset = uNearClip + bayer(gl_FragCoord.xy) * stepLen;

      vec3 accum = vec3(0.0);

      for (int i = 0; i < 64; i++) {
        if (i >= steps) break;

        vec3 p = uCameraPos + rayDir * (offset + float(i) * stepLen);

        vec3 toLight = uLightPos - p;
        float dist = length(toLight);
        if (dist > uLightRange) continue;
        vec3 l = toLight / max(dist, 1e-4);

        // Inside the cone? uLightDir points the way the torch is aimed, so the
        // sample is lit when the direction *from* the light to it agrees.
        float cosAngle = dot(-l, uLightDir);
        if (cosAngle < uCosOuter) continue;
        float cone = smoothstep(uCosOuter, uCosInner, cosAngle);

        // Physically-correct inverse square, matching the lights themselves.
        float atten = 1.0 / (1.0 + dist * dist);
        atten *= 1.0 - smoothstep(uLightRange * 0.75, uLightRange, dist);

        // Shadowed? This is what makes the beam interact with the room.
        float visible = 1.0;
        if (uHasShadow > 0.5) {
          vec4 sc = uShadowMatrix * vec4(p, 1.0);
          sc /= sc.w;
          if (sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0 && sc.z <= 1.0) {
            float mapDepth = unpackDepth(texture2D(tShadow, sc.xy));
            // A generous bias: this is a volume sample, not a surface, so
            // acne here shows up as flickering motes rather than as stripes,
            // and erring toward "lit" is far less noticeable than erring
            // toward "dark" in the middle of a torch beam.
            visible = step(sc.z - 0.0025, mapDepth);
          }
        }

        // g = 0.35 rather than the 0.55 that dust actually measures at. The
        // stronger the forward bias, the more the beam only exists when you
        // are looking down it — which is physically right and dramatically
        // wrong, because the shot that sells a torch is the one from the side
        // where you can see the shaft hanging in the air.
        float phase = phaseHG(dot(rayDir, -l), 0.35);
        accum += uLightColor * cone * atten * visible * phase;
      }

      // stepLen keeps this a Riemann sum, so changing the step count changes
      // the noise and the cost but not the brightness.
      accum *= uDensity * uLightIntensity * stepLen;

      // A ceiling. Standing with the torch pressed against a wall puts every
      // sample at minimum distance and maximum cone, and without this the
      // result is a white screen rather than a bright wall.
      accum = min(accum, vec3(1.2));

      gl_FragColor = vec4(max(accum, 0.0), 1.0);
    }
  `,
};

/** Upsample the half-res result and add it onto the lit scene. */
export const VolumetricCombineShader = {
  uniforms: {
    tDiffuse: { value: null },
    tVolume: { value: null },
    uTexel: { value: [1 / 640, 1 / 360] },
  },
  vertexShader: VolumetricShader.vertexShader,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tVolume;
    uniform vec2 uTexel;
    varying vec2 vUv;

    void main() {
      // A small tent on the way up. The volume is low frequency, so this is
      // enough to hide the half-resolution grid without a separate blur pass.
      vec3 v = texture2D(tVolume, vUv).rgb * 4.0;
      v += texture2D(tVolume, vUv + vec2( uTexel.x, 0.0)).rgb * 2.0;
      v += texture2D(tVolume, vUv + vec2(-uTexel.x, 0.0)).rgb * 2.0;
      v += texture2D(tVolume, vUv + vec2(0.0,  uTexel.y)).rgb * 2.0;
      v += texture2D(tVolume, vUv + vec2(0.0, -uTexel.y)).rgb * 2.0;
      v += texture2D(tVolume, vUv + uTexel).rgb;
      v += texture2D(tVolume, vUv - uTexel).rgb;
      v += texture2D(tVolume, vUv + vec2( uTexel.x, -uTexel.y)).rgb;
      v += texture2D(tVolume, vUv + vec2(-uTexel.x,  uTexel.y)).rgb;
      v /= 16.0;

      gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + v, 1.0);
    }
  `,
};
