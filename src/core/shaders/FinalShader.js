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

    // ---- AgX tonemap ---------------------------------------------------------
    //
    // Replaces the Narkowicz ACES fit, which was wrong for this game in a
    // specific and visible way. That curve pushes saturated highlights toward
    // their own hue as they clip, so a bright tungsten practical — of which
    // this building is entirely made — blew out to a flat orange disc with a
    // hard edge, and the kiln at temperature went the same way in red. AgX
    // desaturates on the way up instead, the way film does: a hot filament
    // goes white at the centre and keeps its colour in the falloff, so the
    // light reads as bright rather than as a coloured hole in the picture.
    //
    // Implemented as the standard 6x6x6 log-encoded approximation: rotate into
    // the AgX working space, take a log2 exposure range, apply a sigmoid, and
    // rotate back. The polynomial is the usual Troy Sobotka fit.
    const mat3 AGX_IN = mat3(
      0.8424, 0.0784, 0.0792,
      0.0423, 0.8789, 0.0788,
      0.0424, 0.0784, 0.8793
    );
    const mat3 AGX_OUT = mat3(
       1.1968, -0.0980, -0.0990,
      -0.0528,  1.1519, -0.0991,
      -0.0529, -0.0980,  1.1511
    );

    vec3 agxCurve(vec3 x) {
      // Sobotka's 6th-order fit of the AgX sigmoid, in x^6 down to the
      // constant. The order matters: written as a 4th-order polynomial by
      // mistake this evaluates to 0.43 at x = 0, which lifts every black in
      // the game to mid-grey and turns a horror game into an overcast
      // afternoon. Correct, it passes through -0.00232 at zero.
      vec3 x2 = x * x;
      vec3 x4 = x2 * x2;
      return  15.5     * x4 * x2
           -  40.14    * x4 * x
           +  31.96    * x4
           -   6.868   * x2 * x
           +   0.4298  * x2
           +   0.1191  * x
           -   0.00232;
    }

    /**
     * The look, applied in the encoded space before the output rotation.
     *
     * Base AgX is deliberately flat: its log range spans sixteen and a half
     * stops, so it lifts deep shadows a long way in exchange for holding on
     * to highlight detail. That trade is right for a rendering reference and
     * completely wrong here — with it the theatre reads as "dimly lit" rather
     * than "black, with three pools of light in it", which is the entire
     * atmosphere of the game.
     *
     * So the highlight behaviour is kept and the contrast is put back: an
     * ASC-CDL power pushes the toe back down while barely touching anything
     * above about 0.8, and a small saturation lift compensates for the
     * desaturation the curve applies on the way up. This is what Blender
     * ships as the "Punchy" look and it exists for the same reason.
     */
    vec3 agxLook(vec3 c) {
      const float POWER  = 1.5;     // contrast: crushes the toe, spares the shoulder
      const float OFFSET = -0.004;  // a hair of lift-removal so black is black
      const float SAT    = 1.22;

      c = clamp(c + OFFSET, 0.0, 1.0);
      c = pow(c, vec3(POWER));
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return clamp(luma + (c - luma) * SAT, 0.0, 1.0);
    }

    vec3 agx(vec3 color) {
      const float MIN_EV = -12.47393;
      const float MAX_EV =   4.026069;

      color = AGX_IN * max(color, vec3(0.0));
      color = clamp((log2(color + 1e-8) - MIN_EV) / (MAX_EV - MIN_EV), 0.0, 1.0);
      color = agxCurve(color);
      color = agxLook(color);
      color = AGX_OUT * color;
      return clamp(color, 0.0, 1.0);
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
      color = agx(color);
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

      // uFade is signed: positive fades to black (transitions, death), negative
      // flares to white (the Veilmask overloading and blinding the player).
      if (uFade >= 0.0) {
        color *= (1.0 - uFade);
      } else {
        color = mix(color, vec3(1.0), min(-uFade, 1.0));
      }

      // --- dither ------------------------------------------------------------
      //
      // The last thing before the 8-bit buffer, and on this game one of the
      // largest visible wins available for the cost. Almost every frame here
      // is a near-black gradient — a torch falling off across plaster, the
      // unlit half of a room — and 8 bits over that range quantises into
      // visible contour rings. Adding a sub-LSB offset before the hardware
      // rounds turns each ring edge into noise, which the eye integrates back
      // into the smooth ramp that was there in the float buffer.
      //
      // An ordered 4x4 Bayer matrix rather than white noise: its pattern is
      // fixed in screen space, so unlike a random dither it does not fizz
      // frame to frame, and unlike a blue-noise texture it costs no sampler.
      // The threshold is scaled to one 8-bit step, so it is invisible as
      // pattern and only ever decides which side of a rounding boundary a
      // pixel falls on.
      float bayer = mod(
        4.0 * mod(floor(gl_FragCoord.y), 2.0) + 2.0 * mod(floor(gl_FragCoord.x), 2.0)
        + mod(floor(gl_FragCoord.y * 0.5), 2.0) + 8.0 * mod(floor(gl_FragCoord.x * 0.5), 2.0),
        16.0
      ) / 16.0;
      color += (bayer - 0.5) / 255.0;

      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};
