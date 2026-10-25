// Procedural WebAudio sound effects (no asset files).
'use strict';

class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.engine = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator(); osc2.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const eg = ctx.createGain(); eg.gain.value = 0;
    osc.connect(lp); osc2.connect(lp); lp.connect(eg); eg.connect(this.sfx);
    osc.start(); osc2.start();
    // boost hiss
    const bn = ctx.createBufferSource(); bn.buffer = this.noise; bn.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 900; bf.Q.value = 0.7;
    const bg = ctx.createGain(); bg.gain.value = 0;
    bn.connect(bf); bf.connect(bg); bg.connect(this.sfx); bn.start();
    // crowd: two murmur bands with a slow swell, into their own gain (set by excitement)
    const crowdBus = ctx.createGain(); crowdBus.gain.value = 0; crowdBus.connect(this.sfx);
    for (const [f, q, v] of [[420, 0.5, 1], [1150, 0.9, 0.55]]) {
      const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true; n.playbackRate.value = 0.93 + Math.random() * 0.14;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = v;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.17 + Math.random() * 0.2;
      const lg = ctx.createGain(); lg.gain.value = v * 0.35;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      n.connect(bp); bp.connect(g); g.connect(crowdBus); n.start(0, Math.random());
    }
    const cg = crowdBus;
    this.engine = { osc, osc2, lp, eg, bg, bf, cg };
    this.applyVolume();
  }
  applyVolume() {
    if (!this.ctx) return;
    const a = this.settings.audio;
    this.master.gain.value = a.master;
    this.sfx.gain.value = a.sfx;
  }
  setEngine(speed, boosting, active, onGround) {
    if (!this.engine) return;
    const e = this.engine, t = this.ctx.currentTime;
    const k = Math.min(1, speed / 2300);
    const vol = active ? (0.05 + 0.06 * k) * this.settings.audio.engine : 0;
    e.eg.gain.setTargetAtTime(vol, t, 0.05);
    e.osc.frequency.setTargetAtTime(48 + k * 110 + (onGround ? 0 : 20), t, 0.08);
    e.osc2.frequency.setTargetAtTime(24 + k * 55, t, 0.08);
    e.lp.frequency.setTargetAtTime(400 + k * 1400, t, 0.1);
    e.bg.gain.setTargetAtTime(active && boosting ? 0.14 * this.settings.audio.engine : 0, t, 0.04);
    e.bf.frequency.setTargetAtTime(700 + k * 900, t, 0.1);
  }
  crowd(level) {
    if (!this.engine) return;
    this.engine.cg.gain.setTargetAtTime(level * 0.09 * (this.settings.audio.crowd ?? 0.8), this.ctx.currentTime, 0.35);
  }
  // a crowd voice reaction: noise through vowel formants with a pitch/volume contour
  // kind: 'cheer' (rising "aaah!"), 'ooh' (rises then falls), 'aww' (falls)
  react(kind, strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = kind === 'cheer' ? 2.6 : 1.4;
    const vol = 0.32 * strength * (this.settings.audio.crowd ?? 0.8);
    const out = ctx.createGain(); out.connect(this.sfx);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + (kind === 'aww' ? 0.08 : 0.25));
    out.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const forms = kind === 'ooh' ? [[350, 6], [800, 7]] : [[750, 5], [1150, 6], [2500, 8]];
    for (const [f, q] of forms) {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      const k = kind === 'aww' ? [1.15, 0.8] : kind === 'ooh' ? [0.85, 1.12] : [0.9, 1.08];
      bp.frequency.setValueAtTime(f * k[0], t);
      bp.frequency.linearRampToValueAtTime(f * k[1], t + dur * 0.5);
      if (kind === 'ooh') bp.frequency.linearRampToValueAtTime(f * 0.85, t + dur);
      s.connect(bp); bp.connect(out);
      s.start(t, Math.random()); s.stop(t + dur);
    }
  }
  burst(freq, dur, vol, type = 'noise', q = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.sfx);
    if (type === 'noise') {
      const s = ctx.createBufferSource(); s.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      s.connect(f); f.connect(g);
      s.start(t, Math.random()); s.stop(t + dur);
    } else {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.5), t + dur);
      o.connect(g); o.start(t); o.stop(t + dur);
    }
  }
  hit(strength) {
    const k = Math.min(1, strength / 3000);
    this.burst(180 + k * 300, 0.25, 0.25 + 0.5 * k, 'noise', 0.8);
    this.burst(90 + k * 60, 0.2, 0.3 + 0.4 * k, 'sine');
  }
  bounce(speed) { this.burst(120, 0.18, Math.min(0.35, speed / 4000), 'sine'); }
  jump() { this.burst(500, 0.12, 0.08, 'noise', 2); }
  flip() { this.burst(900, 0.18, 0.1, 'noise', 1.5); }
  pad(big) { this.burst(big ? 660 : 880, big ? 0.25 : 0.12, 0.12, 'triangle'); }
  beep(high) { this.burst(high ? 880 : 520, high ? 0.5 : 0.25, 0.25, 'square'); }
  demo() { this.burst(200, 0.8, 0.7, 'noise', 0.5); this.burst(60, 0.6, 0.6, 'sine'); }
  flipReset() { this.burst(1320, 0.15, 0.12, 'triangle'); setTimeout(() => this.burst(1760, 0.2, 0.12, 'triangle'), 70); }
  click() { this.burst(1500, 0.05, 0.06, 'square'); }
  goal() {
    if (!this.ctx) return;
    this.burst(150, 1.6, 0.9, 'noise', 0.4);
    this.burst(70, 1.2, 0.8, 'sine');
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.burst(f, 0.6, 0.18, 'sawtooth'), 150 + i * 110));
    this.react('cheer', 1.3);
    this.crowd(1);
    setTimeout(() => this.crowd(0.35), 2500);
  }
}
