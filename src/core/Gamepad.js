/**
 * Gamepad.js — DualSense (and any standard-mapping pad) support.
 *
 * The browser does not deliver gamepad events; it hands you a snapshot of the
 * device's state and expects you to read it once per frame. So this polls in
 * `beginFrame` and keeps its own edge sets, exactly the way Input does for the
 * keyboard, which lets gameplay code stay ignorant of where a button press
 * came from.
 *
 * Two things a controller needs that a keyboard does not:
 *
 *  - **A response curve on the sticks.** A mouse reports movement; a stick
 *    reports a position, and turning that into a turn rate linearly makes slow
 *    aiming impossible and fast turning feel sluggish. Cubed, past a deadzone,
 *    with the deadzone's width subtracted rather than clipped, so the first
 *    degree of stick travel past the dead centre produces the smallest
 *    possible movement instead of a jump.
 *  - **Rumble.** On a DualSense this is the only feedback channel the game has
 *    that is not sight or sound, and in a game the player spends in the dark
 *    it is worth using — a heartbeat when Strain is high, a jolt on a catch.
 */

import { Settings } from './Settings.js';
import { EventBus } from '../util/EventBus.js';

/**
 * Standard-mapping button indices.
 * https://w3c.github.io/gamepad/#remapping
 */
export const PAD = {
  A: 0,            // cross
  B: 1,            // circle
  X: 2,            // square
  Y: 3,            // triangle
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SELECT: 8,       // create
  START: 9,        // options
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  HOME: 16,        // PS button
  TOUCHPAD: 17,
};

/**
 * Which pad control drives which game action.
 *
 * Laid out the way a console horror game is laid out, because that is what a
 * player picking up a DualSense will expect: cross to jump, circle to crouch,
 * square to interact, triangle for the mask, shoulders for lenses, R3 for the
 * torch. Nothing here is rebindable yet; the keyboard map is, and this
 * mirrors it.
 */
export const PAD_BINDS = {
  jump:       [PAD.A],
  crouch:     [PAD.B],
  interact:   [PAD.X],
  mask:       [PAD.Y],
  lensPrev:   [PAD.L1],
  lensNext:   [PAD.R1],
  sprint:     [PAD.L3],
  flashlight: [PAD.R3],
  hint:       [PAD.UP],
  journal:    [PAD.DOWN],
  pause:      [PAD.START],
};

/** Glyphs for the HUD, so prompts read "□" rather than "E" on a pad. */
export const PAD_GLYPHS = {
  [PAD.A]: '✕', [PAD.B]: '◯', [PAD.X]: '▢', [PAD.Y]: '△',
  [PAD.L1]: 'L1', [PAD.R1]: 'R1', [PAD.L2]: 'L2', [PAD.R2]: 'R2',
  [PAD.L3]: 'L3', [PAD.R3]: 'R3',
  [PAD.UP]: '↑', [PAD.DOWN]: '↓', [PAD.LEFT]: '←', [PAD.RIGHT]: '→',
  [PAD.START]: 'OPTIONS', [PAD.SELECT]: 'CREATE',
};

const STICK_DEADZONE = 0.14;
const TRIGGER_THRESHOLD = 0.35;

export class GamepadInput extends EventBus {
  constructor() {
    super();
    this.index = null;
    this.id = '';
    this.isDualSense = false;
    /** True while the player is actually using the pad rather than the keyboard. */
    this.active = false;

    this.down = new Set();
    this._pressed = new Set();
    this._released = new Set();

    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;

    this._rumbleUntil = 0;

    this._onConnect = (e) => this._adopt(e.gamepad);
    this._onDisconnect = (e) => {
      if (e.gamepad.index === this.index) {
        this.index = null;
        this.active = false;
        this.down.clear();
        this.emit('disconnected');
      }
    };
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);

    // A pad connected before the page loaded fires no event.
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (pad) this._adopt(pad);
    }
  }

  _adopt(pad) {
    if (this.index !== null) return;
    this.index = pad.index;
    this.id = pad.id ?? '';
    // Sony's vendor id is 054c; the DualSense product ids are 0ce6 and 0df2.
    this.isDualSense = /054c|dualsense|dualshock|wireless controller/i.test(this.id);
    this.emit('connected', this.id);
  }

  get connected() {
    return this.index !== null;
  }

  /** The live snapshot, or null. Browsers invalidate these every frame. */
  _pad() {
    if (this.index === null) return null;
    return navigator.getGamepads?.()[this.index] ?? null;
  }

  /**
   * A stick axis, deadzoned and curved.
   *
   * The deadzone is subtracted and the remainder renormalised, so the usable
   * range still runs the whole way to 1 — clipping instead leaves a step at
   * the edge of the deadzone, which is what makes a stick feel like it snaps
   * out of centre.
   */
  static curve(v, exponent = 3) {
    const m = Math.abs(v);
    if (m < STICK_DEADZONE) return 0;
    const t = (m - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    return Math.sign(v) * Math.pow(t, exponent);
  }

  /** Poll. Called once per frame from Input.beginFrame(). */
  poll() {
    const pad = this._pad();
    this._pressed.clear();
    this._released.clear();

    if (!pad) {
      this.moveX = this.moveY = this.lookX = this.lookY = 0;
      return;
    }

    // --- buttons ------------------------------------------------------------
    let anyDown = false;
    for (let i = 0; i < pad.buttons.length; i++) {
      const b = pad.buttons[i];
      // Triggers are analogue; treat them as buttons past a threshold so L2/R2
      // can be bound like anything else.
      const isDown = b.pressed || b.value > TRIGGER_THRESHOLD;
      const was = this.down.has(i);
      if (isDown && !was) { this.down.add(i); this._pressed.add(i); }
      else if (!isDown && was) { this.down.delete(i); this._released.add(i); }
      if (isDown) anyDown = true;
    }

    // --- sticks -------------------------------------------------------------
    const lx = GamepadInput.curve(pad.axes[0] ?? 0, 2);
    const ly = GamepadInput.curve(pad.axes[1] ?? 0, 2);
    const rx = GamepadInput.curve(pad.axes[2] ?? 0, 3);
    const ry = GamepadInput.curve(pad.axes[3] ?? 0, 3);

    this.moveX = lx;
    this.moveY = -ly;          // stick up is -1; forward is +1
    this.lookX = rx;
    this.lookY = ry;

    // The pad becomes "active" — which is what swaps the HUD glyphs — only
    // when it is actually being used. A controller sitting on the desk with a
    // drifting stick must not take the prompts away from the keyboard.
    if (anyDown || Math.hypot(lx, ly) > 0.2 || Math.hypot(rx, ry) > 0.2) {
      if (!this.active) {
        this.active = true;
        this.emit('activity', true);
      }
    }
  }

  /** Tell Input the keyboard has been used, so prompts go back to keys. */
  standDown() {
    if (!this.active) return;
    this.active = false;
    this.emit('activity', false);
  }

  isDown(action) {
    const binds = PAD_BINDS[action];
    if (!binds) return false;
    return binds.some((b) => this.down.has(b));
  }

  pressed(action) {
    const binds = PAD_BINDS[action];
    if (!binds) return false;
    return binds.some((b) => this._pressed.has(b));
  }

  released(action) {
    const binds = PAD_BINDS[action];
    if (!binds) return false;
    return binds.some((b) => this._released.has(b));
  }

  /** The glyph to print for an action, or null when it is not bound. */
  glyph(action) {
    const binds = PAD_BINDS[action];
    if (!binds?.length) return null;
    return PAD_GLYPHS[binds[0]] ?? null;
  }

  /**
   * Rumble.
   *
   * `dual-rumble` is what Chrome exposes for both DualSense and Xbox pads: a
   * strong low-frequency motor and a weak high-frequency one. Requests are
   * dropped while a stronger one is still playing, so a heartbeat cannot cut
   * off the jolt of being caught.
   *
   * @param {number} strong  0..1, the heavy motor
   * @param {number} weak    0..1, the light motor
   * @param {number} ms      duration
   */
  rumble(strong = 0.5, weak = 0.3, ms = 200) {
    if (!Settings.get('rumble')) return;
    const pad = this._pad();
    const actuator = pad?.vibrationActuator;
    if (!actuator?.playEffect) return;

    const now = performance.now();
    const priority = strong + weak;
    if (now < this._rumbleUntil && priority < (this._rumblePriority ?? 0)) return;
    this._rumbleUntil = now + ms;
    this._rumblePriority = priority;

    try {
      actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: ms,
        strongMagnitude: Math.max(0, Math.min(1, strong)),
        weakMagnitude: Math.max(0, Math.min(1, weak)),
      }).catch(() => {});
    } catch {
      /* the pad does not support it; nothing to do */
    }
  }

  stopRumble() {
    const actuator = this._pad()?.vibrationActuator;
    try { actuator?.reset?.(); } catch { /* ignore */ }
    this._rumbleUntil = 0;
    this._rumblePriority = 0;
  }

  dispose() {
    this.stopRumble();
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
  }
}
