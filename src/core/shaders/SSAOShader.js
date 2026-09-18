/**
 * SSAOShader — depth-only ambient occlusion.
 *
 * The scene is lit almost entirely by a handful of weak practical lights, so
 * contact shadows are what actually sell the geometry. We derive view-space
 * normals from depth derivatives instead of rendering a normal buffer, which
 * keeps this to a single extra pass. The banding that costs us is hidden by the
 * blur pass and the film grain.
 */

export const SSAOShader = {
  name: 'SSAOShader',

  uniforms: {
    tDepth:       { value: null },
    uProjection:  { value: null },
    uInvProjection: { value: null },
    uResolution:  { value: [1920, 1080] },
    uRadius:      { value: 0.5 },
    uIntensity:   { value: 1.0 },
    uBias:        { value: 0.022 },
    uNear:        { value: 0.06 },
    uFar:         { value: 400 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform highp sampler2D tDepth;
    uniform mat4  uProjection;
    uniform mat4  uInvProjection;
    uniform vec2  uResolution;
    uniform float uRadius;
    uniform float uIntensity;
    uniform float uBias;

    varying vec2 vUv;

    vec3 viewPosFromDepth(vec2 uv, float depth) {
      vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 v = uInvProjection * ndc;
      return v.xyz / v.w;
    }

    // 12 points on a hemisphere-ish spiral. A fixed kernel rotated per-pixel
    // costs less than sampling a noise texture and looks the same after blur.
    const int KERNEL = 12;
    vec3 kernelDir(int i) {
      float fi = float(i);
      float a = fi * 2.3999632;              // golden angle
      float z = 1.0 - (fi + 0.5) / float(KERNEL);
      float r = sqrt(max(0.0, 1.0 - z * z));
      return vec3(cos(a) * r, sin(a) * r, z);
    }

    void main() {
      float depth = texture2D(tDepth, vUv).x;
      if (depth >= 0.9999) {
        gl_FragColor = vec4(1.0);
        return;
      }

      vec3 origin = viewPosFromDepth(vUv, depth);

      // Normal from depth derivatives. Using the smaller of the forward and
      // backward difference avoids fattening the normal across depth edges.
      vec2 texel = 1.0 / uResolution;
      vec3 px = viewPosFromDepth(vUv + vec2(texel.x, 0.0), texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x);
      vec3 mx = viewPosFromDepth(vUv - vec2(texel.x, 0.0), texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x);
      vec3 py = viewPosFromDepth(vUv + vec2(0.0, texel.y), texture2D(tDepth, vUv + vec2(0.0, texel.y)).x);
      vec3 my = viewPosFromDepth(vUv - vec2(0.0, texel.y), texture2D(tDepth, vUv - vec2(0.0, texel.y)).x);

      vec3 ddx = (abs(px.z - origin.z) < abs(origin.z - mx.z)) ? (px - origin) : (origin - mx);
      vec3 ddy = (abs(py.z - origin.z) < abs(origin.z - my.z)) ? (py - origin) : (origin - my);
      vec3 normal = normalize(cross(ddx, ddy));

      // Per-pixel rotation of the kernel.
      float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
      float cr = cos(rot), sr = sin(rot);
      mat2 rotM = mat2(cr, -sr, sr, cr);

      // Build a tangent frame around the surface normal.
      vec3 up = abs(normal.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 tangent = normalize(cross(up, normal));
      vec3 bitangent = cross(normal, tangent);
      mat3 tbn = mat3(tangent, bitangent, normal);

      float occlusion = 0.0;
      for (int i = 0; i < KERNEL; i++) {
        vec3 dir = kernelDir(i);
        dir.xy = rotM * dir.xy;
        vec3 samplePos = origin + (tbn * dir) * uRadius;

        vec4 offset = uProjection * vec4(samplePos, 1.0);
        if (offset.w <= 0.0) continue;
        vec2 sampleUv = (offset.xy / offset.w) * 0.5 + 0.5;
        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

        float sampleDepth = texture2D(tDepth, sampleUv).x;
        if (sampleDepth >= 0.9999) continue;
        float sceneZ = viewPosFromDepth(sampleUv, sampleDepth).z;

        // View space is right-handed with -Z forward, so "in front of" is >.
        if (sceneZ >= samplePos.z + uBias) {
          // Fade out occluders that are far behind: a distant wall must not
          // darken a nearby object just because it lines up in screen space.
          float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(origin.z - sceneZ)));
          occlusion += rangeCheck;
        }
      }

      float ao = 1.0 - (occlusion / float(KERNEL)) * uIntensity;
      gl_FragColor = vec4(clamp(ao, 0.0, 1.0));
    }
  `,
};

/**
 * Separable cross-bilateral blur for the AO buffer, plus the composite back
 * into the lit colour. Run twice (horizontal, then vertical) with uDirection.
 */
export const SSAOBlurShader = {
  name: 'SSAOBlurShader',

  uniforms: {
    tDiffuse:    { value: null },   // colour, passed through untouched
    tAO:         { value: null },
    tDepth:      { value: null },
    uResolution: { value: [1920, 1080] },
    uDirection:  { value: [1, 0] },
    uComposite:  { value: 0 },      // 1 on the final pass: multiply AO in
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform sampler2D tAO;
    uniform highp sampler2D tDepth;
    uniform vec2  uResolution;
    uniform vec2  uDirection;
    uniform int   uComposite;

    varying vec2 vUv;

    void main() {
      vec2 texel = uDirection / uResolution;
      float centerDepth = texture2D(tDepth, vUv).x;

      float sum = 0.0;
      float wsum = 0.0;

      // 9-tap gaussian. The weight is evaluated analytically rather than read
      // from a lookup array, because GLSL ES 1.00 (which is what three compiles
      // ShaderMaterial to) forbids indexing a const array with a loop variable.
      const float sigma = 2.0;

      for (int i = -4; i <= 4; i++) {
        float fi = float(i);
        vec2 uv = vUv + texel * fi;
        float w = exp(-(fi * fi) / (2.0 * sigma * sigma));

        // Bilateral term: don't blur AO across a depth discontinuity, or the
        // occlusion bleeds off objects onto the wall behind them.
        float d = texture2D(tDepth, uv).x;
        w *= exp(-abs(d - centerDepth) * 900.0);

        sum += texture2D(tAO, uv).r * w;
        wsum += w;
      }

      float ao = wsum > 0.0 ? sum / wsum : texture2D(tAO, vUv).r;

      if (uComposite == 1) {
        vec4 color = texture2D(tDiffuse, vUv);
        gl_FragColor = vec4(color.rgb * ao, color.a);
      } else {
        gl_FragColor = vec4(ao, ao, ao, 1.0);
      }
    }
  `,
};
