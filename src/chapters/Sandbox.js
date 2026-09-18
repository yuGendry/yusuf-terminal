/**
 * Sandbox.js — the movement proving ground.
 *
 * Not a chapter. This is a room built specifically to exercise every system
 * Phase 1 delivers: capsule collision, stairs and auto-step, slopes, dynamic
 * props, shadow-casting practicals, flicker, god rays, dust, footstep material
 * detection and the post stack. Chapter 1 replaces it in a later phase.
 */

import * as THREE from 'three';
import { material } from '../world/Materials.js';
import { createDust, createGodRay, createHangingLight } from '../world/Atmosphere.js';
import { buildPuppet, animateHang } from '../world/Puppet.js';
import { Audio } from '../audio/AudioEngine.js';
import { Settings } from '../core/Settings.js';
import { makeRng, randRange } from '../util/MathUtil.js';

/** Footstep timbres per surface. Keyed by the userData.surface on a collider. */
const SURFACES = {
  wood:  { freq: 780,  freqEnd: 190, q: 1.1, gain: 0.16, tone: 128 },
  tile:  { freq: 2400, freqEnd: 900, q: 2.4, gain: 0.13, tone: 0 },
  metal: { freq: 3100, freqEnd: 700, q: 3.6, gain: 0.15, tone: 420 },
  water: { freq: 1500, freqEnd: 320, q: 0.8, gain: 0.2,  tone: 0 },
};

export function buildSandbox({ physics, engine }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050a);
  scene.fog = new THREE.FogExp2(0x06070c, 0.032);

  const rng = makeRng(99);
  const updaters = [];
  const disposables = [];

  const W = 24;
  const D = 30;
  const H = 6.5;

  // ---- helpers --------------------------------------------------------------

  /** Build a box that is both visible and solid, in one call. */
  function solidBox(w, h, d, x, y, z, mat, { surface = 'wood', rotY = 0, shadow = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    physics.addStaticBox(
      { x: w / 2, y: h / 2, z: d / 2 },
      { x, y, z },
      q,
      { surface }
    );
    return mesh;
  }

  // ---- shell ----------------------------------------------------------------

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    material('stageFloor', { repeat: 7 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  physics.addStaticBox({ x: W / 2, y: 0.5, z: D / 2 }, { x: 0, y: -0.5, z: 0 }, null, { surface: 'wood' });

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    material('ceiling', { repeat: 5 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  const wallMat = material('wallPlaster', { repeat: 4 });
  // Four walls, each solid.
  solidBox(W, H, 0.4, 0, H / 2, -D / 2, wallMat, { shadow: false });
  solidBox(W, H, 0.4, 0, H / 2, D / 2, wallMat, { shadow: false });
  solidBox(0.4, H, D, -W / 2, H / 2, 0, wallMat, { shadow: false });
  solidBox(0.4, H, D, W / 2, H / 2, 0, wallMat, { shadow: false });

  // ---- a raised tiled platform, reached by stairs and by a ramp ------------
  // Stairs exercise Rapier's auto-step; the ramp exercises the slope limit.

  const platH = 1.6;
  const platMesh = new THREE.Mesh(
    new THREE.BoxGeometry(9, platH, 8),
    material('tileFloor', { repeat: 3 })
  );
  platMesh.position.set(-6.5, platH / 2, -8);
  platMesh.castShadow = true;
  platMesh.receiveShadow = true;
  scene.add(platMesh);
  physics.addStaticBox({ x: 4.5, y: platH / 2, z: 4 }, { x: -6.5, y: platH / 2, z: -8 }, null, { surface: 'tile' });

  // Stairs: eight 20cm risers, approached from +Z.
  //
  // The tread nearest the approach must be the SHORTEST one. Indexing the
  // risers in the same direction as the walk (rather than outward from the
  // platform) puts the full-height step at the bottom, which the player meets
  // as a 1.6m wall rather than a staircase.
  const stepMat = material('paintedWood', { color: 0x3b2c20 });
  const steps = 8;
  const stepDepth = 0.34;
  const stairTop = -4.0;                        // platform's near edge
  for (let i = 0; i < steps; i++) {
    const h = platH * ((i + 1) / steps);        // i = 0 is the lowest riser
    // Lowest riser furthest from the platform, climbing toward it.
    const z = stairTop + (steps - i) * stepDepth - stepDepth / 2;
    solidBox(2.4, h, stepDepth, -6.5, h / 2, z, stepMat, { surface: 'wood' });
  }

  // A ramp up to the same platform, approached from +Z alongside the stairs.
  //
  // Built from its two endpoints rather than from a rotation angle, because the
  // sign convention for rotating a slab about X is easy to get backwards — and a
  // ramp that descends away from the platform presents its high end to the
  // player as an unclimbable wall rather than as a slope.
  const rampX = -9.6;
  const rampTop = new THREE.Vector3(rampX, platH, -4.0);   // meets the platform lip
  const rampFoot = new THREE.Vector3(rampX, 0, 0.6);       // meets the floor
  {
    const along = rampFoot.clone().sub(rampTop);
    const run = Math.hypot(along.z, along.x);
    const rampAngle = Math.atan2(platH, run);              // ~17°, well under the 50° limit
    const slabLen = along.length() + 1.2;                  // extra length buried at the foot
    const thickness = 0.24;

    const rampMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, thickness, slabLen),
      material('steel', { repeat: 2 })
    );

    // Sit the slab on the line between the endpoints, sunk by half its
    // thickness so the walking surface is exactly that line. The extra length
    // is spent below the floor at the foot, so there is no lip to catch on.
    const mid = rampTop.clone().add(rampFoot).multiplyScalar(0.5);
    rampMesh.position.copy(mid);
    rampMesh.position.y -= thickness / 2 / Math.cos(rampAngle);
    rampMesh.position.z += 0.35;                           // bias the overhang downhill

    // Local +Z must point downhill (toward the foot, which is at greater z and
    // lower y), so the slab tilts nose-up toward the platform.
    rampMesh.rotation.x = rampAngle;

    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    scene.add(rampMesh);
    physics.addStaticTrimesh(rampMesh, { surface: 'metal' });

    // Kerbs, so the player can feel the edges of the ramp in the dark.
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.16, slabLen),
        material('rustedSteel', { repeat: 1 })
      );
      kerb.position.copy(rampMesh.position);
      kerb.position.x += side * 1.4;
      kerb.position.y += 0.16;
      kerb.rotation.x = rampAngle;
      kerb.castShadow = true;
      scene.add(kerb);
    }
  }

  // ---- a crawl tunnel the player must stay crouched through ----------------
  //
  // Crouch-only for its whole length, so the "refuse to stand when something is
  // overhead" check is actually exercised — a hole in a single thin wall would
  // let the player pass before the check ever mattered.
  //
  // Headroom has to clear the CROUCHED capsule, which is 2*(halfHeight+radius)
  // = 1.16m tall, while staying well under the standing capsule's 1.84m. At
  // 1.1m the player could not fit through at all, crouched or not.
  const ventZ = 6;
  const ventLen = 3.0;
  const ventHeadroom = 1.32;
  const partitionT = 0.5;

  // Partition walls either side of the mouth, at both ends of the tunnel.
  for (const z of [ventZ - ventLen / 2, ventZ + ventLen / 2]) {
    solidBox(4.0, H, partitionT, -3.0, H / 2, z, wallMat, { shadow: false });
    solidBox(6.0, H, partitionT, 9.0, H / 2, z, wallMat, { shadow: false });
  }

  // The tunnel's ceiling slab, spanning the full run.
  solidBox(3.2, H - ventHeadroom, ventLen, 4.5, ventHeadroom + (H - ventHeadroom) / 2, ventZ,
    wallMat, { shadow: false });

  // Side cheeks, so it reads as a duct rather than a gap under a wall.
  for (const x of [4.5 - 1.75, 4.5 + 1.75]) {
    solidBox(0.3, ventHeadroom, ventLen, x, ventHeadroom / 2, ventZ, wallMat, { shadow: false });
  }

  const ventLip = new THREE.Mesh(
    new THREE.BoxGeometry(3.3, 0.12, ventLen + 0.2),
    material('rustedSteel', { repeat: 1 })
  );
  ventLip.position.set(4.5, ventHeadroom, ventZ);
  ventLip.castShadow = true;
  ventLip.receiveShadow = true;
  scene.add(ventLip);

  // ---- dynamic props: crates that can be shoved -----------------------------
  const crateMat = material('paintedWood', { color: 0x4a3724 });
  for (let i = 0; i < 9; i++) {
    const s = randRange(0.4, 0.62);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    crate.position.set(
      randRange(2, 9),
      s / 2 + 0.02 + (i > 5 ? s * (i - 5) : 0),
      randRange(-9, -3)
    );
    crate.rotation.y = rng() * Math.PI;
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    physics.addDynamicBox(crate, { x: s / 2, y: s / 2, z: s / 2 }, { mass: 5 + s * 10 });
  }

  // A stack to knock over, and a heavy crate that resists being pushed.
  const heavy = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), crateMat);
  heavy.position.set(7.5, 0.57, 1.5);
  heavy.castShadow = true;
  heavy.receiveShadow = true;
  scene.add(heavy);
  physics.addDynamicBox(heavy, { x: 0.55, y: 0.55, z: 0.55 }, { mass: 140, friction: 0.95 });

  // ---- a marionette to look at ---------------------------------------------
  const puppet = buildPuppet({
    preset: 'marionette',
    scale: 1.25,
    strings: true,
    stringHeight: 3.4,
    faceStyle: 'smile',
    clothColor: 0x3d1c26,
  });
  puppet.root.position.set(-6.5, platH, -10.5);
  puppet.root.rotation.y = 0.35;
  puppet.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(puppet.root);
  updaters.push((dt, t) => animateHang(puppet, t));

  // ---- lighting -------------------------------------------------------------

  scene.add(new THREE.HemisphereLight(0x2b3444, 0x090806, 0.17));

  // The key: a window shaft from high on the back wall.
  const sun = new THREE.DirectionalLight(0xffd7a8, 1.5);
  sun.position.set(-9, 12, 14);
  sun.target.position.set(-2, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 46;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.026;
  scene.add(sun, sun.target);

  // Two failing practicals over the main floor.
  for (const [x, z, seed] of [[0, 2, 3], [6.5, -7, 11]]) {
    const lamp = createHangingLight({
      color: 0xffb06a,
      intensity: 3.4,
      distance: 13,
      cordLength: 1.1,
      castShadow: true,
      flicker: { chance: 0.5, severity: 0.88, seed },
    });
    lamp.position.set(x, H, z);
    scene.add(lamp);
    updaters.push((dt, t) => lamp.userData.update(dt, t));
  }

  // A cold, steady light over the platform, so the two zones read differently.
  const cold = new THREE.SpotLight(0x8fb6d8, 12, 16, Math.PI / 5, 0.6, 2);
  cold.position.set(-6.5, H - 0.4, -8);
  cold.target.position.set(-6.5, 0, -8);
  cold.castShadow = true;
  cold.shadow.mapSize.setScalar(1024);
  cold.shadow.bias = -0.002;
  cold.shadow.normalBias = 0.02;
  scene.add(cold, cold.target);

  // ---- atmosphere -----------------------------------------------------------
  if (Settings.get('godRays')) {
    const ray = createGodRay({
      radiusTop: 0.7, radiusBottom: 3.2, length: H + 1,
      color: 0xffd9a8, intensity: 0.17, noiseAmount: 0.6,
    });
    ray.position.set(-4.5, H + 0.5, 9);
    ray.rotation.set(-0.42, 0, 0.2);
    scene.add(ray);
    updaters.push((dt, t) => ray.userData.update(t));
  }

  const dust = createDust({
    count: 1100,
    bounds: new THREE.Vector3(W, H, D),
    center: new THREE.Vector3(0, H / 2, 0),
    size: 20,
    seed: 5,
  });
  scene.add(dust);
  updaters.push((dt, t) => dust.userData.update(t, scene, engine.camera));

  // ---- footstep audio -------------------------------------------------------

  const _down = { x: 0, y: -1, z: 0 };

  function onFootstep(info) {
    // Ask the physics world what we're standing on, so the same footstep system
    // works in every level without the level having to declare zones.
    const origin = info.position.clone();
    origin.y += 0.2;
    const hit = physics.raycast(origin, _down, 1.6);
    const surface = hit?.collider?.userData?.surface ?? 'wood';
    const s = SURFACES[surface] ?? SURFACES.wood;

    const vol = s.gain * info.loudness;
    Audio.noise({
      duration: 0.11,
      gain: vol,
      filterType: 'lowpass',
      freq: s.freq * randRange(0.9, 1.12),
      freqEnd: s.freqEnd,
      q: s.q,
      reverb: 0.28,
      pan: randRange(-0.14, 0.14),
    });
    if (s.tone) {
      Audio.tone({
        freq: s.tone * randRange(0.92, 1.08),
        type: 'triangle',
        duration: 0.055,
        attack: 0.001, decay: 0.035, sustain: 0.1, release: 0.09,
        gain: vol * 0.45,
        reverb: 0.3,
      });
    }
  }

  // ---- assembly -------------------------------------------------------------

  return {
    scene,
    spawn: new THREE.Vector3(0, 1.0, 9),
    spawnYaw: Math.PI,
    onFootstep,

    update(dt, time) {
      for (const fn of updaters) fn(dt, time);
    },

    dispose() {
      scene.traverse((obj) => {
        if (obj.isMesh || obj.isPoints || obj.isLine) obj.geometry?.dispose();
      });
      for (const d of disposables) d.dispose?.();
      updaters.length = 0;
    },
  };
}
