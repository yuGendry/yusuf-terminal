/**
 * AudioEngine.js — Web Audio graph, buses and the UI sound set.
 *
 * Everything is synthesised; no audio files ship with the game. This module
 * owns the routing (master → music/sfx/voice buses, each wired to a settings
 * slider) and the small library of interface sounds. The procedural score and
 * the adaptive music system build on top of this in MusicEngine.js.
 *
 * Browsers will not start an AudioContext without a gesture, so `unlock()` must
 * be called from a click/keypress before anything will be audible.
 */

import { Settings } from '../core/Settings.js';
import { clamp, randRange } from '../util/MathUtil.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buses = {};
    this._unlockHandlers = [];
    this._noiseBuffer = null;
  }

  /** Create the graph. Safe to call repeatedly. */
  init() {
    if (this.ctx) return this.ctx;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      console.warn('[audio] Web Audio unavailable; running silent.');
      return null;
    }

    this.ctx = new Ctx({ latencyHint: 'interactive' });

    // --- bus graph ----------------------------------------------------------
    //   sources → [music|sfx|voice] → master → limiter → destination
    const master = this.ctx.createGain();

    // A gentle limiter on the master: procedural synthesis can stack up
    // unpredictably and this stops a chase layer from clipping.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;

    master.connect(limiter);
    limiter.connect(this.ctx.destination);

    this.buses.master = master;
    this.buses.limiter = limiter;

    for (const name of ['music', 'sfx', 'voice']) {
      const g = this.ctx.createGain();
      g.connect(master);
      this.buses[name] = g;
    }

    // A shared convolution reverb — the whole building is tiled, wooden and
    // enormous, and dry sounds would break that instantly.
    this.buses.reverb = this.ctx.createConvolver();
    this.buses.reverb.buffer = this._makeImpulse(2.6, 2.4);
    this.buses.reverbSend = this.ctx.createGain();
    this.buses.reverbSend.gain.value = 0.32;
    this.buses.reverbSend.connect(this.buses.reverb);
    this.buses.reverb.connect(master);

    this._applyVolumes();
    for (const key of ['volMaster', 'volMusic', 'volSfx', 'volVoice']) {
      Settings.on(`change:${key}`, () => this._applyVolumes());
    }

    this.ready = true;
    return this.ctx;
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const set = (node, value) => {
      node.gain.setTargetAtTime(clamp(value, 0, 1), now, 0.02);
    };
    // Perceptual curve: a linear slider sounds wrong, squaring it sounds right.
    const curve = (v) => v * v;
    set(this.buses.master, curve(Settings.get('volMaster')));
    set(this.buses.music, curve(Settings.get('volMusic')));
    set(this.buses.sfx, curve(Settings.get('volSfx')));
    set(this.buses.voice, curve(Settings.get('volVoice')));
  }

  /** Must be called from a user gesture. */
  async unlock() {
    this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    for (const fn of this._unlockHandlers) fn();
    this._unlockHandlers.length = 0;
    return this.ctx.state === 'running';
  }

  onUnlocked(fn) {
    if (this.ctx?.state === 'running') fn();
    else this._unlockHandlers.push(fn);
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // --------------------------------------------------------------------------
  // Primitives
  // --------------------------------------------------------------------------

  /** Cached white-noise buffer; the basis of every non-tonal sound we make. */
  noiseBuffer(seconds = 2) {
    if (this._noiseBuffer) return this._noiseBuffer;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  /**
   * Generate a decaying-noise impulse response for the convolver.
   * Two-stage decay (fast early reflections, long tail) reads as a big hall.
   */
  _makeImpulse(seconds = 2.5, decay = 2.2) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const envelope = Math.pow(1 - t, decay);
        // Sparse early reflections give the tail a sense of walls.
        const early = i < rate * 0.08 && Math.random() > 0.986 ? 3 : 1;
        data[i] = (Math.random() * 2 - 1) * envelope * early;
      }
    }
    return buf;
  }

  /**
   * One-shot oscillator voice with an ADSR-ish envelope.
   * Returns the gain node so callers can route or modulate it further.
   */
  tone({
    freq = 440,
    type = 'sine',
    duration = 0.4,
    attack = 0.005,
    decay = 0.08,
    sustain = 0.5,
    release = 0.2,
    gain = 0.2,
    bus = 'sfx',
    detune = 0,
    reverb = 0,
    pan = 0,
    when = 0,
  } = {}) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.detune.setValueAtTime(detune, t0);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(gain * sustain, 0.0001), t0 + attack + decay);
    env.gain.setValueAtTime(Math.max(gain * sustain, 0.0001), t0 + duration);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);

    let node = env;
    if (pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      env.connect(panner);
      node = panner;
    }

    osc.connect(env);
    node.connect(this.buses[bus] ?? this.buses.sfx);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      node.connect(send);
      send.connect(this.buses.reverbSend);
    }

    osc.start(t0);
    osc.stop(t0 + duration + release + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    return { osc, env };
  }

  /** Filtered noise burst — footsteps, cloth, impacts, breath. */
  noise({
    duration = 0.2,
    gain = 0.2,
    filterType = 'bandpass',
    freq = 1200,
    q = 1.2,
    freqEnd = null,
    bus = 'sfx',
    reverb = 0,
    pan = 0,
    attack = 0.002,
    when = 0,
  } = {}) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    // Start at a random offset so repeated footsteps never sound identical.
    //
    // Clamped, because the buffer is two seconds long and a caller asking for
    // a longer noise than that produced a negative offset, which is not a
    // quiet failure: `start()` throws, the sound never plays, and whatever
    // called it stops dead mid-sequence. The source loops, so a longer
    // duration than the buffer is fine — it simply wraps.
    const room = Math.max(0, src.buffer.duration - duration - 0.01);
    const offset = Math.random() * room;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    if (freqEnd !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t0 + duration);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    let node = env;
    if (pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      env.connect(panner);
      node = panner;
    }

    src.connect(filter);
    filter.connect(env);
    node.connect(this.buses[bus] ?? this.buses.sfx);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      node.connect(send);
      send.connect(this.buses.reverbSend);
    }

    src.start(t0, offset, duration + 0.05);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
    return { src, filter, env };
  }

  // --------------------------------------------------------------------------
  // Interface sounds
  // --------------------------------------------------------------------------

  /**
   * Menu hover: a short, dry wooden tick, like a puppet joint knocking.
   * Pitch-randomised so scanning a menu doesn't sound like a machine gun.
   */
  uiHover() {
    if (!this.ctx) return;
    this.noise({
      duration: 0.045, gain: 0.055, filterType: 'bandpass',
      freq: randRange(1800, 2600), q: 3.5, reverb: 0.12,
    });
    this.tone({
      freq: randRange(820, 960), type: 'triangle',
      duration: 0.035, attack: 0.001, decay: 0.02, sustain: 0.1, release: 0.05,
      gain: 0.035, reverb: 0.15,
    });
  }

  /** Menu confirm: the tick, plus a low wooden thunk underneath. */
  uiClick() {
    if (!this.ctx) return;
    this.noise({
      duration: 0.07, gain: 0.09, filterType: 'bandpass',
      freq: 1400, freqEnd: 500, q: 2.2, reverb: 0.2,
    });
    this.tone({
      freq: 196, type: 'triangle',
      duration: 0.08, attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.16,
      gain: 0.1, reverb: 0.25,
    });
  }

  /** Menu back / cancel: the same gesture, falling instead of rising. */
  uiBack() {
    if (!this.ctx) return;
    this.tone({
      freq: 330, type: 'triangle',
      duration: 0.1, attack: 0.002, decay: 0.06, sustain: 0.15, release: 0.2,
      gain: 0.08, reverb: 0.22,
    });
    this.tone({
      freq: 220, type: 'sine', when: 0.05,
      duration: 0.12, attack: 0.002, decay: 0.08, sustain: 0.1, release: 0.25,
      gain: 0.06, reverb: 0.25,
    });
  }

  /** Denied / locked option. */
  uiDenied() {
    if (!this.ctx) return;
    this.tone({
      freq: 146, type: 'square',
      duration: 0.09, attack: 0.002, decay: 0.05, sustain: 0.3, release: 0.1,
      gain: 0.05, reverb: 0.1,
    });
  }

  /** A brief burst of tape static, used for menu transitions and VHS moments. */
  staticBurst(duration = 0.22, gain = 0.09) {
    if (!this.ctx) return;
    this.noise({
      duration, gain, filterType: 'highpass', freq: 900, q: 0.5, reverb: 0.05,
    });
  }

  dispose() {
    this.ctx?.close();
    this.ctx = null;
    this.ready = false;
  }
}

/** Single shared instance — audio hardware is not something to have two of. */
export const Audio = new AudioEngine();
