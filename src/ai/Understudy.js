/**
 * Understudy.js — the one that is always coming.
 *
 * It does not hunt, search, lose you or give up. It knows where you are, it
 * always knew, and it walks. That is the whole design, and everything else
 * follows from refusing to complicate it:
 *
 *  - **It never runs.** Its walk is a shade slower than yours, so walking away
 *    works and standing still does not. There is no moment where it suddenly
 *    accelerates, because a pursuer that can sprint turns the encounter into a
 *    reflex test; one that merely never stops turns it into a clock.
 *  - **It never loses you.** Hiding, breaking line of sight and doubling back
 *    all do nothing. Pretending otherwise would invite the player to spend the
 *    encounter testing stealth rules that are not there.
 *  - **The water is the only lever.** It wades, and wading slows it exactly as
 *    much as it slows you. Getting onto dry floor is how you buy time, which
 *    makes the chapter's drained and undrained sections play completely
 *    differently with no extra rules.
 *
 * What it costs the player is therefore never *whether* they can get away, but
 * whether they can do the thing in front of them before it arrives. That is
 * the only question the encounter asks.
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { material } from '../world/Materials.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/** How close it has to get. Generous — the threat is the clock, not the reach. */
const CATCH_DISTANCE = 1.15;

/**
 * Walking speed on dry floor, m/s.
 *
 * The player walks at 3.05 and sprints at 5.95. At 2.55 it falls behind a
 * walking player slowly and a sprinting one quickly, so a player who keeps
 * moving is never caught by the movement itself — only by stopping to solve
 * something, which is the entire point.
 */
const WALK_SPEED = 2.55;

export class Understudy extends EventBus {
  /**
   * @param {object} opts
   * @param {THREE.Vector3} opts.spawn      where it comes from
   * @param {function} [opts.waterAt]       (x, z) → depth of water in metres
   */
  constructor({ scene, physics, engine, audio, music, player, spawn, waterAt = null }) {
    super();
    this.scene = scene;
    this.physics = physics;
    this.engine = engine;
    this.audio = audio;
    this.music = music;
    this.player = player;
    this.waterAt = waterAt;

    this.enabled = false;
    this.caught = false;
    this.spawn = spawn.clone();
    this.position = spawn.clone();
    this.yaw = 0;

    this._rng = makeRng(4041);
    this._stepPhase = 0;
    this._breath = 0;
    this._speed = 0;
    this._floorY = spawn.y;

    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    this._build();
  }

  // --------------------------------------------------------------------------

  _build() {
    const root = new THREE.Group();
    root.name = 'understudy';

    // Wrong proportions, deliberately: too tall, too narrow, arms that reach
    // below the knee. It should read as a person from far enough away to be
    // briefly reassuring, and stop reading as one at about ten metres.
    const cloth = new THREE.MeshStandardMaterial({ color: 0x0f0d12, roughness: 0.96 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xcfc2ad, roughness: 0.62 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.78, 6, 10), cloth);
    torso.position.y = 1.35;
    torso.scale.set(1, 1, 0.68);
    root.add(torso);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.24), cloth);
    hips.position.y = 0.92;
    root.add(hips);

    // Legs, as pivots so they can swing.
    this._legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.92, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 4, 8), cloth);
      thigh.position.y = -0.28;
      pivot.add(thigh);
      const shinPivot = new THREE.Group();
      shinPivot.position.y = -0.54;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 8), cloth);
      shin.position.y = -0.24;
      shinPivot.add(shin);
      pivot.add(shinPivot);
      pivot.userData.shin = shinPivot;
      pivot.userData.side = side;
      root.add(pivot);
      this._legs.push(pivot);
    }

    // Arms. Long enough to be wrong, hanging perfectly still.
    this._arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24, 1.66, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.46, 4, 8), cloth);
      upper.position.y = -0.3;
      pivot.add(upper);
      const fore = new THREE.Group();
      fore.position.y = -0.58;
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.5, 4, 8), cloth);
      lower.position.y = -0.31;
      fore.add(lower);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.05), skin);
      hand.position.y = -0.62;
      fore.add(hand);
      pivot.add(fore);
      pivot.userData.fore = fore;
      pivot.userData.side = side;
      root.add(pivot);
      this._arms.push(pivot);
    }

    // The head: a porcelain understudy mask on a neck that is slightly too long.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.22, 8), skin);
    neck.position.y = 1.88;
    root.add(neck);

    const head = new THREE.Group();
    head.position.y = 2.06;
    root.add(head);
    this._head = head;

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), skin);
    skull.scale.set(1, 1.18, 0.92);
    head.add(skull);

    // The face is a blank the understudy would have worn to stand in for
    // whoever was absent: no features except the two holes.
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.142, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({
        color: 0xeae2d4, roughness: 0.28, metalness: 0,
      })
    );
    face.rotation.x = Math.PI / 2.1;
    face.scale.set(1, 0.95, 1);
    face.position.z = 0.012;
    head.add(face);

    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
      );
      socket.position.set(side * 0.05, 0.02, 0.125);
      head.add(socket);
    }

    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // Through Threadlight it is the only thing in the building with no threads
    // at all — which is the tell that it was never a puppet.
    const absence = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 2.4, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x1a0c10, transparent: true, opacity: 0.4,
        side: THREE.BackSide, depthWrite: false,
      })
    );
    absence.position.y = 1.2;
    absence.userData.lensOnly = 'threadlight';
    root.add(absence);

    root.visible = false;
    root.position.copy(this.position);
    this.scene.add(root);
    this.root = root;
  }

  // --------------------------------------------------------------------------

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.caught = false;
    this.root.visible = true;
    this._speed = 0;
    this.emit('started');
  }

  stop() {
    this.enabled = false;
    this.root.visible = false;
    this._stopAudio();
  }

  reset() {
    this.stop();
    this.caught = false;
    this.position.copy(this.spawn);
    this.root.position.copy(this.spawn);
    this._speed = 0;
  }

  /** Distance to the player, for HUD proximity and music. */
  get distance() {
    return this.player ? this.position.distanceTo(this.player.position) : Infinity;
  }

  // --------------------------------------------------------------------------

  update(dt) {
    if (!this.enabled || !this.player || this.caught) return;

    this._steer(dt);
    this._animate(dt);
    this._audio(dt);

    if (this.distance < CATCH_DISTANCE) {
      this.caught = true;
      this._stopAudio();
      this.emit('caught');
    }
  }

  /**
   * Walk toward the player, sliding along anything in the way.
   *
   * Not a pathfinder. A pursuer that solved mazes would be a different and
   * much less readable creature; this one only ever knows "that way", and when
   * "that way" is a wall it slides along the wall. In a room of pillars and
   * racks that produces exactly the behaviour the encounter wants — it comes
   * round things rather than through them, and it never gets stuck for long
   * enough to be exploited.
   */
  _steer(dt) {
    this._dir.subVectors(this.player.position, this.position);
    this._dir.y = 0;
    const dist = this._dir.length();
    if (dist < 0.001) return;
    this._dir.divideScalar(dist);

    // Wading slows it exactly as much as it slows the player.
    const depth = this.waterAt ? this.waterAt(this.position.x, this.position.z) : 0;
    const wade = depth > 0.05 ? clamp(1 - depth * 0.62, 0.42, 1) : 1;
    const target = WALK_SPEED * wade;
    this._speed = damp(this._speed, target, 3, dt);

    // Probe ahead. If the direct line is blocked, try progressively wider
    // angles to each side and take the first that is clear.
    let move = this._dir.clone();
    const PROBE = 0.75;
    if (this._blocked(move, PROBE)) {
      let found = false;
      for (const angle of [0.45, -0.45, 0.9, -0.9, 1.35, -1.35]) {
        const alt = this._dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        if (!this._blocked(alt, PROBE)) { move = alt; found = true; break; }
      }
      // Boxed in on every side: press on regardless rather than freeze, so it
      // can never be parked in a corner and forgotten about.
      if (!found) move = this._dir.clone();
    }

    this.position.addScaledVector(move, this._speed * dt);

    // Settle onto whatever floor is underfoot, so it follows ramps and steps
    // down into the drained sections instead of walking through the air.
    const hit = this.physics.raycast(
      { x: this.position.x, y: this.position.y + 1.4, z: this.position.z },
      { x: 0, y: -1, z: 0 }, 4.5
    );
    if (hit) this._floorY = hit.point.y;
    this.position.y = damp(this.position.y, this._floorY, 8, dt);

    this.root.position.copy(this.position);

    // Face the player, always, including while sliding around something.
    const wantYaw = Math.atan2(this._dir.x, this._dir.z);
    let delta = wantYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * Math.min(1, dt * 4);
    this.root.rotation.y = this.yaw;
  }

  _blocked(dir, distance) {
    const hit = this.physics.raycast(
      { x: this.position.x, y: this.position.y + 1.0, z: this.position.z },
      { x: dir.x, y: 0, z: dir.z },
      distance
    );
    return !!hit;
  }

  _animate(dt) {
    // A slow, even, unhurried walk. The stride never changes length and never
    // changes tempo, whatever the distance — it is not trying to catch you, it
    // is just going to.
    const moving = this._speed > 0.1;
    this._stepPhase += dt * this._speed * 2.1;

    for (const leg of this._legs) {
      const p = this._stepPhase + (leg.userData.side > 0 ? Math.PI : 0);
      leg.rotation.x = moving ? Math.sin(p) * 0.52 : 0;
      leg.userData.shin.rotation.x = moving ? Math.max(0, -Math.cos(p)) * 0.6 : 0;
    }

    // The arms do not swing. That is the thing people notice.
    for (const arm of this._arms) {
      arm.rotation.x = Math.sin(this._stepPhase * 0.5 + arm.userData.side) * 0.03;
      arm.rotation.z = arm.userData.side * 0.06;
    }

    // The head stays level and locked on while the body walks under it.
    this._head.rotation.x = 0;
    this._breath += dt;
    this._head.position.y = 2.06 + Math.sin(this._breath * 1.1) * 0.006;
  }

  _audio(dt) {
    const A = this.audio;
    if (!A?.ctx) return;

    // One wet, heavy footfall per stride, positioned in the world. The player
    // is supposed to be able to navigate by the sound of it alone.
    const stride = Math.PI;
    if (this._stepPhase - (this._lastStep ?? 0) >= stride) {
      this._lastStep = this._stepPhase;
      const depth = this.waterAt ? this.waterAt(this.position.x, this.position.z) : 0;
      A.footstep?.(depth > 0.1 ? 'water' : 'tile', {
        loudness: 1.1,
        position: this.position.clone().setY(this.position.y + 0.1),
      });
    }

    // And a breath, slow and far too deep, every few seconds.
    this._breathTimer = (this._breathTimer ?? randRange(0, 3)) + dt;
    if (this._breathTimer > 4.2) {
      this._breathTimer = 0;
      A.noiseAt?.(this.position.clone().setY(this.position.y + 1.9), {
        duration: 1.5, gain: 0.05, filterType: 'lowpass',
        freq: 520, freqEnd: 190, q: 1.1, attack: 0.35, reverb: 0.5,
      });
    }
  }

  _stopAudio() {
    this._lastStep = 0;
    this._breathTimer = 0;
  }

  dispose() {
    this.stop();
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose(); }
    });
  }
}

export { WALK_SPEED, CATCH_DISTANCE };
