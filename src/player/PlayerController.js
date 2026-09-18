/**
 * PlayerController.js — first-person movement, camera feel and stamina.
 *
 * Movement is intentionally weighty rather than snappy: acceleration and
 * deceleration are separate, air control is heavily reduced, and the camera
 * lags the body slightly. Horror pacing depends on the player *not* being able
 * to outrun a problem casually.
 *
 * The camera transform is assembled every frame from independent layers, so any
 * one of them can be disabled (accessibility) without disturbing the others:
 *   eye height  →  head bob  →  landing dip  →  lean/sway  →  trauma shake
 */

import * as THREE from 'three';
import { Settings } from './../core/Settings.js';
import { EventBus } from '../util/EventBus.js';
import { clamp, damp, lerp, smoothstep } from '../util/MathUtil.js';
import { GROUP, collisionGroups } from '../core/Physics.js';

const STANCE = {
  stand:  { eye: 1.62, halfHeight: 0.62, speed: 3.05, label: 'stand' },
  crouch: { eye: 0.95, halfHeight: 0.28, speed: 1.35, label: 'crouch' },
};

const SPRINT_MULTIPLIER = 1.95;
const WALK_MULTIPLIER = 0.48;        // held when the player wants to be quiet

/**
 * Downward velocity applied while grounded. Keeps the capsule pressed into
 * slopes and stair treads so the controller's ground detection stays stable
 * instead of flickering between grounded and airborne on every ridge.
 */
const GROUND_STICK = -2.0;

export class PlayerController extends EventBus {
  constructor({ engine, input, physics, spawn = new THREE.Vector3(0, 1, 0), yaw = 0 }) {
    super();
    this.engine = engine;
    this.input = input;
    this.physics = physics;
    this.camera = engine.camera;

    this.character = physics.createCharacter({
      radius: 0.3,
      halfHeight: STANCE.stand.halfHeight,
      position: spawn,
    });

    // --- state ---------------------------------------------------------------
    this.position = spawn.clone();          // capsule centre
    this._pendingSpawn = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = yaw;
    this.pitch = 0;

    this.stance = 'stand';
    this.wantsCrouch = false;
    this.grounded = false;
    this._wasGrounded = true;
    this._coyote = 0;

    this.stamina = 1;
    this.exhausted = false;
    this.sprinting = false;
    this.moveSpeed = 0;                     // current horizontal speed, m/s

    /** 0..1 — how much noise the player is making right now. Enemies read this. */
    this.noiseLevel = 0;

    this.frozen = false;                    // cutscenes, death, hiding
    this.canMove = true;
    this.canLook = true;

    // --- camera feel ---------------------------------------------------------
    this.eyeHeight = STANCE.stand.eye;
    this._bobPhase = 0;
    this._bobAmount = 0;
    this._stepDistance = 0;
    this._landDip = 0;
    this._landDipVel = 0;
    this._swayX = 0;
    this._swayY = 0;
    this._rollTarget = 0;
    this._roll = 0;
    this._trauma = 0;
    this._fovOffset = 0;
    this._breath = 0;

    this._toggledSprint = false;
    this._toggledCrouch = false;

    // Scratch vectors — allocating inside the update loop causes GC hitches.
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._camQuat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  get eyePosition() {
    return this._tmpA.set(this.position.x, this.position.y + this._eyeOffset(), this.position.z);
  }

  _eyeOffset() {
    // Capsule centre → eye. The capsule's centre sits halfHeight above its
    // bottom sphere centre, which is itself `radius` above the floor.
    const stance = STANCE[this.stance];
    return stance.eye - (this.character.halfHeight + this.character.radius);
  }

  /** Direction the camera is facing, flattened to the ground plane. */
  getForward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /**
   * Move the player somewhere instantly: spawn points, checkpoints, cutscenes.
   *
   * The capsule is then settled onto the floor by raycast rather than trusted to
   * fall into place. A spawn point authored a few centimetres off is normal, and
   * the character controller cannot resolve penetration that already exists — it
   * only prevents new penetration — so a capsule that starts inside the floor
   * stays inside it for the rest of the level.
   */
  teleport(position, yaw = this.yaw, { snapToFloor = true } = {}) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;

    if (snapToFloor) {
      const feetClearance = this.character.halfHeight + this.character.radius;
      // Start the probe above the requested point so a spawn already slightly
      // below the floor still finds it.
      const from = this._tmpB.copy(position).setY(position.y + feetClearance + 1.0);
      const hit = this.physics.raycast(
        from,
        { x: 0, y: -1, z: 0 },
        feetClearance + 3.0,
        collisionGroups(0xffff, GROUP.WORLD | GROUP.PROP),
        this.character.collider
      );
      if (hit) {
        // 0.02 matches the character controller's skin width, so the very first
        // move neither has to climb out of the floor nor drops through it.
        this.position.y = hit.point.y + feetClearance + 0.02;
      }
    }

    const { x, y, z } = this.position;
    this.character.body.setTranslation({ x, y, z }, true);
    this.character.body.setNextKinematicTranslation({ x, y, z });
    this.grounded = true;
    this._wasGrounded = true;
    this._lastFallSpeed = 0;
  }

  /** Camera kick, 0..1. Used by impacts, scares and collapsing catwalks. */
  addTrauma(amount) {
    if (Settings.get('reduceScreenShake')) amount *= 0.25;
    this._trauma = clamp(this._trauma + amount, 0, 1);
  }

  // --------------------------------------------------------------------------

  update(dt) {
    this._updateLook(dt);
    this._updateStance(dt);
    this._updateMovement(dt);
    this._updateStamina(dt);
    this._updateCameraFeel(dt);
    this._updateNoise(dt);
  }

  // --------------------------------------------------------------------------
  // Look
  // --------------------------------------------------------------------------

  _updateLook(dt) {
    if (!this.canLook || this.frozen) return;
    const sens = Settings.get('mouseSensitivity') * 0.0022;
    const invert = Settings.get('invertY') ? -1 : 1;

    this.yaw -= this.input.mouse.dx * sens;
    this.pitch -= this.input.mouse.dy * sens * invert;

    // Just short of straight up/down, so the view never gimbals or flips.
    const limit = Math.PI / 2 - 0.02;
    this.pitch = clamp(this.pitch, -limit, limit);

    // Mouse motion also drives the weapon-style sway of the view.
    const swayScale = 0.0016;
    this._swayX = damp(this._swayX, clamp(-this.input.mouse.dx * swayScale, -0.05, 0.05), 9, dt);
    this._swayY = damp(this._swayY, clamp(-this.input.mouse.dy * swayScale, -0.04, 0.04), 9, dt);
  }

  // --------------------------------------------------------------------------
  // Stance (stand / crouch), with a headroom check before standing up
  // --------------------------------------------------------------------------

  _updateStance(dt) {
    if (!this.frozen && this.canMove) {
      if (Settings.get('holdToCrouch')) {
        this.wantsCrouch = this.input.isDown('crouch');
      } else if (this.input.pressed('crouch')) {
        this._toggledCrouch = !this._toggledCrouch;
        this.wantsCrouch = this._toggledCrouch;
      }
    }

    const target = this.wantsCrouch ? 'crouch' : 'stand';

    if (target === 'stand' && this.stance === 'crouch') {
      // Refuse to stand if there's a vent/desk overhead — otherwise the capsule
      // resizes into geometry and Rapier ejects the player through the ceiling.
      if (!this._hasHeadroom()) {
        this.stance = 'crouch';
      } else {
        this.stance = 'stand';
      }
    } else {
      this.stance = target;
    }

    const stance = STANCE[this.stance];

    // The collider snaps, but the eye height eases — that transition is most of
    // what makes crouching feel physical.
    if (Math.abs(this.character.halfHeight - stance.halfHeight) > 1e-4) {
      // Keep the feet planted rather than the centre: shrinking around the
      // centre would drop the capsule half the height difference into the floor
      // and pop it the same distance into the air when standing back up.
      const feet = this.position.y - (this.character.halfHeight + this.character.radius);
      this.position.y = feet + stance.halfHeight + this.character.radius;
      this.physics.setCharacterHeight(this.character, stance.halfHeight, this.position);
    }

    this.eyeHeight = damp(this.eyeHeight, stance.eye, 11, dt);
  }

  _hasHeadroom() {
    const standHalf = STANCE.stand.halfHeight;
    const r = this.character.radius;
    const origin = this._tmpB.copy(this.position);
    origin.y += this.character.halfHeight;
    const needed = (standHalf - this.character.halfHeight) + r + 0.08;
    const hit = this.physics.raycast(
      origin,
      { x: 0, y: 1, z: 0 },
      needed,
      collisionGroups(0xffff, GROUP.WORLD | GROUP.PROP),
      this.character.collider
    );
    return hit === null;
  }

  // --------------------------------------------------------------------------
  // Movement
  // --------------------------------------------------------------------------

  _updateMovement(dt) {
    const input = this.input;
    const stance = STANCE[this.stance];

    // --- gather wish direction in world space ------------------------------
    let ix = 0;
    let iz = 0;
    if (this.canMove && !this.frozen) {
      if (input.isDown('forward')) iz += 1;
      if (input.isDown('back')) iz -= 1;
      if (input.isDown('right')) ix += 1;
      if (input.isDown('left')) ix -= 1;
    }

    const hasInput = ix !== 0 || iz !== 0;
    if (hasInput) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
    }

    this.getForward(this._forward);
    this._right.set(-this._forward.z, 0, this._forward.x);

    this._desired
      .set(0, 0, 0)
      .addScaledVector(this._forward, iz)
      .addScaledVector(this._right, ix);

    // --- sprint ------------------------------------------------------------
    let wantsSprint;
    if (Settings.get('holdToSprint')) {
      wantsSprint = input.isDown('sprint');
    } else {
      if (input.pressed('sprint')) this._toggledSprint = !this._toggledSprint;
      if (!hasInput) this._toggledSprint = false;
      wantsSprint = this._toggledSprint;
    }

    // Sprinting requires forward intent, stamina, and standing up.
    this.sprinting =
      wantsSprint && hasInput && iz > 0.3 && !this.exhausted &&
      this.stance === 'stand' && this.grounded;

    // Holding the walk modifier (the same key as crouch, tapped while standing)
    // is handled by the stance system; here we only need the speed multiplier.
    let targetSpeed = stance.speed;
    if (this.sprinting) targetSpeed *= SPRINT_MULTIPLIER;
    if (this.exhausted && this.stance === 'stand') targetSpeed *= 0.8;

    // --- horizontal acceleration ------------------------------------------
    const wishVel = this._desired.clone().multiplyScalar(hasInput ? targetSpeed : 0);

    // Separate accel/decel: quick to get going, slower to stop, much weaker in
    // the air. These numbers are the whole "feel" of the character.
    const accel = this.grounded ? (hasInput ? 14 : 11) : 2.6;
    this.velocity.x = damp(this.velocity.x, wishVel.x, accel, dt);
    this.velocity.z = damp(this.velocity.z, wishVel.z, accel, dt);

    // --- gravity & ground ---------------------------------------------------
    if (this.grounded) {
      this._coyote = 0.12;
      // A small downward bias keeps the controller glued to slopes and stairs.
      this.velocity.y = GROUND_STICK;
    } else {
      this._coyote = Math.max(0, this._coyote - dt);
      this.velocity.y -= 19.6 * dt;
      this.velocity.y = Math.max(this.velocity.y, -28);
    }

    // --- move through Rapier ------------------------------------------------
    const motion = this._tmpB.copy(this.velocity).multiplyScalar(dt);
    const { controller, collider, body } = this.character;

    controller.computeColliderMovement(
      collider,
      { x: motion.x, y: motion.y, z: motion.z },
      undefined,
      collisionGroups(GROUP.PLAYER, GROUP.WORLD | GROUP.PROP)
    );

    const corrected = controller.computedMovement();
    this.position.x += corrected.x;
    this.position.y += corrected.y;
    this.position.z += corrected.z;

    body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    });

    this._wasGrounded = this.grounded;
    this.grounded = controller.computedGrounded();

    // If the controller ate our motion (we hit a wall), zero the corresponding
    // velocity so we don't keep accumulating speed into the wall.
    if (dt > 0) {
      if (Math.abs(corrected.x) < Math.abs(motion.x) * 0.25) this.velocity.x *= 0.25;
      if (Math.abs(corrected.z) < Math.abs(motion.z) * 0.25) this.velocity.z *= 0.25;
      if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    }

    // Speed is measured from the distance actually covered, not from the
    // velocity we asked for. Pressed against a wall the controller returns
    // almost no movement while the wish velocity stays at full walking speed —
    // reading the latter would keep the head bobbing, keep footsteps firing,
    // and keep telling the AI the player is making walking noise while they
    // stand still against a door.
    this.moveSpeed = dt > 0 ? Math.hypot(corrected.x, corrected.z) / dt : 0;

    // --- landing ------------------------------------------------------------
    if (this.grounded && !this._wasGrounded) {
      const impact = clamp(Math.abs(this._lastFallSpeed ?? 0) / 14, 0, 1);
      if (impact > 0.06) {
        this._landDipVel -= impact * 0.16;
        this.addTrauma(impact * 0.25);
        this.emit('land', impact);
      }
      this._lastFallSpeed = 0;
    }
    if (!this.grounded) this._lastFallSpeed = this.velocity.y;

    // --- footsteps ----------------------------------------------------------
    if (this.grounded && this.moveSpeed > 0.25) {
      // Stride length scales with speed so a sprint doesn't just play the same
      // footstep loop faster — the steps genuinely get longer.
      const stride = this.stance === 'crouch' ? 0.78 : this.sprinting ? 1.32 : 1.02;
      this._stepDistance += this.moveSpeed * dt;
      if (this._stepDistance >= stride) {
        this._stepDistance -= stride;
        this.emit('footstep', {
          position: this.position.clone(),
          speed: this.moveSpeed,
          stance: this.stance,
          sprinting: this.sprinting,
          loudness: this.stance === 'crouch' ? 0.25 : this.sprinting ? 1.0 : 0.55,
        });
      }
    } else {
      // Bias the phase so that starting to walk always begins mid-stride,
      // which reads as more natural than a step landing instantly.
      this._stepDistance = Math.min(this._stepDistance, 0.35);
    }
  }

  // --------------------------------------------------------------------------
  // Stamina
  // --------------------------------------------------------------------------

  _updateStamina(dt) {
    if (this.sprinting) {
      this.stamina -= dt / 7.5;           // ~7.5s of full sprint from rest
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        this.emit('exhausted');
      }
    } else {
      // Recovery is slower than drain, and slower still while exhausted, so
      // sprinting is a resource the player has to spend deliberately.
      const rate = this.exhausted ? 1 / 11 : 1 / 6;
      this.stamina = Math.min(1, this.stamina + dt * rate);
      // Hysteresis: you can't sprint again the instant stamina ticks above 0.
      if (this.exhausted && this.stamina > 0.32) this.exhausted = false;
    }

    // Breathing intensity feeds the audio system and the mask's strain rate.
    const target = this.exhausted ? 1 : this.sprinting ? 0.7 : (1 - this.stamina) * 0.6;
    this._breath = damp(this._breath, target, 2.5, dt);
    this.breath = this._breath;
  }

  // --------------------------------------------------------------------------
  // Camera assembly
  // --------------------------------------------------------------------------

  _updateCameraFeel(dt) {
    const cam = this.camera;
    const reduceBob = Settings.get('reduceHeadBob');

    // --- head bob -----------------------------------------------------------
    const speedRatio = clamp(this.moveSpeed / 3.05, 0, 2);
    const bobTarget = this.grounded ? speedRatio : 0;
    this._bobAmount = damp(this._bobAmount, bobTarget, 7, dt);

    // Phase advances with distance travelled, not with time, so the bob stays
    // locked to the footsteps at every speed.
    this._bobPhase += this.moveSpeed * dt * (this.stance === 'crouch' ? 5.4 : 4.3);

    const bobScale = reduceBob ? 0.25 : 1;
    const bobY = Math.sin(this._bobPhase * 2) * 0.031 * this._bobAmount * bobScale;
    const bobX = Math.cos(this._bobPhase) * 0.026 * this._bobAmount * bobScale;
    // The head also rolls very slightly into each step.
    const bobRoll = Math.cos(this._bobPhase) * 0.006 * this._bobAmount * bobScale;

    // --- landing dip (spring) ----------------------------------------------
    // Critically-damped-ish spring: fast down, soft recovery.
    this._landDipVel += -this._landDip * 62 * dt;
    this._landDipVel *= Math.exp(-11 * dt);
    this._landDip += this._landDipVel * dt;

    // --- strafe lean --------------------------------------------------------
    const localRight = this._right.dot(this.velocity) / 3.05;
    this._rollTarget = clamp(-localRight * 0.021, -0.03, 0.03);
    this._roll = damp(this._roll, this._rollTarget, 6, dt);

    // --- trauma shake -------------------------------------------------------
    this._trauma = Math.max(0, this._trauma - dt * 0.9);
    const shake = this._trauma * this._trauma;   // quadratic falloff feels right
    const t = this.engine.elapsed;
    const shakeX = (Math.sin(t * 43.1) + Math.sin(t * 27.7)) * 0.5 * shake * 0.035;
    const shakeY = (Math.sin(t * 38.3) + Math.sin(t * 19.1)) * 0.5 * shake * 0.035;
    const shakeRoll = Math.sin(t * 31.3) * shake * 0.022;

    // --- assemble -----------------------------------------------------------
    cam.position.set(
      this.position.x + bobX + shakeX + this._swayX,
      this.position.y + this._eyeOffsetSmoothed() + bobY + this._landDip + shakeY,
      this.position.z
    );

    this._euler.set(
      this.pitch + this._swayY + shakeY * 0.6,
      this.yaw + this._swayX * 0.5,
      this._roll + bobRoll + shakeRoll,
      'YXZ'
    );
    cam.quaternion.setFromEuler(this._euler);

    // --- FOV ----------------------------------------------------------------
    // A small kick while sprinting; the classic trick for conveying speed.
    const fovTarget = this.sprinting ? 7 : this.exhausted ? 2.5 : 0;
    this._fovOffset = damp(this._fovOffset, fovTarget, 4, dt);
    const wanted = Settings.get('fov') + this._fovOffset;
    if (Math.abs(cam.fov - wanted) > 0.01) {
      cam.fov = wanted;
      cam.updateProjectionMatrix();
    }
  }

  _eyeOffsetSmoothed() {
    return this.eyeHeight - (this.character.halfHeight + this.character.radius);
  }

  // --------------------------------------------------------------------------
  // Noise — the value the AI's hearing model samples
  // --------------------------------------------------------------------------

  _updateNoise(dt) {
    let target = 0;
    if (this.moveSpeed > 0.2) {
      if (this.stance === 'crouch') target = 0.18;
      else if (this.sprinting) target = 1.0;
      else target = 0.45 * smoothstep(0.2, 3.0, this.moveSpeed);
    }
    // Heavy breathing after a sprint gives you away even when standing still.
    target = Math.max(target, this._breath * 0.28);
    this.noiseLevel = damp(this.noiseLevel, target, 5, dt);
  }

  /** Snapshot for the save system. */
  serialize() {
    return {
      position: this.position.toArray(),
      yaw: this.yaw,
      pitch: this.pitch,
      stamina: this.stamina,
      stance: this.stance,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.teleport(new THREE.Vector3().fromArray(data.position), data.yaw ?? 0);
    this.pitch = data.pitch ?? 0;
    this.stamina = data.stamina ?? 1;
  }
}
