/**
 * GameSounds.js — the diegetic sound set, mixed into AudioEngine.
 *
 * Everything here is synthesised. The interesting ones:
 *
 *  - The mask hum is a continuous, barely-audible tone that rises with Strain.
 *    It is the sound the monsters hear, so the player needs to be able to hear
 *    it too, just — at the edge of perception.
 *  - Hallucinations are routed through the same 3D panner as real sounds, so
 *    they are genuinely indistinguishable by ear. That is the point.
 *  - Footsteps take a surface name and vary pitch and filtering per step.
 */

import * as THREE from 'three';
import { clamp, randRange, lerp } from '../util/MathUtil.js';

/** Footstep timbres per surface. */
export const SURFACES = {
  wood:    { freq: 760,  freqEnd: 180, q: 1.1, gain: 0.17, tone: 128, tail: 0.11 },
  tile:    { freq: 2500, freqEnd: 950, q: 2.6, gain: 0.14, tone: 0,   tail: 0.09 },
  metal:   { freq: 3100, freqEnd: 700, q: 3.8, gain: 0.16, tone: 430, tail: 0.16 },
  water:   { freq: 1500, freqEnd: 300, q: 0.8, gain: 0.22, tone: 0,   tail: 0.22 },
  carpet:  { freq: 480,  freqEnd: 120, q: 0.7, gain: 0.09, tone: 0,   tail: 0.08 },
  gravel:  { freq: 1900, freqEnd: 420, q: 1.4, gain: 0.18, tone: 0,   tail: 0.13 },
  sawdust: { freq: 900,  freqEnd: 220, q: 0.9, gain: 0.11, tone: 0,   tail: 0.10 },
};

/**
 * Mix the game's sound methods into an AudioEngine instance.
 * Kept separate from the engine so the core stays about routing, not content.
 */
export function installGameSounds(A) {
  // --------------------------------------------------------------------------
  // 3D positioning
  // --------------------------------------------------------------------------

  /** Create a panner at a world position, connected to a bus. */
  A.panner = function panner(position, { bus = 'sfx', refDistance = 2.5, maxDistance = 40, reverb = 0.3 } = {}) {
    if (!this.ctx) return null;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.maxDistance = maxDistance;
    p.rolloffFactor = 1.1;
    if (p.positionX) {
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
    } else {
      p.setPosition(position.x, position.y, position.z);
    }
    p.connect(this.buses[bus] ?? this.buses.sfx);
    if (reverb > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverb;
      p.connect(send);
      send.connect(this.buses.reverbSend);
    }
    return p;
  };

  /** Keep the listener glued to the camera. Called once per frame. */
  A.updateListener = function updateListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = camera.position;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02);
      L.upY.setTargetAtTime(up.y, t, 0.02);
      L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  };

  /** Filtered noise burst routed through a world-space panner. */
  A.noiseAt = function noiseAt(position, opts = {}) {
    const p = this.panner(position, { bus: opts.bus, reverb: opts.reverb ?? 0.35 });
    if (!p) return;
    const node = this.noise({ ...opts, reverb: 0 });
    if (!node) return;
    node.env.disconnect();
    node.env.connect(p);
  };

  A.toneAt = function toneAt(position, opts = {}) {
    const p = this.panner(position, { bus: opts.bus, reverb: opts.reverb ?? 0.35 });
    if (!p) return;
    const node = this.tone({ ...opts, reverb: 0 });
    if (!node) return;
    node.env.disconnect();
    node.env.connect(p);
  };

  // --------------------------------------------------------------------------
  // Footsteps
  // --------------------------------------------------------------------------

  A.footstep = function footstep(surface, { loudness = 1, position = null } = {}) {
    if (!this.ctx) return;
    const s = SURFACES[surface] ?? SURFACES.wood;
    const gain = s.gain * loudness;

    const emit = (opts) => (position ? this.noiseAt(position, opts) : this.noise(opts));

    emit({
      duration: s.tail,
      gain,
      filterType: 'lowpass',
      freq: s.freq * randRange(0.88, 1.14),
      freqEnd: s.freqEnd,
      q: s.q,
      reverb: 0.3,
      pan: position ? 0 : randRange(-0.15, 0.15),
    });

    if (s.tone) {
      const t = {
        freq: s.tone * randRange(0.92, 1.08),
        type: 'triangle',
        duration: 0.055,
        attack: 0.001, decay: 0.035, sustain: 0.1, release: 0.09,
        gain: gain * 0.45,
        reverb: 0.32,
      };
      position ? this.toneAt(position, t) : this.tone(t);
    }
  };

  // --------------------------------------------------------------------------
  // The Veilmask
  // --------------------------------------------------------------------------

  A.maskOn = function maskOn() {
    // Porcelain settling against skin, then the lens engaging.
    this.noise({ duration: 0.16, gain: 0.1, filterType: 'lowpass', freq: 900, freqEnd: 260, q: 0.8, reverb: 0.2 });
    this.tone({ freq: 196, type: 'sine', duration: 0.22, attack: 0.004, decay: 0.1, sustain: 0.3, release: 0.4, gain: 0.07, reverb: 0.5 });
    this.tone({ freq: 587.33, type: 'sine', duration: 0.5, attack: 0.02, decay: 0.3, sustain: 0.15, release: 0.7, gain: 0.035, reverb: 0.8, detune: -14, when: 0.05 });
  };

  A.maskOff = function maskOff(forced = false) {
    if (forced) {
      // It tears itself off: a sharp crack and a long ringing tail.
      this.noise({ duration: 0.09, gain: 0.26, filterType: 'bandpass', freq: 3400, freqEnd: 800, q: 1.2, reverb: 0.4 });
      this.tone({ freq: 1244, type: 'sine', duration: 0.1, attack: 0.001, decay: 0.06, sustain: 0.2, release: 1.6, gain: 0.1, reverb: 0.9 });
      this.tone({ freq: 1661, type: 'sine', duration: 0.1, attack: 0.001, decay: 0.05, sustain: 0.15, release: 1.3, gain: 0.06, reverb: 0.9, detune: 22 });
    } else {
      this.noise({ duration: 0.13, gain: 0.08, filterType: 'lowpass', freq: 1200, freqEnd: 400, q: 0.7, reverb: 0.2 });
      this.tone({ freq: 147, type: 'sine', duration: 0.18, attack: 0.004, decay: 0.09, sustain: 0.2, release: 0.3, gain: 0.05, reverb: 0.4 });
    }
  };

  A.lensSwap = function lensSwap() {
    // Glass turning in a brass bezel: a short scrape plus a detent click.
    this.noise({ duration: 0.11, gain: 0.07, filterType: 'bandpass', freq: 2100, freqEnd: 3400, q: 4, reverb: 0.25 });
    this.tone({ freq: 1046, type: 'triangle', duration: 0.04, attack: 0.001, decay: 0.025, sustain: 0.1, release: 0.06, gain: 0.05, reverb: 0.3, when: 0.07 });
  };

  /**
   * The hum. A continuous pair of close tones that beat against each other,
   * plus a high partial that only becomes audible at high Strain.
   */
  A.startMaskHum = function startMaskHum() {
    if (!this.ctx) return null;
    const ctx = this.ctx;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.buses.sfx);

    const send = ctx.createGain();
    send.gain.value = 0.5;
    out.connect(send);
    send.connect(this.buses.reverbSend);

    const oscs = [];
    for (const [freq, detune, type, g] of [
      [110, -6, 'sine', 0.5],
      [110, +7, 'sine', 0.45],
      [440, -3, 'sine', 0.05],
      [1320, +11, 'sine', 0.02],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const vg = ctx.createGain();
      vg.gain.value = g;
      osc.connect(vg);
      vg.connect(out);
      osc.start();
      oscs.push({ osc, gain: vg, baseFreq: freq });
    }

    return { out, oscs, send };
  };

  A.setMaskHum = function setMaskHum(nodes, level, strain) {
    if (!nodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Deliberately quiet. The player should have to listen for it.
    nodes.out.gain.setTargetAtTime(clamp(level, 0, 1) * 0.055, t, 0.12);
    // Strain drags the hum sharp, which is what makes it start to feel wrong.
    for (const { osc, baseFreq } of nodes.oscs) {
      osc.frequency.setTargetAtTime(baseFreq * (1 + strain * 0.06), t, 0.3);
    }
  };

  A.stopMaskHum = function stopMaskHum(nodes) {
    if (!nodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    nodes.out.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      for (const { osc } of nodes.oscs) {
        try { osc.stop(); osc.disconnect(); } catch { /* already gone */ }
      }
      nodes.out.disconnect();
      nodes.send.disconnect();
    }, 400);
  };

  // --------------------------------------------------------------------------
  // Hallucinations — routed identically to real sounds
  // --------------------------------------------------------------------------

  A.hallucination = function hallucination(kind, position) {
    if (!this.ctx) return;
    switch (kind) {
      case 'whisper': {
        // Breathy band-limited noise with a slow sweep: speech-shaped, but
        // never resolving into a word.
        this.noiseAt(position, {
          duration: randRange(0.7, 1.4), gain: 0.05,
          filterType: 'bandpass', freq: randRange(700, 1300), freqEnd: randRange(300, 700),
          q: 5, reverb: 0.7, attack: 0.15,
        });
        break;
      }
      case 'footstep':
        this.footstep('wood', { loudness: randRange(0.5, 0.9), position });
        break;
      case 'creak': {
        this.toneAt(position, {
          freq: randRange(80, 160), type: 'sawtooth',
          duration: randRange(0.5, 1.1), attack: 0.2, decay: 0.3, sustain: 0.4, release: 0.6,
          gain: 0.035, reverb: 0.6,
        });
        this.noiseAt(position, {
          duration: 0.6, gain: 0.03, filterType: 'bandpass',
          freq: 420, freqEnd: 280, q: 8, reverb: 0.5, attack: 0.2,
        });
        break;
      }
      case 'breath':
        this.noiseAt(position, {
          duration: 0.9, gain: 0.055, filterType: 'bandpass',
          freq: 620, freqEnd: 340, q: 1.6, reverb: 0.3, attack: 0.25,
        });
        break;
      case 'name': {
        // Two syllables, formant-shaped. Close enough to a name that the ear
        // supplies the rest.
        for (const [when, f] of [[0, 620], [0.26, 430]]) {
          this.noiseAt(position, {
            duration: 0.22, gain: 0.07, filterType: 'bandpass',
            freq: f, q: 9, reverb: 0.55, attack: 0.05, when,
          });
        }
        break;
      }
      default: break;
    }
  };

  // --------------------------------------------------------------------------
  // Flashlight
  // --------------------------------------------------------------------------

  A.flashlightClick = function flashlightClick(dead = false) {
    this.noise({ duration: 0.03, gain: dead ? 0.06 : 0.11, filterType: 'bandpass', freq: dead ? 1800 : 2800, q: 5, reverb: 0.15 });
    if (!dead) this.tone({ freq: 1400, type: 'square', duration: 0.015, attack: 0.001, decay: 0.008, sustain: 0.1, release: 0.02, gain: 0.03 });
  };

  A.flashlightSmack = function flashlightSmack() {
    this.noise({ duration: 0.07, gain: 0.2, filterType: 'lowpass', freq: 700, freqEnd: 180, q: 1, reverb: 0.4 });
    this.tone({ freq: 96, type: 'triangle', duration: 0.09, attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.15, gain: 0.11, reverb: 0.4 });
  };

  A.flashlightReload = function flashlightReload() {
    for (const [when, freq] of [[0, 2400], [0.11, 1800], [0.24, 3000]]) {
      this.noise({ duration: 0.04, gain: 0.08, filterType: 'bandpass', freq, q: 4, reverb: 0.2, when });
    }
  };

  // --------------------------------------------------------------------------
  // Objects and UI
  // --------------------------------------------------------------------------

  A.paperPickup = function paperPickup() {
    this.noise({ duration: 0.26, gain: 0.07, filterType: 'highpass', freq: 2600, q: 0.6, reverb: 0.2, attack: 0.02 });
  };

  A.puzzleSolved = function puzzleSolved() {
    // Not a fanfare. A mechanism giving way, and one clean music-box note.
    this.noise({ duration: 0.14, gain: 0.12, filterType: 'lowpass', freq: 800, freqEnd: 200, q: 1.4, reverb: 0.5 });
    this.tone({ freq: 587.33, type: 'sine', duration: 0.5, attack: 0.004, decay: 0.3, sustain: 0.2, release: 1.4, gain: 0.07, reverb: 0.85, when: 0.09 });
  };

  A.doorOpen = function doorOpen(position = null) {
    const opts = {
      duration: 1.1, gain: 0.1, filterType: 'bandpass',
      freq: 320, freqEnd: 180, q: 6, reverb: 0.6, attack: 0.25,
    };
    position ? this.noiseAt(position, opts) : this.noise(opts);
  };

  A.leverClunk = function leverClunk(position = null) {
    const n = { duration: 0.1, gain: 0.16, filterType: 'lowpass', freq: 900, freqEnd: 160, q: 1.2, reverb: 0.5 };
    const t = { freq: 110, type: 'triangle', duration: 0.12, attack: 0.001, decay: 0.07, sustain: 0.15, release: 0.2, gain: 0.1, reverb: 0.5 };
    if (position) { this.noiseAt(position, n); this.toneAt(position, t); }
    else { this.noise(n); this.tone(t); }
  };

  A.tapeStart = function tapeStart() {
    this.noise({ duration: 0.5, gain: 0.07, filterType: 'highpass', freq: 1200, q: 0.5 });
    this.tone({ freq: 62, type: 'sawtooth', duration: 0.7, attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.3, gain: 0.04 });
  };
  A.tapeCut = function tapeCut() {
    this.noise({ duration: 0.06, gain: 0.05, filterType: 'highpass', freq: 2000, q: 0.5 });
  };
  A.tapeGlitch = function tapeGlitch() {
    this.noise({ duration: 0.45, gain: 0.16, filterType: 'highpass', freq: 600, q: 0.4 });
    this.tone({ freq: randRange(1800, 3200), type: 'square', duration: 0.12, attack: 0.001, decay: 0.05, sustain: 0.4, release: 0.05, gain: 0.05 });
  };
  A.tapeEnd = function tapeEnd() {
    this.noise({ duration: 0.8, gain: 0.06, filterType: 'lowpass', freq: 1400, freqEnd: 200, q: 0.5 });
  };

  /** Distant structural noises — the building settling around the player. */
  A.distantThud = function distantThud(position) {
    this.noiseAt(position, {
      duration: 0.7, gain: 0.13, filterType: 'lowpass',
      freq: 260, freqEnd: 60, q: 1.1, reverb: 0.9,
    });
  };

  A.woodSnap = function woodSnap(position) {
    this.noiseAt(position, {
      duration: 0.22, gain: 0.3, filterType: 'bandpass',
      freq: 1600, freqEnd: 380, q: 1.6, reverb: 0.7,
    });
  };

  return A;
}
