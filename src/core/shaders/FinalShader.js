/**
 * FinalShader — the single "uber" grade pass that runs after bloom.
 *
 * Doing tonemapping, grading, lens distortion, chromatic aberration, vignette
 * and grain in one pass instead of five saves four full-screen reads, which on
 * an integrated GPU is the difference between 60 and 45 fps at 1080p.
 *
 * Order matters and mirrors a real lens: geometric distortion first (it bends
 * where we sample from), then per-channel offset (chromatic aberration is a
 * property of that same lens), then tonemap, then grade, then the artefacts
 * that live on the film rather than the lens (vignette, grain).
 */

export const FinalShader = {
  name: 'FinalShader',

  uniforms: {
    tDiffuse:        { value: null },
    uResolution:     { value: [1920, 1080] },
    uTime:           { value: 0 },

    uBrightness:     { value: 1.0 },
    uVignette:       { value: 0.6 },
    uGrain:          { value: 0.4 },
    uChroma:         { value: 0.4 },
    uDistortion:     { value: 0.0 },   // driven by the Veilmask
    uMask:           { value: 0.0 },   // 0 = mask off, 1 = fully worn
    uStrain:         { value: 0.0 },   // 0..1, drives the cracked/ill look
    uDamage:         { value: 0.0 },   // red pulse when hurt or chased
    uFade:           { value: 0.0 },   // 1 = fully black (transitions, deaths)
    uLensTint:       { value: [1, 1, 1] },
    uSaturation:     { value: 1.0 },
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
    uniform vec2  uResolution;
    uniform float uTime;
    uniform float uBrightness;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uChroma;
    uniform float uDistortion;
    uniform float uMask;
    uniform float uStrain;
    uniform float uDamage;
    uniform float uFade;
    uniform vec3  uLensTint;
    uniform float uSaturation;

    varying vec2 vUv;

    // ---- ACES filmic tonemap (Narkowicz fit) --------------------------------
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    vec3 toSRGB(vec3 c) {
      return mix(
        c * 12.92,
        1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
        step(0.0031308, c)
      );
    }

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);

      // --- barrel / pincushion distortion (the porcelain lens curvature) ----
      float k = uDistortion * 0.55 + uStrain * 0.10;
      if (abs(k) > 0.0001) {
        centered *= 1.0 + k * r2;
        uv = centered + 0.5;
      }

      // Sampling outside the frame after distortion would show garbage; mirror
      // the edge instead so the corners stay plausible.
      uv = mix(uv, clamp(uv, 0.0, 1.0), 0.999);

      // --- chromatic aberration ---------------------------------------------
      // Scales with r2 so the centre of frame stays sharp, like a real lens.
      float ca = (uChroma * 0.0035) * (1.0 + uStrain * 4.0 + uDamage * 3.0);
      vec3 color;
      if (ca > 0.00001) {
        vec2 dir = centered * r2 * 4.0;
        color.r = texture2D(tDiffuse, uv + dir * ca).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - dir * ca).b;
      } else {
        color = texture2D(tDiffuse, uv).rgb;
      }

      // --- exposure + tonemap ------------------------------------------------
      color *= uBrightness;
      color = aces(color);
      color = toSRGB(color);

      // --- grade -------------------------------------------------------------
      color *= uLensTint;

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      // Strain drains colour and pushes the image sickly green-grey.
      color = mix(color, vec3(luma) * vec3(0.86, 0.95, 0.88), uStrain * 0.5);

      // Damage pushes red into the shadows rather than flashing the whole frame.
      color = mix(color, vec3(0.42, 0.03, 0.03), uDamage * (1.0 - luma) * 0.8);

      // --- vignette ----------------------------------------------------------
      float vig = 1.0 - uVignette * smoothstep(0.18, 0.85, r2 * 1.9);
      vig *= 1.0 - uMask * smoothstep(0.05, 0.42, r2 * 1.9) * 0.55;
      color *= vig;

      // --- film grain --------------------------------------------------------
      if (uGrain > 0.001) {
        float n = hash(gl_FragCoord.xy + fract(uTime) * 1000.0);
        // Grain is strongest in the mid-tones, like real silver halide.
        float grainWeight = 1.0 - abs(luma * 2.0 - 1.0);
        color += (n - 0.5) * uGrain * 0.11 * (grainWeight * 0.8 + 0.2);
      }

      color *= (1.0 - uFade);

      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};
