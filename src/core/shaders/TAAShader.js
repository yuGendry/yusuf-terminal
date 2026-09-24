/**
 * TAAShader.js — temporal anti-aliasing.
 *
 * The camera's projection is nudged by a sub-pixel offset every frame, and
 * this pass folds each new frame into an accumulated history. Over eight
 * frames that amounts to eight samples per pixel, which is supersampling the
 * whole image for the cost of one blend — and it is the only anti-aliasing
 * here that also stabilises *shading* rather than just edges. That matters
 * more in this game than in most: the screen-space AO is noisy by
 * construction, the film grain is noise on purpose, and a dark room full of
 * thin geometry (rigging, stair treads, the strings on a marionette) crawls
 * and shimmers under every spatial filter. SMAA smooths the edge of a catwalk
 * rail; it cannot stop that rail from sparkling as you walk past it.
 *
 * The whole difficulty of TAA is that yesterday's pixel is not always this
 * pixel. Three defences, in order of how much work they do:
 *
 *   1. Reprojection. Each pixel's depth is unprojected to a world position and
 *      re-projected through *last* frame's camera, so history is sampled from
 *      where that surface actually was, not from the same screen coordinate.
 *      This is what lets the camera move at all.
 *
 *   2. Neighbourhood clamping. History is clamped to the colour range of the
 *      3x3 block around the current pixel, in YCoCg so the box is tight around
 *      luma rather than a loose RGB cube. Anything that has genuinely changed
 *      — a disocclusion, something walking out from behind a pillar — pulls
 *      the clamp onto the new colour immediately instead of smearing.
 *
 *   3. A luminance brake. When the frame changes violently the history weight
 *      is cut. This exists for one specific thing: the Veilmask overload
 *      flares the whole screen white in a couple of frames, and without the
 *      brake that flare is still faintly visible several frames later, which
 *      reads as the lens being dirty rather than as a flash.
 *
 * Depth is reversed-Z nowhere here; it is a plain non-linear depth texture,
 * so the unprojection goes through the inverse view-projection rather than
 * trying to linearise anything.
 */

export const TAAShader = {
  uniforms: {
    tDiffuse: { value: null },        // this frame, jittered
    tHistory: { value: null },        // last frame's resolve
    tDepth: { value: null },
    uInvViewProj: { value: null },    // current frame, UNjittered
    uPrevViewProj: { value: null },   // previous frame, UNjittered
    uTexel: { value: [1 / 1280, 1 / 720] },
    uBlend: { value: 0.9 },           // how much history to keep
    uFirst: { value: 1 },             // 1 on the first frame, or after a cut
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
    uniform sampler2D tHistory;
    uniform sampler2D tDepth;
    uniform mat4 uInvViewProj;
    uniform mat4 uPrevViewProj;
    uniform vec2 uTexel;
    uniform float uBlend;
    uniform float uFirst;

    varying vec2 vUv;

    // YCoCg is the usual choice for the clamp box. The luma axis carries
    // almost all of the perceptual difference, so an axis-aligned box in
    // YCoCg hugs the real distribution of a neighbourhood far more tightly
    // than the same box in RGB — a loose box is what lets ghosts through.
    vec3 rgbToYCoCg(vec3 c) {
      return vec3(
        0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
        0.5  * c.r             - 0.5  * c.b,
       -0.25 * c.r + 0.5 * c.g - 0.25 * c.b
      );
    }

    vec3 yCoCgToRgb(vec3 c) {
      float t = c.x - c.z;
      return vec3(t + c.y, c.x + c.z, t - c.y);
    }

    void main() {
      vec4 current = texture2D(tDiffuse, vUv);

      // No history yet (first frame, a resize, or a hard cut): take the frame
      // as it is. Blending against an empty buffer fades up from black, which
      // on a cut reads as a fault.
      if (uFirst > 0.5) {
        gl_FragColor = current;
        return;
      }

      float depth = texture2D(tDepth, vUv).x;

      // The far plane is sky or nothing at all. There is no surface to follow,
      // so reprojecting it is meaningless — and in this game it is almost
      // always pure black, where a wrong history sample is very visible.
      if (depth >= 1.0) {
        gl_FragColor = current;
        return;
      }

      // Screen -> world, through this frame's camera.
      vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 world = uInvViewProj * clip;
      world /= world.w;

      // World -> screen, through last frame's camera.
      vec4 prevClip = uPrevViewProj * world;
      vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;

      // Off the edge of the previous frame: nothing to blend with.
      if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
        gl_FragColor = current;
        return;
      }

      vec3 history = texture2D(tHistory, prevUv).rgb;

      // ---- neighbourhood clamp --------------------------------------------
      vec3 cMin = vec3( 1e20);
      vec3 cMax = vec3(-1e20);
      vec3 cAvg = vec3(0.0);

      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 off = vec2(float(x), float(y)) * uTexel;
          vec3 s = rgbToYCoCg(texture2D(tDiffuse, vUv + off).rgb);
          cMin = min(cMin, s);
          cMax = max(cMax, s);
          cAvg += s;
        }
      }
      cAvg /= 9.0;

      // Pull the box in slightly toward the mean. A box that is exactly the
      // min and max of nine samples is dominated by whichever single pixel is
      // the outlier, so it lets through most of what it is meant to catch.
      cMin = mix(cMin, cAvg, 0.12);
      cMax = mix(cMax, cAvg, 0.12);

      vec3 histY = clamp(rgbToYCoCg(history), cMin, cMax);
      history = yCoCgToRgb(histY);

      // ---- how much history to trust ---------------------------------------
      float blend = uBlend;

      // Fast movement across the screen means thin geometry is sweeping over
      // this pixel and the history is mostly wrong. Shorten the tail.
      float velocity = length((prevUv - vUv) / uTexel);
      blend *= 1.0 - clamp(velocity / 48.0, 0.0, 0.7);

      // The luminance brake. See the note at the top: this is what stops the
      // mask's white overload leaving an after-image.
      float lumC = rgbToYCoCg(current.rgb).x;
      float lumH = histY.x;
      float change = abs(lumC - lumH) / max(max(lumC, lumH), 0.05);
      blend *= 1.0 - clamp(change * 0.65, 0.0, 0.85);

      vec3 result = mix(current.rgb, history, blend);

      // Half-float buffers plus a divide by w can produce a NaN at a grazing
      // depth, and a single NaN pixel is sticky: it feeds itself back through
      // the history every frame and never washes out. One comparison is
      // cheaper than the bug report.
      if (any(isnan(result)) || any(isinf(result))) result = current.rgb;

      gl_FragColor = vec4(result, current.a);
    }
  `,
};

/**
 * Halton, the standard low-discrepancy sequence for TAA jitter.
 *
 * Random offsets clump — some frames land nearly on top of each other and
 * contribute nothing, and eight random samples cover a pixel worse than four
 * well-spread ones. Halton fills the pixel evenly at every prefix length,
 * which is what makes a short history look like proper supersampling.
 */
export function halton(index, base) {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** The 8-tap jitter pattern, centred on the pixel. */
export const JITTER = Array.from({ length: 8 }, (_, i) => [
  halton(i + 1, 2) - 0.5,
  halton(i + 1, 3) - 0.5,
]);
