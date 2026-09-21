/**
 * Jumpscare.js — being caught.
 *
 * The catch used to fade politely to black. That is a defensible choice and it
 * was the wrong one: the moment a monster reaches you is the only time the
 * game has the player's complete attention, and spending it on a dissolve
 * throws it away.
 *
 * What makes a scare land is not volume, it is **timing and contrast**:
 *
 *  1. A beat of nothing. Everything stops — the music, the player, the camera.
 *     Two tenths of a second of silence is what makes the next frame loud.
 *  2. The thing arrives IN FRAME, already close. The camera is snapped onto it
 *     rather than the creature being animated across the room, because a
 *     player looking the other way must still be shown what got them.
 *  3. It comes at the lens, filling the frame over about a third of a second,
 *     with the roll coming off true so the horizon tilts.
 *  4. Then black — fast, not a fade.
 *
 * Everything here reads Settings.reduceFlashing and Settings.reduceScreenShake
 * and degrades honestly: the animation still plays, it just stops strobing and
 * stops throwing the camera around. A player who has turned those on has said
 * they do not want this, and they should still be told they died.
 */

import * as THREE from 'three';
import { Settings } from './Settings.js';
import { clamp, lerp } from '../util/MathUtil.js';

/** Total length. Short on purpose — a long jumpscare is a cutscene. */
const DURATION = 1.35;
const HOLD = 0.18;      // the silence before it

export class Jumpscare {
  constructor({ engine, audio, input, hud }) {
    this.engine = engine;
    this.audio = audio;
    this.input = input;
    this.hud = hud;

    this.active = false;
    this.time = 0;

    this._from = new THREE.Vector3();
    this._fromQuat = new THREE.Quaternion();
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._boxOne = new THREE.Box3();
    this._aimY = 1.5;
  }

  /**
   * @param {object} opts
   * @param {THREE.Object3D} [opts.subject]  what caught them; framed if given
   * @param {THREE.Vector3}  [opts.at]       where it is, if there is no object
   * @param {string}         [opts.cause]
   */
  play({ subject = null, at = null, cause = 'unknown' } = {}) {
    if (this.active) return;

    const cam = this.engine.camera;
    this.active = true;
    this.time = 0;
    this.cause = cause;
    this.subject = subject;

    this._from.copy(cam.position);
    this._fromQuat.copy(cam.quaternion);
    this._baseFov = cam.fov;

    // Where the thing is — specifically, where its face is.
    //
    // A fixed 1.5 metres above the root used to stand in for this, and it is
    // wrong for every creature in the game by a different amount: a
    // marionette's root is the hanger above its head, a choir doll's root is
    // its feet and it is a metre tall, and the Understudy's root sits in its
    // chest. The scare framed the Understudy's sternum. Measuring the
    // silhouette once, here, costs a single traversal and is right for all of
    // them — including anything added later.
    if (subject) {
      subject.getWorldPosition(this._target);
      this._aimY = this._headOffset(subject);
      this._target.y += this._aimY;
    } else if (at) {
      this._target.copy(at);
    } else {
      // Nothing to show: come at them from straight ahead.
      cam.getWorldDirection(this._tmp);
      this._target.copy(cam.position).addScaledVector(this._tmp, 2.2);
    }

    // Face it immediately. The snap is the scare; easing the camera round is
    // the player turning to look, which is not what happened to them.
    this._look.copy(this._target);

    this.reduced = Settings.get('reduceFlashing') || Settings.get('reduceScreenShake');

    this._shriek();
    this.input?.rumble?.(1.0, 1.0, 420);
  }

  /**
   * How far above a creature's own origin its face is.
   *
   * Meshes only: a marionette's control strings run two metres up to the
   * gantry, and counting them would aim the camera at the ceiling.
   */
  _headOffset(subject) {
    const box = this._box.makeEmpty();
    const one = this._boxOne;
    subject.updateWorldMatrix(true, true);
    subject.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      one.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(one);
    });
    if (box.isEmpty()) return 1.5;
    const top = box.max.y - (box.max.y - box.min.y) * 0.12;
    return top - this._target.y;
  }

  /**
   * The sound.
   *
   * Three layers, all synthesised: a downward-swept noise band (breath), a
   * detuned cluster low enough to be felt (the body), and a single very short
   * high transient (the impact). The transient is what the ear registers as
   * "loud"; the other two are what make it feel like a thing rather than an
   * effect.
   */
  _shriek() {
    const A = this.audio;
    if (!A?.ctx) return;

    A.noise?.({
      duration: 0.9, gain: 0.34, filterType: 'bandpass',
      freq: 2600, freqEnd: 180, q: 0.9, attack: 0.004, reverb: 0.45,
    });
    A.noise?.({
      duration: 0.5, gain: 0.22, filterType: 'lowpass',
      freq: 260, freqEnd: 60, q: 1.2, attack: 0.002, reverb: 0.3,
    });
    for (const f of [74, 78.5, 111]) {
      A.tone?.({
        freq: f, type: 'sawtooth', duration: 1.1,
        attack: 0.006, decay: 0.5, sustain: 0.3, release: 0.5,
        gain: 0.12, detune: -18, reverb: 0.5,
      });
    }
    A.noise?.({
      duration: 0.06, gain: 0.3, filterType: 'highpass',
      freq: 3600, q: 0.7, attack: 0.001, when: 0.02,
    });
  }

  /** Advance. Returns true while it is still running. */
  update(dt) {
    if (!this.active) return false;

    this.time += dt;
    const cam = this.engine.camera;
    const fx = this.engine.postfx.fx;

    if (this.time < HOLD) {
      // The beat of nothing. Hold the pose exactly; do not even drift.
      cam.position.copy(this._from);
      cam.quaternion.copy(this._fromQuat);
      return true;
    }

    const t = clamp((this.time - HOLD) / (DURATION - HOLD), 0, 1);

    // A subject that is still moving is tracked, so a creature that lunges
    // past does not leave the camera staring at where it was.
    if (this.subject) {
      this.subject.getWorldPosition(this._look);
      this._look.y += this._aimY;
    } else {
      this._look.copy(this._target);
    }

    // Pull toward it, hard, easing out — the last third is almost still,
    // which is what makes the first third read as fast.
    const ease = 1 - Math.pow(1 - t, 3);
    this._tmp.copy(this._from).lerp(this._look, ease * 0.62);
    cam.position.copy(this._tmp);
    cam.up.set(0, 1, 0);
    cam.lookAt(this._look);

    // Roll off true. Nothing says "wrong" faster than a horizon that is not.
    const roll = this.reduced ? 0.04 : 0.22;
    cam.rotateZ(Math.sin(t * 7.5) * roll * (1 - t * 0.4));

    // In, then a touch back out, so it reads as a lunge rather than a zoom.
    const fov = lerp(this._baseFov, this._baseFov * 0.62, Math.min(1, t * 1.6));
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    if (!this.reduced) {
      const shake = (1 - t) * 0.5;
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
    }

    // The grade goes wrong with it: colour drains, the lens tears apart, and
    // the frame flares white once on the first frame of movement.
    fx.chromaBoost = (this.reduced ? 0.35 : 1.4) * (1 - t * 0.5);
    fx.saturation = lerp(1, 0.15, t);
    fx.vignetteBoost = lerp(0, 0.85, t);

    if (t < 0.12 && !this.reduced) {
      this.engine.postfx.setFade(-(0.75 - t * 6));   // signed: negative is white
    } else {
      // Then straight to black over the back half. Fast, not a dissolve.
      this.engine.postfx.setFade(clamp((t - 0.55) / 0.35, 0, 1));
    }

    if (this.time >= DURATION) {
      this.active = false;
      return false;
    }
    return true;
  }

  /** Put everything back. Called before the respawn. */
  reset() {
    this.active = false;
    this.time = 0;
    const fx = this.engine.postfx.fx;
    fx.chromaBoost = 0;
    fx.saturation = 1;
    fx.vignetteBoost = 0;
    const cam = this.engine.camera;
    cam.fov = this._baseFov ?? cam.fov;
    cam.updateProjectionMatrix();
  }
}
