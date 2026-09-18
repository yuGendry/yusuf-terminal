/**
 * Physics.js — Rapier wrapper.
 *
 * Two things live here:
 *  1. The static/dynamic world used for props, doors, debris and level collision.
 *  2. The kinematic character controller the player moves with. Using Rapier's
 *     controller (rather than hand-rolled sphere casts) is what gives us free
 *     slope limits, auto-stepping onto stairs and ground snapping — the things
 *     that make first-person movement feel solid instead of floaty.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

let initialised = false;

/** Must be awaited once before any Physics instance is constructed. */
export async function initPhysics() {
  if (initialised) return RAPIER;
  await RAPIER.init();
  initialised = true;
  return RAPIER;
}

export const GROUP = {
  WORLD:   0x0001,
  PLAYER:  0x0002,
  PROP:    0x0004,
  ENEMY:   0x0008,
  TRIGGER: 0x0010,
  SOUND:   0x0020,
};

/** Rapier packs (membership << 16) | filter into one u32. */
export const collisionGroups = (membership, filter) => ((membership << 16) | filter) >>> 0;

export class Physics {
  constructor({ gravity = -19.6 } = {}) {
    if (!initialised) throw new Error('initPhysics() must be awaited before constructing Physics');

    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    // 60Hz fixed step. Everything in the game is tuned against this number;
    // varying it would make jump arcs and prop settling frame-rate dependent.
    this.fixedStep = 1 / 60;
    this.world.timestep = this.fixedStep;
    this._accumulator = 0;

    /** Dynamic bodies whose Three.js mesh should follow them each frame. */
    this._synced = [];
    /** Colliders that act as sensors, keyed by collider handle. */
    this._sensors = new Map();

    this.eventQueue = new RAPIER.EventQueue(true);
  }

  // --------------------------------------------------------------------------
  // Static level geometry
  // --------------------------------------------------------------------------

  /**
   * Add a static box collider. `mesh` is optional — when passed, the box is
   * derived from the mesh's world transform, which lets level code build a
   * visual and its collision in one call.
   */
  addStaticBox(halfExtents, position, quaternion = null, userData = {}) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    );
    if (quaternion) {
      body.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }, true);
    }
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setCollisionGroups(collisionGroups(GROUP.WORLD, 0xffff))
      .setFriction(0.9)
      .setRestitution(0.0);
    const collider = this.world.createCollider(desc, body);
    collider.userData = userData;
    return { body, collider };
  }

  /**
   * Add static collision from a Three.js mesh's triangles. Used for the pieces
   * of level geometry that boxes can't approximate (ramps, curved stage lips).
   */
  addStaticTrimesh(mesh, userData = {}) {
    mesh.updateWorldMatrix(true, false);
    const geom = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geom.attributes.position;

    const vertices = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      vertices[i * 3] = v.x;
      vertices[i * 3 + 1] = v.y;
      vertices[i * 3 + 2] = v.z;
    }
    const indices = new Uint32Array(pos.count);
    for (let i = 0; i < pos.count; i++) indices[i] = i;

    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setCollisionGroups(collisionGroups(GROUP.WORLD, 0xffff))
      .setFriction(0.9);
    const collider = this.world.createCollider(desc, body);
    collider.userData = userData;

    if (geom !== mesh.geometry) geom.dispose();
    return { body, collider };
  }

  /**
   * Add a dynamic prop. `mesh` is kept in sync with the body every frame, so
   * chairs scatter when the player barges through them and crates can be
   * pushed onto pressure plates.
   */
  addDynamicBox(mesh, halfExtents, { mass = 8, friction = 0.7, restitution = 0.05, linearDamping = 0.35 } = {}) {
    mesh.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    mesh.getWorldPosition(p);
    mesh.getWorldQuaternion(q);

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(linearDamping)
        .setAngularDamping(0.5)
        // Props are small and can be shoved hard; CCD stops them tunnelling.
        .setCcdEnabled(true)
    );
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setMass(mass)
      .setFriction(friction)
      .setRestitution(restitution)
      .setCollisionGroups(collisionGroups(GROUP.PROP, 0xffff));
    const collider = this.world.createCollider(desc, body);

    this._synced.push({ mesh, body });
    return { body, collider };
  }

  /** A non-solid volume that reports overlap — used for triggers and zones. */
  addSensor(halfExtents, position, userData = {}) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    );
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(collisionGroups(GROUP.TRIGGER, GROUP.PLAYER));
    const collider = this.world.createCollider(desc, body);
    collider.userData = userData;
    this._sensors.set(collider.handle, { collider, userData });
    return { body, collider };
  }

  // --------------------------------------------------------------------------
  // Character controller
  // --------------------------------------------------------------------------

  createCharacter({ radius = 0.3, halfHeight = 0.62, position = new THREE.Vector3() }) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(position.x, position.y, position.z)
    );
    const desc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setCollisionGroups(collisionGroups(GROUP.PLAYER, GROUP.WORLD | GROUP.PROP | GROUP.TRIGGER));
    const collider = this.world.createCollider(desc, body);

    // 0.02 is the skin width Rapier keeps between the capsule and the world.
    const controller = this.world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((38 * Math.PI) / 180);
    // Auto-step lets the player walk up stairs and over cable runs without
    // jumping; the `true` means small dynamic obstacles count as steps too.
    controller.enableAutostep(0.42, 0.22, true);
    controller.enableSnapToGround(0.36);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(72);

    return { body, collider, controller, radius, halfHeight };
  }

  /**
   * Resize the player capsule (crouching) without recreating the body.
   *
   * `centre` is where the capsule's centre must end up so that the feet stay
   * planted. Both the shape change and the move have to be committed here, and
   * the queries refreshed, because the character controller resolves movement
   * against the collider's last *stepped* pose. Changing the shape but leaving
   * the collider at its old pose makes the next resolution use a mismatched
   * capsule, which lets the player sink into the floor on every crouch.
   */
  setCharacterHeight(character, halfHeight, centre) {
    character.halfHeight = halfHeight;
    character.collider.setHalfHeight(halfHeight);
    if (centre) {
      character.body.setTranslation({ x: centre.x, y: centre.y, z: centre.z }, true);
      character.body.setNextKinematicTranslation({ x: centre.x, y: centre.y, z: centre.z });
    }
    this.refreshQueries();
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Rebuild the broad phase so scene queries see colliders added since the last
   * step.
   *
   * This matters more than it sounds. Rapier's spatial acceleration structure is
   * only refreshed inside `world.step()`, so a collider created this frame is
   * invisible to raycasts and to the character controller until a step has run.
   * A player spawned into a freshly-built level therefore finds no floor on its
   * first update, falls one frame's worth of gravity into the ground, and stays
   * there — the character controller prevents new penetration but never resolves
   * penetration that already exists.
   *
   * Call this after building a level and after adding colliders mid-game.
   */
  refreshQueries() {
    this.world.propagateModifiedBodyPositionsToColliders();
    this.world.updateSceneQueries();
  }

  /**
   * Raycast. Returns `{ point, normal, distance, collider }` or null.
   * `filterGroups` uses the same packed membership/filter encoding as colliders.
   */
  raycast(origin, direction, maxDistance = 100, filterGroups = collisionGroups(0xffff, 0xffff), excludeCollider = null) {
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const hit = this.world.castRayAndGetNormal(
      ray, maxDistance, true, undefined, filterGroups, excludeCollider ?? undefined
    );
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return {
      point: new THREE.Vector3(p.x, p.y, p.z),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: hit.timeOfImpact,
      collider: hit.collider,
    };
  }

  /** True when nothing solid blocks the straight line between two points. */
  hasLineOfSight(from, to, filterGroups = collisionGroups(0xffff, GROUP.WORLD)) {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 1e-4) return true;
    dir.divideScalar(dist);
    const hit = this.raycast(from, dir, dist - 0.05, filterGroups);
    return hit === null;
  }

  // --------------------------------------------------------------------------
  // Stepping
  // --------------------------------------------------------------------------

  /**
   * Advance the simulation. Uses a fixed-step accumulator so physics stays
   * deterministic regardless of frame rate, capped so a long stall (alt-tab)
   * doesn't trigger a spiral of catch-up steps.
   */
  step(dt, onCollisionEvent = null) {
    this._accumulator += Math.min(dt, 0.25);
    let steps = 0;
    while (this._accumulator >= this.fixedStep && steps < 5) {
      this.world.step(this.eventQueue);
      this._accumulator -= this.fixedStep;
      steps++;

      if (onCollisionEvent) {
        this.eventQueue.drainCollisionEvents((h1, h2, started) => {
          const a = this._sensors.get(h1);
          const b = this._sensors.get(h2);
          if (a) onCollisionEvent(a.userData, started);
          if (b) onCollisionEvent(b.userData, started);
        });
      }
    }
    if (steps >= 5) this._accumulator = 0;

    // Push simulated transforms back onto their meshes.
    for (const { mesh, body } of this._synced) {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  removeBody(body) {
    const i = this._synced.findIndex((s) => s.body === body);
    if (i >= 0) this._synced.splice(i, 1);
    this.world.removeRigidBody(body);
  }

  dispose() {
    this._synced.length = 0;
    this._sensors.clear();
    this.eventQueue.free();
    this.world.free();
  }
}
