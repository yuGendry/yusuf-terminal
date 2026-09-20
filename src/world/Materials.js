/**
 * Materials.js — the game's material library.
 *
 * Materials are shared singletons keyed by name: every oak floorboard in the
 * building points at one MeshStandardMaterial, which keeps draw calls batchable
 * and the texture cache small. Ask for a variant (different repeat, different
 * tint) through `material(name, { repeat, color })` rather than mutating one.
 */

import * as THREE from 'three';
import { getTexture } from './Textures.js';

const cache = new Map();

/** Clone the texture set so a variant can have its own repeat without
 *  disturbing every other user of the same generated image. */
function withRepeat(texSet, repeat) {
  if (!repeat || repeat === 1) return texSet;
  const out = {};
  for (const [k, tex] of Object.entries(texSet)) {
    const c = tex.clone();
    c.needsUpdate = true;
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat, repeat);
    out[k] = c;
  }
  return out;
}

const RECIPES = {
  // --- architecture --------------------------------------------------------
  stageFloor: () => {
    const t = getTexture('wood', { seed: 7, hue: 26, light: 0.24, plankCount: 7, wear: 0.7 }, 512);
    return new THREE.MeshStandardMaterial({
      ...t, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8),
    });
  },
  lobbyFloor: () => {
    const t = getTexture('wood', { seed: 22, hue: 20, light: 0.19, plankCount: 5, wear: 0.85 }, 512);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0 });
  },
  wallPlaster: () => {
    const t = getTexture('plaster', { seed: 3, hue: 36, light: 0.30, cracks: 0.8, stains: 0.75 }, 512);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0 });
  },
  wallPlasterClean: () => {
    const t = getTexture('plaster', { seed: 81, hue: 40, light: 0.38, cracks: 0.25, stains: 0.3 }, 512);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0 });
  },
  wallpaperLobby: () => {
    const t = getTexture('wallpaper', { seed: 9, hue: 26, sat: 0.26, light: 0.28, stripeWidth: 30, peel: 0.7 }, 512);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0 });
  },
  ceiling: () => {
    const t = getTexture('plaster', { seed: 44, hue: 34, light: 0.22, cracks: 0.5, stains: 0.9 }, 256);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0 });
  },
  tileFloor: () => {
    const t = getTexture('tile', { seed: 41, tiles: 8, hue: 150, light: 0.34 }, 512);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0 });
  },

  // --- set dressing --------------------------------------------------------
  curtain: () => {
    const t = getTexture('velvet', { seed: 21, hue: 352, sat: 0.45, light: 0.085 }, 512);
    return new THREE.MeshStandardMaterial({
      ...t, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      normalScale: new THREE.Vector2(1.4, 1.4),
    });
  },
  seatVelvet: () => {
    const t = getTexture('velvet', { seed: 64, hue: 344, sat: 0.3, light: 0.07 }, 256);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0 });
  },
  steel: () => {
    const t = getTexture('metal', { seed: 13, rust: 0.5, paintHue: 205, paintLight: 0.19 }, 512);
    return new THREE.MeshStandardMaterial({
      ...t, roughness: 0.6, metalness: 0.85,
      normalScale: new THREE.Vector2(1.1, 1.1),
    });
  },
  rustedSteel: () => {
    const t = getTexture('metal', { seed: 97, rust: 0.78, paintHue: 30, paintLight: 0.13 }, 512);
    return new THREE.MeshStandardMaterial({
      // Barely metallic. Rust is iron oxide — a ceramic — and giving it a
      // metal's specular response makes every torch beam blow a white hole in
      // the middle of it.
      ...t, roughness: 0.96, metalness: 0.3,
      normalScale: new THREE.Vector2(0.7, 0.7),
    });
  },
  brass: () => new THREE.MeshStandardMaterial({
    color: 0x8a6d2a, roughness: 0.42, metalness: 1.0,
  }),
  porcelain: () => {
    const t = getTexture('porcelain', { seed: 5, crackle: 0.7, grime: 0.4 }, 512);
    return new THREE.MeshPhysicalMaterial({
      ...t, roughness: 0.28, metalness: 0,
      clearcoat: 0.85, clearcoatRoughness: 0.22,
      sheen: 0.2, sheenColor: new THREE.Color(0xfff2dd),
    });
  },
  porcelainClean: () => {
    const t = getTexture('porcelain', { seed: 200, crackle: 0.25, grime: 0.08, light: 0.88 }, 512);
    return new THREE.MeshPhysicalMaterial({
      ...t, roughness: 0.18, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.1,
    });
  },
  feltDark: () => new THREE.MeshStandardMaterial({
    color: 0x1b1a1e, roughness: 0.98, metalness: 0,
  }),
  paintedWood: () => new THREE.MeshStandardMaterial({
    color: 0x5a4632, roughness: 0.8, metalness: 0,
  }),
  paper: () => new THREE.MeshStandardMaterial({
    color: 0xcfc3a6, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
  }),
  glassDusty: () => new THREE.MeshPhysicalMaterial({
    color: 0xaab6b2, roughness: 0.32, metalness: 0,
    transmission: 0.82, thickness: 0.02, ior: 1.5,
    transparent: true, opacity: 0.55,
  }),
  water: () => {
    const t = getTexture('water', { seed: 71 }, 256);
    return new THREE.MeshPhysicalMaterial({
      ...t, color: 0x14201d, roughness: 0.08, metalness: 0,
      transmission: 0.55, thickness: 1.2, ior: 1.33,
      transparent: true, opacity: 0.9,
      normalScale: new THREE.Vector2(0.35, 0.35),
    });
  },

  // --- emissive / effect ---------------------------------------------------
  bulbOn: () => new THREE.MeshStandardMaterial({
    color: 0x120d07, emissive: 0xffd9a0, emissiveIntensity: 6, roughness: 0.4,
  }),
  bulbOff: () => new THREE.MeshStandardMaterial({
    color: 0x2b2722, roughness: 0.5, metalness: 0.1,
  }),
  threadGlow: () => new THREE.MeshBasicMaterial({
    color: 0x6fe3d4, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }),
  exitSign: () => new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, emissive: 0x2ecc71, emissiveIntensity: 2.4, roughness: 0.6,
  }),
};

/**
 * Fetch a shared material. Pass `overrides` for a one-off variant; anything in
 * `overrides` produces a separate cached entry rather than mutating the shared one.
 */
export function material(name, overrides = null) {
  const recipe = RECIPES[name];
  if (!recipe) throw new Error(`Unknown material "${name}"`);

  const key = overrides ? `${name}:${JSON.stringify(overrides)}` : name;
  if (cache.has(key)) return cache.get(key);

  const mat = recipe();
  mat.name = name;

  if (overrides) {
    const { repeat, ...rest } = overrides;
    if (repeat) {
      const texSet = {};
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        if (mat[slot]) texSet[slot] = mat[slot];
      }
      Object.assign(mat, withRepeat(texSet, repeat));
    }
    for (const [k, v] of Object.entries(rest)) {
      if (k === 'color' || k === 'emissive') mat[k] = new THREE.Color(v);
      else mat[k] = v;
    }
  }

  cache.set(key, mat);
  return mat;
}

export function disposeMaterials() {
  for (const mat of cache.values()) mat.dispose();
  cache.clear();
}
