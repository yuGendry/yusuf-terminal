/**
 * EchoGhost.js — the replays the Echo lens shows.
 *
 * A ghost is a recording, not a character: it walks a fixed path, performs at
 * fixed times, and loops. It cannot see the player and never reacts. That
 * restraint is what makes the lens read as *looking at the past* rather than as
 * another kind of monster — and it is what lets a ghost be a fair puzzle clue,
 * because it does the same thing every time you watch it.
 *
 * Built as a translucent additive figure so it reads as an image rather than an
 * object, and tagged `lensOnly: 'echo'` so the mask system handles visibility.
 */

import * as THREE from 'three';
import { clamp, lerp, damp, randRange } from '../util/MathUtil.js';

const GHOST_COLOR = 0xa98fd6;

/**
 * Build the figure. Deliberately low detail: a silhouette with no face. The
 * player is seeing a residue, and a residue should not have features.
 */
function buildFigure(color, scale) {
  const group = new THREE.Group();

  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 10), mat);
  torso.position.y = 1.12;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), mat);
  head.position.y = 1.62;
  group.add(head);

  const limbs = {};
  for (const [name, x, y, len] of [
    ['armL', -0.24, 1.35, 0.52], ['armR', 0.24, 1.35, 0.52],
    ['legL', -0.11, 0.82, 0.78], ['legR', 0.11, 0.82, 0.78],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, len * 0.72, 3, 8), mat);
    limb.position.y = -len / 2;
    pivot.add(limb);
    group.add(pivot);
    limbs[name] = pivot;
  }

  group.scale.setScalar(scale);
  group.userData.material = mat;
  group.userData.limbs = limbs;
  group.userData.head = head;
  return group;
}

export class EchoGhost {
  /**
   * @param {object} opts
   * @param {THREE.Vector3[]} opts.path   points the ghost walks, looped
   * @param {number} opts.duration        seconds for one full loop
   * @param {Array}  [opts.beats]         [{ t, action, data }] scripted moments
   * @param {number} [opts.scale]
   * @param {number} [opts.color]
   * @param {string} [opts.whisper]       subtitle shown when the player is near
   */
  constructor({
    scene, path, duration = 12, beats = [], scale = 1,
    color = GHOST_COLOR, whisper = null, audio = null, hud = null,
    pauseAt = null, pauseFor = 0,
  }) {
    this.scene = scene;
    this.path = path.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
    this.duration = duration;
    this.beats = beats.map((b) => ({ ...b, fired: false }));
    this.whisper = whisper;
    this.audio = audio;
    this.hud = hud;
    this.pauseAt = pauseAt;      // 0..1 along the loop where the ghost stops
    this.pauseFor = pauseFor;    // seconds

    this.root = buildFigure(color, scale);
    // Tagged for the mask system, which owns `.visible` for lens-only objects.
    //
    // It must NOT start hidden: the mask records each tagged object's initial
    // visibility as the level's own intent, so a ghost created with
    // `visible = false` is read as "the level wants this hidden" and is pinned
    // off permanently, whatever lens is up.
    this.root.userData.lensOnly = 'echo';
    this.root.visible = true;
    scene.add(this.root);

    this.time = 0;
    this._whisperCooldown = 0;
    this._lastLoop = 0;
    this._walkPhase = 0;

    // Precompute cumulative lengths so movement is at constant speed along the
    // path rather than constant time per segment.
    this._lengths = [0];
    let total = 0;
    for (let i = 1; i < this.path.length; i++) {
      total += this.path[i].distanceTo(this.path[i - 1]);
      this._lengths.push(total);
    }
    this._total = total || 1;

    this._pos = new THREE.Vector3();
    this._next = new THREE.Vector3();
  }

  /** Where along the path is the ghost at normalised time `u` (0..1)? */
  _sample(u, out) {
    const target = clamp(u, 0, 1) * this._total;
    for (let i = 1; i < this._lengths.length; i++) {
      if (this._lengths[i] >= target) {
        const seg = this._lengths[i] - this._lengths[i - 1];
        const t = seg > 1e-6 ? (target - this._lengths[i - 1]) / seg : 0;
        return out.lerpVectors(this.path[i - 1], this.path[i], t);
      }
    }
    return out.copy(this.path[this.path.length - 1]);
  }

  update(dt, playerPos, lensActive) {
    // The recording only runs while somebody is watching it. Advancing it in
    // the dark would mean the player sees a different moment every time they
    // put the lens on, and a clue that shows you something different each
    // viewing is not a clue.
    if (!lensActive) return;

    this.time += dt;
    let u = (this.time % this.duration) / this.duration;

    // A held beat: the ghost stops to do something, which is usually the part
    // the player needs to see.
    if (this.pauseAt !== null && this.pauseFor > 0) {
      const cycle = this.duration + this.pauseFor;
      const local = this.time % cycle;
      const pauseStart = this.pauseAt * this.duration;
      if (local > pauseStart && local < pauseStart + this.pauseFor) {
        u = this.pauseAt;
        this._paused = true;
      } else {
        this._paused = false;
        u = (local < pauseStart ? local : local - this.pauseFor) / this.duration;
      }
    }

    this._sample(u, this._pos);
    this.root.position.copy(this._pos);

    // Face along travel.
    this._sample(clamp(u + 0.01, 0, 1), this._next);
    if (this._next.distanceToSquared(this._pos) > 1e-5) {
      const yaw = Math.atan2(this._next.x - this._pos.x, this._next.z - this._pos.z);
      this.root.rotation.y = damp(this.root.rotation.y, yaw, 7, dt);
    }

    // Walk cycle, frozen while paused.
    const moving = !this._paused;
    this._walkPhase += moving ? dt * 6.2 : 0;
    const swing = moving ? 0.5 : 0.05;
    const L = this.root.userData.limbs;
    L.legL.rotation.x = Math.sin(this._walkPhase) * swing;
    L.legR.rotation.x = -Math.sin(this._walkPhase) * swing;
    L.armL.rotation.x = -Math.sin(this._walkPhase) * swing * 0.7;
    L.armR.rotation.x = Math.sin(this._walkPhase) * swing * 0.7;

    // The image is unstable: it thins and thickens, and jumps like worn tape.
    const flicker = 0.24 + Math.sin(this.time * 3.1) * 0.05 + Math.sin(this.time * 11.7) * 0.03;
    this.root.userData.material.opacity = Math.max(0.08, flicker);

    // --- beats ---------------------------------------------------------------
    const loop = Math.floor(this.time / this.duration);
    if (loop !== this._lastLoop) {
      this._lastLoop = loop;
      for (const b of this.beats) b.fired = false;
    }
    const localT = this.time % this.duration;
    for (const b of this.beats) {
      if (!b.fired && localT >= b.t) {
        b.fired = true;
        b.action?.(this);
      }
    }

    // --- whisper -------------------------------------------------------------
    this._whisperCooldown -= dt;
    if (this.whisper && this._whisperCooldown <= 0 && playerPos) {
      const d = this._pos.distanceTo(playerPos);
      if (d < 4.5) {
        this._whisperCooldown = 9;
        this.hud?.say(this.whisper, { speaker: '1986', duration: 5 });
        this.audio?.hallucination?.('whisper', this._pos.clone());
      }
    }
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

/**
 * A stationary echo: a figure that stands and repeats one action.
 * Used for the operators the player has to watch in order to learn a machine.
 */
export function createEchoOperator({
  scene, position, facing = 0, scale = 1, color = GHOST_COLOR,
  actionEvery = 5, onAction = null,
}) {
  const root = buildFigure(color, scale);
  root.position.copy(position);
  root.rotation.y = facing;
  root.userData.lensOnly = 'echo';
  root.visible = true;     // see the note in EchoGhost's constructor
  scene.add(root);

  let t = 0;
  let reach = 0;
  let next = 1.5;

  return {
    root,
    update(dt, playerPos, lensActive) {
      if (!lensActive) return;
      t += dt;

      next -= dt;
      if (next <= 0) {
        next = actionEvery;
        reach = 1;
        onAction?.();
      }
      reach = Math.max(0, reach - dt * 1.6);

      // The reaching arm is the whole point of the figure.
      const L = root.userData.limbs;
      L.armR.rotation.x = lerp(L.armR.rotation.x, -1.5 * Math.min(reach * 2, 1), 0.2);
      L.armL.rotation.x = lerp(L.armL.rotation.x, -0.1, 0.1);

      // A small sway so it does not look frozen.
      root.position.y = position.y + Math.sin(t * 1.1) * 0.012;
      root.userData.material.opacity = 0.22 + Math.sin(t * 2.7) * 0.05;
    },
    dispose() { scene.remove(root); },
  };
}
