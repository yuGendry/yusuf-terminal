/** Small numeric helpers used across the game. */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Frame-rate independent exponential smoothing.
 * `rate` is roughly "how much of the gap is closed per second" (0..1-ish),
 * expressed so that damp(a, b, 0.9, dt) behaves the same at 30 and 144 fps.
 */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Move `a` toward `b` by at most `maxDelta`. */
export const moveToward = (a, b, maxDelta) => {
  const d = b - a;
  return Math.abs(d) <= maxDelta ? b : a + Math.sign(d) * maxDelta;
};

/** Shortest signed angular difference in radians. */
export const angleDelta = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(randRange(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Deterministic PRNG (mulberry32). The world generator uses seeded randomness
 * so that a given room looks identical every time the player re-enters it.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D value noise built on a seeded RNG — used for procedural textures. */
export function makeNoise2D(seed = 1337) {
  const rng = makeRng(seed);
  const SIZE = 256;
  const perm = new Uint8Array(SIZE * 2);
  const grad = new Float32Array(SIZE * 2);
  for (let i = 0; i < SIZE; i++) {
    perm[i] = i;
    grad[i] = rng();
  }
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < SIZE; i++) {
    perm[SIZE + i] = perm[i];
    grad[SIZE + i] = grad[i];
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  return function noise2D(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = grad[perm[perm[xi] + yi]];
    const ab = grad[perm[perm[xi] + yi + 1]];
    const ba = grad[perm[perm[xi + 1] + yi]];
    const bb = grad[perm[perm[xi + 1] + yi + 1]];

    const x1 = aa + u * (ba - aa);
    const x2 = ab + u * (bb - ab);
    return x1 + v * (x2 - x1);
  };
}

/** Fractal brownian motion over a value-noise function. */
export function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
