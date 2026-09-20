/**
 * Gloam.js — the long felt thing in the vents.
 *
 * Blind. It has no eyes at all, and it never once tests line of sight. It
 * hears, and that is the whole contract with the player: **noise is the only
 * thing that can hurt you here.** Crouching, walking, standing still and the
 * Veilmask's hum are the entire vocabulary of the encounter.
 *
 * Because it cannot see, it must be scrupulously honest about what it can
 * hear, or the player will believe it is cheating. So:
 *  - it only ever moves toward a *sound event*, never toward the player;
 *  - a sound event has a position and a loudness, and the position is where
 *    the sound happened, not where the player is now;
 *  - it investigates, loses the trail, and casts about — audibly — so the
 *    player can hear it failing to find them.
 *
 * States: dormant → listening → investigating → hunting → feeding
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { material } from '../world/Materials.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

const STATE = {
  DORMANT: 'dormant',
  LISTENING: 'listening',
  INVESTIGATING: 'investigating',
  HUNTING: 'hunting',
  FEEDING: 'feeding',
};

/** How close it has to get. It is very long; this is generous to the player. */
const CATCH_DISTANCE = 1.25;

/** Loudness below which a sound does not register at all. */
const HEARING_FLOOR = 0.12;

export class Gloam extends EventBus {
  constructor({ scene, physics, engine, audio, music, player, patrol = [], hearingRange = 18 }) {
    super();
    this.scene = scene;
    this.physics = physics;
    this.engine = engine;
    this.audio = audio;
    this.music = music;
    this.player = player;

    this.enabled = false;
    this.state = STATE.DORMANT;
    this.stateTime = 0;
    this.hearingRange = hearingRange;

    this.patrol = patrol.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
    this.patrolIndex = 0;

    this.position = new THREE.Vector3().copy(this.patrol[0] ?? new THREE.Vector3());
    this.target = this.position.clone();
    this.speed = 0;
    /** Confidence that the last sound was the player, 0..1. */
    this.interest = 0;

    this._rng = makeRng(777);
    this._tmp = new THREE.Vector3();
    this._segments = [];
    this._soundTimer = 0;

    this._build();
  }

  /**
   * The body: a chain of segments that follow each other, so it moves like
   * something long being dragged through a space rather than like a walking
   * animal. No legs, no eyes.
   */
  _build() {
    const root = new THREE.Group();
    root.name = 'gloam';

    const feltMat = material('feltDark', { color: 0x14121a });

    const COUNT = 14;
    for (let i = 0; i < COUNT; i++) {
      const t = i / (COUNT - 1);
      // Thick at the head, tapering hard toward the tail.
      const r = lerp(0.3, 0.07, Math.pow(t, 0.7));
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), feltMat);
      seg.scale.set(1, 0.82, 1.25);
      seg.castShadow = true;
      seg.receiveShadow = true;
      root.add(seg);
      this._segments.push({ mesh: seg, pos: this.position.clone(), radius: r });
    }

    // The arms. Many, thin, and far too long — they reach ahead of the body,
    // feeling for what it cannot see.
    this._arms = [];
    for (let i = 0; i < 8; i++) {
      const arm = new THREE.Group();
      const links = [];
      for (let j = 0; j < 4; j++) {
        const link = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035 - j * 0.006, 0.03 - j * 0.006, 0.42, 5),
          feltMat
        );
        link.position.y = -0.21;
        const pivot = new THREE.Group();
        pivot.position.y = j === 0 ? 0 : -0.42;
        pivot.add(link);
        if (j === 0) arm.add(pivot);
        else links[j - 1].add(pivot);
        links.push(pivot);
      }
      arm.userData.links = links;
      arm.userData.phase = this._rng() * Math.PI * 2;
      arm.userData.side = i % 2 === 0 ? -1 : 1;
      arm.userData.index = i;
      root.add(arm);
      this._arms.push(arm);
    }

    // A blunt head with no face. Just a seam where a mouth would be.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 11), feltMat);
    head.scale.set(1, 0.85, 1.35);
    head.castShadow = true;
    root.add(head);
    this._head = head;

    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.022, 6, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2a0d10, roughness: 0.9 })
    );
    seam.rotation.set(Math.PI / 2, 0, 0);
    seam.position.z = -0.3;
    head.add(seam);

    root.visible = false;
    this.scene.add(root);
    this.root = root;
  }

  // --------------------------------------------------------------------------

  start() {
    this.enabled = true;
    this.root.visible = true;
    this.setState(STATE.LISTENING);
  }

  stop() {
    this.enabled = false;
    this.root.visible = false;
    this.setState(STATE.DORMANT);
  }

  setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.stateTime = 0;
    this.emit('stateChanged', next);

    if (next === STATE.HUNTING) this.music?.setMood('chase');
    else if (next === STATE.INVESTIGATING) this.music?.setMood('tension');
    else if (next === STATE.LISTENING) this.music?.setMood('unease');
  }

  /**
   * Report a sound. This is the ONLY way the player can be detected.
   *
   * @param {THREE.Vector3} position where the sound happened
   * @param {number} loudness 0..1
   */
  hear(position, loudness) {
    if (!this.enabled || loudness < HEARING_FLOOR) return;

    const distance = this.position.distanceTo(position);
    // Inverse-square-ish falloff, then a hard range cut.
    const heard = loudness * (1 - clamp(distance / this.hearingRange, 0, 1)) ** 1.4;
    if (heard < 0.04) return;

    this.interest = clamp(this.interest + heard * 1.6, 0, 1);
    // It goes to where the sound WAS. Moving after making a noise works.
    this.target.copy(position);
    this.lastSound = { position: position.clone(), loudness, at: this.engine.elapsed };

    if (this.interest > 0.62) this.setState(STATE.HUNTING);
    else if (this.state === STATE.LISTENING) this.setState(STATE.INVESTIGATING);
  }

  update(dt, { maskHum = 0 } = {}) {
    if (!this.enabled) return;
    this.stateTime += dt;

    // The mask's hum is a continuous sound source at the player's position —
    // wearing it anywhere near this thing is simply telling it where you are.
    if (maskHum > 0.05) {
      this._humAccum = (this._humAccum ?? 0) + dt;
      if (this._humAccum > 0.4) {
        this._humAccum = 0;
        this.hear(this.player.position, maskHum * 0.55);
      }
    }

    switch (this.state) {
      case STATE.LISTENING:     this._patrol(dt); break;
      case STATE.INVESTIGATING: this._investigate(dt); break;
      case STATE.HUNTING:       this._hunt(dt); break;
      case STATE.FEEDING:       this.speed = 0; break;
      default: break;
    }

    // Interest always decays. Standing still always works, eventually.
    this.interest = clamp(this.interest - dt * 0.085, 0, 1);

    this._move(dt);
    this._animate(dt);
    this._audio(dt);
  }

  _patrol(dt) {
    this.speed = damp(this.speed, 1.1, 1.5, dt);
    const point = this.patrol[this.patrolIndex];
    if (!point) return;
    this.target.copy(point);
    if (this.position.distanceTo(point) < 1.2) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
    }
  }

  _investigate(dt) {
    this.speed = damp(this.speed, 1.9, 2.2, dt);

    if (this.position.distanceTo(this.target) < 1.0) {
      // Arrived at the sound and found nothing. Cast about nearby — this is
      // the part the player hears and holds their breath through.
      if (!this._castTimer || this._castTimer <= 0) {
        this._castTimer = randRange(1.4, 2.6);
        this.target.set(
          this.target.x + randRange(-3, 3),
          this.target.y,
          this.target.z + randRange(-3, 3)
        );
      }
      this._castTimer -= dt;
    }

    if (this.interest < 0.12 && this.stateTime > 6) this.setState(STATE.LISTENING);
    if (this.interest > 0.62) this.setState(STATE.HUNTING);
  }

  _hunt(dt) {
    this.speed = damp(this.speed, 3.6, 3, dt);

    // Still going to the last SOUND, not to the player. If they have gone
    // quiet and moved, it arrives at an empty corridor.
    const reached = this.position.distanceTo(this.target) < 0.9;
    if (reached) {
      this._castTimer = (this._castTimer ?? 0) - dt;
      if (this._castTimer <= 0) {
        this._castTimer = randRange(0.8, 1.5);
        this.target.set(
          this.target.x + randRange(-2.5, 2.5),
          this.target.y,
          this.target.z + randRange(-2.5, 2.5)
        );
      }
    }

    const d = this.position.distanceTo(this.player.position);
    if (d < CATCH_DISTANCE) {
      this.setState(STATE.FEEDING);
      this.emit('caught', this);
      return;
    }

    if (this.interest < 0.28) this.setState(STATE.INVESTIGATING);
  }

  _move(dt) {
    this._tmp.subVectors(this.target, this.position);
    this._tmp.y = 0;
    const d = this._tmp.length();
    if (d > 0.05) {
      this._tmp.divideScalar(d);
      const step = Math.min(this.speed * dt, d);
      const next = this.position.clone().addScaledVector(this._tmp, step);

      // It crawls along the floor and through vents; keep it out of walls with
      // a short forward probe rather than a full navmesh.
      const probe = this.physics.raycast(
        this.position.clone().setY(this.position.y + 0.4),
        { x: this._tmp.x, y: 0, z: this._tmp.z },
        step + 0.6
      );
      if (!probe) {
        this.position.copy(next);
      } else {
        // Slide along the obstruction.
        const n = probe.normal;
        const slide = this._tmp.clone().addScaledVector(n, -this._tmp.dot(n)).normalize();
        this.position.addScaledVector(slide, step * 0.6);
      }
    }

    // Follow-the-leader chain: each segment eases toward the one ahead.
    let ahead = this.position;
    for (let i = 0; i < this._segments.length; i++) {
      const seg = this._segments[i];
      const gap = seg.radius * 1.15;
      this._tmp.subVectors(ahead, seg.pos);
      const dist = this._tmp.length();
      if (dist > gap) {
        seg.pos.addScaledVector(this._tmp.divideScalar(dist), dist - gap);
      }
      seg.mesh.position.copy(seg.pos);
      seg.mesh.position.y = 0.16 + Math.sin(this.engine.elapsed * 4 + i * 0.5) * 0.04;
      ahead = seg.pos;
    }

    this._head.position.copy(this.position);
    this._head.position.y = 0.26;
    const lookAt = this._tmp.copy(this.target).setY(this._head.position.y);
    if (lookAt.distanceToSquared(this._head.position) > 1e-4) this._head.lookAt(lookAt);
  }

  _animate(dt) {
    const t = this.engine.elapsed;
    const active = this.state === STATE.HUNTING ? 1.6 : this.state === STATE.INVESTIGATING ? 1 : 0.5;

    this._arms.forEach((arm, i) => {
      const seg = this._segments[Math.min(i + 1, this._segments.length - 1)];
      arm.position.copy(seg.pos);
      arm.position.y = 0.3;

      const ph = arm.userData.phase + t * (1.4 + active);
      // The arms sweep ahead of the body, feeling the space.
      arm.rotation.z = arm.userData.side * (0.7 + Math.sin(ph) * 0.5 * active);
      arm.rotation.x = Math.sin(ph * 0.7) * 0.6 * active;

      const links = arm.userData.links;
      for (let j = 0; j < links.length; j++) {
        links[j].rotation.x = Math.sin(ph + j * 0.9) * 0.34 * active;
        links[j].rotation.z = Math.cos(ph * 0.8 + j * 0.6) * 0.22 * active;
      }
    });
  }

  _audio(dt) {
    this._soundTimer -= dt;
    if (this._soundTimer > 0) return;

    const d = this.position.distanceTo(this.player.position);
    const near = clamp(1 - d / 22, 0, 1);
    if (near <= 0.02) { this._soundTimer = 1.5; return; }

    switch (this.state) {
      case STATE.HUNTING:
        this._soundTimer = randRange(0.3, 0.55);
        // Wet felt dragging over concrete.
        this.audio?.noiseAt?.(this.position, {
          duration: 0.4, gain: 0.16 * near, filterType: 'bandpass',
          freq: randRange(300, 700), freqEnd: 180, q: 1.4, reverb: 0.75, attack: 0.05,
        });
        break;
      case STATE.INVESTIGATING:
        this._soundTimer = randRange(0.8, 1.6);
        this.audio?.noiseAt?.(this.position, {
          duration: 0.6, gain: 0.1 * near, filterType: 'bandpass',
          freq: 420, freqEnd: 240, q: 3, reverb: 0.8, attack: 0.15,
        });
        break;
      default:
        this._soundTimer = randRange(2.5, 5);
        this.audio?.noiseAt?.(this.position, {
          duration: 0.9, gain: 0.06 * near, filterType: 'lowpass',
          freq: 380, freqEnd: 160, q: 0.8, reverb: 0.9, attack: 0.3,
        });
        break;
    }
  }

  reset() {
    this.position.copy(this.patrol[0] ?? new THREE.Vector3());
    this.target.copy(this.position);
    this.interest = 0;
    this.speed = 0;
    this.patrolIndex = 0;
    for (const seg of this._segments) seg.pos.copy(this.position);
    this.setState(STATE.LISTENING);
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

export { STATE as GLOAM_STATE };
