/**
 * Choir.js — a dozen porcelain choir dolls that only move when unobserved.
 *
 * The rule is simple and the implementation has to be scrupulous about it,
 * because the entire mechanic dies the moment a player catches one moving.
 * A doll is "observed" when all three hold:
 *
 *   1. It is inside the camera frustum.
 *   2. It is within the player's attention cone (generous, but not 180°).
 *   3. Nothing solid is between it and the camera.
 *
 * Frustum alone is not enough — a doll at the very edge of a wide FOV is
 * technically on screen and nobody is looking at it, and freezing it there
 * feels arbitrary. The raycast matters just as much: a doll behind a seat back
 * is unobserved even though it is on screen, and players find that fair
 * immediately.
 *
 * They also hum. The volume of the hum is the player's only warning that the
 * ones behind them are closing, and it is the reason the mechanic reads as
 * dread rather than as a puzzle about camera angles.
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { material } from '../world/Materials.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/** Half-angle of the player's attention cone, in radians (~62°). */
const ATTENTION_COS = Math.cos(1.08);

/** How close a doll has to get to catch the player. */
const CATCH_DISTANCE = 0.85;

export class Choir extends EventBus {
  constructor({ scene, physics, engine, audio, music, player, count = 10, origin, spread = 6 }) {
    super();
    this.scene = scene;
    this.physics = physics;
    this.engine = engine;
    this.audio = audio;
    this.music = music;
    this.player = player;

    this.enabled = false;
    this.frozenByMusic = false;   // the gramophone holds them still
    this.dolls = [];

    this._frustum = new THREE.Frustum();
    this._projScreen = new THREE.Matrix4();
    this._camPos = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._toDoll = new THREE.Vector3();
    this._sphere = new THREE.Sphere(new THREE.Vector3(), 0.55);

    this._humNodes = null;
    this._humLevel = 0;
    this._singTimer = 0;

    const rng = makeRng(31337);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng() * 0.4;
      const r = spread * (0.45 + rng() * 0.55);
      this._spawn(
        origin.x + Math.cos(angle) * r,
        origin.y,
        origin.z + Math.sin(angle) * r,
        rng
      );
    }
  }

  /**
   * Build one doll.
   *
   * Deliberately NOT the full articulated puppet. A doll needs a head that can
   * turn and a silhouette; it has no visible limbs (the robe covers them) and
   * it never walks, so the forty-odd meshes of a real marionette buy nothing
   * and eleven of them cost more draw calls than the rest of the chapter put
   * together. Six meshes each, and the face still reads at arm's length —
   * which is the only distance at which it matters.
   */
  _spawn(x, y, z, rng) {
    const scale = 0.72 + rng() * 0.12;

    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = rng() * Math.PI * 2;
    root.scale.setScalar(scale);

    // The robe is the body: a cone, floor to shoulder.
    const robe = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.74, 14, 1, false),
      new THREE.MeshStandardMaterial({ color: 0x241c2c, roughness: 0.95 })
    );
    robe.position.y = 0.37;
    robe.castShadow = true;
    robe.receiveShadow = true;
    root.add(robe);

    // A collar, so the head does not appear to float.
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.13, 0.07, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a1520, roughness: 0.9 })
    );
    collar.position.y = 0.76;
    root.add(collar);

    // The head turns, so it is its own pivot.
    const head = new THREE.Group();
    head.position.y = 0.86;
    root.add(head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 11), material('porcelain'));
    skull.scale.set(1, 1.1, 0.95);
    skull.castShadow = true;
    skull.receiveShadow = true;
    head.add(skull);

    // The face. Kept to a handful of meshes — there are eleven of these and
    // they are seen in silhouette, at distance, in the dark — but not to the
    // three it used to be, because the one moment that matters is the one
    // where a doll is suddenly close.
    const dark = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.35 });

    // Sunken sockets, then a pale ball with a black pupil inside each. The
    // pale ball is the whole difference between two holes and two eyes.
    for (const side of [-1, 1]) {
      // Asymmetric on purpose: one socket sits lower than the other.
      const drop = side > 0 ? -0.007 : 0;

      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.031, 9, 7),
        new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.95 })
      );
      socket.position.set(side * 0.036, 0.012 + drop, -0.079);
      socket.scale.set(1, 0.85, 0.6);
      head.add(socket);

      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.019, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xe4ddd0, roughness: 0.2 })
      );
      ball.position.set(side * 0.036, 0.012 + drop, -0.083);
      head.add(ball);

      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0075, 10), dark);
      pupil.position.set(side * 0.036, 0.012 + drop, -0.101);
      head.add(pupil);
    }

    // The mouth, open, with a ring of small teeth round it.
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), dark);
    mouth.position.set(0, -0.045, -0.082);
    mouth.scale.set(0.72, 1.3, 0.6);
    head.add(mouth);

    const toothMat = new THREE.MeshStandardMaterial({ color: 0xc8bda4, roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.016, 4), toothMat);
      tooth.position.set(
        Math.cos(a) * 0.019,
        -0.045 + Math.sin(a) * 0.026,
        -0.092
      );
      tooth.rotation.x = Math.PI / 2;
      head.add(tooth);
    }

    // Crazing. Three cracks down the skull, placed from the doll's own seed so
    // no two in the row are alike — a line of identical dolls reads as a
    // render, a line of dolls that are each slightly broken reads as a choir.
    const crackMat = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 1 });
    for (let i = 0; i < 3 + Math.floor(rng() * 3); i++) {
      const t = rng() * Math.PI * 2;
      const ph = 0.3 + rng() * 1.5;
      const crack = new THREE.Mesh(
        new THREE.BoxGeometry(0.0022, 0.03 + rng() * 0.03, 0.0012),
        crackMat
      );
      crack.position.set(
        Math.sin(ph) * Math.sin(t) * 0.101,
        Math.cos(ph) * 0.101,
        Math.sin(ph) * Math.cos(t) * 0.101
      );
      crack.lookAt(0, 0, 0);
      crack.rotateZ(rng() * Math.PI);
      head.add(crack);
    }

    this.scene.add(root);

    this.dolls.push({
      puppet: { joints: { head } },
      root,
      speed: 1.15 + rng() * 0.5,
      observed: true,
      home: new THREE.Vector3(x, y, z),
      // Each doll turns its head to track the player even while frozen — the
      // one thing they are allowed to do on screen, and the thing that makes
      // a room full of them unbearable.
      headLag: 0.5 + rng() * 1.2,
    });
  }

  start() {
    this.enabled = true;
    this._humNodes = this.audio?.startMaskHum?.() ?? null;
    this.emit('started');
  }

  stop() {
    this.enabled = false;
    if (this._humNodes) {
      this.audio?.stopMaskHum?.(this._humNodes);
      this._humNodes = null;
    }
  }

  /** Called by the gramophone: while it plays, nothing moves. */
  setHeld(held) {
    this.frozenByMusic = held;
  }

  update(dt) {
    if (!this.enabled) return;

    const cam = this.engine.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(this._camPos);
    cam.getWorldDirection(this._camDir);

    this._projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreen);

    const playerPos = this.player.position;
    let nearest = Infinity;
    let movingCount = 0;

    for (const doll of this.dolls) {
      const pos = doll.root.position;

      // --- observation test ---------------------------------------------------
      this._sphere.center.set(pos.x, pos.y + 0.45, pos.z);
      let observed = this._frustum.intersectsSphere(this._sphere);

      if (observed) {
        // Attention cone: on screen is not the same as being looked at.
        this._toDoll.subVectors(this._sphere.center, this._camPos);
        const dist = this._toDoll.length();
        this._toDoll.divideScalar(Math.max(dist, 1e-4));
        observed = this._toDoll.dot(this._camDir) > ATTENTION_COS;

        // And line of sight: behind a seat back is not observed.
        if (observed) {
          observed = this.physics.hasLineOfSight(this._camPos, this._sphere.center);
        }
      }
      doll.observed = observed;

      // --- movement -----------------------------------------------------------
      const canMove = !observed && !this.frozenByMusic;
      if (canMove) {
        movingCount++;
        this._toDoll.subVectors(playerPos, pos);
        this._toDoll.y = 0;
        const d = this._toDoll.length();
        if (d > CATCH_DISTANCE) {
          this._toDoll.divideScalar(d);
          // They close fast. The threat is that you cannot watch every one of
          // them at once, not that any individual one is quick.
          pos.addScaledVector(this._toDoll, doll.speed * dt);
          doll.root.rotation.y = Math.atan2(this._toDoll.x, this._toDoll.z);
        }
      }

      const flat = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      nearest = Math.min(nearest, flat);

      // --- the head ------------------------------------------------------------
      // Allowed to move on screen, because a doll whose head has turned since
      // you last looked is far worse than one that has moved its feet.
      const head = doll.puppet.joints.head;
      const local = head.parent.worldToLocal(
        new THREE.Vector3(playerPos.x, playerPos.y + 1.0, playerPos.z)
      );
      const wantYaw = clamp(Math.atan2(-local.x, -local.z), -1.3, 1.3);
      head.rotation.y = damp(head.rotation.y, wantYaw, doll.headLag, dt);

      if (flat < CATCH_DISTANCE && !this.frozenByMusic) {
        this.emit('caught', doll);
        return;
      }
    }

    this.nearest = nearest;
    this.movingCount = movingCount;

    // --- the hum ---------------------------------------------------------------
    // Rises as the nearest doll closes. This is the player's only information
    // about what is behind them.
    const proximity = clamp(1 - (nearest - CATCH_DISTANCE) / 9, 0, 1);
    const target = this.frozenByMusic ? proximity * 0.15 : proximity;
    this._humLevel = damp(this._humLevel, target, 2.2, dt);
    this.audio?.setMaskHum?.(this._humNodes, this._humLevel * 0.85, proximity * 0.6);

    // Every so often they actually sing a phrase of the lullaby.
    this._singTimer -= dt;
    if (this._singTimer <= 0 && !this.frozenByMusic) {
      this._singTimer = randRange(11, 20);
      const near = this.dolls.reduce((a, b) =>
        (a.root.position.distanceTo(playerPos) < b.root.position.distanceTo(playerPos) ? a : b));
      const panner = this.audio?.panner?.(near.root.position, { bus: 'music', reverb: 0.8 });
      this.music?.singChoirPhrase?.(panner, clamp(proximity + 0.3, 0.3, 1));
    }
  }

  /** Put every doll back where it started. Used on respawn. */
  /**
   * The doll closest to the player, for the jumpscare to frame.
   *
   * There are eleven of them and only one of them reached you; a scare that
   * cut to the middle of the group would show the player the wrong thing.
   */
  get nearestDoll() {
    if (!this.player || !this.dolls?.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const doll of this.dolls) {
      const d = doll.root.position.distanceToSquared(this.player.position);
      if (d < bestD) { bestD = d; best = doll; }
    }
    return best?.root ?? null;
  }

  reset() {
    for (const doll of this.dolls) {
      doll.root.position.copy(doll.home);
      doll.puppet.joints.head.rotation.y = 0;
    }
    this._humLevel = 0;
    this._singTimer = randRange(4, 9);
  }

  dispose() {
    this.stop();
    for (const doll of this.dolls) this.scene.remove(doll.root);
    this.dolls.length = 0;
  }
}
