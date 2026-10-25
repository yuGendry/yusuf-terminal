// Keyboard / mouse / gamepad input with rebinding.
'use strict';

const ACTIONS = [
  { id: 'throttle', label: 'Throttle / Pitch Down' },
  { id: 'reverse', label: 'Reverse / Pitch Up' },
  { id: 'steerLeft', label: 'Steer / Yaw Left' },
  { id: 'steerRight', label: 'Steer / Yaw Right' },
  { id: 'pitchDown', label: 'Air Pitch Down' },
  { id: 'pitchUp', label: 'Air Pitch Up' },
  { id: 'jump', label: 'Jump' },
  { id: 'boost', label: 'Boost' },
  { id: 'powerslide', label: 'Powerslide / Air Roll' },
  { id: 'airRoll', label: 'Air Roll (stick picks direction)' },
  { id: 'airRollLeft', label: 'Air Roll Left' },
  { id: 'airRollRight', label: 'Air Roll Right' },
  { id: 'ballCam', label: 'Ball Cam' },
  { id: 'resetBall', label: 'Reset Shot / Ball (Training)' },
  { id: 'scoreboard', label: 'Scoreboard' },
  { id: 'pause', label: 'Pause' },
];

const DEFAULT_KEYS = {
  throttle: ['KeyW'], reverse: ['KeyS'], steerLeft: ['KeyA'], steerRight: ['KeyD'],
  pitchDown: ['ArrowUp'], pitchUp: ['ArrowDown'],
  jump: ['Space', 'Mouse2'], boost: ['ShiftLeft', 'Mouse0'], powerslide: ['KeyC', 'ControlRight'],
  airRoll: ['KeyX'], airRollLeft: ['KeyQ'], airRollRight: ['KeyE'], ballCam: ['KeyF', 'Mouse1'],
  resetBall: ['KeyR'], scoreboard: ['Tab'], pause: ['Escape', 'KeyP'],
};
// Standard gamepad mapping indices
const DEFAULT_PAD = {
  throttle: [7], reverse: [6], jump: [0], boost: [1], powerslide: [2], ballCam: [3],
  airRoll: [6], airRollLeft: [4], airRollRight: [5], resetBall: [8], scoreboard: [], pause: [9],
  steerLeft: [], steerRight: [], pitchDown: [], pitchUp: [],
};
const PAD_NAMES = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2',
  'Back / Share', 'Start / Options', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'];

function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Mouse0') return 'Left Mouse';
  if (code === 'Mouse1') return 'Middle Mouse';
  if (code === 'Mouse2') return 'Right Mouse';
  return code.replace('Left', ' L').replace('Right', ' R').replace('Arrow', '↑↓←→'.includes(code) ? '' : 'Arrow ');
}

class Input {
  constructor(settings) {
    this.settings = settings;
    this.keys = new Set();
    this.pressedEdges = new Set();
    this.padIndex = -1;
    this.padButtons = [];
    this.padPrev = [];
    this.padAxes = [0, 0, 0, 0];
    this.lastDevice = 'kb';
    this.capture = null; // rebinding callback
    this.ballCamOn = settings.camera.ballCamDefault !== false;
    window.addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const cb = this.capture; this.capture = null; cb({ type: 'key', code: e.code }); return; }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !(e.target && e.target.tagName === 'INPUT')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedEdges.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'kb';
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.keys.clear());
    const canvas = document.getElementById('game');
    window.addEventListener('mousedown', (e) => {
      if (this.capture && e.target.closest && e.target.closest('.bind-btn')) return;
      if (this.capture) { const cb = this.capture; this.capture = null; cb({ type: 'key', code: 'Mouse' + e.button }); return; }
      if (e.target !== canvas) return;
      const c = 'Mouse' + e.button;
      if (!this.keys.has(c)) this.pressedEdges.add(c);
      this.keys.add(c);
    });
    window.addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    window.addEventListener('contextmenu', (e) => { if (e.target === canvas) e.preventDefault(); });
    window.addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; this.onPadChange && this.onPadChange(e.gamepad); });
    window.addEventListener('gamepaddisconnected', () => { this.padIndex = -1; this.onPadChange && this.onPadChange(null); });
  }

  poll() {
    this.padPrev = this.padButtons.slice();
    this.padButtons.length = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    if (pads) {
      if (this.padIndex >= 0) pad = pads[this.padIndex];
      if (!pad) for (const p of pads) if (p && p.connected) { pad = p; this.padIndex = p.index; break; }
    }
    this.pad = pad;
    if (pad) {
      for (let i = 0; i < pad.buttons.length; i++) this.padButtons[i] = pad.buttons[i].value;
      for (let i = 0; i < 4; i++) this.padAxes[i] = pad.axes[i] || 0;
      if (this.padButtons.some(v => v > 0.3) || this.padAxes.some(v => Math.abs(v) > 0.3)) this.lastDevice = 'pad';
      if (this.capture) {
        for (let i = 0; i < this.padButtons.length; i++) {
          if (this.padButtons[i] > 0.5 && !(this.padPrev[i] > 0.5)) { const cb = this.capture; this.capture = null; cb({ type: 'pad', index: i }); break; }
        }
      }
    } else this.padAxes.fill(0);
  }

  keyDown(action) {
    const b = this.settings.bindings.keys[action] || [];
    for (const k of b) if (this.keys.has(k)) return true;
    return false;
  }
  padValue(action) {
    const b = this.settings.bindings.pad[action] || [];
    let v = 0;
    for (const i of b) v = Math.max(v, this.padButtons[i] || 0);
    return v;
  }
  down(action) { return this.keyDown(action) || this.padValue(action) > 0.5; }
  pressed(action) {
    const kb = (this.settings.bindings.keys[action] || []).some(k => this.pressedEdges.has(k));
    const pb = (this.settings.bindings.pad[action] || []).some(i => (this.padButtons[i] || 0) > 0.5 && !((this.padPrev[i] || 0) > 0.5));
    return kb || pb;
  }
  endFrame() { this.pressedEdges.clear(); }

  stick() {
    const c = this.settings.controls;
    let x = this.padAxes[0], y = this.padAxes[1];
    const mag = Math.hypot(x, y);
    const dz = c.deadzone;
    if (mag < dz) { x = 0; y = 0; }
    else if (c.deadzoneShape === 'cross') {
      x = Math.abs(x) < dz ? 0 : sign(x) * (Math.abs(x) - dz) / (1 - dz);
      y = Math.abs(y) < dz ? 0 : sign(y) * (Math.abs(y) - dz) / (1 - dz);
    } else {
      const s = Math.min(1, (mag - dz) / (1 - dz)) / mag;
      x *= s; y *= s;
    }
    return { x, y };
  }

  // Build car controls. onGround decides steering vs aerial sensitivities.
  carControls(car) {
    const c = this.settings.controls;
    const out = car.controls;
    const st = this.stick();
    const kbThrottle = (this.keyDown('throttle') ? 1 : 0) - (this.keyDown('reverse') ? 1 : 0);
    const kbSteer = (this.keyDown('steerRight') ? 1 : 0) - (this.keyDown('steerLeft') ? 1 : 0);
    const kbPitch = (this.keyDown('pitchUp') ? 1 : 0) - (this.keyDown('pitchDown') ? 1 : 0);
    // a button bound to both Reverse and Air Roll (default L2) reverses on the ground
    // and free air rolls in the air
    const B = this.settings.bindings.pad;
    const sharedRev = (B.reverse || []).filter(i => (B.airRoll || []).includes(i));
    const grounded0 = car.numArenaWheels >= 3;
    const revVal = grounded0 ? this.padValue('reverse')
      : Math.max(0, ...(B.reverse || []).filter(i => !sharedRev.includes(i)).map(i => this.padButtons[i] || 0));
    const padThrottle = this.padValue('throttle') - revVal;
    const dpadSteer = this.padValue('steerRight') - this.padValue('steerLeft');
    const dpadPitch = this.padValue('pitchUp') - this.padValue('pitchDown');
    const grounded = car.numArenaWheels >= 3;
    const sens = grounded ? c.steerSens : c.aerialSens;
    let sx = clamp((st.x + dpadSteer) * sens, -1, 1);
    let sy = clamp((st.y + dpadPitch) * (c.invertPitch ? -1 : 1) * c.aerialSens, -1, 1);
    // keyboard: W/S also pitch in air (W = nose down)
    if (kbSteer) sx = kbSteer;
    let pitch = sy;
    if (kbPitch) pitch = kbPitch;
    else if (kbThrottle && !grounded && !this.settings.controls.kbSeparatePitch) pitch = -kbThrottle;
    out.throttle = clamp(kbThrottle || padThrottle, -1, 1);
    out.steer = sx;
    out.pitch = clamp(pitch, -1, 1);
    const powerslide = this.down('powerslide');
    const freeRoll = !grounded0 && (this.keyDown('airRoll') || this.padValue('airRoll') > 0.3);
    const airRoll = powerslide || freeRoll;
    const rl = this.down('airRollLeft'), rr = this.down('airRollRight');
    if (airRoll) { out.yaw = 0; out.roll = sx; }
    else { out.yaw = sx; out.roll = 0; }
    if (rl || rr) out.roll = (rr ? 1 : 0) - (rl ? 1 : 0);
    out.handbrake = powerslide;
    out.jump = this.down('jump');
    out.boost = this.down('boost');
    return out;
  }

  rumble(strong, weak, ms) {
    if (!this.settings.controls.vibration || !this.pad || !this.pad.vibrationActuator) return;
    try { this.pad.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* ignore */ }
  }
}
