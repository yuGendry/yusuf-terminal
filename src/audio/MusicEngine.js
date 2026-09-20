/**
 * MusicEngine.js — the procedural score.
 *
 * "Hollowhart Lullaby" is a slow waltz in D harmonic minor, played on a
 * synthesised music box. What makes it unsettling is not randomness — random
 * notes sound like a mistake, not like dread — but three deliberate choices:
 *
 *   1. The melody keeps resolving onto the raised seventh (C#) against a minor
 *      drone, which leaves every phrase leaning and unfinished.
 *   2. Each note is detuned by a few cents, drifting slowly, the way a real
 *      music box comb goes out of true as its pins wear.
 *   3. The pads underneath have a reversed envelope — a long swell into an
 *      abrupt cut — so they sound like they are being played backwards.
 *
 * Three layers crossfade with the player's situation:
 *   ambient  — drone, sparse music box
 *   tension  — adds a dissonant cluster and a heartbeat; something is near
 *   chase    — percussive, fast, detuned strings; it has seen you
 */

import { clamp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/** Semitone offsets from A4=440 for note names. */
const NOTE_INDEX = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** "F#4" | "Bb3" | "D5" -> Hz */
export function noteFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  const [, letter, accidental, octave] = m;
  let semis = NOTE_INDEX[letter];
  if (accidental === '#') semis += 1;
  if (accidental === 'b') semis -= 1;
  semis += (Number(octave) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

/**
 * The lullaby. 3/4, two eight-bar phrases.
 * `[note, beats]`; a null note is a rest.
 *
 * Phrase A climbs the tonic triad and falls back, which is nursery-simple.
 * Phrase B does the same shape but reaches a semitone higher to the flat
 * sixth, then drops onto the raised seventh — the same tune, gone wrong.
 */
const LULLABY = [
  // Phrase A
  ['D5', 1], ['F5', 1], ['A5', 1],
  ['G5', 1], ['F5', 1], ['E5', 1],
  ['D5', 1], ['E5', 1], ['F5', 1],
  ['E5', 2], [null, 1],
  // Phrase B — the same contour, reaching too far
  ['D5', 1], ['F5', 1], ['Bb5', 1],
  ['A5', 1], ['G5', 1], ['F5', 1],
  ['E5', 1], ['C#5', 1], ['E5', 1],
  ['D5', 2], [null, 1],
];

/** The Choir's version: the same melody, slower, sung, a fourth lower. */
const CHOIR_LULLABY = LULLABY.map(([n, b]) => [n ? transpose(n, -5) : null, b * 1.5]);

function transpose(name, semitones) {
  const f = noteFreq(name) * Math.pow(2, semitones / 12);
  return f;   // returned as Hz; the choir voice takes frequencies directly
}

export class MusicEngine {
  constructor(audio) {
    this.audio = audio;
    this.started = false;

    /** 0..1 weight per layer; the mixer crossfades toward these. */
    this.target = { ambient: 1, tension: 0, chase: 0 };
    this.current = { ambient: 0, tension: 0, chase: 0 };

    this.bpm = 52;              // slow waltz
    this._beat = 0;
    this._nextNoteTime = 0;
    this._melodyStep = 0;
    this._barsSinceMelody = 0;
    this._rng = makeRng(9091);

    this.layers = {};
    this._schedulerId = 0;
    this._detuneDrift = 0;
  }

  get ctx() { return this.audio.ctx; }

  // --------------------------------------------------------------------------

  start() {
    if (this.started || !this.ctx) return;
    this.started = true;

    const ctx = this.ctx;
    const music = this.audio.buses.music;

    // One gain per layer, all fed from the music bus.
    for (const name of ['ambient', 'tension', 'chase']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(music);
      this.layers[name] = g;
    }

    this._buildDrone();
    this._buildPads();
    this._buildChaseBed();

    this._nextNoteTime = ctx.currentTime + 0.2;
    // Look-ahead scheduling: Web Audio events must be queued in advance or
    // they arrive late and the rhythm stutters. A 25ms timer scheduling 150ms
    // ahead is the standard arrangement.
    this._schedulerId = setInterval(() => this._schedule(), 25);
  }

  stop() {
    clearInterval(this._schedulerId);
    this._schedulerId = 0;
    this.started = false;
    for (const src of this._sources ?? []) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this._sources = [];
  }

  // --------------------------------------------------------------------------
  // Persistent beds
  // --------------------------------------------------------------------------

  _buildDrone() {
    const ctx = this.ctx;
    this._sources ??= [];

    // Two oscillators a whisker apart beat slowly against each other, which
    // gives the drone a slow pulse without any LFO.
    const root = noteFreq('D1');
    for (const [mult, detune, type, gain] of [
      [1, -4, 'sine', 0.22],
      [1, +5, 'sine', 0.20],
      [2, -9, 'triangle', 0.07],
      [3, +7, 'sine', 0.035],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = root * mult;
      osc.detune.value = detune;

      const g = ctx.createGain();
      g.gain.value = gain;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lp.Q.value = 0.6;

      osc.connect(g);
      g.connect(lp);
      lp.connect(this.layers.ambient);
      osc.start();
      this._sources.push(osc);
    }

    // A very slow filter sweep so the drone breathes over ~40 seconds.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 1 / 40;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 70;
    sweep.connect(sweepGain);
    sweep.start();
    this._sources.push(sweep);
  }

  _buildPads() {
    const ctx = this.ctx;

    // The "reversed choir": detuned voices whose amplitude is shaped by a slow
    // sawtooth LFO — a long ramp up, then an instant drop. That asymmetry is
    // exactly the envelope of a reversed recording, and the ear reads it as
    // tape played backwards even though nothing is reversed.
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padGain.connect(this.layers.tension);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.85;
    this.padGain.connect(reverbSend);
    reverbSend.connect(this.audio.buses.reverbSend);

    for (const [note, detune] of [['D3', -7], ['F3', +6], ['A3', -11], ['C#4', +9]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = noteFreq(note);
      osc.detune.value = detune;

      // Formant-ish band to suggest a voice rather than a synth.
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = randRange(420, 900);
      bp.Q.value = 3.2;

      const vg = ctx.createGain();
      vg.gain.value = 0.16;

      // The reversed envelope LFO.
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.value = 1 / randRange(7, 11);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.14;
      lfo.connect(lfoGain);
      lfoGain.connect(vg.gain);

      osc.connect(bp);
      bp.connect(vg);
      vg.connect(this.padGain);

      osc.start();
      lfo.start();
      this._sources.push(osc, lfo);
    }
  }

  _buildChaseBed() {
    const ctx = this.ctx;

    // A low, detuned cluster that sits under the chase — two notes a semitone
    // apart, which is about as unpleasant as two pitches get.
    this.chaseCluster = ctx.createGain();
    this.chaseCluster.gain.value = 0;
    this.chaseCluster.connect(this.layers.chase);

    for (const [note, detune] of [['D2', 0], ['Eb2', +8], ['A2', -6], ['Bb2', +11]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = noteFreq(note);
      osc.detune.value = detune;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 1.4;

      const g = ctx.createGain();
      g.gain.value = 0.1;

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.chaseCluster);
      osc.start();
      this._sources.push(osc);
    }
  }

  // --------------------------------------------------------------------------
  // Scheduling
  // --------------------------------------------------------------------------

  _schedule() {
    if (!this.ctx) return;
    const ahead = 0.15;
    const beatLen = 60 / this.bpm;

    while (this._nextNoteTime < this.ctx.currentTime + ahead) {
      this._playBeat(this._nextNoteTime, beatLen);
      this._nextNoteTime += beatLen;
      this._beat++;
    }
  }

  _playBeat(time, beatLen) {
    const beatInBar = this._beat % 3;   // 3/4

    // --- ambient: the lullaby, played sparsely ---------------------------
    if (this.current.ambient > 0.02) {
      // The melody does not run continuously; it surfaces for a phrase and
      // then leaves several bars of drone. A tune that never stops stops being
      // frightening.
      if (this._melodyStep < LULLABY.length) {
        const [note, beats] = LULLABY[this._melodyStep];
        if (note) this._musicBox(noteFreq(note), time, beatLen * beats);
        this._melodyStep += 1;
        // Advance by the note's length rather than one beat.
        this._beat += beats - 1;
        this._nextNoteTime += beatLen * (beats - 1);
      } else {
        this._barsSinceMelody++;
        if (this._barsSinceMelody > 6 + Math.floor(this._rng() * 8)) {
          this._melodyStep = 0;
          this._barsSinceMelody = 0;
        }
      }
    }

    // --- tension: heartbeat on the downbeat ------------------------------
    if (this.current.tension > 0.05 && beatInBar === 0) {
      this._heartbeat(time, this.current.tension);
    }

    // --- chase: driving low percussion + stabs ---------------------------
    if (this.current.chase > 0.05) {
      this._chaseHit(time, beatInBar, this.current.chase);
    }
  }

  /**
   * A single music-box note: a struck metal tine.
   *
   * Built from a fundamental plus two inharmonic partials (a real comb tooth is
   * a bar, not a string, so its overtones are not whole multiples), a fast
   * attack, a long decay, and a tiny noise click for the pin striking.
   */
  _musicBox(freq, time, duration) {
    const ctx = this.ctx;
    const out = this.layers.ambient;

    // Slowly wandering detune — the comb is out of true.
    this._detuneDrift += (this._rng() - 0.5) * 3;
    this._detuneDrift = clamp(this._detuneDrift, -18, 18);

    const partials = [
      [1.0, 0.5, 2.6],
      [2.76, 0.16, 1.5],   // inharmonic, characteristic of a struck bar
      [5.4, 0.06, 0.9],
    ];

    for (const [mult, amp, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      osc.detune.value = this._detuneDrift;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(amp * 0.22, time + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay);

      osc.connect(g);
      g.connect(out);

      const send = ctx.createGain();
      send.gain.value = 0.55;
      g.connect(send);
      send.connect(this.audio.buses.reverbSend);

      osc.start(time);
      osc.stop(time + decay + 0.1);
      osc.onended = () => { osc.disconnect(); g.disconnect(); send.disconnect(); };
    }

    // The mechanism: a soft click as the pin plucks.
    const click = ctx.createBufferSource();
    click.buffer = this.audio.noiseBuffer();
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 3200;
    cf.Q.value = 2;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.02, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    click.connect(cf); cf.connect(cg); cg.connect(out);
    click.start(time, this._rng() * 1.5, 0.05);
  }

  _heartbeat(time, weight) {
    const ctx = this.ctx;
    // Two thumps, lub-dub, the second softer and quick behind the first.
    for (const [offset, amp] of [[0, 1], [0.21, 0.6]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(64, time + offset);
      osc.frequency.exponentialRampToValueAtTime(38, time + offset + 0.13);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time + offset);
      g.gain.exponentialRampToValueAtTime(0.32 * amp * weight, time + offset + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + offset + 0.26);

      osc.connect(g);
      g.connect(this.layers.tension);
      osc.start(time + offset);
      osc.stop(time + offset + 0.32);
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
    }
  }

  _chaseHit(time, beatInBar, weight) {
    const ctx = this.ctx;
    const out = this.layers.chase;

    // Percussion on every beat, harder on the downbeat.
    const hard = beatInBar === 0;
    const noise = ctx.createBufferSource();
    noise.buffer = this.audio.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = hard ? 'lowpass' : 'bandpass';
    f.frequency.setValueAtTime(hard ? 420 : 2600, time);
    f.frequency.exponentialRampToValueAtTime(hard ? 90 : 900, time + 0.16);
    f.Q.value = hard ? 1 : 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime((hard ? 0.34 : 0.13) * weight, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + (hard ? 0.28 : 0.1));
    noise.connect(f); f.connect(g); g.connect(out);
    noise.start(time, this._rng() * 1.5, 0.35);

    // Dissonant string stab on the off-beats.
    if (!hard) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = noteFreq('D4') * (this._rng() < 0.5 ? 1 : 1.0595);   // a semitone apart
      osc.frequency.value = base;
      osc.detune.value = randRange(-25, 25);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = base * 2.2;
      bp.Q.value = 5;

      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, time);
      g2.gain.exponentialRampToValueAtTime(0.1 * weight, time + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

      osc.connect(bp); bp.connect(g2); g2.connect(out);
      osc.start(time);
      osc.stop(time + 0.3);
      osc.onended = () => { osc.disconnect(); bp.disconnect(); g2.disconnect(); };
    }
  }

  // --------------------------------------------------------------------------
  // Mixing
  // --------------------------------------------------------------------------

  /**
   * Set the musical situation.
   * @param {'calm'|'unease'|'tension'|'chase'} mood
   */
  setMood(mood) {
    switch (mood) {
      case 'calm':    this.target = { ambient: 0.55, tension: 0, chase: 0 }; break;
      case 'unease':  this.target = { ambient: 1.0, tension: 0.25, chase: 0 }; break;
      case 'tension': this.target = { ambient: 0.7, tension: 1.0, chase: 0 }; break;
      case 'chase':   this.target = { ambient: 0.15, tension: 0.5, chase: 1.0 }; break;
      case 'silent':  this.target = { ambient: 0, tension: 0, chase: 0 }; break;
      default: break;
    }
    this.mood = mood;
  }

  update(dt) {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Crossfades are asymmetric on purpose: the chase layer slams in almost
    // immediately (the scare has to land on the frame it happens) and bleeds
    // out slowly (the adrenaline should outlast the threat).
    for (const name of ['ambient', 'tension', 'chase']) {
      const to = this.target[name];
      const rising = to > this.current[name];
      const rate = name === 'chase' ? (rising ? 14 : 0.7) : (rising ? 1.6 : 1.1);
      this.current[name] = lerp(this.current[name], to, clamp(rate * dt, 0, 1));
      this.layers[name].gain.setTargetAtTime(this.current[name] * 0.6, now, 0.05);
    }

    this.padGain?.gain.setTargetAtTime(this.current.tension * 0.5, now, 0.2);
    this.chaseCluster?.gain.setTargetAtTime(this.current.chase * 0.7, now, 0.1);

    // The chase tempo pushes up as the threat closes.
    this.bpm = lerp(52, 138, this.current.chase);
  }

  /** The Choir's lullaby, positioned in the world. Used by the Ch.3 enemy. */
  singChoirPhrase(panner, weight = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    let t = ctx.currentTime;
    const beat = 60 / 44;

    for (const [freq, beats] of CHOIR_LULLABY) {
      if (freq) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = randRange(-14, 14);

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq * 2.4;
        bp.Q.value = 4;

        const g = ctx.createGain();
        const dur = beat * beats;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09 * weight, t + dur * 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        osc.connect(bp); bp.connect(g);
        g.connect(panner ?? this.audio.buses.music);
        osc.start(t);
        osc.stop(t + dur + 0.1);
        osc.onended = () => { osc.disconnect(); bp.disconnect(); g.disconnect(); };
      }
      t += beat * beats;
    }
    return t - ctx.currentTime;
  }
}

export { LULLABY };
