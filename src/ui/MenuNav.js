/**
 * MenuNav.js — keyboard and controller navigation for the front end.
 *
 * Every screen outside gameplay was mouse-only: you could rebind the jump key
 * with a gamepad in your hands and then be unable to press Play with it. For a
 * game that claims controller support that is not a missing feature, it is a
 * front end you cannot get past.
 *
 * The model is deliberately dumb and DOM-driven rather than a retained widget
 * tree. A screen hands over a container; everything inside it matching
 * `SELECTOR` and not disabled is focusable, in document order, and the arrows
 * move between them by *geometry* rather than by index — so a grid of chapter
 * cards behaves like a grid and a column of buttons behaves like a column,
 * without either of them having to declare which it is.
 *
 * Only one nav is live at a time. Opening a dialog pushes a new one and
 * closing it pops back to the one underneath with its selection intact, which
 * is what makes going into Chapter Select and back out again not lose your
 * place.
 */

import { Audio } from '../audio/AudioEngine.js';
import { PAD } from '../core/Gamepad.js';

const SELECTOR = 'button:not([disabled]), [data-nav]:not([disabled])';

/** Repeat rate for a held stick or D-pad, in seconds. */
const REPEAT_FIRST = 0.42;
const REPEAT_NEXT = 0.13;

const stack = [];

class NavLayer {
  constructor(root, { onCancel = null, columns = null } = {}) {
    this.root = root;
    this.onCancel = onCancel;
    this.columns = columns;
    this.index = -1;
    this.items = [];
    this.refresh();
  }

  refresh() {
    const previous = this.items[this.index] ?? null;
    this.items = [...this.root.querySelectorAll(SELECTOR)].filter((n) => {
      if (n.disabled) return false;
      // Hidden things are not navigable, and neither is anything inside a
      // collapsed section. offsetParent is null for both.
      return n.offsetParent !== null;
    });
    const at = previous ? this.items.indexOf(previous) : -1;
    this.index = at >= 0 ? at : (this.items.length ? 0 : -1);
    this._paint();
  }

  /** Drop the selection marker without forgetting where it was. */
  _clear() {
    for (const n of this.items) n.classList.remove('nav-on');
  }

  _paint() {
    this._clear();
    const cur = this.items[this.index];
    if (!cur) return;
    cur.classList.add('nav-on');
    // Keep the selection on screen in a scrolling dialog without yanking the
    // page around when it is already visible.
    cur.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * Move by geometry.
   *
   * The alternative — next/previous in document order — is right for a column
   * and wrong for everything else: in a three-across grid of chapter cards,
   * "down" would step one card to the right. Scoring candidates by how well
   * they lie in the requested direction costs a handful of getBoundingClientRect
   * calls on a keypress and is correct for any layout, including ones that
   * reflow at a different window size.
   */
  move(dx, dy) {
    if (this.items.length < 2) return;
    const cur = this.items[this.index];
    if (!cur) { this.index = 0; this._paint(); return; }

    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;

    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < this.items.length; i++) {
      if (i === this.index) continue;
      const b = this.items[i].getBoundingClientRect();
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      const ox = bx - ax;
      const oy = by - ay;

      // Distance along the direction asked for, and across it.
      const along = ox * dx + oy * dy;
      const across = Math.abs(ox * dy - oy * dx);
      if (along <= 1) continue;               // behind us, or level

      // Across is weighted heavily: a thing almost straight ahead beats a
      // nearer thing off to one side, which is how people expect arrows to
      // behave.
      const score = along + across * 3;
      if (score < bestScore) { bestScore = score; best = i; }
    }

    if (best === null) {
      // Nothing that way. Wrap within the axis, so a column loops top to
      // bottom rather than dead-ending.
      const axis = this.items
        .map((n, i) => ({ i, r: n.getBoundingClientRect() }))
        .filter(({ r }) => {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          return Math.abs((cx - ax) * dy - (cy - ay) * dx) < Math.max(a.width, a.height);
        });
      if (axis.length < 2) return;
      axis.sort((p, q) => {
        const pv = (p.r.left + p.r.width / 2) * dx + (p.r.top + p.r.height / 2) * dy;
        const qv = (q.r.left + q.r.width / 2) * dx + (q.r.top + q.r.height / 2) * dy;
        return pv - qv;
      });
      best = axis[0].i;
      if (best === this.index) return;
    }

    this.index = best;
    Audio.uiHover();
    this._paint();
  }

  activate() {
    const cur = this.items[this.index];
    if (!cur) return;
    Audio.uiClick();
    cur.click();
  }

  cancel() {
    if (!this.onCancel) return false;
    Audio.uiBack();
    this.onCancel();
    return true;
  }

  /** Point the selection at whatever the mouse is over, so the two agree. */
  syncTo(node) {
    const i = this.items.indexOf(node);
    if (i < 0 || i === this.index) return;
    this.index = i;
    this._paint();
  }
}

export const MenuNav = {
  /** Push a screen. Returns a handle; call `.pop()` when it closes. */
  push(root, opts = {}) {
    // The screen underneath keeps its selection but stops showing it. Without
    // this, opening chapter select left "New Game" lit behind the dialog and
    // two things looked selected at once.
    stack[stack.length - 1]?._clear();
    const layer = new NavLayer(root, opts);
    stack.push(layer);
    this._bind();

    // Mouse and stick should not disagree about what is selected.
    const onOver = (e) => {
      const item = e.target.closest?.(SELECTOR);
      if (item && layer.items.includes(item)) layer.syncTo(item);
    };
    root.addEventListener('mouseover', onOver);

    return {
      layer,
      refresh: () => layer.refresh(),
      pop: () => {
        root.removeEventListener('mouseover', onOver);
        layer._clear();
        const i = stack.indexOf(layer);
        if (i >= 0) stack.splice(i, 1);
        // The layer underneath may have had items added or removed while this
        // one was up (the archive can change what Continue says), so it is
        // refreshed rather than simply repainted.
        stack[stack.length - 1]?.refresh();
      },
    };
  },

  get top() {
    return stack[stack.length - 1] ?? null;
  },

  /** Called every frame by the app while the menu is up. */
  update(dt, input) {
    const layer = this.top;
    if (!layer || !input?.gamepad) return;
    const pad = input.gamepad;
    if (!pad.connected) return;

    // Stick or D-pad, whichever is giving a direction. The stick reports
    // forward as +Y and the screen counts down as +Y, so it is inverted here
    // rather than anywhere the game uses it.
    let x = Math.abs(pad.moveX) > 0.5 ? Math.sign(pad.moveX) : 0;
    let y = Math.abs(pad.moveY) > 0.5 ? -Math.sign(pad.moveY) : 0;
    if (pad.down.has(PAD.LEFT)) x = -1;
    else if (pad.down.has(PAD.RIGHT)) x = 1;
    if (pad.down.has(PAD.UP)) y = -1;
    else if (pad.down.has(PAD.DOWN)) y = 1;
    // One axis at a time: a diagonal on a stick should not move twice.
    if (x && y) { if (Math.abs(pad.moveX) >= Math.abs(pad.moveY)) y = 0; else x = 0; }

    const dir = x || y ? `${x},${y}` : null;

    if (!dir) {
      this._held = null;
      this._timer = 0;
    } else if (dir !== this._held) {
      this._held = dir;
      this._timer = REPEAT_FIRST;
      layer.move(x, y);
    } else {
      this._timer -= dt;
      if (this._timer <= 0) {
        this._timer = REPEAT_NEXT;
        layer.move(x, y);
      }
    }

    if (document.querySelector('.opt-keybind.listening')) return;
    if (pad.pressed('jump') || pad.pressed('interact')) layer.activate();
    else if (pad.pressed('crouch') || pad.pressed('pause')) layer.cancel();
  },

  _bind() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('keydown', (e) => {
      const layer = this.top;
      if (!layer) return;
      // Never eat typing, and never fight a key-rebinding prompt: while one
      // is armed, the next key pressed is the binding, and W must bind W
      // rather than move the selection up.
      if (document.activeElement?.matches?.('input, textarea')) return;
      if (document.querySelector('.opt-keybind.listening')) return;

      switch (e.code) {
        case 'ArrowUp': case 'KeyW': layer.move(0, -1); break;
        case 'ArrowDown': case 'KeyS': layer.move(0, 1); break;
        case 'ArrowLeft': case 'KeyA': layer.move(-1, 0); break;
        case 'ArrowRight': case 'KeyD': layer.move(1, 0); break;
        case 'Enter': case 'Space': case 'NumpadEnter': layer.activate(); break;
        case 'Escape': case 'Backspace':
          if (!layer.cancel()) return;
          break;
        default: return;
      }
      e.preventDefault();
    });
  },
};
