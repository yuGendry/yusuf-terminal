/**
 * Veilmask.js — the porcelain mask, its four lenses, and the Strain meter.
 *
 * The mask is the game's central verb. Wearing it reveals a second version of
 * the room, but it costs Strain, it hums where monsters can hear it, and at
 * maximum Strain it tears itself off and blinds you for a moment.
 *
 * Visibility model
 * ----------------
 * Level geometry declares its relationship to the mask through userData, and
 * this module toggles `.visible` accordingly each time the lens changes:
 *
 *   obj.userData.lensOnly  = 'threadlight'   // only visible through that lens
 *   obj.userData.lensOnly  = ['echo','hollow']
 *   obj.userData.hiddenBy  = 'hollow'        // real geometry the Other Side removes
 *   obj.userData.maskOnly  = true            // visible whenever the mask is worn
 *
 * Doing it by explicit tag rather than by render layers keeps level code
 * readable, survives objects being re-parented, and means a single traversal
 * on a state change instead of per-frame work.
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { Settings } from '../core/Settings.js';
import { clamp, damp, lerp, randRange, pick } from '../util/MathUtil.js';
import { LENSES, LENS_ORDER } from '../chapters/ChapterData.js';

/** Strain thresholds at which the world starts to misbehave. */
const STRAIN = {
  whisper: 0.35,   // first fake sounds
  figures: 0.55,   // shapes at the edge of vision
  severe: 0.78,    // heavy distortion, false footsteps close by
  breaking: 0.94,  // the mask is about to come off
};

const BLIND_DURATION = 2.6;
const OVERLOAD_LOCKOUT = 7.0;   // seconds before it can be worn again

export class Veilmask extends EventBus {
  constructor({ engine, input, audio, player, hud }) {
    super();
    this.engine = engine;
    this.input = input;
    this.audio = audio;
    this.player = player;
    this.hud = hud;

    /** Lenses the player has recovered, in unlock order. */
    this.unlocked = [];
    this.lensIndex = 0;

    this.owned = false;       // does the player have the mask at all?
    this.worn = false;
    this.strain = 0;
    this.blinded = 0;         // seconds remaining of forced blindness
    this.lockout = 0;         // seconds until it can be worn again
    this.cracks = 0;          // 0..1, permanent-ish; grows with total use

    this.enabled = true;      // cutscenes and chases can suppress it

    /** How loudly the mask is humming right now. The AI reads this. */
    this.hum = 0;

    this.scene = null;
    this._hallucTimer = 4;
    this._lastLens = null;
    this._wornTime = 0;
    this._humNodes = null;

    this._bindInput();
  }

  // --------------------------------------------------------------------------
  // Ownership and unlocks
  // --------------------------------------------------------------------------

  give() {
    if (this.owned) return;
    this.owned = true;
    this.emit('acquired');
  }

  unlockLens(id) {
    if (!LENSES[id] || this.unlocked.includes(id)) return false;
    this.unlocked.push(id);
    // Keep the player's lens list in canonical order so the Q/R cycle is stable.
    this.unlocked.sort((a, b) => LENS_ORDER.indexOf(a) - LENS_ORDER.indexOf(b));
    this.lensIndex = this.unlocked.indexOf(id);
    this.emit('lensUnlocked', id, LENSES[id]);
    return true;
  }

  get lens() {
    return this.unlocked[this.lensIndex] ?? null;
  }

  get lensData() {
    return this.lens ? LENSES[this.lens] : null;
  }

  get active() {
    return this.worn && this.blinded <= 0;
  }

  // --------------------------------------------------------------------------
  // Input
  // --------------------------------------------------------------------------

  _bindInput() {
    this._unbind = [
      this.input.on('keydown', () => {}),   // placeholder to keep the shape
    ];
  }

  /** Called from the chapter's update, before the mask's own update. */
  handleInput() {
    if (!this.owned || !this.enabled) return;

    if (this.input.pressed('mask')) {
      this.toggle();
    }

    if (this.worn && this.unlocked.length > 1) {
      if (this.input.pressed('lensNext')) this.cycleLens(1);
      if (this.input.pressed('lensPrev')) this.cycleLens(-1);
      const wheel = this.input.mouse.wheel;
      if (wheel) this.cycleLens(wheel > 0 ? 1 : -1);
    }
  }

  toggle() {
    if (this.worn) this.takeOff();
    else this.putOn();
  }

  putOn() {
    if (!this.owned || this.worn) return false;
    if (this.lockout > 0) {
      this.audio?.uiDenied();
      this.hud?.say('The porcelain is still too hot to hold.', { duration: 2.4 });
      return false;
    }
    if (!this.lens) {
      this.hud?.say('The mask is blank. There is no lens in it.', { duration: 3 });
      return false;
    }

    this.worn = true;
    this._wornTime = 0;
    this._applyVisibility();
    this._startHum();
    this.emit('wornChanged', true);
    this.audio?.maskOn?.();
    return true;
  }

  takeOff({ forced = false } = {}) {
    if (!this.worn) return;
    this.worn = false;
    this._applyVisibility();
    this._stopHum();
    this.emit('wornChanged', false, { forced });
    this.audio?.maskOff?.(forced);
  }

  cycleLens(dir) {
    if (this.unlocked.length < 2) return;
    const prev = this.lens;
    this.lensIndex = (this.lensIndex + dir + this.unlocked.length) % this.unlocked.length;
    if (this.lens !== prev) {
      this._applyVisibility();
      this.emit('lensChanged', this.lens, LENSES[this.lens]);
      this.audio?.lensSwap?.();
      this.hud?.showLens?.(LENSES[this.lens]);
    }
  }

  setLens(id) {
    const i = this.unlocked.indexOf(id);
    if (i < 0) return false;
    if (i === this.lensIndex) return true;
    this.lensIndex = i;
    this._applyVisibility();
    this.emit('lensChanged', this.lens, LENSES[this.lens]);
    return true;
  }

  // --------------------------------------------------------------------------
  // Scene visibility
  // --------------------------------------------------------------------------

  setScene(scene) {
    this.scene = scene;
    this._lastLens = undefined;   // force a rebuild
    this._applyVisibility();
  }

  /**
   * Show and hide everything tagged for the current mask state.
   *
   * Runs only on a state change, not per frame. Objects also record their
   * author-intended visibility the first time they are seen, so that a level
   * can hide something for its own reasons (a door that has not opened yet)
   * without the mask overriding it.
   */
  _applyVisibility() {
    if (!this.scene) return;
    const key = this.active ? this.lens : null;
    if (key === this._lastLens) return;
    this._lastLens = key;

    const maskOn = this.active;

    this.scene.traverse((obj) => {
      const ud = obj.userData;
      if (!ud) return;
      const hasTag = ud.lensOnly !== undefined || ud.hiddenBy !== undefined || ud.maskOnly !== undefined;
      if (!hasTag) return;

      // Remember what the level wanted before the mask touched this object.
      if (ud._baseVisible === undefined) ud._baseVisible = obj.visible;
      if (ud._baseVisible === false) {
        obj.visible = false;
        return;
      }

      let visible = true;

      if (ud.maskOnly && !maskOn) visible = false;

      if (ud.lensOnly !== undefined) {
        const list = Array.isArray(ud.lensOnly) ? ud.lensOnly : [ud.lensOnly];
        visible = visible && maskOn && list.includes(key);
      }

      if (ud.hiddenBy !== undefined && maskOn) {
        const list = Array.isArray(ud.hiddenBy) ? ud.hiddenBy : [ud.hiddenBy];
        if (list.includes(key)) visible = false;
      }

      obj.visible = visible;
    });

    this.emit('visibilityApplied', key);
  }

  /** Levels call this after adding tagged objects at runtime. */
  refreshVisibility() {
    this._lastLens = undefined;
    this._applyVisibility();
  }

  // --------------------------------------------------------------------------
  // Frame
  // --------------------------------------------------------------------------

  update(dt) {
    if (this.blinded > 0) {
      this.blinded -= dt;
      if (this.blinded <= 0) {
        this.blinded = 0;
        this.emit('blindEnded');
      }
    }
    if (this.lockout > 0) this.lockout = Math.max(0, this.lockout - dt);

    if (this.worn && this.blinded <= 0) {
      this._wornTime += dt;

      // Strain accrues faster for the more expensive lenses, and faster still
      // when the player is already out of breath — panic costs more.
      const rate = this.lensData?.strainRate ?? 0.06;
      const exertion = 1 + (this.player?.breath ?? 0) * 0.6;
      this.strain = clamp(this.strain + dt * rate * exertion, 0, 1);

      // Wearing it wears it out. Cracks never fully heal.
      this.cracks = clamp(this.cracks + dt * rate * 0.05, 0, 1);

      if (this.strain >= 1) this._overload();
    } else {
      // Recovery is much faster than accrual, but not instant — the mask is
      // meant to be used in bursts, not left on.
      this.strain = clamp(this.strain - dt * 0.16, 0, 1);
    }

    this._updateHum(dt);
    this._updateHallucinations(dt);
    this._updatePost(dt);
  }

  _overload() {
    this.strain = 1;
    this.blinded = BLIND_DURATION;
    this.lockout = OVERLOAD_LOCKOUT;
    this.takeOff({ forced: true });
    this.player?.addTrauma(0.7);
    this.emit('overload');

    this.hud?.say('The lens goes white. You cannot see.', { duration: 2.8 });
  }

  // --------------------------------------------------------------------------
  // The hum — what makes wearing the mask dangerous
  // --------------------------------------------------------------------------

  _startHum() {
    this._humNodes = this.audio?.startMaskHum?.(this.lensData?.tint ?? 0xffffff) ?? null;
  }

  _stopHum() {
    this.audio?.stopMaskHum?.(this._humNodes);
    this._humNodes = null;
  }

  _updateHum(dt) {
    // The hum rises with strain: the longer you wear it, the further it carries.
    const target = this.active ? 0.45 + this.strain * 0.55 : 0;
    this.hum = damp(this.hum, target, 3, dt);
    this.audio?.setMaskHum?.(this._humNodes, this.hum, this.strain);
  }

  // --------------------------------------------------------------------------
  // Hallucinations
  // --------------------------------------------------------------------------

  /**
   * At high strain the mask starts lying to you.
   *
   * Every hallucination is *deniable* — a sound with no source, a shape that is
   * gone when you look at it. None of them can hurt you, and none of them
   * replaces a real threat cue, so the player can never be killed by trusting
   * the wrong thing. The dread comes from no longer being able to tell.
   */
  _updateHallucinations(dt) {
    if (!this.active || this.strain < STRAIN.whisper) {
      this._hallucTimer = randRange(3, 7);
      return;
    }

    this._hallucTimer -= dt;
    if (this._hallucTimer > 0) return;

    // Frequency ramps hard with strain.
    const t = (this.strain - STRAIN.whisper) / (1 - STRAIN.whisper);
    this._hallucTimer = randRange(lerp(7, 1.6, t), lerp(13, 3.4, t));

    const options = ['whisper'];
    if (this.strain >= STRAIN.whisper) options.push('footstep', 'creak');
    if (this.strain >= STRAIN.figures) options.push('figure', 'breath');
    if (this.strain >= STRAIN.severe) options.push('closeFootstep', 'name', 'figure');

    this.fire(pick(options));
  }

  /** Trigger a specific hallucination. Exposed so chapters can script one. */
  fire(kind) {
    const cam = this.engine.camera;
    const behind = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion);
    const pos = cam.position.clone().addScaledVector(behind, randRange(1.5, 4));
    pos.y = Math.max(0.3, pos.y + randRange(-0.6, 0.4));

    switch (kind) {
      case 'whisper':
        this.audio?.hallucination?.('whisper', pos);
        break;
      case 'footstep':
        this.audio?.hallucination?.('footstep', pos);
        break;
      case 'closeFootstep':
        this.audio?.hallucination?.('footstep', cam.position.clone().addScaledVector(behind, 0.9));
        this.player?.addTrauma(0.08);
        break;
      case 'creak':
        this.audio?.hallucination?.('creak', pos);
        break;
      case 'breath':
        this.audio?.hallucination?.('breath', cam.position.clone().addScaledVector(behind, 0.7));
        break;
      case 'name':
        this.audio?.hallucination?.('name', pos);
        if (Settings.get('subtitles')) {
          this.hud?.say('(someone says your name, very close)', { duration: 2.6 });
        }
        break;
      case 'figure':
        this.emit('figure', pos);
        break;
      default:
        break;
    }
    this.emit('hallucination', kind);
  }

  // --------------------------------------------------------------------------
  // Post-processing drive
  // --------------------------------------------------------------------------

  _updatePost(dt) {
    const fx = this.engine.postfx.fx;
    const lens = this.lensData;

    fx.maskAmount = this.active ? 1 : 0;
    fx.strain = this.active ? this.strain : this.strain * 0.35;

    if (this.active && lens) {
      const c = new THREE.Color(lens.tint);
      // Pull the tint toward white so the world stays readable; a fully
      // saturated lens colour makes puzzles genuinely hard to see.
      fx.lensTint.set(
        lerp(1, c.r, 0.55),
        lerp(1, c.g, 0.55),
        lerp(1, c.b, 0.55)
      );
      fx.distortion = lens.chapter === 4 ? 0.55 : 0.30;
      fx.saturation = this.lens === 'ember' ? 0.55 : 0.85;
    } else {
      fx.lensTint.lerp(new THREE.Color(1, 1, 1), clamp(dt * 8, 0, 1));
      fx.distortion = damp(fx.distortion, 0, 8, dt);
      fx.saturation = damp(fx.saturation, 1, 6, dt);
    }

    // Blindness is a white-out rather than a black-out: the lens flares.
    if (this.blinded > 0) {
      const t = clamp(this.blinded / BLIND_DURATION, 0, 1);
      fx.fade = -t;   // negative fade is interpreted as a white flash
    }
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  serialize() {
    return {
      owned: this.owned,
      unlocked: [...this.unlocked],
      lensIndex: this.lensIndex,
      strain: this.strain,
      cracks: this.cracks,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.owned = !!data.owned;
    this.unlocked = (data.unlocked ?? []).filter((id) => LENSES[id]);
    this.lensIndex = clamp(data.lensIndex ?? 0, 0, Math.max(0, this.unlocked.length - 1));
    this.strain = data.strain ?? 0;
    this.cracks = data.cracks ?? 0;
    this.worn = false;
    this.blinded = 0;
    this.lockout = 0;
    this.refreshVisibility();
  }

  dispose() {
    this._stopHum();
  }
}

export { STRAIN };
