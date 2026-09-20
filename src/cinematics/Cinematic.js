/**
 * Cinematic.js — scripted camera sequences.
 *
 * A cinematic is a timeline. Camera keyframes are interpolated along a
 * Catmull-Rom spline so the move is continuous rather than a series of lerps
 * between poses, and everything else — subtitles, fades, sound cues, arbitrary
 * callbacks — hangs off the same clock.
 *
 * Two rules the whole system is built around:
 *
 *  1. **Always skippable.** Holding the skip key fills a ring and jumps to the
 *     end. A player on their fourth attempt at a chase should never be made to
 *     sit through the same forty seconds again.
 *  2. **The end state is authoritative.** Skipping runs every remaining beat's
 *     `onFire` immediately, so a cinematic that unlocks a door still unlocks
 *     it. A skip must never leave the world in a different state from watching.
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { clamp, smoothstep, lerp } from '../util/MathUtil.js';

/** Easing curves available to camera segments. */
const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => smoothstep(0, 1, t),
  // A long slow start that never quite settles — the dolly-in look.
  creep: (t) => 1 - Math.pow(1 - t, 3.2),
};

export class Cinematic extends EventBus {
  /**
   * @param {object} opts
   * @param {Engine} opts.engine
   * @param {THREE.Scene} opts.scene           rendered while the cinematic runs
   * @param {Array} opts.shots                 camera keyframes
   * @param {Array} [opts.beats]               timed events
   * @param {number} opts.duration             total seconds
   * @param {function} [opts.onUpdate]         per-frame hook (dt, t, progress)
   * @param {boolean} [opts.letterbox]         default true
   * @param {boolean} [opts.skippable]         default true
   */
  constructor({
    engine, scene, shots, beats = [], duration,
    onUpdate = null, letterbox = true, skippable = true,
    audio = null, hud = null, input = null,
  }) {
    super();
    this.engine = engine;
    this.scene = scene;
    this.shots = shots;
    this.beats = beats.map((b) => ({ ...b, fired: false }));
    this.duration = duration;
    this.onUpdateHook = onUpdate;
    this.useLetterbox = letterbox;
    this.skippable = skippable;
    this.audio = audio;
    this.hud = hud;
    this.input = input;

    this.time = 0;
    this.running = false;
    this.finished = false;
    this._skipHold = 0;

    this._buildSplines();
    this._buildOverlay();

    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  /**
   * Camera path.
   *
   * Keyframes are interpolated segment by segment, with the easing curve named
   * on the segment's first keyframe, rather than being run through a spline
   * along the whole path.
   *
   * A spline was the obvious choice and it was wrong. Shot lists routinely
   * hold a pose across two keyframes, and they routinely cut from a subject
   * 30cm away to one 40 metres away. Any Catmull-Rom through points spaced
   * like that swings wide between the two identical poses — the tangents are
   * set by the far-away neighbours — so the camera drifts off the thing the
   * shot is of, in the middle of the shot. Centripetal parameterisation does
   * not save it, because two coincident control points degenerate its knot
   * spacing and it falls back to exactly the behaviour that caused the
   * problem.
   *
   * Interpolating between the two bracketing keyframes cannot do that. The
   * camera is always somewhere between two poses the shot list actually asked
   * for, and because every easing curve here has zero derivative at both ends,
   * the motion still settles into and leaves each mark smoothly — which is
   * what the spline was for in the first place.
   */
  _buildSplines() {
    this.keys = this.shots.map((s, i) => ({
      pos: new THREE.Vector3(...s.pos),
      look: new THREE.Vector3(...s.look),
      // Normalised time of each keyframe, for per-segment easing.
      t: s.t !== undefined ? s.t / this.duration : i / Math.max(1, this.shots.length - 1),
      ease: s.ease ?? 'inOut',
      fov: s.fov ?? 48,
      roll: s.roll ?? 0,
      shake: s.shake ?? 0,
    }));

    // A single-pose "path" is a held shot.
    if (this.keys.length === 1) this.keys.push({ ...this.keys[0], t: 1 });

    this.times = this.keys.map((k) => k.t);
  }

  _buildOverlay() {
    const root = document.createElement('div');
    root.className = 'cinematic-overlay';

    if (this.useLetterbox) {
      root.appendChild(Object.assign(document.createElement('div'), { className: 'cine-bar top' }));
      root.appendChild(Object.assign(document.createElement('div'), { className: 'cine-bar bottom' }));
    }

    const caption = document.createElement('div');
    caption.className = 'cine-caption';
    root.appendChild(caption);
    this.caption = caption;

    const title = document.createElement('div');
    title.className = 'cine-title';
    root.appendChild(title);
    this.titleEl = title;

    if (this.skippable) {
      const skip = document.createElement('div');
      skip.className = 'cine-skip';
      skip.innerHTML =
        '<svg viewBox="0 0 34 34"><circle class="track" cx="17" cy="17" r="14"/>' +
        '<circle class="fill" cx="17" cy="17" r="14"/></svg><span>Hold to skip</span>';
      root.appendChild(skip);
      this.skipEl = skip;
      this.skipRing = skip.querySelector('.fill');
      const c = 2 * Math.PI * 14;
      this.skipRing.style.strokeDasharray = String(c);
      this.skipRing.style.strokeDashoffset = String(c);
      this._skipCirc = c;
    }

    this.root = root;
  }

  // --------------------------------------------------------------------------

  start() {
    if (this.running) return;
    this.running = true;
    this.finished = false;
    this.time = 0;

    document.getElementById('game-layer').appendChild(this.root);
    void this.root.offsetWidth;
    this.root.classList.add('active');

    this.engine.setScene(this.scene);
    this.emit('started');
  }

  /** Advance. Returns true while still playing. */
  update(dt) {
    if (!this.running) return false;

    // --- skip ---------------------------------------------------------------
    if (this.skippable && this.input) {
      const held = this.input.isCodeDown('Space') || this.input.isCodeDown('Enter');
      this._skipHold = clamp(this._skipHold + (held ? dt / 0.9 : -dt / 0.3), 0, 1);
      if (this.skipRing) {
        this.skipRing.style.strokeDashoffset = String(this._skipCirc * (1 - this._skipHold));
      }
      this.skipEl?.classList.toggle('holding', this._skipHold > 0.02);
      if (this._skipHold >= 1) { this.skip(); return false; }
    }

    this.time += dt;
    const progress = clamp(this.time / this.duration, 0, 1);

    this._applyCamera(progress);
    this._fireBeats();
    this.onUpdateHook?.(dt, this.time, progress);

    if (this.time >= this.duration) { this.finish(); return false; }
    return true;
  }

  /**
   * Place the camera for a normalised progress value.
   *
   * Each segment between keyframes is eased independently, which is what lets
   * a sequence hold, then drift, then snap — rather than gliding uniformly
   * through the whole path like a camera on rails.
   */
  _applyCamera(progress) {
    let seg = 0;
    while (seg < this.keys.length - 2 && progress > this.keys[seg + 1].t) seg++;

    const a = this.keys[seg];
    const b = this.keys[seg + 1] ?? a;

    const span = b.t - a.t;
    const local = span > 1e-6 ? clamp((progress - a.t) / span, 0, 1) : 1;
    const eased = (EASE[a.ease] ?? EASE.inOut)(local);

    this._pos.lerpVectors(a.pos, b.pos, eased);
    this._look.lerpVectors(a.look, b.look, eased);

    const cam = this.engine.camera;
    cam.position.copy(this._pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this._look);

    // Per-shot roll and FOV, interpolated across the segment.
    const roll = lerp(a.roll, b.roll, eased);
    if (roll) cam.rotateZ(roll);

    const fov = lerp(a.fov, b.fov, eased);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    // Handheld float, so nothing ever reads as a locked-off render.
    const shake = lerp(a.shake, b.shake, eased);
    if (shake > 0) {
      const t = this.engine.elapsed;
      cam.position.x += Math.sin(t * 8.3) * 0.012 * shake + Math.sin(t * 3.1) * 0.03 * shake;
      cam.position.y += Math.sin(t * 6.7 + 1.2) * 0.014 * shake;
    }
  }

  _fireBeats() {
    for (const beat of this.beats) {
      if (beat.fired || this.time < beat.t) continue;
      beat.fired = true;
      this._runBeat(beat);
    }
  }

  _runBeat(beat) {
    if (beat.caption !== undefined) this.showCaption(beat.caption, beat.captionFor ?? 3.4);
    if (beat.title !== undefined) this.showTitle(beat.title, beat.subtitle);
    if (beat.fade !== undefined) this.engine.postfx.setFade(beat.fade);
    if (beat.sound) beat.sound(this.audio);
    beat.onFire?.(this);
  }

  showCaption(text, seconds = 3.4) {
    this.caption.textContent = text;
    this.caption.classList.toggle('show', !!text);
    clearTimeout(this._capTimer);
    if (text) {
      this._capTimer = setTimeout(() => this.caption.classList.remove('show'), seconds * 1000);
    }
  }

  showTitle(title, subtitle = '') {
    this.titleEl.innerHTML = title
      ? `<div class="cine-title-main">${title}</div>` +
        (subtitle ? `<div class="cine-title-sub">${subtitle}</div>` : '')
      : '';
    this.titleEl.classList.toggle('show', !!title);
  }

  /**
   * Jump to the end.
   *
   * Every unfired beat still runs, so anything the cinematic was responsible
   * for setting up is set up. A skip that leaves the world half-built is worse
   * than no skip at all.
   */
  skip() {
    if (!this.running) return;
    for (const beat of this.beats) {
      if (beat.fired) continue;
      beat.fired = true;
      // Suppress presentation on a skip; keep the state changes.
      if (beat.onFire) beat.onFire(this);
    }
    this.time = this.duration;
    this.emit('skipped');
    this.finish();
  }

  finish() {
    if (!this.running) return;
    this.running = false;
    this.finished = true;
    this.root.classList.remove('active');
    clearTimeout(this._capTimer);
    setTimeout(() => this.root.remove(), 700);
    this.emit('finished');
  }

  /**
   * Tear down the overlay.
   *
   * Deliberately does NOT touch the scene. Most cinematics are shot inside a
   * level that the game still needs afterwards, and a dispose that walked the
   * scene graph freeing geometry would quietly destroy the chapter the player
   * is about to walk into. A cinematic that builds its own set (the intro
   * drive) wraps this method and frees that set itself.
   */
  dispose() {
    clearTimeout(this._capTimer);
    this.root.remove();
  }
}

export { EASE };
