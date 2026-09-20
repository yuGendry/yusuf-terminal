/**
 * MaskOverlay.js — the porcelain frame you look through, drawn in SVG.
 *
 * The lens grade, distortion and vignette all happen in the post shader; this
 * layer is the physical object in front of the player's face — the eye-hole
 * silhouette, the craquelure spreading through the glaze as the mask is used,
 * and the Strain meter.
 *
 * SVG rather than a texture because the crack network has to grow: each crack
 * is a path whose `stroke-dashoffset` animates from fully hidden to fully
 * drawn, so damage accumulates visibly instead of popping between states.
 */

import { Settings } from '../core/Settings.js';
import { makeRng, clamp, lerp } from '../util/MathUtil.js';

const NS = 'http://www.w3.org/2000/svg';
const CRACK_COUNT = 18;

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export class MaskOverlay {
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'mask-overlay';
    this.visible = false;
    this._shown = 0;
    this._build();
  }

  _build() {
    // --- the porcelain frame ------------------------------------------------
    const frame = svg('svg', {
      viewBox: '0 0 100 100',
      preserveAspectRatio: 'none',
      class: 'mask-frame',
    });

    const defs = svg('defs');

    // A radial gradient that is transparent through the eye-holes and opaque
    // at the edges: this is what makes it read as looking *through* something.
    const grad = svg('radialGradient', {
      id: 'maskVignette', cx: '50%', cy: '48%', r: '62%',
    });
    for (const [offset, color, opacity] of [
      ['0%', '#000', '0'],
      ['42%', '#000', '0'],
      ['62%', '#0a0806', '0.35'],
      ['80%', '#070504', '0.82'],
      ['100%', '#030202', '1'],
    ]) {
      grad.appendChild(svg('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }));
    }
    defs.appendChild(grad);
    frame.appendChild(defs);

    frame.appendChild(svg('rect', { x: 0, y: 0, width: 100, height: 100, fill: 'url(#maskVignette)' }));
    this.root.appendChild(frame);

    // --- the nose bridge ----------------------------------------------------
    // A soft dark wedge rising from the bottom centre. Subtle, but it is what
    // makes the frame feel like a face rather than a vignette.
    const bridge = document.createElement('div');
    bridge.className = 'mask-bridge';
    this.root.appendChild(bridge);

    // --- craquelure ---------------------------------------------------------
    const cracks = svg('svg', {
      viewBox: '0 0 100 100',
      preserveAspectRatio: 'none',
      class: 'mask-cracks',
    });

    const rng = makeRng(20481);
    this.crackPaths = [];

    for (let i = 0; i < CRACK_COUNT; i++) {
      // Cracks originate at the rim and travel inward — glaze fails at the
      // edges first, where the porcelain is thinnest.
      const edge = Math.floor(rng() * 4);
      let x = edge === 0 ? rng() * 100 : edge === 1 ? 100 : edge === 2 ? rng() * 100 : 0;
      let y = edge === 0 ? 0 : edge === 1 ? rng() * 100 : edge === 2 ? 100 : rng() * 100;

      let angle = Math.atan2(50 - y, 50 - x) + (rng() - 0.5) * 1.1;
      let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      const segs = 4 + Math.floor(rng() * 5);
      for (let s = 0; s < segs; s++) {
        angle += (rng() - 0.5) * 0.9;
        const step = 3 + rng() * 9;
        x += Math.cos(angle) * step;
        y += Math.sin(angle) * step;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }

      const path = svg('path', {
        d,
        fill: 'none',
        stroke: 'rgba(232,224,210,0.55)',
        'stroke-width': (0.18 + rng() * 0.3).toFixed(2),
        'stroke-linecap': 'round',
      });
      cracks.appendChild(path);

      this.crackPaths.push({
        el: path,
        // Cracks appear one at a time as damage accumulates.
        threshold: i / CRACK_COUNT,
        length: 0,
      });
    }
    this.root.appendChild(cracks);
    this.cracksSvg = cracks;

    // --- strain meter -------------------------------------------------------
    // Bottom centre, only visible while the mask is worn. Drawn as an arc so it
    // reads as part of the mask rather than as a game HUD bar.
    const strain = svg('svg', { viewBox: '0 0 200 40', class: 'mask-strain' });
    strain.appendChild(svg('path', {
      d: 'M 10 32 Q 100 4 190 32',
      fill: 'none',
      stroke: 'rgba(232,224,210,0.16)',
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }));
    this.strainFill = svg('path', {
      d: 'M 10 32 Q 100 4 190 32',
      fill: 'none',
      stroke: '#6fe3d4',
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
    });
    strain.appendChild(this.strainFill);
    this.root.appendChild(strain);
    this.strainSvg = strain;

    // --- lens name ----------------------------------------------------------
    const label = document.createElement('div');
    label.className = 'mask-lens-label';
    this.root.appendChild(label);
    this.lensLabel = label;
  }

  mount(parent) {
    parent.appendChild(this.root);
    // Path lengths are only measurable once the SVG is in the document.
    for (const c of this.crackPaths) {
      c.length = c.el.getTotalLength();
      c.el.style.strokeDasharray = String(c.length);
      c.el.style.strokeDashoffset = String(c.length);
    }
    this.strainLength = this.strainFill.getTotalLength();
    this.strainFill.style.strokeDasharray = String(this.strainLength);
    this.strainFill.style.strokeDashoffset = String(this.strainLength);
  }

  unmount() {
    this.root.remove();
  }

  setLens(lensData) {
    if (!lensData) return;
    this.lensLabel.textContent = lensData.name;
    const hex = `#${lensData.tint.toString(16).padStart(6, '0')}`;
    this.strainFill.setAttribute('stroke', hex);
    this.root.style.setProperty('--lens-tint', hex);

    // Re-announce the lens name briefly on every swap.
    this.lensLabel.classList.remove('flash');
    void this.lensLabel.offsetWidth;
    this.lensLabel.classList.add('flash');
  }

  /**
   * @param {number} worn     0..1 — how far the mask is onto the face
   * @param {number} strain   0..1
   * @param {number} cracks   0..1 — accumulated lifetime damage
   */
  update(worn, strain, cracks) {
    this._shown = worn;
    this.root.style.opacity = worn.toFixed(3);
    this.root.style.display = worn < 0.002 ? 'none' : '';
    if (worn < 0.002) return;

    // Strain arc fills left to right.
    this.strainFill.style.strokeDashoffset = String(this.strainLength * (1 - clamp(strain, 0, 1)));

    // Above the danger line the whole frame pulses and the cracks brighten.
    const danger = clamp((strain - 0.7) / 0.3, 0, 1);
    this.root.classList.toggle('straining', danger > 0.01 && !Settings.get('reduceFlashing'));
    this.root.style.setProperty('--danger', danger.toFixed(3));

    // Damage: each crack draws itself in once the total passes its threshold.
    // Strain temporarily reveals more than the permanent damage alone would.
    const shown = clamp(cracks * 0.7 + strain * 0.5, 0, 1);
    for (const c of this.crackPaths) {
      const t = clamp((shown - c.threshold) * 4, 0, 1);
      c.el.style.strokeDashoffset = String(c.length * (1 - t));
    }
  }
}
