/**
 * MisterTangle.js — the ringmaster marionette.
 *
 * Three metres of lacquered limb hanging from the fly rails. His whole design
 * is a readable rule: **he can only go where the rail goes.** Once a player
 * understands that, every room becomes a map of where they are safe, and the
 * Threadlight lens turns that map visible.
 *
 * He therefore never pathfinds through the room. He pathfinds through a graph
 * of rail nodes, and drops his arms toward whatever is underneath him.
 *
 * States: dormant → stirring → hunting → lunging → recovering → losing
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { buildPuppet, animateHang } from '../world/Puppet.js';
import { material } from '../world/Materials.js';
import { clamp, damp, lerp, randRange, smoothstep } from '../util/MathUtil.js';

const STATE = {
  DORMANT: 'dormant',
  STIRRING: 'stirring',
  HUNTING: 'hunting',
  LUNGING: 'lunging',
  RECOVERING: 'recovering',
  LOSING: 'losing',
};

/**
 * The swipe volume: a cylinder hanging under his position on the rail.
 *
 * This is deliberately NOT a test against his hands. The limbs are driven by
 * layered procedural animation, so where a fingertip is at any instant is
 * effectively arbitrary — testing against it made being caught depend on the
 * phase of an idle sine wave, and the same spot would kill on one attempt and
 * not the next. A player cannot learn that, and cannot feel it was fair.
 *
 * A cylinder under the rail is the rule the player can actually read: if you
 * are under him when he swings, he has you; step out from under the rail and
 * he has not. The hand animation then sells the hit that the volume decided.
 */
const CATCH_RADIUS = 1.7;     // horizontal, from his point on the rail
const CATCH_DROP = 4.2;       // how far below the rail the swipe sweeps

/**
 * A rail network. Nodes are points in space; edges connect them. Tangle's
 * position is always a point along an edge, expressed as (edge, t).
 */
export class RailNetwork {
  constructor() {
    this.nodes = [];       // THREE.Vector3
    this.edges = [];       // { a, b, length }
    this.adjacency = [];   // node index -> [edge indices]
  }

  addNode(x, y, z) {
    this.nodes.push(new THREE.Vector3(x, y, z));
    this.adjacency.push([]);
    return this.nodes.length - 1;
  }

  connect(a, b) {
    const length = this.nodes[a].distanceTo(this.nodes[b]);
    const i = this.edges.length;
    this.edges.push({ a, b, length });
    this.adjacency[a].push(i);
    this.adjacency[b].push(i);
    return i;
  }

  /** Build a chain of nodes from a list of points, connecting them in order. */
  addPath(points) {
    const ids = points.map((p) => this.addNode(p[0], p[1], p[2]));
    for (let i = 0; i < ids.length - 1; i++) this.connect(ids[i], ids[i + 1]);
    return ids;
  }

  pointOn(edgeIndex, t) {
    const e = this.edges[edgeIndex];
    return this.nodes[e.a].clone().lerp(this.nodes[e.b], t);
  }

  /** Closest point on the whole network to `target`. */
  closest(target) {
    let best = { edge: 0, t: 0, distance: Infinity, point: null };
    const ab = new THREE.Vector3();
    const ap = new THREE.Vector3();

    for (let i = 0; i < this.edges.length; i++) {
      const { a, b } = this.edges[i];
      const A = this.nodes[a];
      const B = this.nodes[b];
      ab.subVectors(B, A);
      ap.subVectors(target, A);
      const len2 = ab.lengthSq();
      const t = len2 > 1e-6 ? clamp(ap.dot(ab) / len2, 0, 1) : 0;
      const point = A.clone().addScaledVector(ab, t);
      const d = point.distanceTo(target);
      if (d < best.distance) best = { edge: i, t, distance: d, point };
    }
    return best;
  }

  /**
   * Breadth-first search from one node to another, returning the node path.
   * The graphs here are a few dozen nodes, so BFS is ample and predictable.
   */
  route(fromNode, toNode) {
    if (fromNode === toNode) return [fromNode];
    const prev = new Map([[fromNode, null]]);
    const queue = [fromNode];

    while (queue.length) {
      const n = queue.shift();
      for (const ei of this.adjacency[n]) {
        const e = this.edges[ei];
        const other = e.a === n ? e.b : e.a;
        if (prev.has(other)) continue;
        prev.set(other, n);
        if (other === toNode) {
          const path = [other];
          let cur = n;
          while (cur !== null) { path.push(cur); cur = prev.get(cur); }
          return path.reverse();
        }
        queue.push(other);
      }
    }
    return null;
  }

  /** Visible rail geometry, plus the Threadlight-only glow overlay. */
  buildMesh(scene, { showAlways = true } = {}) {
    const group = new THREE.Group();
    group.name = 'rails';

    const railMat = material('rustedSteel', { repeat: 1 });

    for (const e of this.edges) {
      const A = this.nodes[e.a];
      const B = this.nodes[e.b];
      const mid = A.clone().lerp(B, 0.5);
      const dir = B.clone().sub(A);
      const len = dir.length();

      if (showAlways) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, len), railMat);
        beam.position.copy(mid);
        beam.lookAt(B);
        beam.castShadow = true;
        beam.receiveShadow = true;
        group.add(beam);
      }

      // The Threadlight overlay: a glowing line along the same run, visible
      // only through the lens. This is how the player learns the rule.
      const glowGeo = new THREE.BufferGeometry().setFromPoints([A, B]);
      const glow = new THREE.Line(glowGeo, new THREE.LineBasicMaterial({
        color: 0x6fe3d4, transparent: true, opacity: 0.85,
      }));
      glow.userData.lensOnly = 'threadlight';
      group.add(glow);

      // A fatter additive tube under the line so it reads as light, not wire.
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, len, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x6fe3d4, transparent: true, opacity: 0.22,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      tube.position.copy(mid);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      tube.userData.lensOnly = 'threadlight';
      group.add(tube);
    }

    scene.add(group);
    this.mesh = group;
    return group;
  }
}

export class MisterTangle extends EventBus {
  constructor({ scene, rails, player, audio, music, physics, engine }) {
    super();
    this.scene = scene;
    this.rails = rails;
    this.player = player;
    this.audio = audio;
    this.music = music;
    this.physics = physics;
    this.engine = engine;

    this.state = STATE.DORMANT;
    this.stateTime = 0;
    this.enabled = false;

    // Position on the rail network.
    this.edge = 0;
    this.t = 0;
    this.speed = 0;
    this.maxSpeed = 4.6;
    this.route = null;
    this.routeIndex = 0;

    /** How far his hands are currently reaching down. */
    this.reach = 0;
    this.awareness = 0;         // 0..1, how sure he is where the player is
    this.lastKnown = new THREE.Vector3();

    this._buildBody();

    this.worldPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._handWorld = new THREE.Vector3();
  }

  _buildBody() {
    const puppet = buildPuppet({
      preset: 'ringmaster',
      scale: 1.55,
      strings: false,          // his strings go up to the rail, built below
      faceStyle: 'smile',
      clothColor: 0x2a1018,
    });
    this.puppet = puppet;

    const root = new THREE.Group();
    root.name = 'misterTangle';
    root.add(puppet.root);

    // He hangs: the body sits below the rail carriage.
    puppet.root.position.y = -2.1;

    // The carriage that rides the rail.
    const carriage = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.16, 0.5),
      material('rustedSteel', { repeat: 1 })
    );
    carriage.castShadow = true;
    root.add(carriage);

    // Suspension strings from carriage down to the body.
    const stringPts = [];
    for (const [ox, oz] of [[-0.12, -0.16], [0.12, -0.16], [-0.12, 0.16], [0.12, 0.16]]) {
      stringPts.push(new THREE.Vector3(ox, 0, oz), new THREE.Vector3(ox * 0.6, -2.1, oz * 0.6));
    }
    const strandGeo = new THREE.BufferGeometry().setFromPoints(stringPts);
    const strands = new THREE.LineSegments(strandGeo, new THREE.LineBasicMaterial({
      color: 0x8a8272, transparent: true, opacity: 0.5,
    }));
    strands.frustumCulled = false;
    root.add(strands);
    this.strands = strands;
    this.strandPositions = strandGeo.attributes.position;

    // A top hat — the one flourish that makes his silhouette unmistakable.
    const head = puppet.joints.head;
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.018, 16),
      material('feltDark')
    );
    brim.position.y = 0.11;
    brim.castShadow = true;
    head.add(brim);
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.135, 0.26, 16),
      material('feltDark')
    );
    crown.position.y = 0.24;
    crown.castShadow = true;
    head.add(crown);

    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.visible = false;
    this.scene.add(root);
    this.root = root;
  }

  // --------------------------------------------------------------------------

  /** Place him on the network near a world point and wake him. */
  spawnNear(point, { state = STATE.STIRRING } = {}) {
    const c = this.rails.closest(point);
    this.edge = c.edge;
    this.t = c.t;
    this.root.visible = true;
    this.enabled = true;
    this.setState(state);
  }

  setState(next) {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.stateTime = 0;
    this.emit('stateChanged', next, prev);

    switch (next) {
      case STATE.HUNTING:
        this.music?.setMood('chase');
        break;
      case STATE.LOSING:
        this.music?.setMood('tension');
        break;
      case STATE.DORMANT:
        this.music?.setMood('unease');
        this.root.visible = false;
        this.enabled = false;
        break;
      default: break;
    }
  }

  get position() {
    return this.rails.pointOn(this.edge, this.t);
  }

  // --------------------------------------------------------------------------

  update(dt, { maskHum = 0, playerNoise = 0 } = {}) {
    if (!this.enabled) return;
    this.stateTime += dt;

    const playerPos = this.player.position;
    this.worldPos.copy(this.position);

    // --- senses -------------------------------------------------------------
    // He is a puppet on a wire: he cannot see well, but he feels the building.
    // Noise and the mask's hum both give the player away, the hum more so
    // because it is exactly what he was built to listen for.
    const dist = this.worldPos.distanceTo(playerPos);
    const audible = clamp(1 - dist / 22, 0, 1);
    const signal = clamp(playerNoise * 0.7 + maskHum * 1.25, 0, 1) * audible;

    const sees = this._canSee(playerPos) ? clamp(1 - dist / 18, 0, 1) : 0;
    const total = clamp(signal + sees * 0.8, 0, 1);

    if (total > 0.05) {
      this.awareness = clamp(this.awareness + dt * total * 1.7, 0, 1);
      this.lastKnown.copy(playerPos);
    } else {
      this.awareness = clamp(this.awareness - dt * 0.22, 0, 1);
    }

    // --- state machine ------------------------------------------------------
    switch (this.state) {
      case STATE.STIRRING:   this._updateStirring(dt); break;
      case STATE.HUNTING:    this._updateHunting(dt, playerPos); break;
      case STATE.LUNGING:    this._updateLunging(dt, playerPos); break;
      case STATE.RECOVERING: this._updateRecovering(dt); break;
      case STATE.LOSING:     this._updateLosing(dt); break;
      default: break;
    }

    this._updateBody(dt);
    this._updateAudio(dt, dist);
  }

  _canSee(target) {
    const from = this._tmp.copy(this.worldPos).setY(this.worldPos.y - 1.4);
    return this.physics.hasLineOfSight(from, target.clone().setY(target.y + 1.2));
  }

  _updateStirring(dt) {
    // He wakes badly: a few seconds of jerking before he commits.
    this.speed = 0;
    if (this.stateTime > 2.4) this.setState(STATE.HUNTING);
  }

  _updateHunting(dt, playerPos) {
    // Route toward whichever rail node is closest to where he last heard them.
    const targetOnRail = this.rails.closest(this.lastKnown);
    this._advanceToward(dt, targetOnRail);

    const horizontal = Math.hypot(
      this.worldPos.x - playerPos.x,
      this.worldPos.z - playerPos.z
    );

    // Once he is nearly overhead he swipes.
    if (horizontal < 2.2 && this.awareness > 0.4) {
      this.setState(STATE.LUNGING);
    } else if (this.awareness < 0.12) {
      this.setState(STATE.LOSING);
    }
  }

  _updateLunging(dt, playerPos) {
    this.speed = damp(this.speed, 0.8, 6, dt);
    // The arms come down over roughly half a second.
    this.reach = damp(this.reach, 1, 9, dt);

    // Track the player laterally while lunging, but slowly enough to dodge.
    const target = this.rails.closest(playerPos);
    this._advanceToward(dt, target, 0.45);

    // Stepping out from under the rail is what saves you — the one rule the
    // whole character is built to teach.
    if (this.stateTime > 0.35 && this._swipeConnects(playerPos)) {
      this.emit('caught', this);
      this.setState(STATE.RECOVERING);
      return;
    }

    if (this.stateTime > 1.5) this.setState(STATE.RECOVERING);
  }

  /**
   * Is the player inside the swipe volume?
   *
   * Horizontal distance from his point on the rail, and vertical band below
   * it. Requires `reach` to be most of the way down, so the wind-up is a real
   * window the player can run out of rather than an instant hit.
   */
  _swipeConnects(playerPos) {
    if (this.reach < 0.55) return false;

    const horizontal = Math.hypot(
      this.worldPos.x - playerPos.x,
      this.worldPos.z - playerPos.z
    );
    if (horizontal > CATCH_RADIUS) return false;

    const half = this.player.character?.halfHeight ?? 0.62;
    const headY = playerPos.y + half;
    const drop = this.worldPos.y - headY;
    return drop >= -0.5 && drop <= CATCH_DROP;
  }

  _updateRecovering(dt) {
    this.reach = damp(this.reach, 0, 4, dt);
    this.speed = damp(this.speed, 0, 3, dt);
    if (this.stateTime > 1.1) {
      this.setState(this.awareness > 0.25 ? STATE.HUNTING : STATE.LOSING);
    }
  }

  _updateLosing(dt) {
    // He patrols the last place he was sure of, swinging back and forth.
    this.reach = damp(this.reach, 0.15, 3, dt);
    const target = this.rails.closest(this.lastKnown);
    this._advanceToward(dt, target, 0.5);

    if (this.awareness > 0.45) this.setState(STATE.HUNTING);
    else if (this.stateTime > 14) this.setState(STATE.DORMANT);
  }

  /**
   * Move along the rail graph toward a point on it. Recomputes the route only
   * when the destination edge changes, so BFS runs a handful of times a chase
   * rather than every frame.
   */
  _advanceToward(dt, targetOnRail, speedScale = 1) {
    const targetSpeed = this.maxSpeed * speedScale * lerp(0.45, 1, this.awareness);
    this.speed = damp(this.speed, targetSpeed, 2.5, dt);

    if (this._routeTargetEdge !== targetOnRail.edge) {
      this._routeTargetEdge = targetOnRail.edge;
      const here = this.rails.edges[this.edge];
      const there = this.rails.edges[targetOnRail.edge];
      // Head for whichever end of the destination edge is easiest to reach.
      const startNode = this.t > 0.5 ? here.b : here.a;
      const endNode = targetOnRail.t > 0.5 ? there.b : there.a;
      this.route = this.rails.route(startNode, endNode);
      this.routeIndex = 0;
    }

    if (!this.route || this.route.length < 2) {
      // Already on the destination edge: slide along it.
      this.t = damp(this.t, targetOnRail.t, 2.2, dt);
      return;
    }

    // Walk the node list, consuming distance.
    let remaining = this.speed * dt;
    while (remaining > 0 && this.routeIndex < this.route.length - 1) {
      const fromNode = this.route[this.routeIndex];
      const toNode = this.route[this.routeIndex + 1];
      const edgeIndex = this._edgeBetween(fromNode, toNode);
      if (edgeIndex < 0) { this.route = null; break; }

      const e = this.rails.edges[edgeIndex];
      const forward = e.a === fromNode;
      if (this.edge !== edgeIndex) {
        this.edge = edgeIndex;
        this.t = forward ? 0 : 1;
      }

      const targetT = forward ? 1 : 0;
      const distToEnd = Math.abs(targetT - this.t) * e.length;

      if (remaining >= distToEnd) {
        remaining -= distToEnd;
        this.t = targetT;
        this.routeIndex++;
      } else {
        const dir = forward ? 1 : -1;
        this.t += (remaining / e.length) * dir;
        remaining = 0;
      }
    }

    if (this.routeIndex >= this.route.length - 1) {
      this.t = damp(this.t, targetOnRail.t, 2.2, dt);
    }
  }

  _edgeBetween(a, b) {
    for (const ei of this.rails.adjacency[a]) {
      const e = this.rails.edges[ei];
      if ((e.a === a && e.b === b) || (e.b === a && e.a === b)) return ei;
    }
    return -1;
  }

  // --------------------------------------------------------------------------

  _updateBody(dt) {
    const pos = this.position;
    this.root.position.copy(pos);

    const time = this.engine.elapsed;

    // The jerk. He does not move smoothly; he is yanked. A stepped time value
    // makes the idle animation advance in visible increments, which reads as
    // a hand above pulling rather than as a creature walking.
    const jerkRate = lerp(3.5, 9, this.awareness);
    const stepped = Math.floor(time * jerkRate) / jerkRate;
    animateHang(this.puppet, stepped, { amount: lerp(0.6, 1.6, this.awareness) });

    // Face along travel.
    const e = this.rails.edges[this.edge];
    const dir = this.rails.nodes[e.b].clone().sub(this.rails.nodes[e.a]).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    this.puppet.root.rotation.y = damp(this.puppet.root.rotation.y, yaw, 5, dt);

    // Reaching: the arms swing forward and down, and the whole body drops.
    const j = this.puppet.joints;
    const r = this.reach;
    j.shoulderL.rotation.x = lerp(j.shoulderL.rotation.x, -2.3 * r, 0.3);
    j.shoulderR.rotation.x = lerp(j.shoulderR.rotation.x, -2.3 * r, 0.3);
    j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, -0.5 - 0.9 * r, 0.3);
    j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -0.5 - 0.9 * r, 0.3);
    // The whole body drops on the strings as he swipes — that lunge downward
    // is what closes the last metre, and what makes the attack readable as a
    // wind-up the player can still run out from under.
    this.puppet.root.position.y = lerp(-2.1, -3.55, r);

    // The head always finds the player, even when the body is going elsewhere.
    if (this.awareness > 0.2) {
      const headTarget = this._tmp.copy(this.player.position).setY(this.player.position.y + 1.2);
      const local = j.head.parent.worldToLocal(headTarget.clone());
      const wantYaw = Math.atan2(-local.x, -local.z);
      const wantPitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
      j.head.rotation.y = damp(j.head.rotation.y, clamp(wantYaw, -1.4, 1.4), 6, dt);
      j.head.rotation.x = damp(j.head.rotation.x, clamp(-wantPitch, -0.9, 0.9), 6, dt);
    }

    // Keep the suspension strands attached as the body swings.
    const bodyY = this.puppet.root.position.y;
    const arr = this.strandPositions.array;
    for (let i = 0; i < 4; i++) {
      arr[i * 6 + 4] = bodyY;
    }
    this.strandPositions.needsUpdate = true;
  }

  _updateAudio(dt, dist) {
    this._soundTimer = (this._soundTimer ?? 0) - dt;
    if (this._soundTimer > 0) return;

    const near = clamp(1 - dist / 24, 0, 1);

    switch (this.state) {
      case STATE.HUNTING:
        this._soundTimer = randRange(0.28, 0.5);
        // The carriage on the rail: a metal roll plus the knock of wooden limbs.
        this.audio?.noiseAt?.(this.worldPos, {
          duration: 0.18, gain: 0.1 * near, filterType: 'bandpass',
          freq: randRange(2200, 3400), freqEnd: 900, q: 4, reverb: 0.7,
        });
        this.audio?.toneAt?.(this.worldPos, {
          freq: randRange(150, 230), type: 'triangle', duration: 0.07,
          attack: 0.001, decay: 0.04, sustain: 0.1, release: 0.1,
          gain: 0.07 * near, reverb: 0.7,
        });
        break;
      case STATE.LUNGING:
        this._soundTimer = 1.6;
        this.audio?.noiseAt?.(this.worldPos, {
          duration: 0.5, gain: 0.2 * near, filterType: 'bandpass',
          freq: 3000, freqEnd: 500, q: 2, reverb: 0.8,
        });
        break;
      case STATE.STIRRING:
        this._soundTimer = randRange(0.5, 1.0);
        this.audio?.noiseAt?.(this.worldPos, {
          duration: 0.3, gain: 0.13 * near, filterType: 'bandpass',
          freq: randRange(400, 900), q: 7, reverb: 0.85, attack: 0.08,
        });
        break;
      case STATE.LOSING:
        this._soundTimer = randRange(1.4, 3.2);
        this.audio?.noiseAt?.(this.worldPos, {
          duration: 0.6, gain: 0.07 * near, filterType: 'bandpass',
          freq: 320, freqEnd: 220, q: 9, reverb: 0.9, attack: 0.2,
        });
        break;
      default:
        this._soundTimer = 1;
        break;
    }
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

export { STATE as TANGLE_STATE, CATCH_RADIUS };
