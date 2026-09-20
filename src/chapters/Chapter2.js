/**
 * Chapter2.js — "The Workshop"
 *
 * Carving room → paint shop → kiln → conveyor hall.
 *
 * Structure:
 *   .   THE EMBER LENS     — found on the carving bench
 *   P1  Warm Hands         — lens tutorial: one thing in the room is warm
 *   P2  The Paint Shop Door— the keypad; heat on the keys gives the code
 *   P3  The Kiln           — fire to cone 6, read through the lens
 *   C   The Conveyor Run   — Tangle over the packing line
 *
 * The chapter's idea is that heat means *recent*. Every Ember puzzle is a
 * question about what happened in this room a few minutes ago, which is a
 * worse question than it sounds, because the building is supposed to be empty.
 */

import * as THREE from 'three';
import { material } from '../world/Materials.js';
import { LevelKit } from '../world/LevelKit.js';
import { RailNetwork, MisterTangle } from '../ai/MisterTangle.js';
import { NOTES, TAPES, STUBS, RADIO } from './StoryContent.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/** The paint-shop keypad code. Derived from the heat order on the keys. */
const KEYPAD_CODE = [4, 1, 9, 7];

/**
 * Pyrometric cones. Real kiln practice: a cone is a slug of clay formulated to
 * slump at a known temperature, and potters fire to a *cone*, not to a number
 * on a gauge, precisely because gauges drift. That is exactly the trap here —
 * the gauge in this room reads low, and the log tells you cone 6.
 */
const CONES = [
  { number: 4, temp: 1186 },
  { number: 5, temp: 1196 },
  { number: 6, temp: 1222 },   // the target
  { number: 7, temp: 1240 },   // past this the porcelain cracks
];
const GAUGE_ERROR = -305;      // the gauge under-reads by this much

export function buildChapter2(ctx) {
  const { physics, engine, audio, music, save, puzzles, interaction, mask, flashlight, hud, reader } = ctx;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05040a);
  scene.fog = new THREE.FogExp2(0x0a0808, 0.03);

  const kit = new LevelKit({ scene, physics, engine, audio });
  const rng = makeRng(1986_2);

  // The workshop still has power, so it is marginally less black than the
  // theatre — which is the point of the chapter, and not a comfort.
  kit.ambience({ strength: 1.3, sky: 0x33303a });

  // Continuity. A player who reaches this chapter through Chapter Select has
  // not played Chapter 1 in this session, so they would arrive with no mask at
  // all — which makes the Ember lens, and therefore every puzzle here,
  // impossible. Grant what Chapter 1 would have given them.
  if (!mask.owned) {
    mask.give();
    mask.unlockLens('threadlight');
  }
  if (!flashlight.owned) flashlight.give({ battery: 0.5 });

  const state = {
    emberFound: false,
    warmHandTaken: false,
    keypadEntry: [],
    paintDoorOpen: false,
    kilnTemp: 20,
    kilnFiring: false,
    kilnDone: false,
    kilnRuined: false,
    chaseStarted: false,
    chaseDone: false,
  };

  // ==========================================================================
  // CARVING ROOM
  // ==========================================================================

  kit.room({
    width: 18, depth: 14, height: 5.2, x: 0, z: 0,
    floorMat: material('lobbyFloor', { repeat: 5 }),
    wallMat: material('wallPlaster', { repeat: 4 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'sawdust',
    openings: [
      { side: 'n', at: 5, width: 1.5, top: 2.3 },    // to the paint shop corridor
      { side: 's', at: 0, width: 1.6, top: 2.3 },    // back the way you came
    ],
  });

  kit.window(-8.9, 3.4, -3, { width: 1.4, height: 2.2, rotY: Math.PI / 2, boarded: true, rayLength: 7, rayIntensity: 0.2 });
  kit.window(-8.9, 3.4, 3, { width: 1.4, height: 2.2, rotY: Math.PI / 2, boarded: true, rayLength: 7, rayIntensity: 0.2 });
  kit.dust(new THREE.Vector3(0, 2.6, 0), new THREE.Vector3(18, 5, 14), { count: 1100, seed: 21 });

  kit.practical(-3, 5.0, 0, { intensity: 20, distance: 11, flicker: { chance: 0.5, severity: 0.85, seed: 41 } });
  kit.practical(4, 5.0, -4, { intensity: 16, distance: 9, flicker: { chance: 0.7, severity: 0.9, seed: 42 } });

  // Benches down the middle, with a lathe at the end.
  for (let i = 0; i < 3; i++) {
    kit.table(-4 + i * 4, 0, 2.5, { width: 2.6, depth: 1.0, height: 0.86 });
  }
  kit.shelving(-8.4, 0, 3, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4 });
  kit.shelving(-8.4, 0, -3, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4 });

  // Unfinished bodies hanging from the ceiling rail — the room's whole mood.
  kit.bodyRack(
    Array.from({ length: 9 }, (_, i) => [-6.4 + i * 1.6, 1.6, -4.6]),
    { hangHeight: 2.6 }
  );

  // ==========================================================================
  // THE EMBER LENS — on the carving bench, in a lens case
  // ==========================================================================

  const lensCase = new THREE.Group();
  {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.16), material('feltDark'));
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.012, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xff7a3d, roughness: 0.1, metalness: 0,
        transmission: 0.8, thickness: 0.01, ior: 1.6,
        transparent: true, opacity: 0.85,
        emissive: 0xff5a1d, emissiveIntensity: 0.6,
      })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.y = 0.045;
    box.add(lens);
    lensCase.add(box);
  }
  lensCase.position.set(0, 0.92, 2.5);
  lensCase.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(lensCase);

  const lensGlow = new THREE.PointLight(0xff7a3d, 2.2, 3, 2);
  lensGlow.position.set(0, 1.05, 2.5);
  scene.add(lensGlow);

  puzzles.register({
    id: 'ch2-lens',
    name: 'The Second Lens',
    objective: 'Wren said there was another lens down here.',
    marker: new THREE.Vector3(0, 1, 2.5),
    hints: [
      'She said the workshop. Look at the benches down the middle of the carving room — something on one of them is not covered in dust.',
      'It is in a felt-lined case on the centre bench, and it is the only thing in this room giving off any light of its own.',
      'The case is on the middle bench of the carving room. Open it, then press Q or R to switch lenses once you have the mask on.',
    ],
  });
  puzzles.activate('ch2-lens');

  interaction.register({
    object: lensCase,
    reach: 2.2,
    label: 'Open the lens case',
    enabled: () => !state.emberFound,
    onUse: () => {
      state.emberFound = true;
      mask.unlockLens('ember');
      lensCase.visible = false;
      lensGlow.intensity = 0;
      interaction.unregister(lensCase);
      puzzles.solve('ch2-lens');
      hud.say('Warm to the touch, and it should not be.', { duration: 4 });
      setTimeout(() => {
        ctx.playRadio(RADIO['ch2-radio-1']);
        puzzles.activate('ch2-hands');
      }, 1500);
    },
  });

  // ==========================================================================
  // PUZZLE 1 — Warm Hands
  // ==========================================================================
  //
  // Forty carved hands on a rack. One is warm, because something was holding
  // it very recently. Through Ember it is the only bright thing in the room.
  // Behind it: the key to the corridor door.

  const handRack = new THREE.Group();
  handRack.position.set(7.6, 0, 1);
  scene.add(handRack);

  const WARM_HAND = 23;
  const HAND_COUNT = 40;

  // Forty hands as two instanced meshes rather than two hundred objects. Each
  // hand's transform is kept so the warm one can be hidden when it is taken.
  const handMat = material('paintedWood', { color: 0x8a6d4f });
  const palms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.1, 0.028), handMat, HAND_COUNT);
  const fingers = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.006, 0.005, 0.055, 5), handMat, HAND_COUNT * 4
  );
  palms.castShadow = true;
  fingers.castShadow = true;

  const handTransforms = [];
  {
    const base = new THREE.Matrix4();
    const partM = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let fi = 0;

    for (let i = 0; i < HAND_COUNT; i++) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      const pos = new THREE.Vector3(-0.9 + col * 0.26, 0.7 + row * 0.42, 0);
      // The note says: if they all point the same way, something moved them.
      const roll = i === WARM_HAND ? 0 : randRange(-0.5, 0.5);
      base.compose(pos, q.setFromEuler(new THREE.Euler(0, 0, roll)), one);
      handTransforms.push({ pos, matrix: base.clone() });

      palms.setMatrixAt(i, base);
      for (let f = 0; f < 4; f++) {
        partM.compose(new THREE.Vector3((f - 1.5) * 0.018, 0.076, 0), new THREE.Quaternion(), one);
        fingers.setMatrixAt(fi++, new THREE.Matrix4().multiplyMatrices(base, partM));
      }
    }
    palms.instanceMatrix.needsUpdate = true;
    fingers.instanceMatrix.needsUpdate = true;
  }
  handRack.add(palms, fingers);

  // The Ember signature. Only the warm one blooms.
  const warmHeat = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0xff8a4d, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  warmHeat.position.copy(handTransforms[WARM_HAND].pos);
  warmHeat.userData.lensOnly = 'ember';
  handRack.add(warmHeat);

  // The rack frame.
  for (let r = 0; r <= 5; r++) {
    kit.box(2.2, 0.04, 0.16, 7.6, 0.64 + r * 0.42, 1, material('rustedSteel', { repeat: 1 }), { surface: 'metal', solid: r === 0 });
  }

  // The key on the peg behind the warm hand.
  //
  // It is parented to the rack and positioned in the rack's LOCAL space. The
  // previous version copied the hand's local position and then added the
  // rack's x offset by hand while forgetting its z — which left the key
  // hanging in mid-air a metre out from the rack, nowhere near the peg the
  // hint tells the player to look at.
  //
  // It is also an actual key shape rather than a 3cm sliver: the player has
  // to spot it across a dim workshop and put a crosshair on it.
  const corridorKey = new THREE.Group();
  {
    const brass = material('brass');

    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 6, 14), brass);
    bow.position.y = 0.055;
    corridorKey.add(bow);

    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 8), brass);
    shank.position.y = -0.01;
    corridorKey.add(shank);

    for (const [by, bw] of [[-0.05, 0.028], [-0.068, 0.02]]) {
      const bit = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.016, 0.008), brass);
      bit.position.set(bw / 2, by, 0);
      corridorKey.add(bit);
    }
    corridorKey.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  corridorKey.position.copy(handTransforms[WARM_HAND].pos).add(new THREE.Vector3(0, -0.02, -0.05));
  corridorKey.visible = false;
  handRack.add(corridorKey);

  // A glint on it once it is uncovered, so it reads from across the room.
  const keyGlint = new THREE.PointLight(0xffd9a0, 0, 2.6, 2);
  keyGlint.position.set(
    7.6 + handTransforms[WARM_HAND].pos.x,
    handTransforms[WARM_HAND].pos.y,
    1 - 0.25
  );
  scene.add(keyGlint);

  puzzles.register({
    id: 'ch2-hands',
    name: 'Warm Hands',
    objective: 'The corridor door is locked. Find the key.',
    marker: new THREE.Vector3(7.6, 1.4, 1),
    hints: [
      'Nothing in this building has been touched in ten years. So look for the thing that has — the new lens shows you what is warm.',
      'The rack of carved hands on the east wall. Thirty-nine of them are hanging at whatever angle they were left at. Put the mask on with the Ember lens and look at the rack.',
      'Third row up, eighth across — the one hanging perfectly straight. It is still warm. Take it; the key is on the peg behind it.',
    ],
  });

  interaction.register({
    object: handRack,
    reach: 2.4,
    label: () => (state.warmHandTaken ? 'An empty peg' : 'Take the hand'),
    enabled: () => !state.warmHandTaken,
    requiresLens: 'ember',
    lensHint: 'Forty carved hands. Without knowing which one, this is pointless.',
    onUse: () => {
      state.warmHandTaken = true;
      // Collapse that one instance to zero scale — the instanced equivalent of
      // setting `visible = false` on a single object.
      palms.setMatrixAt(WARM_HAND, new THREE.Matrix4().makeScale(0, 0, 0));
      palms.instanceMatrix.needsUpdate = true;
      for (let f = 0; f < 4; f++) {
        fingers.setMatrixAt(WARM_HAND * 4 + f, new THREE.Matrix4().makeScale(0, 0, 0));
      }
      fingers.instanceMatrix.needsUpdate = true;
      warmHeat.visible = false;
      warmHeat.userData.lensOnly = undefined;
      corridorKey.visible = true;
      keyGlint.intensity = 2.6;
      audio?.paperPickup?.();
      // Stop the rack itself capturing the crosshair. It sits in front of the
      // key and, once disabled, would hold focus as "an empty peg" forever —
      // the player would be looking straight at the key and never be offered
      // it.
      interaction.unregister(handRack);

      hud.say('Still warm. Warmer than your own hand — and there is a key on the peg behind it.', { duration: 5 });
      hud.setObjective('Take the key from the peg.');
      puzzles.solve('ch2-hands');
    },
  });

  interaction.register({
    object: corridorKey,
    reach: 2.4,
    label: 'Take the key',
    onUse: () => {
      corridorKey.visible = false;
      keyGlint.intensity = 0;
      corridorDoor.unlock();
      interaction.unregister(corridorKey);
      hud.say('A brass key, worn smooth.', { duration: 3 });
      hud.setObjective('Open the corridor door.');
      setTimeout(() => puzzles.activate('ch2-keypad'), 1200);
    },
  });

  const corridorDoor = kit.door({
    x: 4.25, z: -7.1, width: 1.5, height: 2.3, locked: true, name: 'carving-corridor',
  });
  interaction.register({
    object: corridorDoor.object,
    reach: 2.4,
    label: () => (corridorDoor.isLocked ? 'Locked' : corridorDoor.isOpen ? 'Close' : 'Open'),
    enabled: () => !corridorDoor.isLocked,
    disabledLabel: 'Locked — there is a keyhole',
    deniedMessage: 'Locked. The keyway is clean; someone uses this.',
    onUse: () => corridorDoor.toggle(),
  });

  // ==========================================================================
  // CORRIDOR + PAINT SHOP
  // ==========================================================================

  // The corridor runs from the carving room to the paint shop's south wall.
  //
  // It used to stop half a metre short of that wall, leaving a strip with no
  // floor between two solid walls — and the paint shop had no south opening at
  // all, so the keypad door unbolted onto plaster. Same fault as the stage
  // door in Chapter 1: an opening in one room is not an opening in the room
  // on the other side of it.
  //
  // `walls.n: false` because the paint shop's south wall stands here; building
  // both would put two coincident slabs in the same place and make them fight.
  kit.room({
    width: 3.2, depth: 12.5, height: 3.2, x: 5, z: -13.25,
    floorMat: material('tileFloor', { repeat: 3 }),
    wallMat: material('wallPlasterClean', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'tile',
    walls: { n: false, s: true, e: true, w: true },
    openings: [
      // `at` is measured from the ROOM's centre, not from world zero. The
      // corridor is centred at x = 5 and the carving room's doorway is at
      // world x 4.25..5.75, so this must be 0, not -0.75. At -0.75 the
      // corridor's own south wall covered x 5.00..5.75 — half the doorway,
      // with the door itself visible behind it.
      { side: 's', at: 0, width: 1.6, top: 2.3 },
    ],
  });
  kit.sconce(3.5, 2.3, -11, { rotY: -Math.PI / 2, intensity: 7, flicker: { chance: 0.6, severity: 0.8, seed: 51 } });
  kit.sconce(6.5, 2.3, -15, { rotY: Math.PI / 2, intensity: 7 });

  // ==========================================================================
  // PUZZLE 2 — The Paint Shop Keypad
  // ==========================================================================

  const keypadGroup = new THREE.Group();
  keypadGroup.position.set(5, 1.35, -18.8);
  scene.add(keypadGroup);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.05), material('rustedSteel', { repeat: 1 }));
  plate.castShadow = true;
  keypadGroup.add(plate);

  const keyMeshes = [];
  for (let i = 0; i < 9; i++) {
    const digit = i + 1;
    const col = i % 3;
    const row = Math.floor(i / 3);

    const key = new THREE.Mesh(
      new THREE.BoxGeometry(0.062, 0.062, 0.02),
      material('paintedWood', { color: 0x2b2725 })
    );
    key.position.set((col - 1) * 0.082, 0.11 - row * 0.082, 0.032);
    key.castShadow = true;
    key.userData.digit = digit;
    keypadGroup.add(key);
    keyMeshes.push(key);

    // The clue: residual heat on the keys that were pressed.
    //
    // Brightness encodes recency — the LAST key pressed is the hottest,
    // because it has had least time to cool. So the order the player reads,
    // dimmest to brightest, is the order the code was entered.
    const orderIndex = KEYPAD_CODE.indexOf(digit);
    if (orderIndex >= 0) {
      const recency = (orderIndex + 1) / KEYPAD_CODE.length;   // 0.25 … 1.0
      const heat = new THREE.Mesh(
        new THREE.PlaneGeometry(0.075, 0.075),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(lerp(0.09, 0.02, recency), 1, lerp(0.28, 0.6, recency)),
          transparent: true,
          opacity: lerp(0.35, 0.95, recency),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      heat.position.copy(key.position).add(new THREE.Vector3(0, 0, 0.015));
      heat.userData.lensOnly = 'ember';
      keypadGroup.add(heat);
    }
  }

  const readout = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x0a1008, emissive: 0x1a3d1a, emissiveIntensity: 1.5 })
  );
  readout.position.set(0, 0.175, 0.028);
  keypadGroup.add(readout);

  const paintDoor = kit.door({
    x: 4.15, z: -19.35, width: 1.7, height: 2.3, locked: true, name: 'paint-shop',
  });

  const pressKey = (digit) => {
    state.keypadEntry.push(digit);
    audio?.tone?.({
      freq: 440 + digit * 55, type: 'square', duration: 0.07,
      attack: 0.001, decay: 0.04, sustain: 0.2, release: 0.06, gain: 0.05,
    });

    if (state.keypadEntry.length >= 4) {
      const ok = state.keypadEntry.every((d, i) => d === KEYPAD_CODE[i]);
      state.keypadEntry = [];
      if (ok) {
        readout.material.emissive.setHex(0x2ecc71);
        readout.material.emissiveIntensity = 4;
        state.paintDoorOpen = true;
        paintDoor.unlock();
        paintDoor.open();
        puzzles.solve('ch2-keypad');
        audio?.puzzleSolved?.();
        hud.setObjective('Get into the kiln room.');
        setTimeout(() => puzzles.activate('ch2-kiln'), 1400);
      } else {
        readout.material.emissive.setHex(0xc23b2e);
        readout.material.emissiveIntensity = 3;
        audio?.uiDenied?.();
        setTimeout(() => {
          readout.material.emissive.setHex(0x1a3d1a);
          readout.material.emissiveIntensity = 1.5;
        }, 900);
      }
    }
  };

  keyMeshes.forEach((key) => {
    interaction.register({
      object: key,
      reach: 1.8,
      label: () => `Press ${key.userData.digit}`,
      enabled: () => !state.paintDoorOpen,
      disabledLabel: 'The door is already open',
      onUse: () => pressKey(key.userData.digit),
    });
  });

  puzzles.register({
    id: 'ch2-keypad',
    name: 'The Paint Shop Door',
    objective: 'Four digits. Somebody used this keypad recently.',
    marker: new THREE.Vector3(5, 1.35, -18.8),
    hints: [
      'Somebody came through this door not long ago, and they touched four keys to do it. The Ember lens shows what has been touched.',
      'Four of the nine keys are still warm. Heat fades, so they are not all equally warm — the faintest one was pressed first and the brightest was pressed last. Read them in that order.',
      'The code is 4 — 1 — 9 — 7.',
    ],
  });

  // --- paint shop -----------------------------------------------------------
  kit.room({
    width: 14, depth: 11, height: 4.4, x: 0, z: -25,
    floorMat: material('tileFloor', { repeat: 4 }),
    wallMat: material('wallPlasterClean', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'tile',
    openings: [
      // The corridor arrives through the SOUTH wall at x = 5. The old opening
      // was on the east wall at the extreme south-east corner, half of it
      // hanging off the end of the wall, and connected to nothing.
      { side: 's', at: 5, width: 1.8, top: 2.4 },
      { side: 'w', at: 0, width: 1.6, top: 2.3 },   // to the kiln
    ],
  });
  kit.practical(0, 4.2, -25, { intensity: 18, distance: 10, flicker: { chance: 0.35, severity: 0.7, seed: 61 } });
  kit.dust(new THREE.Vector3(0, 2.2, -25), new THREE.Vector3(14, 4, 11), { count: 700, seed: 31 });

  for (let i = 0; i < 4; i++) {
    kit.table(-4.5 + i * 3, 0, -22.5, { width: 2.2, depth: 0.9 });
  }
  kit.shelving(-6.6, 0, -25, { width: 6, height: 2.6, rotY: Math.PI / 2, shelves: 5, fill: 1 });

  // Rows of heads, all with their eyes painted open. The note says shut.
  for (let i = 0; i < 12; i++) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), material('porcelain'));
    head.scale.set(1, 1.1, 0.95);
    head.position.set(-4.6 + (i % 6) * 1.5, 0.95, -22.4 - Math.floor(i / 6) * 0.5);
    head.castShadow = true;
    head.receiveShadow = true;
    scene.add(head);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.2 })
      );
      eye.position.copy(head.position).add(new THREE.Vector3(side * 0.036, 0.012, 0.086));
      scene.add(eye);
    }
  }

  // ==========================================================================
  // PUZZLE 3 — The Kiln
  // ==========================================================================

  kit.room({
    width: 12, depth: 10, height: 4.6, x: -13, z: -25,
    floorMat: material('tileFloor', { repeat: 3 }),
    wallMat: material('wallPlaster', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'tile',
    openings: [
      { side: 'e', at: 0, width: 1.6, top: 2.3 },
      { side: 'n', at: 0, width: 2.4, top: 2.6 },   // out to the conveyor hall
    ],
  });

  // The kiln itself: a brick box with a heavy door.
  const kilnBody = kit.box(3.2, 2.6, 2.6, -15, 1.3, -25, material('rustedSteel', { repeat: 2 }), { surface: 'metal' });
  const kilnDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.8, 1.8),
    material('rustedSteel', { repeat: 1 })
  );
  kilnDoor.position.set(-13.35, 1.2, -25);
  kilnDoor.castShadow = true;
  scene.add(kilnDoor);

  // The interior glow: only visible through Ember, and it brightens with heat.
  const kilnHeat = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.8, 1.8),
    new THREE.MeshBasicMaterial({
      color: 0xff5a1d, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  kilnHeat.position.set(-15, 1.2, -25);
  kilnHeat.userData.lensOnly = 'ember';
  scene.add(kilnHeat);

  const kilnLight = new THREE.PointLight(0xff5a1d, 0, 8, 2);
  kilnLight.position.set(-13.6, 1.2, -25);
  scene.add(kilnLight);

  // The three witness cones inside, visible only as heat.
  const coneMeshes = CONES.slice(0, 3).map((c, i) => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.18, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffaa66, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    cone.position.set(-13.9, 0.55, -25.5 + i * 0.5);
    cone.userData.lensOnly = 'ember';
    cone.userData.coneNumber = c.number;
    cone.userData.temp = c.temp;
    scene.add(cone);
    return cone;
  });

  // The gauge — which is wrong.
  const gaugeCanvas = document.createElement('canvas');
  gaugeCanvas.width = 256; gaugeCanvas.height = 128;
  const gaugeTex = new THREE.CanvasTexture(gaugeCanvas);
  gaugeTex.colorSpace = THREE.SRGBColorSpace;
  const gauge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.22),
    new THREE.MeshStandardMaterial({ map: gaugeTex, emissiveMap: gaugeTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 })
  );
  gauge.position.set(-13.32, 2.2, -25);
  gauge.rotation.y = -Math.PI / 2;
  scene.add(gauge);

  const drawGauge = () => {
    const g = gaugeCanvas.getContext('2d');
    g.fillStyle = '#12100e';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#3a342c';
    g.lineWidth = 3;
    g.strokeRect(6, 6, 244, 116);

    const shown = Math.max(0, Math.round(state.kilnTemp + GAUGE_ERROR));
    g.fillStyle = state.kilnRuined ? '#c23b2e' : '#ffb066';
    g.font = 'bold 46px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.fillText(`${shown}`, 128, 66);
    g.font = '15px "IBM Plex Mono", monospace';
    g.fillStyle = '#7a6f5e';
    g.fillText('DEGREES C', 128, 92);
    g.font = '11px "IBM Plex Mono", monospace';
    g.fillText('CAL. DUE 1984', 128, 112);
    gaugeTex.needsUpdate = true;
  };
  drawGauge();

  // The cone chart on the wall: the clue that a cone is a temperature.
  buildConeChart(scene);

  // The valve.
  const valve = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.024, 8, 18),
    material('brass')
  );
  valve.position.set(-13.3, 1.0, -26.4);
  valve.rotation.y = Math.PI / 2;
  valve.castShadow = true;
  scene.add(valve);

  interaction.register({
    object: valve,
    reach: 2.2,
    label: () => (state.kilnFiring ? 'Close the gas' : 'Open the gas'),
    enabled: () => !state.kilnDone,
    disabledLabel: 'The firing is finished',
    onUse: () => {
      state.kilnFiring = !state.kilnFiring;
      audio?.leverClunk?.(valve.position);
      if (state.kilnFiring) {
        hud.say('Gas. The burners catch with a thump you feel in the floor.', { duration: 3.6 });
      } else {
        checkFiring();
      }
    },
  });

  function checkFiring() {
    const t = state.kilnTemp;
    if (t >= CONES[3].temp) {
      state.kilnRuined = true;
      state.kilnDone = true;
      hud.say('Too far. Inside, something splits with a sound like a knuckle cracking.', { duration: 5 });
      audio?.woodSnap?.(new THREE.Vector3(-15, 1.2, -25));
      // Recoverable: the kiln cools and can be re-fired.
      setTimeout(() => {
        state.kilnRuined = false;
        state.kilnDone = false;
        state.kilnTemp = 20;
        hud.say('It cools. There are more bodies on the rack. Try again.', { duration: 4.5 });
      }, 6000);
    } else if (t >= CONES[2].temp) {
      state.kilnDone = true;
      puzzles.solve('ch2-kiln');
      hud.say('Cone six is down. Whatever is in there has stopped moving.', { duration: 5 });
      hud.setObjective('Go through to the packing hall.');
      setTimeout(() => {
        ctx.playRadio(RADIO['ch2-radio-2']);
        ctx.checkpoint('ch2-kiln-done');
      }, 2200);
    } else {
      hud.say(`Not hot enough. Cone ${CONES[2].number} is still standing.`, { duration: 3.6 });
    }
  }

  puzzles.register({
    id: 'ch2-kiln',
    name: 'The Kiln',
    objective: 'Fire the kiln properly.',
    marker: new THREE.Vector3(-13.4, 1.2, -25),
    hints: [
      'The kiln log in this room gives a firing schedule, and the chart on the wall explains what the numbers in it mean. The gauge is not the only way to read a kiln.',
      'The gauge was last calibrated in 1984 and it reads low — trusting it will overfire the load. Potters fire to a cone, not to a number: the cones are inside the kiln, and the Ember lens is the only way to see them. Watch them, not the dial.',
      'Open the gas and watch the three cones through the Ember lens. When the third one — cone 6 — slumps over, close the valve immediately. If you wait for the gauge to read 1222 you will be at nearly 1530 and everything inside will crack.',
    ],
  });

  // Kiln simulation.
  kit.onUpdate((dt) => {
    if (state.kilnFiring && !state.kilnDone) {
      // ~80 seconds from cold to cone 7, which is enough time to read the
      // cones but not so much that it is boring.
      state.kilnTemp = Math.min(1400, state.kilnTemp + dt * 17.5);
    } else if (!state.kilnFiring && state.kilnTemp > 20) {
      state.kilnTemp = Math.max(20, state.kilnTemp - dt * 26);
    }

    const t = state.kilnTemp;
    const glow = clamp((t - 300) / 1000, 0, 1);
    kilnHeat.material.opacity = 0.12 + glow * 0.7;
    kilnHeat.material.color.setHSL(lerp(0.08, 0.02, glow), 1, lerp(0.3, 0.62, glow));
    kilnLight.intensity = glow * 14;

    // Cones slump as they reach temperature. A cone bends over about 10°
    // before its rating and is fully down at it — which is what the player
    // watches for.
    coneMeshes.forEach((cone) => {
      const bend = clamp((t - (cone.userData.temp - 14)) / 14, 0, 1);
      cone.rotation.z = bend * Math.PI * 0.42;
      cone.material.color.setHSL(lerp(0.1, 0.03, glow), 1, lerp(0.45, 0.75, glow));
    });

    if (state.kilnFiring) drawGauge();

    // An alarm past cone 7, so overfiring is signposted rather than a gotcha.
    if (t > CONES[3].temp && !state._alarmed) {
      state._alarmed = true;
      audio?.tone?.({ freq: 880, type: 'square', duration: 0.3, gain: 0.06, sustain: 0.6, release: 0.1 });
      hud.say('Something in the kiln room starts shrieking.', { duration: 3 });
    }
    if (t < CONES[3].temp) state._alarmed = false;
  });

  // ==========================================================================
  // CONVEYOR HALL — the chase
  // ==========================================================================

  kit.room({
    width: 26, depth: 16, height: 8.5, x: -13, z: -38,
    floorMat: material('tileFloor', { repeat: 6 }),
    wallMat: material('wallPlaster', { repeat: 5 }),
    ceilMat: material('ceiling', { repeat: 4 }),
    surface: 'tile',
    openings: [
      { side: 's', at: 0, width: 2.4, top: 2.6 },
      { side: 'n', at: -9, width: 2.0, top: 2.4 },   // the way out
    ],
  });
  kit.dust(new THREE.Vector3(-13, 4, -38), new THREE.Vector3(26, 8, 16), { count: 1200, seed: 71 });

  // Three conveyor lines running the length of the hall.
  const conveyorBelts = [];
  for (let line = 0; line < 3; line++) {
    const cz = -43 + line * 5;
    const belt = kit.box(22, 0.16, 1.2, -13, 0.95, cz,
      material('feltDark'), { surface: 'metal' });
    conveyorBelts.push(belt);

    // Legs.
    for (let i = 0; i < 9; i++) {
      kit.box(0.09, 0.9, 0.09, -23 + i * 2.5, 0.45, cz, material('rustedSteel', { repeat: 1 }), { surface: 'metal' });
    }
    // Crates riding the line — cover during the chase.
    for (let i = 0; i < 5; i++) {
      kit.crate(-21 + i * 4.5 + rng() * 1.5, 1.35, cz, randRange(0.45, 0.7));
    }
  }

  kit.practical(-13, 8.2, -40, { intensity: 24, distance: 14, flicker: { chance: 0.8, severity: 0.95, seed: 81 } });
  kit.practical(-20, 8.2, -36, { intensity: 20, distance: 12, flicker: { chance: 0.6, severity: 0.9, seed: 82 } });

  // Rails above the hall.
  const rails = new RailNetwork();
  const railY = 7.4;
  const rA = rails.addPath([[-23, railY, -43], [-16, railY, -43], [-9, railY, -43], [-3, railY, -43]]);
  const rB = rails.addPath([[-23, railY, -38], [-16, railY, -38], [-9, railY, -38], [-3, railY, -38]]);
  const rC = rails.addPath([[-23, railY, -33], [-16, railY, -33], [-9, railY, -33], [-3, railY, -33]]);
  rails.connect(rA[1], rB[1]);
  rails.connect(rB[2], rC[2]);
  rails.connect(rA[3], rB[3]);
  rails.buildMesh(scene);

  const tangle = new MisterTangle({ scene, rails, player: ctx.player, audio, music, physics, engine });
  tangle.on('caught', () => ctx.onPlayerCaught('tangle'));

  // ==========================================================================
  // COLLECTIBLES
  // ==========================================================================

  placeNote(scene, interaction, reader, save, 'ch2-note-quota', new THREE.Vector3(-4, 0.9, 2.5), 0.3);
  placeNote(scene, interaction, reader, save, 'ch2-note-kiln', new THREE.Vector3(-13.2, 1.05, -27.8), -0.4);
  placeNote(scene, interaction, reader, save, 'ch2-note-hands', new THREE.Vector3(-1.5, 0.92, -22.4), 0.8);
  placeNote(scene, interaction, reader, save, 'ch2-note-resignation', new THREE.Vector3(4, 0.9, 2.5), -0.2);

  placeStub(scene, interaction, reader, save, 'ch2-stub-1', new THREE.Vector3(-8.2, 0.05, 5.4));
  placeStub(scene, interaction, reader, save, 'ch2-stub-2', new THREE.Vector3(-16.6, 0.05, -23.2));
  placeStub(scene, interaction, reader, save, 'ch2-stub-3', new THREE.Vector3(-22.4, 1.05, -43));

  placeTape(scene, interaction, reader, save, 'ch2-tape-safety', new THREE.Vector3(-10.6, 1.05, -27.6));

  // ==========================================================================
  // SCRIPTING
  // ==========================================================================

  // Checkpoint before the door, then the chase trigger inside the hall — never
  // the same volume, or a death respawns the player into a chase in progress.
  kit.trigger({
    x: -13, z: -29.6, width: 4, depth: 2, y: 1.5,
    onEnter: () => ctx.checkpoint('before-conveyor-chase'),
  });

  const chaseTrigger = kit.trigger({
    x: -13, z: -34, width: 8, depth: 2, y: 1.5,
    onEnter: () => startChase(),
  });

  function startChase() {
    if (state.chaseStarted) return;
    state.chaseStarted = true;

    audio?.distantThud?.(new THREE.Vector3(-13, railY, -38));
    ctx.player.addTrauma(0.4);
    music.setMood('chase');
    engine.postfx.fx.chromaBoost = 1;
    hud.say('Every belt in the hall starts moving at once.', { duration: 3.4 });
    hud.setObjective('Get to the north door.');

    tangle.spawnNear(new THREE.Vector3(-3, railY, -38));
    tangle.awareness = 1;
    tangle.lastKnown.copy(ctx.player.position);
  }

  kit.trigger({
    x: -22, z: -30.5, width: 3, depth: 1.6, y: 1.5,
    onEnter: () => {
      if (state.chaseDone) return;
      state.chaseDone = true;
      tangle.enabled = false;
      music.setMood('calm');
      engine.postfx.fx.chromaBoost = 0;
      hud.say('The door holds. On the other side, something drags itself back along the rail.', { duration: 5 });
      setTimeout(() => ctx.completeChapter(2), 3400);
    },
  });

  // ==========================================================================

  return {
    scene,
    kit,
    spawn: new THREE.Vector3(0, 1.2, 5.4),
    // Facing -Z: into the carving room, not at the door behind them.
    spawnYaw: 0,
    tangle,
    state,

    /**
     * The AI is constructed during the build, before a player exists, so its
     * reference is wired up here instead of in the constructor.
     */
    onPlayerReady(player) {
      tangle.player = player;
    },

    /** Re-arm the chase so a death gives a clean run at it, not a loop. */
    onRespawn() {
      if (!state.chaseDone) {
        state.chaseStarted = false;
        chaseTrigger.reset();
        tangle.enabled = false;
        tangle.root.visible = false;
        tangle.awareness = 0;
        tangle.reach = 0;
        tangle.setState('dormant');
        engine.postfx.fx.chromaBoost = 0;
        music.setMood('unease');
      }
    },

    update(dt, time, player) {
      kit.update(dt, time, player);
      if (tangle.enabled) {
        tangle.update(dt, { maskHum: mask.hum, playerNoise: player.noiseLevel });
      }
    },

    serialize: () => ({ ...state }),
    restore(data) { Object.assign(state, data ?? {}); },

    dispose() {
      tangle.dispose();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isLine) o.geometry?.dispose();
      });
    },
  };
}

/* ==========================================================================
   Helpers
   ========================================================================== */

/** The cone chart: the in-world clue that "cone 6" is a temperature. */
function buildConeChart(scene) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 288;
  const g = c.getContext('2d');

  g.fillStyle = '#cfc4a6';
  g.fillRect(0, 0, 384, 288);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(120,90,50,${Math.random() * 0.08})`;
    g.beginPath();
    g.arc(Math.random() * 384, Math.random() * 288, Math.random() * 16, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = '#2a1f16';
  g.textAlign = 'center';
  g.font = 'bold 21px Georgia, serif';
  g.fillText('PYROMETRIC CONES', 192, 34);
  g.font = 'italic 12px Georgia, serif';
  g.fillText('Fire to the cone. Never to the dial.', 192, 54);

  g.textAlign = 'left';
  g.font = '15px "Courier New", monospace';
  const rows = [
    ['CONE 04', '1063 °C'],
    ['CONE 1', '1154 °C'],
    ['CONE 4', '1186 °C'],
    ['CONE 5', '1196 °C'],
    ['CONE 6', '1222 °C'],
    ['CONE 7', '1240 °C'],
  ];
  rows.forEach(([name, temp], i) => {
    const y = 92 + i * 27;
    const highlight = name === 'CONE 6';
    g.fillStyle = highlight ? '#6a1f1c' : '#2a1f16';
    g.fillText(name, 56, y);
    g.fillText(temp, 230, y);
    if (highlight) {
      g.strokeStyle = '#6a1f1c';
      g.lineWidth = 2;
      g.strokeRect(46, y - 19, 290, 26);
    }
  });

  g.textAlign = 'center';
  g.font = 'italic 11px Georgia, serif';
  g.fillStyle = '#6a1f1c';
  g.fillText('A cone bends when it has had enough heat for long enough.', 192, 266);
  g.fillText('The dial only knows how hot it is right now.', 192, 280);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const chart = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.63),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide })
  );
  chart.position.set(-13.3, 1.9, -27.2);
  chart.rotation.y = -Math.PI / 2;
  scene.add(chart);

  const l = new THREE.PointLight(0xffd9a8, 3, 3.4, 2);
  l.position.set(-12.9, 2.1, -27.2);
  scene.add(l);
  return chart;
}

function placeNote(scene, interaction, reader, save, id, position, rotY = 0) {
  const note = NOTES[id];
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), material('paper'));
  mesh.position.copy(position);
  mesh.rotation.set(-Math.PI / 2 + 0.05, rotY, 0);
  mesh.receiveShadow = true;
  scene.add(mesh);
  interaction.register({
    object: mesh, reach: 2.2, label: 'Read',
    onUse: () => {
      reader.showNote(note);
      save.recordCollectible('note', id);
      interaction.unregister(mesh);
      mesh.visible = false;
    },
  });
  return mesh;
}

function placeStub(scene, interaction, reader, save, id, position) {
  const stub = STUBS[id];
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xcdbfa0, roughness: 0.9, side: THREE.DoubleSide })
  );
  mesh.position.copy(position);
  mesh.rotation.set(-Math.PI / 2, Math.random() * Math.PI, 0);
  scene.add(mesh);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.24),
    new THREE.MeshBasicMaterial({
      color: 0x6fe3d4, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glow.position.copy(position).add(new THREE.Vector3(0, 0.01, 0));
  glow.rotation.x = -Math.PI / 2;
  glow.userData.lensOnly = 'threadlight';
  scene.add(glow);

  interaction.register({
    object: mesh, reach: 2.0, label: 'A ticket stub',
    onUse: () => {
      save.recordCollectible('stub', id);
      reader.showStub(stub, { found: save.stubCount, total: 12 });
      interaction.unregister(mesh);
      mesh.visible = false;
      glow.visible = false;
      glow.userData.lensOnly = undefined;
    },
  });
  return mesh;
}

function placeTape(scene, interaction, reader, save, id, position) {
  const tape = TAPES[id];
  const tv = new THREE.Group();
  tv.position.copy(position);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.44), material('paintedWood', { color: 0x2d2926 }));
  tv.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x0a0d0c, roughness: 0.25, emissive: 0x0a1410, emissiveIntensity: 1 })
  );
  screen.position.z = 0.225;
  tv.add(screen);
  tv.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(tv);

  const glow = new THREE.PointLight(0x7fd7c4, 1.6, 3, 2);
  glow.position.copy(position).add(new THREE.Vector3(0, 0, 0.4));
  scene.add(glow);

  interaction.register({
    object: tv, reach: 2.4, label: 'Play the tape',
    onUse: () => {
      save.recordCollectible('tape', id);
      screen.material.emissiveIntensity = 3;
      reader.showTape(tape);
    },
  });
  return tv;
}
