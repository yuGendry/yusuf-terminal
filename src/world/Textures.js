/**
 * Textures.js — every surface in the game is generated here at runtime.
 *
 * No image files ship with the build. Each generator paints a height/albedo
 * pair into a canvas, and the normal map is derived from the height field with
 * a Sobel filter. Results are cached by key, because a wall texture that is
 * used in forty rooms should only be rasterised once.
 */

import * as THREE from 'three';
import { makeRng, makeNoise2D, fbm, clamp, lerp } from '../util/MathUtil.js';

const cache = new Map();
let sharedAnisotropy = 8;

export function setTextureAnisotropy(a) {
  sharedAnisotropy = a;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(cnv, { srgb = false, repeat = 1 } = {}) {
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = sharedAnisotropy;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Sobel a height field into a tangent-space normal map.
 * Wrapping the sample coordinates keeps the normals seamless on a tiling texture.
 */
function heightToNormal(height, size, strength = 2.2) {
  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y),                        r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len;
      const nzn = nz / len;

      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nzn * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

/** Pack a float array (0..1) into a greyscale canvas — used for roughness maps. */
function floatsToCanvas(data, size) {
  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = clamp(data[i], 0, 1) * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

/* ==========================================================================
   Generators
   Each returns { map, normalMap, roughnessMap } of THREE.Texture.
   ========================================================================== */

/**
 * Aged stage floorboards. Long planks with visible grain, darkened at the
 * seams where decades of dirt collected.
 */
function genWood(size, opts) {
  const { seed = 7, hue = 28, sat = 0.34, light = 0.30, plankCount = 6, wear = 0.5 } = opts;
  const rng = makeRng(seed);
  const noise = makeNoise2D(seed + 11);
  const grainNoise = makeNoise2D(seed + 91);

  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  const plankH = size / plankCount;
  // Per-plank offsets so boards don't all start at the same place.
  const plankShift = Array.from({ length: plankCount }, () => rng());
  const plankTone = Array.from({ length: plankCount }, () => 0.78 + rng() * 0.44);

  for (let y = 0; y < size; y++) {
    const plank = Math.floor(y / plankH);
    const inPlank = (y % plankH) / plankH;
    const tone = plankTone[plank];
    const shift = plankShift[plank] * size;

    for (let x = 0; x < size; x++) {
      const u = (x + shift) / size;

      // Grain runs ALONG the plank. Sampling the ring function across the
      // board's width with a strong warp produces the swirling figure of cut
      // plywood; real floorboards are quarter-sawn and read as long, mostly
      // parallel lines with occasional knots.
      const g1 = fbm(noise, u * 2.2, (y / size) * 34, 3);
      const rings = Math.sin((u * 42 + g1 * 2.4) * Math.PI) * 0.5 + 0.5;
      const fine = fbm(grainNoise, u * 110, (y / size) * 190, 2);

      let v = 0.62 + rings * 0.11 + (fine - 0.5) * 0.13;
      v *= tone;

      // Seams between planks, and a subtle bevel at each edge.
      const seam = Math.min(inPlank, 1 - inPlank);
      const seamDark = seam < 0.045 ? (1 - seam / 0.045) : 0;
      v *= 1 - seamDark * 0.65;

      // Scuffs and water damage.
      const blotch = fbm(noise, u * 5 + 40, (y / size) * 5 + 40, 3);
      const stain = clamp((blotch - 0.52) * 4, 0, 1) * wear;
      v *= 1 - stain * 0.45;

      const l = clamp(light * v * 2.0, 0, 1);
      const [r, gg, b] = hslToRgb(hue / 360 - stain * 0.02, sat * (1 - stain * 0.3), l);

      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;

      height[y * size + x] = v * 0.6 + (1 - seamDark) * 0.4 - seamDark * 0.5;
      // Worn patches are polished smooth; the rest of the board is dry.
      rough[y * size + x] = clamp(0.92 - stain * 0.35 - rings * 0.06, 0.25, 1);
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: toTexture(cnv, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 1.6)),
    roughnessMap: toTexture(floatsToCanvas(rough, size)),
  };
}

/** Cracked, water-stained plaster — the default wall of the whole factory. */
function genPlaster(size, opts) {
  const { seed = 3, hue = 38, sat = 0.12, light = 0.42, cracks = 0.5, stains = 0.6 } = opts;
  const rng = makeRng(seed);
  const noise = makeNoise2D(seed + 5);
  const fineNoise = makeNoise2D(seed + 55);

  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // Keep the variation small-scale. A low-frequency, high-contrast blotch
      // is the thing the eye locks onto when a texture repeats across a wall —
      // at 4 repeats you would see the same damp patch sixteen times. Fine
      // detail tiles invisibly; large shapes do not.
      const base = fbm(noise, u * 9, v * 9, 4) * 0.5 + 0.5;
      const tooth = fbm(fineNoise, u * 90, v * 90, 3);

      let val = 0.88 + (base - 0.5) * 0.05 + (tooth - 0.5) * 0.07;

      // Water stains creep downward, so bias the noise lookup vertically.
      const stainField = fbm(noise, u * 6.5 + 17, v * 3.0 + 17, 4);
      const stain = clamp((stainField - 0.54) * 3.0, 0, 1) * stains * clamp(v * 1.4, 0.2, 1);

      // The stain is expressed almost entirely through ROUGHNESS and the
      // normal, and barely at all through colour.
      //
      // A repeating albedo pattern is what the eye picks out when a texture
      // tiles across a wall: the same dark patch appearing on a grid is
      // unmistakable. The same variation carried in roughness only shows up
      // where a light happens to graze it, so it reads as surface character
      // and the repeat stays invisible.
      val *= 1 - stain * 0.07;

      const i = (y * size + x) * 4;
      const l = clamp(light * val * 1.9, 0, 1);
      const [r, g, b] = hslToRgb(hue / 360, sat, l);
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;

      height[y * size + x] = val - stain * 0.25;
      rough[y * size + x] = clamp(0.86 + (tooth - 0.5) * 0.2 - stain * 0.34, 0.42, 1);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Draw cracks on top as real strokes — procedural noise never produces the
  // branching, angular look of actual plaster failure.
  if (cracks > 0) {
    ctx.strokeStyle = 'rgba(28, 22, 18, 0.55)';
    ctx.lineCap = 'round';
    const count = Math.floor(6 * cracks);
    for (let c = 0; c < count; c++) {
      let x = rng() * size;
      let y = rng() * size;
      let angle = rng() * Math.PI * 2;
      const segments = 14 + Math.floor(rng() * 18);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < segments; s++) {
        angle += (rng() - 0.5) * 1.1;
        const step = 4 + rng() * 11;
        x += Math.cos(angle) * step;
        y += Math.sin(angle) * step;
        ctx.lineWidth = lerp(1.6, 0.3, s / segments);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Branch occasionally.
      if (rng() > 0.55) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        let a2 = angle + (rng() - 0.5) * 2;
        for (let s = 0; s < 8; s++) {
          a2 += (rng() - 0.5) * 1.2;
          x += Math.cos(a2) * (3 + rng() * 7);
          y += Math.sin(a2) * (3 + rng() * 7);
          ctx.lineWidth = lerp(0.9, 0.2, s / 8);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  return {
    map: toTexture(cnv, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 1.1)),
    roughnessMap: toTexture(floatsToCanvas(rough, size)),
  };
}

/** Pitted, rusting painted steel — catwalks, machinery, kiln doors. */
function genMetal(size, opts) {
  const { seed = 13, rust = 0.55, paintHue = 200, paintSat = 0.16, paintLight = 0.22 } = opts;
  const noise = makeNoise2D(seed + 3);
  const fine = makeNoise2D(seed + 77);

  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const metal = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      const grime = fbm(noise, u * 6, v * 6, 4);
      const pit = fbm(fine, u * 70, v * 70, 3);

      // Rust eats the paint in patches; where the paint survives, the surface
      // is smoother and less metallic.
      const rustField = clamp((fbm(noise, u * 3.2 + 9, v * 3.2 + 9, 5) - 0.46) * 3.6, 0, 1) * rust;
      const paintLoss = clamp(rustField * 1.4 + (pit - 0.6) * 0.8, 0, 1);

      let r, g, b;
      if (paintLoss > 0.5) {
        // Exposed rust: orange-brown, very rough, barely metallic.
        const t = (paintLoss - 0.5) * 2;
        // Desaturated on purpose. Rust photographs far browner than the
        // orange people remember it being, and at 0.55 saturation a rusted
        // panel reads as a cartoon: bright orange patches sitting on top of
        // the metal rather than eating into it.
        const l = 0.15 + grime * 0.13;
        [r, g, b] = hslToRgb(lerp(paintHue / 360, 0.045, t), lerp(paintSat, 0.34, t), l);
      } else {
        const l = paintLight * (0.75 + grime * 0.5);
        [r, g, b] = hslToRgb(paintHue / 360, paintSat, clamp(l, 0, 1));
      }

      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;

      // The pitting is 70-cycle noise. Pushed into the height map at full
      // strength it comes out of heightToNormal as crumpled foil — every
      // metal surface in the game caught the light like tinfoil. It belongs
      // in the roughness, where it reads as a dulled surface, not in the
      // silhouette of the light.
      height[y * size + x] = 0.6 + (pit - 0.5) * 0.18 - paintLoss * 0.3;
      rough[y * size + x] = clamp(0.40 + paintLoss * 0.55 + (grime - 0.5) * 0.18, 0.22, 1);
      metal[y * size + x] = clamp(1 - paintLoss * 0.75, 0.1, 1);
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: toTexture(cnv, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 1.1)),
    roughnessMap: toTexture(floatsToCanvas(rough, size)),
    metalnessMap: toTexture(floatsToCanvas(metal, size)),
  };
}

/** Heavy theatre velvet — curtains, seat upholstery, the lobby rope line. */
function genVelvet(size, opts) {
  const { seed = 21, hue = 350, sat = 0.42, light = 0.12 } = opts;
  const noise = makeNoise2D(seed + 31);
  const weave = makeNoise2D(seed + 131);

  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // Nap direction gives velvet its characteristic vertical sheen streaks.
      const nap = fbm(noise, u * 5, v * 1.4, 4);
      const fibre = fbm(weave, u * 180, v * 180, 2);
      const dust = clamp((fbm(noise, u * 2 + 61, v * 2 + 61, 3) - 0.5) * 2.2, 0, 1);

      let val = 0.62 + (nap - 0.5) * 0.5 + (fibre - 0.5) * 0.16;
      val *= 1 - dust * 0.28;

      const i = (y * size + x) * 4;
      const [r, g, b] = hslToRgb(hue / 360, sat * (1 - dust * 0.5), clamp(light * val * 2.2, 0, 1));
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;

      height[y * size + x] = val;
      // Velvet is uniformly rough; the sheen comes from the normal, not gloss.
      rough[y * size + x] = clamp(0.93 + (fibre - 0.5) * 0.08, 0.8, 1);
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: toTexture(cnv, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 0.8)),
    roughnessMap: toTexture(floatsToCanvas(rough, size)),
  };
}

/** Glazed porcelain — the masks, the Choir dolls, Mister Tangle's face. */
function genPorcelain(size, opts) {
  const { seed = 5, hue = 36, sat = 0.08, light = 0.80, crackle = 0.6, grime = 0.35 } = opts;
  const rng = makeRng(seed);
  const noise = makeNoise2D(seed + 17);

  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');

  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dirt = clamp((fbm(noise, u * 4 + 3, v * 4 + 3, 4) - 0.5) * 2.6, 0, 1) * grime;
      const val = 1 - dirt * 0.4;

      const i = (y * size + x) * 4;
      const [r, g, b] = hslToRgb(hue / 360, sat + dirt * 0.06, clamp(light * val, 0, 1));
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;

      height[y * size + x] = 0.5;
      rough[y * size + x] = clamp(0.14 + dirt * 0.5, 0.1, 0.8);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Craquelure: the fine web of glaze cracks on old china. Drawn as short,
  // mostly-straight segments that meet at shared nodes.
  if (crackle > 0) {
    ctx.strokeStyle = `rgba(90, 70, 52, ${0.32 * crackle})`;
    ctx.lineWidth = 0.7;
    const nodes = [];
    const nodeCount = Math.floor(40 * crackle);
    for (let i = 0; i < nodeCount; i++) nodes.push([rng() * size, rng() * size]);
    for (const [nx, ny] of nodes) {
      const branches = 2 + Math.floor(rng() * 3);
      for (let b = 0; b < branches; b++) {
        const target = nodes[Math.floor(rng() * nodes.length)];
        const d = Math.hypot(target[0] - nx, target[1] - ny);
        if (d > size * 0.22 || d < 4) continue;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        // A slight midpoint kink reads as a crack rather than a drawn line.
        const mx = (nx + target[0]) / 2 + (rng() - 0.5) * 8;
        const my = (ny + target[1]) / 2 + (rng() - 0.5) * 8;
        ctx.quadraticCurveTo(mx, my, target[0], target[1]);
        ctx.stroke();
      }
    }
  }

  return {
    map: toTexture(cnv, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 0.5)),
    roughnessMap: toTexture(floatsToCanvas(rough, size)),
  };
}

/** Faded striped wallpaper for the lobby and offices. */
function genWallpaper(size, opts) {
  const { seed = 9, hue = 30, sat = 0.22, light = 0.36, stripeWidth = 26, peel = 0.4 } = opts;
  const rng = makeRng(seed);
  const noise = makeNoise2D(seed + 23);

  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      const stripe = (Math.floor(x / stripeWidth) % 2) === 0 ? 1.0 : 0.82;
      const damp2 = clamp((fbm(noise, u * 2.4 + 5, v * 1.2 + 5, 4) - 0.44) * 3, 0, 1);
      const grain = fbm(noise, u * 50, v * 50, 2);

      // Sunlight has bleached the paper unevenly and damp has browned it.
      let val = stripe * (0.85 + (grain - 0.5) * 0.12);
      val *= 1 - damp2 * 0.42 * clamp(v * 1.6, 0.15, 1);

      const i = (y * size + x) * 4;
      const [r, g, b] = hslToRgb(hue / 360 + damp2 * 0.02, sat * (1 - damp2 * 0.4), clamp(light * val * 2.1, 0, 1));
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;

      height[y * size + x] = val * 0.4 + 0.3;
      rough[y * size + x] = clamp(0.88 - damp2 * 0.1, 0.6, 1);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Peeling strips reveal the darker plaster underneath.
  if (peel > 0) {
    const strips = Math.floor(3 * peel);
    for (let s = 0; s < strips; s++) {
      const x0 = rng() * size;
      const w = 12 + rng() * 40;
      const y0 = rng() * size * 0.5;
      const h = 40 + rng() * size * 0.4;
      ctx.fillStyle = 'rgba(38, 31, 26, 0.85)';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + w, y0 + 6);
      ctx.lineTo(x0 + w * 0.7, y0 + h);
      ctx.lineTo(x0 - w * 0.15, y0 + h * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  }

  return {
    map: toTexture(cnv, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 0.9)),
    roughnessMap: toTexture(floatsToCanvas(rough, size)),
  };
}

/** Grubby ceramic tile — the kiln room, the washrooms, the basement stairs. */
function genTile(size, opts) {
  const { seed = 41, tiles = 8, hue = 150, sat = 0.06, light = 0.44, groutDark = 0.55 } = opts;
  const noise = makeNoise2D(seed + 13);

  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  const cell = size / tiles;
  const grout = Math.max(2, cell * 0.06);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = (x % cell) / cell;
      const cy = (y % cell) / cell;
      const edge = Math.min(cx, 1 - cx, cy, 1 - cy) * cell;
      const isGrout = edge < grout;

      const u = x / size, v = y / size;
      const dirt = clamp((fbm(noise, u * 5, v * 5, 4) - 0.44) * 3, 0, 1);
      // Per-tile tint variation so the wall isn't a flat grid.
      const tileId = Math.floor(x / cell) * 31 + Math.floor(y / cell) * 17;
      const tint = 0.88 + ((tileId * 2654435761) % 1000) / 1000 * 0.24;

      let val, rgh;
      if (isGrout) {
        val = (1 - groutDark) * (0.7 + dirt * 0.2);
        rgh = 0.95;
      } else {
        val = tint * (1 - dirt * 0.35);
        rgh = clamp(0.22 + dirt * 0.5, 0.15, 0.9);
      }

      const i = (y * size + x) * 4;
      const [r, g, b] = hslToRgb(hue / 360, sat, clamp(light * val * 1.9, 0, 1));
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;

      height[y * size + x] = isGrout ? 0.25 : 0.72;
      rough[y * size + x] = rgh;
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: toTexture(cnv, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 2.0)),
    roughnessMap: toTexture(floatsToCanvas(rough, size)),
  };
}

/** Standing water for the flooded basement — used as a normal map only. */
function genWaterNormal(size, opts) {
  const { seed = 71 } = opts;
  const noise = makeNoise2D(seed);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      height[y * size + x] =
        fbm(noise, u * 6, v * 6, 4) * 0.6 + fbm(noise, u * 22 + 5, v * 22 + 5, 3) * 0.4;
    }
  }
  return { normalMap: toTexture(heightToNormal(height, size, 0.55)) };
}

/* ========================================================================== */

const GENERATORS = {
  wood: genWood,
  plaster: genPlaster,
  metal: genMetal,
  velvet: genVelvet,
  porcelain: genPorcelain,
  wallpaper: genWallpaper,
  tile: genTile,
  water: genWaterNormal,
};

/**
 * Main entry point.
 * `getTexture('wood', { seed: 4, plankCount: 8 }, 512)` → { map, normalMap, ... }
 */
export function getTexture(kind, opts = {}, size = 512) {
  const key = `${kind}:${size}:${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key);

  const gen = GENERATORS[kind];
  if (!gen) throw new Error(`Unknown texture kind "${kind}"`);

  const result = gen(size, opts);
  cache.set(key, result);
  return result;
}

export function disposeTextureCache() {
  for (const set of cache.values()) {
    for (const tex of Object.values(set)) tex.dispose?.();
  }
  cache.clear();
}

/* --- colour helper --------------------------------------------------------- */

/** HSL → RGB, all inputs 0..1 except the returned channels which are 0..255. */
function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(h + 1 / 3) * 255),
    Math.round(hue2rgb(h) * 255),
    Math.round(hue2rgb(h - 1 / 3) * 255),
  ];
}

export { hslToRgb };
