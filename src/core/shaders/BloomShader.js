/**
 * BloomShader.js — a progressive mip-chain bloom.
 *
 * Replaces `UnrealBloomPass`, which was the wrong shape of bloom for this
 * game. That pass blurs five fixed-size mips and adds them with tuned weights;
 * the result has a recognisable radius, and everything bright in frame wears
 * the same halo whatever size it is. In a building lit entirely by small hot
 * sources — bare filaments, a kiln mouth, the glow through a lens — that reads
 * as a sticker on the light rather than as light.
 *
 * This is the downsample/upsample chain from Jimenez's Call of Duty
 * presentation instead. Each downsample is a 13-tap filter that is stable
 * under motion; each upsample is a 9-tap tent added back onto the level above,
 * so the final spread is the sum of every scale at once. There is no radius
 * parameter because there is no single radius: a filament produces a tight
 * core with a very wide, very faint skirt, which is what a real lens does and
 * what makes a small bright thing feel physically bright.
 *
 * It is also cheaper. The chain is a handful of tiny draws, most of them at a
 * sixteenth resolution or below, against UnrealBloomPass's five separable
 * gaussians at larger sizes.
 *
 * The threshold uses a soft knee rather than a hard cut. A hard threshold
 * makes bloom pop on and off as a light crosses it — very visible here, where
 * the practicals flicker on purpose.
 */

export const BloomPrefilterShader = {
  uniforms: {
    tDiffuse: { value: null },
    uThreshold: { value: 0.8 },
    uKnee: { value: 0.5 },
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
    uniform sampler2D tDiffuse;
    uniform float uThreshold;
    uniform float uKnee;
    varying vec2 vUv;

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float brightness = max(c.r, max(c.g, c.b));

      // Soft knee: a quadratic ramp across a band centred on the threshold,
      // so a light brightening through it fades in rather than snapping on.
      float knee = uThreshold * uKnee;
      float soft = clamp(brightness - uThreshold + knee, 0.0, 2.0 * knee);
      soft = soft * soft / (4.0 * knee + 1e-5);
      float weight = max(soft, brightness - uThreshold) / max(brightness, 1e-5);

      // Half-float buffers carry inf through a blur as a block of white, so
      // the ceiling is here rather than in every downsample.
      gl_FragColor = vec4(min(c * weight, vec3(24.0)), 1.0);
    }
  `,
};

export const BloomDownShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: [1 / 512, 1 / 512] },
  },
  vertexShader: BloomPrefilterShader.vertexShader,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;

    // The 13-tap "dual filter" downsample. A plain box halves the resolution
    // and keeps the aliasing, which then crawls in the bloom as the camera
    // moves — the most obvious artefact of a cheap chain. The extra centre
    // cluster weights the middle heavily enough to suppress it.
    void main() {
      vec2 t = uTexel;

      vec3 a = texture2D(tDiffuse, vUv + vec2(-2.0, 2.0) * t).rgb;
      vec3 b = texture2D(tDiffuse, vUv + vec2( 0.0, 2.0) * t).rgb;
      vec3 c = texture2D(tDiffuse, vUv + vec2( 2.0, 2.0) * t).rgb;

      vec3 d = texture2D(tDiffuse, vUv + vec2(-2.0, 0.0) * t).rgb;
      vec3 e = texture2D(tDiffuse, vUv).rgb;
      vec3 f = texture2D(tDiffuse, vUv + vec2( 2.0, 0.0) * t).rgb;

      vec3 g = texture2D(tDiffuse, vUv + vec2(-2.0,-2.0) * t).rgb;
      vec3 h = texture2D(tDiffuse, vUv + vec2( 0.0,-2.0) * t).rgb;
      vec3 i = texture2D(tDiffuse, vUv + vec2( 2.0,-2.0) * t).rgb;

      vec3 j = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * t).rgb;
      vec3 k = texture2D(tDiffuse, vUv + vec2( 1.0, 1.0) * t).rgb;
      vec3 l = texture2D(tDiffuse, vUv + vec2(-1.0,-1.0) * t).rgb;
      vec3 m = texture2D(tDiffuse, vUv + vec2( 1.0,-1.0) * t).rgb;

      vec3 result = e * 0.125;
      result += (a + c + g + i) * 0.03125;
      result += (b + d + f + h) * 0.0625;
      result += (j + k + l + m) * 0.125;

      gl_FragColor = vec4(result, 1.0);
    }
  `,
};

export const BloomUpShader = {
  uniforms: {
    tDiffuse: { value: null },   // the smaller level being spread upward
    uTexel: { value: [1 / 512, 1 / 512] },
    uRadius: { value: 1.0 },
  },
  vertexShader: BloomPrefilterShader.vertexShader,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uRadius;
    varying vec2 vUv;

    // A 9-tap tent. Additive blending puts it onto the level above, so each
    // step widens what is already there and the final spread is every scale
    // summed rather than a handful of discrete rings.
    void main() {
      vec2 t = uTexel * uRadius;

      vec3 result = texture2D(tDiffuse, vUv).rgb * 4.0;
      result += texture2D(tDiffuse, vUv + vec2(-1.0,  0.0) * t).rgb * 2.0;
      result += texture2D(tDiffuse, vUv + vec2( 1.0,  0.0) * t).rgb * 2.0;
      result += texture2D(tDiffuse, vUv + vec2( 0.0, -1.0) * t).rgb * 2.0;
      result += texture2D(tDiffuse, vUv + vec2( 0.0,  1.0) * t).rgb * 2.0;
      result += texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * t).rgb;
      result += texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * t).rgb;
      result += texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * t).rgb;
      result += texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * t).rgb;

      gl_FragColor = vec4(result / 16.0, 1.0);
    }
  `,
};

export const BloomCombineShader = {
  uniforms: {
    tDiffuse: { value: null },   // the lit scene
    tBloom: { value: null },
    uStrength: { value: 0.55 },
  },
  vertexShader: BloomPrefilterShader.vertexShader,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uStrength;
    varying vec2 vUv;

    void main() {
      vec3 scene = texture2D(tDiffuse, vUv).rgb;
      vec3 bloom = texture2D(tBloom, vUv).rgb;
      gl_FragColor = vec4(scene + bloom * uStrength, 1.0);
    }
  `,
};
