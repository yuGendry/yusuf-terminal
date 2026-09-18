/**
 * Input.js — keyboard, mouse and pointer-lock handling.
 *
 * Actions are looked up through the rebindable keymap in Settings, so gameplay
 * code asks "is `interact` down?" and never mentions a physical key. Edge state
 * (`pressed` / `released`) is latched each frame so a single tap can't be missed
 * by a slow frame and can't fire twice on a fast one.
 */

import { Settings } from './Settings.js';
import { EventBus } from '../util/EventBus.js';

export class Input extends EventBus {
  constructor(canvas) {
    super();
    this.canvas = canvas;

    this.down = new Set();          // physical codes currently held
    this._pressedCodes = new Set(); // codes that went down this frame
    this._releasedCodes = new Set();

    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false };
    this._pendingDx = 0;
    this._pendingDy = 0;
    this._pendingWheel = 0;

    this.locked = false;
    this.enabled = true;
    /** When true, key events go to a rebinding listener instead of the game. */
    this.captureNextKey = null;

    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      // Rebinding takes priority over everything, including Escape.
      if (this.captureNextKey) {
        e.preventDefault();
        const cb = this.captureNextKey;
        this.captureNextKey = null;
        cb(e.code === 'Escape' ? null : e.code);
        return;
      }

      // Let the browser have its reload/devtools/fullscreen chords.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) return;

      if (!this.down.has(e.code)) {
        this.down.add(e.code);
        this._pressedCodes.add(e.code);
        this.emit('keydown', e.code);
      }

      // Stop the page scrolling out from under a pointer-locked game.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    };

    this._onKeyUp = (e) => {
      if (this.down.delete(e.code)) {
        this._releasedCodes.add(e.code);
        this.emit('keyup', e.code);
      }
    };

    this._onMouseMove = (e) => {
      if (!this.locked || !this.enabled) return;
      // Accumulate between frames: a 240Hz mouse fires many events per frame
      // and dropping all but the last would throw away most of the motion.
      this._pendingDx += e.movementX || 0;
      this._pendingDy += e.movementY || 0;
    };

    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      this.emit('mousedown', e.button);
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      this.emit('mouseup', e.button);
    };

    this._onWheel = (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this._pendingWheel += Math.sign(e.deltaY);
    };

    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      document.body.classList.toggle('pointer-locked', this.locked);
      // Held keys are unreliable across a lock change (the player may have
      // alt-tabbed with W down); clear so nobody walks into a wall forever.
      if (!this.locked) this.clearHeld();
      this.emit('pointerlock', this.locked);
    };

    this._onBlur = () => this.clearHeld();
    this._onContextMenu = (e) => { if (this.locked) e.preventDefault(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('contextmenu', this._onContextMenu);
  }

  requestLock() {
    if (this.locked) return;

    // `unadjustedMovement` bypasses OS mouse acceleration, which is what we want
    // for aiming — but it is unsupported on some platforms. In browsers that
    // implement the newer API this returns a promise that *rejects* rather than
    // throwing, so a bare try/catch misses it and it surfaces as an unhandled
    // rejection. Handle both shapes, and fall back to a plain lock.
    let result;
    try {
      result = this.canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      this.canvas.requestPointerLock();
      return;
    }
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        try {
          this.canvas.requestPointerLock();
        } catch {
          /* the browser refused the lock entirely; the pause check handles it */
        }
      });
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  clearHeld() {
    for (const code of this.down) this._releasedCodes.add(code);
    this.down.clear();
    this.mouse.left = false;
    this.mouse.right = false;
    this._pendingDx = 0;
    this._pendingDy = 0;
  }

  // --- action queries -------------------------------------------------------

  _code(action) {
    return Settings.get('keybinds')[action];
  }

  /** Is the action's key held right now? */
  isDown(action) {
    if (!this.enabled) return false;
    const code = this._code(action);
    return code ? this.down.has(code) : false;
  }

  /** Did the action's key go down during this frame? */
  pressed(action) {
    if (!this.enabled) return false;
    const code = this._code(action);
    return code ? this._pressedCodes.has(code) : false;
  }

  /** Did the action's key come up during this frame? */
  released(action) {
    if (!this.enabled) return false;
    const code = this._code(action);
    return code ? this._releasedCodes.has(code) : false;
  }

  /** Raw physical-key query, for things like the "any key" prompt. */
  isCodeDown(code) {
    return this.down.has(code);
  }

  /**
   * Called once per frame *before* systems read input: promotes the accumulated
   * mouse delta and clears last frame's edge sets.
   */
  beginFrame() {
    this.mouse.dx = this._pendingDx;
    this.mouse.dy = this._pendingDy;
    this.mouse.wheel = this._pendingWheel;
    this._pendingDx = 0;
    this._pendingDy = 0;
    this._pendingWheel = 0;
  }

  /** Called once per frame after all systems have read input. */
  endFrame() {
    this._pressedCodes.clear();
    this._releasedCodes.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('contextmenu', this._onContextMenu);
  }
}

/** Human-readable label for a KeyboardEvent.code, for the rebinding UI. */
export function keyLabel(code) {
  if (!code) return '—';
  const map = {
    ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT',
    ControlLeft: 'L CTRL', ControlRight: 'R CTRL',
    AltLeft: 'L ALT', AltRight: 'R ALT',
    Space: 'SPACE', Escape: 'ESC', Enter: 'ENTER', Tab: 'TAB',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    CapsLock: 'CAPS', Backspace: 'BKSP',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}
