/**
 * MusicEngine.js — the procedural score.
 *
 * The whole soundtrack is one tune. "Hollowhart Lullaby" is a slow waltz in D
 * harmonic minor, played on a synthesised music box, and every chapter gets a
 * different arrangement of it: retuned, re-metred, and handed to a different
 * instrument. That is how a score holds a game together — five unrelated
 * tracks would just sound like five unrelated rooms, whereas the same melody
 * coming back on a church organ after you last heard it on a music box is the
 * game telling you how far you have come.
 *
 * What makes the tune unsettling is not randomness — random notes sound like a
 * mistake, not like dread — but three deliberate choices:
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


/**
 * Chapter arrangements.
 *
 * `melody` is `[note, beats]` pairs. `voice` names a timbre built in
 * `_voice()`. `drone` is the pedal note the whole layer sits on, `pad` the
 * chord the reversed-choir voices hold, `cluster` the chase bed.
 *
 * The melodies are all derived from the lullaby rather than invented
 * separately — transposed, re-metred, thinned or thickened — so the score is
 * one piece of music in five costumes.
 */
const THEMES = {
  /** Ch.1 — the original. A music box in an empty lobby. */
  lullaby: {
    title: 'Hollowhart Lullaby',
    bpm: 52,
    meter: 3,
    drone: 'D1',
    pad: ['D3', 'F3', 'A3', 'C#4'],
    cluster: ['D2', 'Eb2', 'A2', 'Bb2'],
    voice: 'musicbox',
    melody: LULLABY,
    rest: [6, 14],          // bars of silence between statements
  },

  /**
   * Ch.2 — "Forty-One Bodies". The same contour dragged into 4/4 and down a
   * fourth, struck on wood instead of metal. A workshop keeps time with a
   * mallet, not a comb.
   */
  workshop: {
    title: 'Forty-One Bodies',
    bpm: 46,
    meter: 4,
    drone: 'A0',
    pad: ['A2', 'C3', 'E3', 'G#3'],
    cluster: ['A1', 'Bb1', 'E2', 'F2'],
    voice: 'woodblock',
    melody: [
      ['A4', 2], ['C5', 1], ['E5', 1],
      ['D5', 2], ['C5', 2],
      ['A4', 1], ['B4', 1], ['C5', 2],
      ['B4', 3], [null, 1],
      ['A4', 2], ['C5', 1], ['F5', 1],
      ['E5', 2], ['D5', 2],
      ['C5', 1], ['G#4', 1], ['B4', 2],
      ['A4', 4],
    ],
    rest: [4, 10],
  },

  /**
   * Ch.3 — "They Are Still Rehearsing". The lullaby sung rather than played,
   * a minor third up, stretched. This is the Choir's arrangement leaking into
   * the score: by chapter three the monsters have the tune.
   */
  rehearsal: {
    title: 'They Are Still Rehearsing',
    bpm: 58,
    meter: 3,
    drone: 'F1',
    pad: ['F3', 'Ab3', 'C4', 'E4'],
    cluster: ['F2', 'Gb2', 'C3', 'Db3'],
    voice: 'choir',
    melody: [
      ['F5', 2], ['Ab5', 1],
      ['C6', 2], ['Bb5', 1],
      ['Ab5', 2], ['G5', 1],
      ['F5', 3],
      ['F5', 2], ['Ab5', 1],
      ['Db6', 2], ['C6', 1],
      ['Bb5', 1], ['Ab5', 1], ['G5', 1],
      ['E5', 2], ['F5', 1],
    ],
    rest: [3, 7],
  },

  /**
   * Ch.4 — "Below The Water Table". Almost no melody left: single long tones,
   * everything lowpassed to a mutter, each note bending flat as it decays. It
   * should sound like the tune is being played in the next building, underwater.
   */
  flood: {
    title: 'Below The Water Table',
    bpm: 38,
    meter: 4,
    drone: 'Bb0',
    pad: ['Bb2', 'Db3', 'F3', 'A3'],
    cluster: ['Bb1', 'B1', 'F2', 'Gb2'],
    voice: 'drowned',
    melody: [
      ['Bb3', 4], ['Db4', 4],
      ['F4', 6], [null, 2],
      ['Eb4', 4], ['Db4', 4],
      ['Bb3', 8],
      [null, 4],
      ['A3', 6], [null, 2],
    ],
    rest: [2, 5],
  },

  /**
   * Ch.5 — "The Grand Premiere". The tune at full height on a theatre organ,
   * back in the original key, in 3/4, at nearly double the tempo. Everything
   * the lullaby was hinting at, played out loud to a full house.
   */
  premiere: {
    title: 'The Grand Premiere',
    bpm: 78,
    meter: 3,
    drone: 'D1',
    pad: ['D3', 'F3', 'A3', 'C#4'],
    cluster: ['D2', 'Eb2', 'A2', 'Bb2'],
    voice: 'organ',
    melody: [
      ['D5', 1], ['F5', 1], ['A5', 1],
      ['D6', 3],
      ['C#6', 1], ['Bb5', 1], ['A5', 1],
      ['G5', 1], ['F5', 1], ['E5', 1],
      ['D5', 1], ['F5', 1], ['Bb5', 1],
      ['A5', 3],
      ['F5', 1], ['E5', 1], ['C#5', 1],
      ['D5', 3],
    ],
    rest: [1, 3],
  },
};

/** Which arrangement each chapter plays. */
const THEME_BY_CHAPTER = { 1: 'lullaby', 2: 'workshop', 3: 'rehearsal', 4: 'flood', 5: 'premiere' };

/**
 * Timbres. Each entry gives the partials of one struck or held note —
 * `[frequency multiple, amplitude, decay seconds]` — plus the envelope and
 * filtering that turn a stack of sines into an instrument.
 *
 * The inharmonic multiples matter more than anything else here. A struck
 * metal bar is not a string: its overtones are not whole multiples of the
 * fundamental, and it is that mismatch, not the waveform, that makes the ear
 * hear "music box" rather than "synthesiser".
 */
const VOICES = {
  musicbox: {
    type: 'sine',
    partials: [[1.0, 0.5, 2.6], [2.76, 0.16, 1.5], [5.4, 0.06, 0.9]],
    attack: 0.004, gain: 0.22, click: 3200, clickGain: 0.02,
  },
  woodblock: {
    // Wood is lossy: fewer, closer partials and a decay measured in fractions
    // of a second rather than seconds.
    type: 'triangle',
    partials: [[1.0, 0.55, 0.9], [2.1, 0.22, 0.42], [3.35, 0.09, 0.22]],
    attack: 0.003, gain: 0.26, click: 1400, clickGain: 0.045,
  },
  choir: {
    // A held voice, not a struck one: slow in, slow out, formant bandpass.
    type: 'sawtooth',
    partials: [[1.0, 0.34, 3.4], [2.0, 0.1, 2.6], [3.0, 0.05, 2.0]],
    attack: 0.34, gain: 0.16, formant: [480, 3.0], sustain: true,
  },
  drowned: {
    // Everything above 400 Hz is gone, and the pitch sags as it decays.
    type: 'sine',
    partials: [[1.0, 0.6, 5.5], [1.98, 0.14, 3.4], [2.5, 0.05, 2.2]],
    attack: 0.5, gain: 0.3, lowpass: 380, bend: -0.035, sustain: true,
  },
  organ: {
    // Drawbar registration: octaves and a fifth, which is what makes an organ
    // sound enormous rather than merely loud.
    type: 'sine',
    partials: [[1.0, 0.4, 1.6], [2.0, 0.3, 1.6], [3.0, 0.2, 1.4], [4.0, 0.12, 1.2], [6.0, 0.07, 1.0]],
    attack: 0.03, gain: 0.2, sustain: true, chiff: true,
  },
};

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

    this.themeName = 'lullaby';
    this.theme = THEMES.lullaby;
    this.bpm = this.theme.bpm;
    this._beat = 0;
    this._nextNoteTime = 0;
    this._melodyStep = 0;
    this._barsSinceMelody = 0;
    this._rng = makeRng(9091);

    this.layers = {};
    this._schedulerId = 0;
    this._detuneDrift = 0;

    // Retunable voices, so a chapter change transposes the live graph rather
    // than tearing it down and building a new one (which clicks).
    this.droneVoices = [];
    this.padVoices = [];
    this.clusterVoices = [];
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
    const root = noteFreq(this.theme.drone);
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
      this.droneVoices.push({ osc, mult });
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

    const PAD_DETUNE = [-7, +6, -11, +9];
    this.theme.pad.forEach((note, i) => {
      const detune = PAD_DETUNE[i] ?? 0;
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
      this.padVoices.push({ osc });
    });
  }

  _buildChaseBed() {
    const ctx = this.ctx;

    // A low, detuned cluster that sits under the chase — two notes a semitone
    // apart, which is about as unpleasant as two pitches get.
    this.chaseCluster = ctx.createGain();
    this.chaseCluster.gain.value = 0;
    this.chaseCluster.connect(this.layers.chase);

    const CLUSTER_DETUNE = [0, +8, -6, +11];
    this.theme.cluster.forEach((note, i) => {
      const detune = CLUSTER_DETUNE[i] ?? 0;
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
      this.clusterVoices.push({ osc });
    });
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
    const theme = this.theme;
    const beatInBar = this._beat % theme.meter;

    // --- ambient: the chapter's melody, played sparsely -------------------
    if (this.current.ambient > 0.02) {
      // The melody does not run continuously; it surfaces for a phrase and
      // then leaves several bars of drone. A tune that never stops stops being
      // frightening. Later chapters leave shorter gaps — the score closes in
      // on you as the game goes on.
      const melody = theme.melody;
      if (this._melodyStep < melody.length) {
        const [note, beats] = melody[this._melodyStep];
        if (note) this._voice(noteFreq(note), time, beatLen * beats, theme.voice);
        this._melodyStep += 1;
        // Advance by the note's length rather than one beat.
        this._beat += beats - 1;
        this._nextNoteTime += beatLen * (beats - 1);
      } else {
        this._barsSinceMelody++;
        const [lo, hi] = theme.rest;
        if (this._barsSinceMelody > lo + Math.floor(this._rng() * (hi - lo))) {
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
   * Play one note on one of the timbres in VOICES.
   *
   * Struck voices (music box, woodblock) ignore the note's written length and
   * ring for as long as their partials decay, the way a real struck bar does.
   * Held voices (choir, organ, drowned) are shaped to the written length
   * instead, because a singer stops when the note ends.
   */
  _voice(freq, time, duration, voiceName = 'musicbox') {
    const ctx = this.ctx;
    const out = this.layers.ambient;
    const v = VOICES[voiceName] ?? VOICES.musicbox;

    // Slowly wandering detune — the mechanism is out of true.
    this._detuneDrift += (this._rng() - 0.5) * 3;
    this._detuneDrift = clamp(this._detuneDrift, -18, 18);

    // A held voice is cut off at the written length (plus a short release); a
    // struck one is allowed to ring out past it.
    const held = !!v.sustain;
    const tail = held ? Math.max(0.3, duration * 0.35) : 0;

    for (const [mult, amp, decay] of v.partials) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.value = freq * mult;
      osc.detune.value = this._detuneDrift;

      // Sinking pitch, for the drowned voice.
      if (v.bend) {
        osc.frequency.setValueAtTime(freq * mult, time);
        osc.frequency.linearRampToValueAtTime(
          freq * mult * (1 + v.bend), time + duration);
      }

      const g = ctx.createGain();
      const peak = Math.max(0.0002, amp * v.gain);
      const life = held ? duration + tail : decay;

      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(peak, time + v.attack);
      if (held) {
        // Hold near the peak, then release.
        g.gain.setValueAtTime(peak, time + duration * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, time + life);
      } else {
        g.gain.exponentialRampToValueAtTime(0.0001, time + life);
      }

      let node = osc;
      const extra = [];

      if (v.formant) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = v.formant[0] * (0.85 + this._rng() * 0.3);
        bp.Q.value = v.formant[1];
        node.connect(bp);
        node = bp;
        extra.push(bp);
      }
      if (v.lowpass) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = v.lowpass;
        lp.Q.value = 0.8;
        node.connect(lp);
        node = lp;
        extra.push(lp);
      }

      node.connect(g);
      g.connect(out);

      const send = ctx.createGain();
      send.gain.value = 0.55;
      g.connect(send);
      send.connect(this.audio.buses.reverbSend);

      osc.start(time);
      osc.stop(time + life + 0.1);
      osc.onended = () => {
        osc.disconnect(); g.disconnect(); send.disconnect();
        for (const n of extra) n.disconnect();
      };
    }

    // The mechanism: a pin plucking, a mallet landing, an organ pipe speaking.
    const clickFreq = v.click ?? (v.chiff ? 2200 : 0);
    if (clickFreq) {
      const click = ctx.createBufferSource();
      click.buffer = this.audio.noiseBuffer();
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = clickFreq;
      cf.Q.value = 2;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(v.clickGain ?? 0.012, time);
      cg.gain.exponentialRampToValueAtTime(0.0001, time + (v.chiff ? 0.07 : 0.03));
      click.connect(cf); cf.connect(cg); cg.connect(out);
      click.start(time, this._rng() * 1.5, 0.08);
    }
  }

  /** Kept for callers that want the original timbre by name. */
  _musicBox(freq, time, duration) {
    this._voice(freq, time, duration, 'musicbox');
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
   * Switch to a chapter's arrangement.
   *
   * The graph is not rebuilt — the live oscillators are glided to their new
   * pitches over `glide` seconds. Rebuilding would mean stopping and starting
   * oscillators, which clicks, and would drop the drone for as long as it took
   * to construct; gliding instead makes the transposition itself audible,
   * which is a nicer way to tell the player they have crossed into somewhere
   * new than a hard cut would be.
   *
   * @param {'lullaby'|'workshop'|'rehearsal'|'flood'|'premiere'|number} theme
   * @param {number} [glide]  seconds to slide into the new key
   */
  setTheme(theme, glide = 3.5) {
    // Accept a chapter number as a convenience.
    const name = typeof theme === 'number'
      ? (THEME_BY_CHAPTER[theme] ?? 'lullaby')
      : theme;

    const next = THEMES[name];
    if (!next || name === this.themeName) return;

    this.themeName = name;
    this.theme = next;

    // Restart the melody at the top of the new tune.
    this._melodyStep = 0;
    this._barsSinceMelody = 0;
    this._beat = 0;

    if (!this.started || !this.ctx) return;

    const now = this.ctx.currentTime;
    const tau = Math.max(0.05, glide / 3);   // setTargetAtTime reaches ~95% in 3τ

    const droneRoot = noteFreq(next.drone);
    for (const { osc, mult } of this.droneVoices) {
      osc.frequency.setTargetAtTime(droneRoot * mult, now, tau);
    }
    this.padVoices.forEach(({ osc }, i) => {
      const note = next.pad[i % next.pad.length];
      osc.frequency.setTargetAtTime(noteFreq(note), now, tau);
    });
    this.clusterVoices.forEach(({ osc }, i) => {
      const note = next.cluster[i % next.cluster.length];
      osc.frequency.setTargetAtTime(noteFreq(note), now, tau);
    });

    this.emit?.('theme', name);
  }

  /** The current arrangement's title, for the chapter card and the archive. */
  get themeTitle() { return this.theme.title; }

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

    // The chase tempo pushes up as the threat closes, from whatever the
    // chapter's resting tempo is toward a flat sprint.
    this.bpm = lerp(this.theme.bpm, 142, this.current.chase);
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

export { LULLABY, THEMES, THEME_BY_CHAPTER };
