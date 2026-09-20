/**
 * LevelKit.js — the vocabulary chapters are written in.
 *
 * Without this, a room is ninety lines of BoxGeometry and collider maths. With
 * it, a room is a handful of calls and the chapter file stays about *design*.
 * Every builder keeps the visual mesh and its collider in lockstep, so it is
 * impossible to add a wall the player can walk through by forgetting a line.
 */

import * as THREE from 'three';
import { material } from './Materials.js';
import { createDust, createGodRay, createHangingLight, Flicker } from './Atmosphere.js';
import { buildPuppet, animateHang } from './Puppet.js';
import { Settings } from '../core/Settings.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

export class LevelKit {
  constructor({ scene, physics, engine, audio }) {
    this.scene = scene;
    this.physics = physics;
    this.engine = engine;
    this.audio = audio;

    this.updaters = [];
    this.interactables = [];
    this.rng = makeRng(1234);
  }

  update(dt, time, player) {
    for (const fn of this.updaters) fn(dt, time, player);
  }

  onUpdate(fn) {
    this.updaters.push(fn);
    return fn;
  }

  // --------------------------------------------------------------------------
  // Structure
  // --------------------------------------------------------------------------

  /** A visible, solid box. The workhorse. */
  box(w, h, d, x, y, z, mat, { surface = 'wood', rotY = 0, shadow = true, receive = true, solid = true, name = '' } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = shadow;
    mesh.receiveShadow = receive;
    if (name) mesh.name = name;
    this.scene.add(mesh);

    if (solid) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
      this.physics.addStaticBox({ x: w / 2, y: h / 2, z: d / 2 }, { x, y, z }, q, { surface });
    }
    return mesh;
  }

  /** Floor plane plus a thick slab of collision beneath it. */
  floor(w, d, x, z, mat, { y = 0, surface = 'wood', repeat = null } = {}) {
    const m = repeat ? material(mat, { repeat }) : mat;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.physics.addStaticBox({ x: w / 2, y: 0.5, z: d / 2 }, { x, y: y - 0.5, z }, null, { surface });
    return mesh;
  }

  ceiling(w, d, x, z, y, mat) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * A rectangular room: floor, ceiling and four walls, with optional gaps left
   * for doorways. `openings` are {side, at, width} where side is n/s/e/w.
   */
  room({
    width, depth, height, x = 0, z = 0, y = 0,
    floorMat, wallMat, ceilMat,
    surface = 'wood',
    openings = [],
    walls = { n: true, s: true, e: true, w: true },
  }) {
    const halfW = width / 2;
    const halfD = depth / 2;
    const T = 0.34;   // wall thickness

    this.floor(width, depth, x, z, floorMat, { y, surface });
    if (ceilMat) this.ceiling(width, depth, x, z, y + height, ceilMat);

    const forSide = (side) => openings.filter((o) => o.side === side);

    /**
     * Build a wall as a run of segments, leaving the openings out.
     *
     * An opening has an optional `sill` as well as a `top`. Without a sill
     * every opening is a doorway — open all the way to the floor — which is
     * wrong for a serving hatch or a ticket window, and quietly makes them
     * unusable: a window whose top is below standing eye height cannot be
     * looked through at all, because the header is in the way.
     */
    const buildRun = (side, length, place) => {
      if (!walls[side]) return;
      const gaps = forSide(side)
        .map((o) => ({
          from: o.at - o.width / 2,
          to: o.at + o.width / 2,
          top: o.top ?? height,
          sill: o.sill ?? 0,
        }))
        .sort((a, b) => a.from - b.from);

      let cursor = -length / 2;
      for (const gap of gaps) {
        const segLen = gap.from - cursor;
        if (segLen > 0.01) place(cursor + segLen / 2, segLen, height, y + height / 2);

        const gapCentre = (gap.from + gap.to) / 2;
        const gapWidth = gap.to - gap.from;

        // Wall below the sill.
        if (gap.sill > 0.01) {
          place(gapCentre, gapWidth, gap.sill, y + gap.sill / 2);
        }
        // Header above the opening.
        if (gap.top < height - 0.01) {
          const headerH = height - gap.top;
          place(gapCentre, gapWidth, headerH, y + gap.top + headerH / 2);
        }
        cursor = gap.to;
      }
      const tail = length / 2 - cursor;
      if (tail > 0.01) place(cursor + tail / 2, tail, height, y + height / 2);
    };

    buildRun('n', width, (off, len, h, cy) =>
      this.box(len, h, T, x + off, cy, z - halfD, wallMat, { surface, shadow: false }));
    buildRun('s', width, (off, len, h, cy) =>
      this.box(len, h, T, x + off, cy, z + halfD, wallMat, { surface, shadow: false }));
    buildRun('w', depth, (off, len, h, cy) =>
      this.box(T, h, len, x - halfW, cy, z + off, wallMat, { surface, shadow: false }));
    buildRun('e', depth, (off, len, h, cy) =>
      this.box(T, h, len, x + halfW, cy, z + off, wallMat, { surface, shadow: false }));

    return { x, z, y, width, depth, height };
  }

  // --------------------------------------------------------------------------
  // Doors
  // --------------------------------------------------------------------------

  /**
   * A hinged door. Returns a controller with open()/close()/toggle().
   *
   * The collider is removed while open rather than animated, because a moving
   * static collider would let the door shove the player through a wall.
   */
  door({ x, y = 0, z, width = 1.1, height = 2.15, rotY = 0, mat = null, locked = false, name = 'door', swing = -1 }) {
    const doorMat = mat ?? material('paintedWood', { color: 0x3a2a1e });

    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.y = rotY;
    this.scene.add(pivot);

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.07), doorMat);
    // Hinge at one edge, so it swings rather than spinning about its middle.
    leaf.position.set(width / 2, height / 2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    pivot.add(leaf);

    // Panelling and a handle, so it reads as a door at a glance.
    for (const py of [height * 0.28, height * 0.68]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.62, height * 0.26, 0.015),
        material('paintedWood', { color: 0x2d2018 })
      );
      panel.position.set(width / 2, py, 0.043);
      pivot.add(panel);
    }
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), material('brass'));
    handle.position.set(width * 0.88, height * 0.47, 0.07);
    handle.castShadow = true;
    pivot.add(handle);

    const state = {
      open: false,
      locked,
      angle: 0,
      target: 0,
      pivot,
      leaf,
      name,
    };

    // Collider matching the closed leaf.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    const centre = new THREE.Vector3(width / 2, height / 2, 0).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
    let collider = this.physics.addStaticBox(
      { x: width / 2, y: height / 2, z: 0.05 },
      centre, q, { surface: 'wood', door: name }
    );

    const controller = {
      state,
      get isOpen() { return state.open; },
      get isLocked() { return state.locked; },
      unlock() { state.locked = false; },
      lock() { state.locked = true; },
      open: () => {
        if (state.open || state.locked) return false;
        state.open = true;
        state.target = swing * Math.PI * 0.55;
        if (collider) { this.physics.world.removeRigidBody(collider.body); collider = null; }
        this.audio?.doorOpen?.(new THREE.Vector3(x, y + 1, z));
        return true;
      },
      close: () => {
        if (!state.open) return false;
        state.open = false;
        state.target = 0;
        if (!collider) {
          collider = this.physics.addStaticBox(
            { x: width / 2, y: height / 2, z: 0.05 },
            centre, q, { surface: 'wood', door: name }
          );
          this.physics.refreshQueries();
        }
        return true;
      },
      toggle: () => (state.open ? controller.close() : controller.open()),
      object: pivot,
    };

    this.onUpdate((dt) => {
      state.angle = damp(state.angle, state.target, 6, dt);
      pivot.rotation.y = rotY + state.angle;
    });

    return controller;
  }

  // --------------------------------------------------------------------------
  // Lights
  // --------------------------------------------------------------------------

  /**
   * The room's ambient floor: a hemisphere light plus an optional weak fill.
   *
   * Without this a chapter is lit only by its practicals, and everything
   * outside their small pools of light is pure black — not atmospheric, just
   * unplayable. The values are deliberately low and cold: enough to read a
   * silhouette and find a doorway, nowhere near enough to see detail. The
   * torch and the practicals are still what you actually see by.
   *
   * @param {number} strength 1 = the standard "abandoned building at night"
   */
  ambience({ sky = 0x2a3340, ground = 0x0a0806, strength = 1, fill = null } = {}) {
    const hemi = new THREE.HemisphereLight(sky, ground, 0.42 * strength);
    this.scene.add(hemi);

    // A very soft directional, purely to give flat walls a gradient so they do
    // not read as cardboard. It casts nothing.
    const soft = new THREE.DirectionalLight(0x8fa0c0, 0.22 * strength);
    soft.position.set(-6, 10, 4);
    soft.castShadow = false;
    this.scene.add(soft);

    if (fill) {
      const f = new THREE.PointLight(fill.color ?? 0xffb066, fill.intensity ?? 8, fill.distance ?? 14, 2);
      f.position.set(fill.x ?? 0, fill.y ?? 3, fill.z ?? 0);
      f.castShadow = false;
      this.scene.add(f);
    }

    return hemi;
  }

  /**
   * A practical light. Intensities here are already scaled for three.js's
   * inverse-square falloff — the number is not lux, it is lux×distance².
   */
  practical(x, y, z, {
    color = 0xffb066, intensity = 26, distance = 12, cordLength = 0.9,
    castShadow = true, flicker = null,
  } = {}) {
    const lamp = createHangingLight({ color, intensity, distance, cordLength, castShadow, flicker });
    lamp.position.set(x, y, z);
    this.scene.add(lamp);
    if (lamp.userData.update) this.onUpdate((dt, t) => lamp.userData.update(dt, t));
    return lamp;
  }

  /** A wall sconce: small, warm, short range. Good for corridors. */
  sconce(x, y, z, { color = 0xffa04d, intensity = 9, distance = 6, rotY = 0, flicker = null } = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.16), material('brass'));
    bracket.castShadow = true;
    group.add(bracket);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.2, 10, 1, true),
      material('brass')
    );
    shade.position.set(0, 0.12, 0.12);
    shade.rotation.x = Math.PI;
    group.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      material('bulbOn', { emissive: color, emissiveIntensity: 5 })
    );
    bulb.position.set(0, 0.06, 0.12);
    group.add(bulb);

    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(0, 0.06, 0.16);
    light.castShadow = false;   // sconces are fill; shadows come from key lights
    group.add(light);

    this.scene.add(group);

    if (flicker) {
      const f = new Flicker(light, { baseIntensity: intensity, ...flicker }).attachBulb(bulb, 5);
      this.onUpdate((dt, t) => f.update(dt, t));
      group.userData.flicker = f;
    }
    group.userData.light = light;
    return group;
  }

  /** A shaft of light from a window, with the window frame to justify it. */
  window(x, y, z, {
    width = 1.6, height = 2.2, rotY = 0,
    rayLength = 7, rayIntensity = 0.16, color = 0xffe2b0, boarded = false,
  } = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    this.scene.add(group);

    const frameMat = material('paintedWood', { color: 0x2a2019 });
    for (const [fx, fy, fw, fh] of [
      [0, height / 2, width + 0.16, 0.1],
      [0, -height / 2, width + 0.16, 0.1],
      [-width / 2, 0, 0.1, height],
      [width / 2, 0, 0.1, height],
      [0, 0, 0.06, height],       // mullion
      [0, 0, width, 0.06],        // transom
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.12), frameMat);
      bar.position.set(fx, fy, 0);
      bar.castShadow = true;
      group.add(bar);
    }

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      material('glassDusty')
    );
    group.add(glass);

    if (boarded) {
      for (let i = 0; i < 3; i++) {
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.4, 0.22, 0.05),
          material('paintedWood', { color: 0x4a3626 })
        );
        plank.position.set(randRange(-0.1, 0.1), (i - 1) * 0.62, 0.1);
        plank.rotation.z = randRange(-0.08, 0.08);
        plank.castShadow = true;
        group.add(plank);
      }
    }

    if (Settings.get('godRays') && rayIntensity > 0) {
      const ray = createGodRay({
        radiusTop: width * 0.42,
        radiusBottom: width * 1.3,
        length: rayLength,
        color,
        intensity: rayIntensity * (boarded ? 0.45 : 1),
        noiseAmount: 0.65,
      });
      // Tilt the shaft away from the window into the room.
      ray.position.set(0, height * 0.3, 0.2);
      ray.rotation.x = 0.55;
      group.add(ray);
      this.onUpdate((dt, t) => ray.userData.update(t));
    }

    return group;
  }

  dust(center, bounds, { count = 900, seed = 1, size = 9 } = {}) {
    const d = createDust({ count, bounds, center, seed, size });
    this.scene.add(d);
    this.onUpdate((dt, t) => d.userData.update(t, this.scene, this.engine.camera));
    return d;
  }

  // --------------------------------------------------------------------------
  // Props
  // --------------------------------------------------------------------------

  /** A shoveable crate. */
  crate(x, y, z, size = 0.5, { mass = null } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      material('paintedWood', { color: 0x4a3724 })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = this.rng() * Math.PI;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.physics.addDynamicBox(mesh, { x: size / 2, y: size / 2, z: size / 2 }, {
      mass: mass ?? 4 + size * 12,
    });
    return mesh;
  }

  /** A simple table or bench — solid, with four legs. */
  table(x, y, z, { width = 1.4, depth = 0.7, height = 0.78, rotY = 0, mat = null } = {}) {
    const m = mat ?? material('paintedWood', { color: 0x4a3626 });
    const top = this.box(width, 0.06, depth, x, y + height, z, m, { rotY, surface: 'wood' });
    const legMat = material('paintedWood', { color: 0x2f231a });
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, height, 0.07), legMat);
      leg.position.set(
        x + lx * (width / 2 - 0.09) * Math.cos(rotY) - lz * (depth / 2 - 0.09) * Math.sin(rotY),
        y + height / 2,
        z + lx * (width / 2 - 0.09) * Math.sin(rotY) + lz * (depth / 2 - 0.09) * Math.cos(rotY)
      );
      leg.castShadow = true;
      this.scene.add(leg);
    }
    return top;
  }

  /** A rack of shelves against a wall. Fills itself with junk. */
  shelving(x, y, z, { width = 2.0, height = 2.1, depth = 0.45, rotY = 0, shelves = 4, fill = 0.6 } = {}) {
    const frameMat = material('rustedSteel', { repeat: 1 });

    for (let i = 0; i <= shelves; i++) {
      const sy = y + (i / shelves) * height;
      this.box(width, 0.04, depth, x, sy, z, frameMat, { rotY, surface: 'metal', solid: i > 0 });
    }
    for (const side of [-1, 1]) {
      const px = x + side * (width / 2) * Math.cos(rotY);
      const pz = z + side * (width / 2) * Math.sin(rotY);
      this.box(0.06, height, depth, px, y + height / 2, pz, frameMat, { rotY, surface: 'metal' });
    }

    // Clutter on the shelves, seeded so it is the same every visit.
    for (let i = 1; i < shelves; i++) {
      const sy = y + (i / shelves) * height;
      const n = Math.floor(this.rng() * 4 * fill);
      for (let k = 0; k < n; k++) {
        const w = randRange(0.1, 0.28);
        const h = randRange(0.1, 0.3);
        const off = randRange(-width / 2 + 0.2, width / 2 - 0.2);
        const junk = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, randRange(0.1, depth * 0.7)),
          material('paintedWood', { color: this.rng() > 0.5 ? 0x4a3724 : 0x37302a })
        );
        junk.position.set(
          x + off * Math.cos(rotY),
          sy + h / 2 + 0.02,
          z + off * Math.sin(rotY)
        );
        junk.rotation.y = rotY + randRange(-0.3, 0.3);
        junk.castShadow = true;
        this.scene.add(junk);
      }
    }
  }

  /**
   * A rack of unfinished bodies, built as instanced parts.
   *
   * A full articulated puppet is ~50 meshes; hanging seven of them as set
   * dressing costs 350 draw calls before shadows, which is more than an entire
   * chapter's budget for something the player walks past. These are what the
   * workshop actually contains anyway: blanks with no faces and no joints, so
   * six boxes each is not a compromise, it is the correct object.
   */
  bodyRack(items, { hangHeight = 2.2 } = {}) {
    const woodMat = material('paintedWood', { color: 0x8a6d4f });
    const clothMat = material('feltDark', { color: 0x2b2028 });
    const n = items.length;

    const torsos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.34, 0.12), clothMat, n);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 9), material('porcelain'), n);
    const limbs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.028, 0.024, 0.34, 6), woodMat, n * 4);

    for (const im of [torsos, heads, limbs]) {
      im.castShadow = true;
      im.receiveShadow = true;
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);

    const hooks = [];
    let li = 0;

    items.forEach(([x, y, z], i) => {
      const scale = 0.85 + this.rng() * 0.3;
      const yaw = this.rng() * Math.PI * 2;
      const lean = (this.rng() - 0.5) * 0.12;
      e.set(lean, yaw, (this.rng() - 0.5) * 0.14);
      q.setFromEuler(e);

      const base = new THREE.Matrix4().compose(v.set(x, y, z), q, new THREE.Vector3(scale, scale, scale));

      const part = (im, idx, px, py, pz, rot = null) => {
        const pm = new THREE.Matrix4().compose(
          new THREE.Vector3(px, py, pz),
          rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion(),
          one
        );
        im.setMatrixAt(idx, new THREE.Matrix4().multiplyMatrices(base, pm));
      };

      part(torsos, i, 0, 0, 0);
      part(heads, i, 0, 0.27, 0);
      // Arms and legs, splayed slightly so the silhouette is not a plank.
      part(limbs, li++, -0.13, -0.05, 0, new THREE.Euler(0, 0, 0.22));
      part(limbs, li++, 0.13, -0.05, 0, new THREE.Euler(0, 0, -0.22));
      part(limbs, li++, -0.06, -0.34, 0, new THREE.Euler(0, 0, 0.06));
      part(limbs, li++, 0.06, -0.34, 0, new THREE.Euler(0, 0, -0.06));

      hooks.push({ x, y, z, scale });
    });

    torsos.count = n;
    heads.count = n;
    limbs.count = li;
    for (const im of [torsos, heads, limbs]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    }

    // The hooks and hanging wires, as one line batch.
    const pts = [];
    for (const h of hooks) {
      pts.push(new THREE.Vector3(h.x, h.y + hangHeight, h.z));
      pts.push(new THREE.Vector3(h.x, h.y + 0.3 * h.scale, h.z));
    }
    const wires = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x6a6252, transparent: true, opacity: 0.4 })
    );
    this.scene.add(wires);

    return { torsos, heads, limbs, wires };
  }

  /** A hanging, unfinished puppet body — set dressing that reads as a threat. */
  hangingBody(x, y, z, { scale = 1, preset = 'marionette', hangHeight = 2.4, sway = true } = {}) {
    const p = buildPuppet({ preset, scale, strings: true, stringHeight: hangHeight, faceStyle: 'stitched' });
    p.root.position.set(x, y, z);
    p.root.rotation.y = this.rng() * Math.PI * 2;
    p.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(p.root);
    if (sway) {
      const phase = this.rng() * 100;
      this.onUpdate((dt, t) => animateHang(p, t * 0.5 + phase, { amount: 0.5 }));
    }
    return p;
  }

  // --------------------------------------------------------------------------
  // Triggers
  // --------------------------------------------------------------------------

  /**
   * A volume that fires once when the player walks into it.
   * Polled against the player position rather than using physics sensors:
   * simpler, frame-exact, and trivially serialisable for the save system.
   */
  trigger({ x, y = 1, z, width = 2, height = 3, depth = 2, once = true, onEnter, onExit = null, id = null }) {
    const half = { x: width / 2, y: height / 2, z: depth / 2 };
    // `reset()` re-arms a one-shot trigger. A chase that has to be replayed
    // after a death needs its start trigger back, or the player respawns into
    // a chase that is already in progress with the enemy on top of them.
    const state = {
      inside: false,
      fired: false,
      id,
      reset() { this.fired = false; this.inside = false; },
    };

    this.onUpdate((dt, t, player) => {
      if (!player) return;
      if (state.fired && once) return;
      const p = player.position;
      const inside =
        Math.abs(p.x - x) < half.x &&
        Math.abs(p.y - y) < half.y &&
        Math.abs(p.z - z) < half.z;

      if (inside && !state.inside) {
        state.inside = true;
        state.fired = true;
        onEnter?.(player);
      } else if (!inside && state.inside) {
        state.inside = false;
        onExit?.(player);
      }
    });

    return state;
  }
}
