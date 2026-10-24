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
    // crowd ambience
    const cn = ctx.createBufferSource(); cn.buffer = this.noise; cn.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 500; cf.Q.value = 0.4;
    const cg = ctx.createGain(); cg.gain.value = 0.0;
    cn.connect(cf); cf.connect(cg); cg.connect(this.sfx); cn.start();
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
    this.engine.cg.gain.setTargetAtTime(level * 0.08, this.ctx.currentTime, 0.4);
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
    this.crowd(1);
    setTimeout(() => this.crowd(0.35), 2500);
  }
}
