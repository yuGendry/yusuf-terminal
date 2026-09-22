/**
 * ChapterArt.js — a poster for each chapter, drawn rather than shipped.
 *
 * The chapter select was a text list, which is an accurate description of the
 * game's contents and tells you nothing about what any of it feels like. These
 * are small, deliberately crude key frames — a silhouette against a light
 * source, in that chapter's palette — built from the same primitives the game
 * itself is built from and for the same reason: there are no image files in
 * this project and there are not going to be.
 *
 * Each is deterministic from its chapter id, so a card looks the same every
 * time it is drawn and cards do not shimmer when the dialog reopens.
 */

import { makeRng } from '../util/MathUtil.js';

const W = 480;
const H = 270;

/** Per chapter: the colour of its light, and of everything the light misses. */
const PALETTE = {
  1: { key: '#ffb066', fill: '#2a1a14', sky: '#120a08', accent: '#c23b2e' },
  2: { key: '#ff7a33', fill: '#241a12', sky: '#0e0906', accent: '#e0821f' },
  3: { key: '#a98fd6', fill: '#18161f', sky: '#0a0810', accent: '#7f6bb0' },
  4: { key: '#7fd7c4', fill: '#0d1a1e', sky: '#04080c', accent: '#3f8f9c' },
  5: { key: '#e8e0d2', fill: '#1c1512', sky: '#0b0707', accent: '#c23b2e' },
};

/** A marionette in silhouette, hanging. The game's one recurring image. */
function drawPuppet(g, x, y, s, colour) {
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineWidth = Math.max(1, 2 * s);
  g.lineCap = 'round';

  // strings up out of frame
  g.globalAlpha = 0.5;
  for (const dx of [-11, -4, 4, 11]) {
    g.beginPath();
    g.moveTo(x + dx * s, y - 26 * s);
    g.lineTo(x + dx * s * 0.45, 0);
    g.stroke();
  }
  g.globalAlpha = 1;

  g.beginPath();
  g.arc(x, y - 20 * s, 8 * s, 0, Math.PI * 2);   // head
  g.fill();
  g.beginPath();
  g.moveTo(x, y - 12 * s);
  g.lineTo(x, y + 8 * s);                          // spine
  g.moveTo(x - 10 * s, y - 4 * s);
  g.lineTo(x + 10 * s, y - 4 * s);                 // arms
  g.moveTo(x, y + 8 * s);
  g.lineTo(x - 7 * s, y + 24 * s);                 // legs
  g.moveTo(x, y + 8 * s);
  g.lineTo(x + 7 * s, y + 24 * s);
  g.stroke();
}

/** Doorway, arch, tank mouth — whatever the light is coming through. */
function drawAperture(g, kind, p) {
  const grad = g.createRadialGradient(W * 0.5, H * 0.52, 8, W * 0.5, H * 0.52, W * 0.62);
  grad.addColorStop(0, p.key);
  grad.addColorStop(0.28, p.fill);
  grad.addColorStop(1, p.sky);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  g.fillStyle = p.sky;
  if (kind === 'proscenium') {
    // A stage arch: two piers and a swag.
    g.fillRect(0, 0, W * 0.2, H);
    g.fillRect(W * 0.8, 0, W * 0.2, H);
    g.beginPath();
    g.moveTo(W * 0.2, 0);
    g.quadraticCurveTo(W * 0.5, H * 0.3, W * 0.8, 0);
    g.lineTo(W * 0.8, 0);
    g.lineTo(W * 0.2, 0);
    g.fill();
  } else if (kind === 'kiln') {
    // A squat firebox with its door ajar.
    g.fillRect(0, 0, W, H * 0.16);
    g.fillRect(0, H * 0.84, W, H * 0.16);
    g.fillRect(0, 0, W * 0.3, H);
    g.fillRect(W * 0.7, 0, W * 0.3, H);
  } else if (kind === 'doorway') {
    g.fillRect(0, 0, W, H);
    g.clearRect(W * 0.36, H * 0.14, W * 0.28, H * 0.86);
    const inner = g.createLinearGradient(0, H * 0.14, 0, H);
    inner.addColorStop(0, p.key);
    inner.addColorStop(1, p.fill);
    g.fillStyle = inner;
    g.fillRect(W * 0.36, H * 0.14, W * 0.28, H * 0.86);
    // round the head of the door
    g.fillStyle = p.sky;
    g.beginPath();
    g.moveTo(W * 0.36, H * 0.22);
    g.quadraticCurveTo(W * 0.5, H * 0.06, W * 0.64, H * 0.22);
    g.lineTo(W * 0.64, H * 0.14);
    g.lineTo(W * 0.36, H * 0.14);
    g.fill();
  } else if (kind === 'water') {
    // A horizon of standing water, lit from under it.
    g.fillRect(0, 0, W, H * 0.58);
    const surf = g.createLinearGradient(0, H * 0.58, 0, H);
    surf.addColorStop(0, p.key);
    surf.addColorStop(0.12, p.fill);
    surf.addColorStop(1, p.sky);
    g.fillStyle = surf;
    g.fillRect(0, H * 0.58, W, H * 0.42);
  }
}

/** Film grain and a vignette: the two things that make a flat fill read. */
function finish(g, rng, p) {
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.82)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.05})`;
    g.fillRect(rng() * W, rng() * H, 1, 1);
  }

  // A scratch or two, as though this were a frame off a print.
  g.strokeStyle = 'rgba(232,224,210,0.05)';
  g.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const x = rng() * W;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + rng() * 8 - 4, H);
    g.stroke();
  }

  // A hairline of the chapter's accent along the bottom, which is what ties
  // the row of cards together into one object.
  g.fillStyle = p.accent;
  g.globalAlpha = 0.65;
  g.fillRect(0, H - 2, W, 2);
  g.globalAlpha = 1;
}

const cache = new Map();

/**
 * @param {number} id chapter number
 * @param {boolean} built false draws the "not built yet" plate instead
 * @returns {HTMLCanvasElement}
 */
export function chapterArt(id, built = true) {
  const key = `${id}:${built}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const p = PALETTE[id] ?? PALETTE[5];
  const rng = makeRng(id * 7919 + 17);

  if (!built) {
    g.fillStyle = '#0a0908';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(232,224,210,0.09)';
    g.lineWidth = 1;
    for (let i = -H; i < W; i += 16) {
      g.beginPath();
      g.moveTo(i, H);
      g.lineTo(i + H, 0);
      g.stroke();
    }
    finish(g, rng, p);
    cache.set(key, c);
    return c;
  }

  const KIND = { 1: 'proscenium', 2: 'kiln', 3: 'doorway', 4: 'water', 5: 'proscenium' };
  drawAperture(g, KIND[id] ?? 'doorway', p);

  // The figure, and the floor it is standing on.
  g.fillStyle = p.sky;
  if (id === 4) {
    // Standing in water: no floor line, a reflection instead.
    drawPuppet(g, W * 0.5, H * 0.52, 1.5, p.sky);
    g.save();
    g.globalAlpha = 0.22;
    g.translate(0, H * 1.36);
    g.scale(1, -1);
    drawPuppet(g, W * 0.5, H * 0.52, 1.5, p.sky);
    g.restore();
  } else if (id === 3) {
    // Three of them, in a row, because that is what is waiting in Chapter 3.
    for (const [dx, s] of [[-0.17, 1.15], [0, 1.45], [0.17, 1.15]]) {
      drawPuppet(g, W * (0.5 + dx), H * (0.56 - (1.45 - s) * 0.04), s, p.sky);
    }
    g.fillRect(0, H * 0.82, W, H * 0.18);
  } else {
    drawPuppet(g, W * 0.5, H * 0.5, 1.6, p.sky);
    g.fillRect(0, H * 0.80, W, H * 0.2);
  }

  finish(g, rng, p);
  cache.set(key, c);
  return c;
}
