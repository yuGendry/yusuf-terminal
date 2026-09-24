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

/**
 * The glaze bench. Four pigment taps, and the works order gives the recipe in
 * parts — but one pair of taps is cross-plumbed, so the label on the handle is
 * not what comes out of it.
 *
 * That is the whole puzzle, and it is why it belongs in this chapter: the
 * player already knows by now not to trust a label (the breaker plates rotted
 * off, the kiln gauge reads low), and Threadlight shows a pipe running to the
 * wrong drum the same way it showed a cable running to the wrong circuit.
 *
 * `delivers` is the pigment the handle ACTUALLY draws. Yellow and blue are
 * swapped; white and red are honest.
 */
const PIGMENTS = {
  white:  { label: 'LEAD WHITE',     rgb: [0.93, 0.91, 0.86] },
  red:    { label: 'IRON RED',       rgb: [0.56, 0.13, 0.09] },
  yellow: { label: 'CHROME YELLOW',  rgb: [0.85, 0.66, 0.12] },
  blue:   { label: 'COBALT BLUE',    rgb: [0.13, 0.22, 0.55] },
};

const TAPS = [
  { label: 'white',  delivers: 'white' },
  { label: 'red',    delivers: 'red' },
  { label: 'yellow', delivers: 'blue' },     // cross-plumbed
  { label: 'blue',   delivers: 'yellow' },   // cross-plumbed
];

/** HOLLOWHART FLESH No. 3, as the works order gives it. */
const GLAZE_RECIPE = { white: 5, red: 3, yellow: 2, blue: 0 };

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
    glaze: { white: 0, red: 0, yellow: 0, blue: 0 },
    glazeDone: false,
    kilnKey: false,
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

  // 24 x 18. The north wall stays exactly where it was, at z = -7, because the
  // paint shop corridor is attached to it — so the extra depth is taken to the
  // SOUTH by moving the room's centre, not by growing symmetrically. Growing
  // symmetrically would have pulled that wall away from the corridor and left
  // a doorway opening onto a gap.
  kit.room({
    width: 24, depth: 18, height: 7.4, x: 0, z: 2,
    floorMat: material('lobbyFloor', { repeat: 5 }),
    wallMat: material('wallPlaster', { repeat: 4 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'sawdust',
    openings: [
      { side: 'n', at: 5, width: 1.5, top: 2.3 },    // to the paint shop corridor
      { side: 's', at: 0, width: 1.6, top: 2.3 },    // back the way you came
    ],
  });

  kit.window(-11.9, 3.8, -3, { width: 1.4, height: 2.2, rotY: Math.PI / 2, boarded: true, rayLength: 8, rayIntensity: 0.2 });
  kit.window(-11.9, 3.8, 3, { width: 1.4, height: 2.2, rotY: Math.PI / 2, boarded: true, rayLength: 8, rayIntensity: 0.2 });
  kit.window(-11.9, 3.8, 8, { width: 1.4, height: 2.2, rotY: Math.PI / 2, boarded: true, rayLength: 8, rayIntensity: 0.2 });
  kit.dust(new THREE.Vector3(0, 3.2, 2), new THREE.Vector3(24, 7, 18), { count: 1400, seed: 21 });

  kit.practical(-3, 6.6, 0, { intensity: 34, distance: 15, flicker: { chance: 0.5, severity: 0.85, seed: 41 } });
  kit.practical(4, 6.6, -4, { intensity: 28, distance: 13, castShadow: false, flicker: { chance: 0.7, severity: 0.9, seed: 42 } });
  // Fill only, and deliberately shadowless.
  //
  // A shadow-casting point light is six renders of every shadow caster in the
  // scene — adding three of them to Chapter 2 took it from 959 draw calls to
  // 2141. One or two casters per room give the shapes their shadows; the rest
  // of the lighting only has to put light in the room, and nobody can tell
  // which lamp a shadow came from.
  kit.practical(-1, 6.6, 7, { intensity: 26, distance: 13, castShadow: false, flicker: { chance: 0.4, severity: 0.7, seed: 43 } });

  // Benches down the middle, with a lathe at the end.
  for (let i = 0; i < 3; i++) {
    kit.table(-4 + i * 4, 0, 2.5, { width: 2.6, depth: 1.0, height: 0.86 });
  }
  kit.shelving(-11.4, 0, 3, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4 });
  kit.shelving(-11.4, 0, -3, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4 });
  kit.shelving(-11.4, 0, 8, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4 });

  // The south end of the enlarged room: timber stock, stacked against the wall
  // it came in through.
  for (let i = 0; i < 7; i++) {
    kit.box(0.16, 0.16, 3.4, -6 + i * 0.22, 0.09 + (i % 3) * 0.02, 9.2,
      material('paintedWood', { color: 0x6b5238 }), { surface: 'wood', rotY: 0.04 * i, shadow: false });
  }
  kit.table(6.5, 0, 8.2, { width: 2.4, depth: 1.0, height: 0.86 });
  kit.shelving(10.4, 0, 6.5, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4 });

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

  // Against the east wall, which moved out to x = 12 when the room grew. The
  // position lived as the literal 7.6 in four separate places — the group, the
  // frame, the glint and the puzzle marker — and moving the room meant getting
  // all four right or leaving a key floating where a rack used to be.
  const RACK = { x: 10.6, z: 1 };

  const handRack = new THREE.Group();
  handRack.position.set(RACK.x, 0, RACK.z);
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
    kit.box(2.2, 0.04, 0.16, RACK.x, 0.64 + r * 0.42, RACK.z, material('rustedSteel', { repeat: 1 }), { surface: 'metal', solid: r === 0 });
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
    RACK.x + handTransforms[WARM_HAND].pos.x,
    handTransforms[WARM_HAND].pos.y,
    RACK.z - 0.25
  );
  scene.add(keyGlint);

  puzzles.register({
    id: 'ch2-hands',
    name: 'Warm Hands',
    objective: 'The corridor door is locked. Find the key.',
    marker: new THREE.Vector3(RACK.x, 1.4, RACK.z),
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
    width: 3.2, depth: 12.5, height: 3.6, x: 5, z: -13.25,
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
        // The glaze bench comes first now: the kiln room door is padlocked and
        // the key is in the drying cabinet.
        setTimeout(() => puzzles.activate('ch2-glaze'), 1400);
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
  // 18 wide instead of 14, taken entirely to the EAST: the west wall carries
  // the kiln doorway and the conveyor hall sits hard against the north side,
  // so east is the only direction with anywhere to go.
  //
  // Depth is unchanged for the same reason. The hall's south wall is at
  // z = -30 and this room already reaches -30.5; another metre north would put
  // the paint shop inside it.
  kit.room({
    width: 18, depth: 11, height: 6.2, x: 2, z: -25,
    floorMat: material('tileFloor', { repeat: 5 }),
    wallMat: material('wallPlasterClean', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'tile',
    openings: [
      // The corridor arrives through the SOUTH wall at world x = 5. `at` is
      // measured from the room's centre, which is now x = 2 rather than 0 —
      // so this is 3, not 5. Leaving it at 5 would have moved the doorway to
      // world x 7 and left the corridor opening onto plaster.
      { side: 's', at: 3, width: 1.8, top: 2.4 },
      { side: 'w', at: 0, width: 1.6, top: 2.3 },   // to the kiln
    ],
  });
  kit.practical(-1, 5.6, -25, { intensity: 30, distance: 14, flicker: { chance: 0.35, severity: 0.7, seed: 61 } });
  kit.practical(6, 5.6, -23, { intensity: 13, distance: 10, castShadow: false, flicker: { chance: 0.5, severity: 0.8, seed: 63 } });
  kit.dust(new THREE.Vector3(2, 2.8, -25), new THREE.Vector3(18, 6, 11), { count: 900, seed: 31 });

  // The new east bay: drying racks and a spray bench, so the extra floor is
  // somewhere the room goes rather than somewhere it stops.
  kit.shelving(10.4, 0, -27, { width: 4.4, height: 2.6, rotY: Math.PI / 2, shelves: 5, fill: 1 });
  kit.table(8.6, 0, -22.4, { width: 2.6, depth: 1.0 });
  kit.table(8.6, 0, -24.6, { width: 2.6, depth: 1.0 });

  for (let i = 0; i < 4; i++) {
    kit.table(-4.5 + i * 3, 0, -22.5, { width: 2.2, depth: 0.9 });
  }
  // Two shorter racks, one either side of the doorway to the kiln room.
  //
  // This was a single six-metre rack centred on x = -6.6, running z = -28..-22
  // — straight across the doorway at z = -25.8..-24.2. It covered the opening
  // completely, and since that doorway has no door in it, nothing in the build
  // or the door check noticed.
  kit.shelving(-6.6, 0, -27.6, { width: 3.2, height: 2.6, rotY: Math.PI / 2, shelves: 5, fill: 1 });
  kit.shelving(-6.6, 0, -22.4, { width: 3.2, height: 2.6, rotY: Math.PI / 2, shelves: 5, fill: 1 });

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
  // PUZZLE 4 — The Glaze
  // ==========================================================================
  //
  // A mixing bench in the paint shop's east bay. Four taps, a pot, a works
  // order with the recipe on it, and one pair of taps plumbed to each other's
  // drums.

  const GLAZE_X = 8.6;
  const GLAZE_Z = -27.4;

  kit.box(3.2, 1.0, 1.0, GLAZE_X, 0.5, GLAZE_Z,
    material('paintedWood', { color: 0x3a2a1e }), { surface: 'wood', tile: 1.2 });

  // The drums, above and behind the taps.
  const drumOf = {};
  TAPS.forEach((tap, i) => {
    const dx = GLAZE_X - 1.2 + i * 0.8;
    // The drum matches the plate under it, because that is what an honest
    // workshop looks like and it is the pipes that are wrong, not the stock.
    // Colouring the drum by what the tap actually delivers gives the whole
    // puzzle away from across the room and makes the lens pointless.
    const drum = kit.box(0.5, 0.7, 0.5, dx, 2.15, GLAZE_Z - 0.55,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(...PIGMENTS[tap.label].rgb).multiplyScalar(0.32),
        roughness: 0.92,
      }), { surface: 'metal' });
    drumOf[tap.label] = drum;

    // The label plate on the HANDLE, which is what the player reads.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.16),
      new THREE.MeshStandardMaterial({
        map: makeGlazePlate(PIGMENTS[tap.label].label), roughness: 0.9, side: THREE.DoubleSide,
      })
    );
    plate.position.set(dx, 1.34, GLAZE_Z - 0.28);
    scene.add(plate);

    // The pipe from drum to tap. Through Threadlight it runs to the drum the
    // handle ACTUALLY draws from, which for two of the four is not its own.
    const target = TAPS.findIndex((t) => t.label === tap.delivers);
    const tx = GLAZE_X - 1.2 + target * 0.8;
    const run = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.05, Math.abs(tx - dx)) + 0.06, 0.045, 0.045),
      new THREE.MeshBasicMaterial({
        color: 0x6fe3d4, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    run.position.set((dx + tx) / 2, 1.62, GLAZE_Z - 0.42);
    run.userData.lensOnly = 'threadlight';
    scene.add(run);

    const drop = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.5, 0.045),
      new THREE.MeshBasicMaterial({
        color: 0x6fe3d4, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    drop.position.set(dx, 1.4, GLAZE_Z - 0.42);
    drop.userData.lensOnly = 'threadlight';
    scene.add(drop);
  });

  // The pot. Its colour is the answer the player is reading.
  const potMat = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.6 });
  const pot = kit.box(0.7, 0.34, 0.7, GLAZE_X + 1.1, 1.17, GLAZE_Z + 0.1,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.5, solid: false });
  const potSurface = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), potMat);
  potSurface.rotation.x = -Math.PI / 2;
  potSurface.position.set(GLAZE_X + 1.1, 1.33, GLAZE_Z + 0.1);
  scene.add(potSurface);

  // Tight and modest. A bench lamp that blows the wall behind it out to white
  // makes the pot — the one thing in the room the player has to judge a colour
  // from — harder to read, not easier.
  const potLight = new THREE.SpotLight(0xfff0d8, 5.5, 2.2, Math.PI / 5, 0.85, 2);
  potLight.position.set(GLAZE_X + 1.1, 2.6, GLAZE_Z + 0.1);
  potLight.target.position.set(GLAZE_X + 1.1, 1.3, GLAZE_Z + 0.1);
  scene.add(potLight, potLight.target);

  /** Weighted average of what is in the pot. Empty reads as dry metal. */
  function glazeColour(parts) {
    let total = 0;
    const acc = [0, 0, 0];
    for (const [id, n] of Object.entries(parts)) {
      total += n;
      for (let i = 0; i < 3; i++) acc[i] += PIGMENTS[id].rgb[i] * n;
    }
    if (total === 0) return new THREE.Color(0x1a1714);
    return new THREE.Color(acc[0] / total, acc[1] / total, acc[2] / total);
  }

  const TARGET_COLOUR = glazeColour(GLAZE_RECIPE);

  function refreshPot() {
    potMat.color.copy(glazeColour(state.glaze));
  }

  function glazeMatches() {
    // The ratio is what matters, not the absolute volume — but the pot is
    // small, so the recipe's own quantities are the only ones that fit.
    return Object.keys(GLAZE_RECIPE).every((id) => state.glaze[id] === GLAZE_RECIPE[id]);
  }

  TAPS.forEach((tap, i) => {
    const dx = GLAZE_X - 1.2 + i * 0.8;
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.24, 0.07),
      material('brass')
    );
    handle.position.set(dx, 1.12, GLAZE_Z + 0.12);
    handle.rotation.x = -0.35;
    handle.castShadow = true;
    scene.add(handle);

    interaction.register({
      object: handle,
      reach: 2.0,
      label: () => `Draw one part — ${PIGMENTS[tap.label].label}`,
      enabled: () => !state.glazeDone,
      disabledLabel: 'The glaze is mixed',
      onUse: () => {
        if (state.glazeDone) return;
        state.glaze[tap.delivers] += 1;
        refreshPot();
        audio?.leverClunk?.(handle.position);

        const total = Object.values(state.glaze).reduce((a, b) => a + b, 0);
        if (glazeMatches()) {
          state.glazeDone = true;
          state.kilnKey = true;
          kilnRoomDoor.unlock();
          puzzles.solve('ch2-glaze');
          audio?.puzzleSolved?.();
          hud.say('Flesh No. 3. The cabinet catch springs — there is a key on the hook inside.', { duration: 6 });
          setTimeout(() => puzzles.activate('ch2-kiln'), 3000);
        } else if (total >= 10) {
          hud.say('The pot is full and it is the wrong colour. Tip it out and start again.', { duration: 4.5 });
        }
      },
    });
  });

  // Tipping the pot out, because a puzzle you can put into an unwinnable state
  // and not get out of is not a puzzle, it is a reload.
  const tipLever = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), material('brass'));
  tipLever.position.set(GLAZE_X + 1.1, 1.3, GLAZE_Z + 0.55);
  tipLever.rotation.x = 0.4;
  tipLever.castShadow = true;
  scene.add(tipLever);

  interaction.register({
    object: tipLever,
    reach: 2.0,
    label: 'Tip the pot out',
    enabled: () => !state.glazeDone,
    disabledLabel: 'The glaze is mixed',
    onUse: () => {
      state.glaze = { white: 0, red: 0, yellow: 0, blue: 0 };
      refreshPot();
      audio?.leverClunk?.(tipLever.position);
      hud.say('Empty.', { duration: 1.8 });
    },
  });

  // The works order, with the recipe and a painted swatch of the target.
  {
    const order = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.0),
      new THREE.MeshStandardMaterial({
        map: makeWorksOrder(GLAZE_RECIPE, PIGMENTS, TARGET_COLOUR),
        roughness: 0.94, side: THREE.DoubleSide,
      })
    );
    order.position.set(10.85, 1.9, GLAZE_Z);
    order.rotation.y = -Math.PI / 2;
    scene.add(order);

    const l = new THREE.SpotLight(0xffe0b0, 9, 2.8, Math.PI / 6, 0.8, 2);
    l.position.set(9.9, 2.9, GLAZE_Z);
    l.target.position.set(10.8, 1.9, GLAZE_Z);
    scene.add(l, l.target);
  }

  puzzles.register({
    id: 'ch2-glaze',
    name: 'The Glaze',
    objective: 'Mix Flesh No. 3.',
    marker: new THREE.Vector3(GLAZE_X, 1.4, GLAZE_Z),
    hints: [
      'The kiln room is locked and the key is in the drying cabinet, which is shut. The works order pinned by the mixing bench says what the cabinet was last opened for.',
      'Five parts white, three red, two yellow. Pull the handles and watch the pot — if it is going the wrong colour, the pot tips out and you start again. And nothing else in this building has been labelled correctly either.',
      'Two of the taps are plumbed to each other\'s drums: the one marked CHROME YELLOW draws cobalt, and the one marked COBALT BLUE draws chrome. So pull WHITE five times, IRON RED three times, and COBALT BLUE twice.',
    ],
  });

  // The kiln room door, which this opens.
  // The hinge sits half a leaf on the +z side of the opening it fills: with
  // rotY = PI/2 the leaf extends toward -z, so the centre of the door is at
  // hinge_z - width/2, and the opening is at world z = -25.
  const kilnRoomDoor = kit.door({
    x: -7, z: -25 + 1.7 / 2, width: 1.7, height: 2.3, rotY: Math.PI / 2,
    locked: true, name: 'kiln-room',
  });

  interaction.register({
    object: kilnRoomDoor.object,
    reach: 2.4,
    label: () => (kilnRoomDoor.isLocked ? 'Locked — the kiln room' : kilnRoomDoor.isOpen ? 'Close' : 'Open'),
    onUse: () => {
      if (kilnRoomDoor.isLocked) {
        hud.say('Locked. A works padlock, and the key is not on this side of it.', { duration: 3.6 });
        return;
      }
      kilnRoomDoor.toggle();
    },
  });

  refreshPot();

  // ==========================================================================
  // PUZZLE 3 — The Kiln
  // ==========================================================================

  // 16 x 13. The east wall (the paint shop door) and the north wall (the way
  // into the conveyor hall) are both load-bearing for the layout, so the room
  // grows west and south only — which means its centre moves, and both
  // openings have to move with it to stay at the same world coordinates.
  kit.room({
    width: 16, depth: 13, height: 6.4, x: -15, z: -23.5,
    floorMat: material('tileFloor', { repeat: 4 }),
    wallMat: material('wallPlaster', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'tile',
    openings: [
      // World z -25, from a centre now at -23.5.
      { side: 'e', at: -1.5, width: 1.6, top: 2.3 },
      // World x -13, from a centre now at -15.
      { side: 'n', at: 2, width: 2.4, top: 2.6 },
    ],
  });

  // The west end: clay stock and a slip bin, filling the ground the room
  // gained.
  for (let i = 0; i < 5; i++) {
    kit.box(0.9, 0.62, 0.9, -21.6, 0.31 + Math.floor(i / 3) * 0.64, -27.4 + (i % 3) * 1.1,
      material('paintedWood', { color: 0x554131 }), { surface: 'wood', rotY: 0.08 * i, shadow: false });
  }
  kit.table(-20.6, 0, -21.5, { width: 2.4, depth: 1.0 });
  kit.practical(-19, 5.6, -24, { intensity: 22, distance: 12, castShadow: false, flicker: { chance: 0.6, severity: 0.9, seed: 65 } });

  // The kiln itself: a brick box with a heavy door.
  // `tile` rather than a material repeat: a repeat of 2 spread the rust
  // texture's low-frequency blotches over 1.6 metres a tile, so the kiln
  // looked like a cube wrapped in a photograph of rust rather than like rusted
  // steel. Tiling in world units keeps the grain the size rust actually is,
  // whatever the box is.
  const kilnBody = kit.box(3.2, 2.6, 2.6, -15, 1.3, -25,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.8 });
  const kilnDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.8, 1.8),
    material('rustedSteel', { repeat: 1 })
  );
  kilnDoor.position.set(-13.35, 1.2, -25);
  kilnDoor.castShadow = true;
  scene.add(kilnDoor);

  // Ember is a heat lens, and steel is not opaque to heat. The shell and its
  // door drop out while Ember is up, which is the only reason the cones inside
  // can be read at all — tagging the cones `lensOnly` made them visible, but
  // they were still sitting behind three centimetres of rusted plate. The
  // colliders are untouched (hiding a mesh does not touch physics), so the
  // kiln is still solid to walk into.
  kilnBody.userData.hiddenBy = 'ember';
  kilnDoor.userData.hiddenBy = 'ember';

  // What replaces the shell: the chamber seen from the inside. Without this
  // the kiln simply disappears under Ember and the cones float in the middle
  // of the room with the far wall behind them. BackSide so it is the interior
  // faces you see, additive so it reads as glow rather than as paint.
  const kilnGhost = new THREE.Mesh(
    new THREE.BoxGeometry(3.12, 2.52, 2.52),
    new THREE.MeshBasicMaterial({
      color: 0x30150a, transparent: true, opacity: 0.4,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  kilnGhost.position.set(-15, 1.3, -25);
  kilnGhost.userData.lensOnly = 'ember';
  scene.add(kilnGhost);

  // The outline, so the kiln keeps its shape and its door still reads as a
  // door when the steel goes see-through.
  const kilnEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 2.6, 2.6)),
    new THREE.LineBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.3, depthWrite: false })
  );
  kilnEdges.position.set(-15, 1.3, -25);
  kilnEdges.userData.lensOnly = 'ember';
  scene.add(kilnEdges);

  const kilnDoorEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.12, 1.8, 1.8)),
    new THREE.LineBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.35, depthWrite: false })
  );
  kilnDoorEdges.position.set(-13.35, 1.2, -25);
  kilnDoorEdges.userData.lensOnly = 'ember';
  scene.add(kilnDoorEdges);

  // The interior glow: only visible through Ember, and it brightens with heat.
  const kilnHeat = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 1.6),
    new THREE.MeshBasicMaterial({
      color: 0xff5a1d, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  kilnHeat.position.set(-15, 1.2, -25);
  kilnHeat.userData.lensOnly = 'ember';
  scene.add(kilnHeat);

  const kilnLight = new THREE.PointLight(0xff5a1d, 0, 8, 2);
  kilnLight.position.set(-13.6, 1.2, -25);
  scene.add(kilnLight);

  // A stencilled plate on the kiln door. The player has to be able to tell at
  // a glance that this brick box is the thing the log and the chart mean.
  {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1a1512';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#c9a227';
    g.lineWidth = 3;
    g.strokeRect(5, 5, 246, 54);
    g.fillStyle = '#c9a227';
    g.font = 'bold 27px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.fillText('KILN  No. 2', 128, 40);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.175),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.3 })
    );
    plate.position.set(-13.28, 2.05, -25);
    // +PI/2, not -PI/2. A plane's normal is +Z, and rotating by -PI/2 about Y
    // sends it to -X — into the kiln. The player stands east of the kiln, so
    // the stencil and the gauge below it were both facing the wrong way and
    // were single-sided, which is to say invisible from the only place you can
    // stand. Same fix on the gauge and on the cone numbers.
    plate.rotation.y = Math.PI / 2;
    // Bolted to the door, so it goes where the door goes.
    plate.userData.hiddenBy = 'ember';
    scene.add(plate);
  }

  // The three witness cones inside, visible only as heat.
  //
  // They sit on a plaque near the door at eye height rather than on the floor
  // of the chamber: a cone you have to crouch and squint at through a glowing
  // box is not a readable instrument. The numbers are stamped beside them,
  // because "the third one" is only obvious to somebody who already knows
  // which end of the row is which.
  const CONE_SHELF_Y = 1.32;
  const kilnShelf = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.05, 1.7),
    new THREE.MeshBasicMaterial({
      color: 0x6b2c10, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  kilnShelf.position.set(-14.05, CONE_SHELF_Y - 0.025, -25);
  kilnShelf.userData.lensOnly = 'ember';
  scene.add(kilnShelf);

  const coneMeshes = CONES.slice(0, 3).map((c, i) => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.28, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffaa66, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    // Pivot at the base: a cone bends over its foot, it does not spin about
    // its middle.
    cone.geometry.translate(0, 0.14, 0);
    cone.position.set(-14.05, CONE_SHELF_Y, -25.5 + i * 0.5);
    cone.userData.lensOnly = 'ember';
    cone.userData.coneNumber = c.number;
    cone.userData.temp = c.temp;
    scene.add(cone);

    // The stamped number, facing the door.
    const lc = document.createElement('canvas');
    lc.width = 64; lc.height = 64;
    const lg = lc.getContext('2d');
    lg.fillStyle = '#000';
    lg.fillRect(0, 0, 64, 64);
    lg.fillStyle = '#ffb877';
    lg.font = 'bold 46px "IBM Plex Mono", monospace';
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    lg.fillText(`${c.number}`, 32, 35);
    const ltex = new THREE.CanvasTexture(lc);
    ltex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.17),
      new THREE.MeshBasicMaterial({
        map: ltex, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    // Above the cone, not beside it: a cone that has gone over should leave
    // its number standing so you can still tell which one fell.
    label.position.set(-13.95, CONE_SHELF_Y + 0.42, -25.5 + i * 0.5);
    label.rotation.y = Math.PI / 2;
    label.userData.lensOnly = 'ember';
    scene.add(label);

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
  gauge.rotation.y = Math.PI / 2;
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
  // A bench east of the kiln, in the clear floor between it and the wall.
  // The kiln log and the safety tape were both sitting at y 1.05 in the middle
  // of an empty room with nothing under them — floating a metre off the tiles.
  kit.table(-10.5, 0, -27.5, { width: 2.0, depth: 0.8 });

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
    label: () => (state.kilnFiring ? 'Close the gas valve' : 'Open the gas valve — fire the kiln'),
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
    objective: 'Fire the kiln to cone 6. Watch the cones, not the gauge.',
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
      // ~85 seconds from cold to cone 7, which is enough time to read the
      // cones but not so much that it is boring — and, crucially, the climb
      // flattens out at the top the way a real kiln's does.
      //
      // At a flat 17.5 degrees a second the whole window between cone 6 going
      // over (1222) and cone 7 going over (1240) was one second wide. That is
      // a reaction test, not a puzzle: the player who is doing exactly the
      // right thing — watching the cones rather than the dial — still loses
      // the load because they were half a second late on the valve. Slowing
      // the last stretch turns it into about six seconds, which is time to
      // see it happen and decide.
      const t0 = state.kilnTemp;
      const rate = t0 < 1100 ? 17.5 : t0 < 1200 ? 9 : 3.2;
      state.kilnTemp = Math.min(1400, t0 + dt * rate);
    } else if (!state.kilnFiring && state.kilnTemp > 20) {
      state.kilnTemp = Math.max(20, state.kilnTemp - dt * 26);
    }

    const t = state.kilnTemp;
    const glow = clamp((t - 300) / 1000, 0, 1);
    // Deliberately dim. The haze is additive and fills most of the chamber,
    // so at the old 0.12 + glow * 0.7 it saturated to a flat orange slab with
    // the cones invisible inside it — which mattered not at all while the
    // steel hid the whole thing, and matters entirely now that Ember sees
    // through it. The cones are the instrument; everything else is context.
    kilnHeat.material.opacity = 0.05 + glow * 0.2;
    kilnHeat.material.color.setHSL(lerp(0.08, 0.02, glow), 1, lerp(0.3, 0.55, glow));
    kilnLight.intensity = glow * 14;
    // The chamber walls hold the heat too, so the x-ray shell brightens with
    // the load rather than sitting at a constant dull red.
    kilnGhost.material.color.setHSL(lerp(0.07, 0.03, glow), 1, lerp(0.04, 0.14, glow));
    kilnEdges.material.opacity = 0.2 + glow * 0.3;

    // Cones slump as they reach temperature. A cone bends over about 10°
    // before its rating and is fully down at it — which is what the player
    // watches for.
    coneMeshes.forEach((cone) => {
      const bend = clamp((t - (cone.userData.temp - 20)) / 20, 0, 1);
      // About X, so the cone tips across the player's view. Bending about Z
      // tipped it straight toward the door, where a cone at 45 degrees and a
      // cone standing up look identical.
      cone.rotation.x = bend * Math.PI * 0.48;
      cone.material.color.setHSL(lerp(0.1, 0.05, glow), 1, lerp(0.5, 0.9, glow));
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
    width: 26, depth: 16, height: 11, x: -13, z: -38,
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
  placeNote(scene, interaction, reader, save, 'ch2-note-kiln', new THREE.Vector3(-11.0, 0.85, -27.62), -0.4);
  placeNote(scene, interaction, reader, save, 'ch2-note-hands', new THREE.Vector3(-1.5, 0.92, -22.4), 0.8);
  placeNote(scene, interaction, reader, save, 'ch2-note-resignation', new THREE.Vector3(4, 0.9, 2.5), -0.2);

  placeStub(scene, interaction, reader, save, 'ch2-stub-1', new THREE.Vector3(-8.2, 0.05, 5.4));
  placeStub(scene, interaction, reader, save, 'ch2-stub-2', new THREE.Vector3(-16.6, 0.05, -23.2));
  placeStub(scene, interaction, reader, save, 'ch2-stub-3', new THREE.Vector3(-22.4, 1.05, -43));

  placeTape(scene, interaction, reader, save, 'ch2-tape-safety', new THREE.Vector3(-10.0, 0.86, -27.4));

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

    /** What caught them, so the jumpscare frames the right thing. */
    subjectFor(cause) {
      return cause === 'tangle' ? tangle.root : null;
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
  // On the kiln room's SOUTH wall, beside the kiln, at reading height.
  //
  // It used to sit at x = -13.3, which is not a wall — the room's walls are at
  // x = -19 and x = -7 — so it hung in the air off the side of the kiln where
  // a player sweeping the walls for a chart would never look.
  chart.position.set(-14.6, 1.75, -29.75);
  scene.add(chart);

  // Lit properly. It is the only clue that explains what a cone is.
  const l = new THREE.SpotLight(0xffe0b0, 30, 4.5, Math.PI / 5, 0.5, 2);
  l.position.set(-14.6, 2.9, -28.9);
  l.target.position.set(-14.6, 1.75, -29.7);
  l.castShadow = false;
  scene.add(l, l.target);
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
    // Collectibles are scattered on purpose and readable whenever you find
    // them; they are never a puzzle step. Tagged so sequencecheck does not
    // read "a note lying near the box-office counter" as the player having
    // broken into the chapter's second puzzle.
    collectible: true,
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
    // Collectibles are scattered on purpose and readable whenever you find
    // them; they are never a puzzle step. Tagged so sequencecheck does not
    // read "a note lying near the box-office counter" as the player having
    // broken into the chapter's second puzzle.
    collectible: true,
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
    // Collectibles are scattered on purpose and readable whenever you find
    // them; they are never a puzzle step. Tagged so sequencecheck does not
    // read "a note lying near the box-office counter" as the player having
    // broken into the chapter's second puzzle.
    collectible: true,
    onUse: () => {
      save.recordCollectible('tape', id);
      screen.material.emissiveIntensity = 3;
      reader.showTape(tape);
    },
  });
  return tv;
}

/** A tap's engraved label plate. */
function makeGlazePlate(text) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 84;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2520';
  g.fillRect(0, 0, 320, 84);
  g.strokeStyle = '#9a8d78';
  g.lineWidth = 3;
  g.strokeRect(7, 7, 306, 70);
  g.fillStyle = '#d8cdb4';
  g.font = 'bold 26px "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 160, 44);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(18,14,10,${Math.random() * 0.3})`;
    g.beginPath();
    g.arc(Math.random() * 320, Math.random() * 84, Math.random() * 8, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The works order pinned by the mixing bench.
 *
 * It gives the recipe in parts and paints the target colour beside it, so the
 * player has both the instruction and the thing to compare the pot against.
 * The colour is computed from the same function the pot uses, so the swatch
 * can never disagree with the answer.
 */
function makeWorksOrder(recipe, pigments, targetColour) {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 500;
  const g = c.getContext('2d');

  g.fillStyle = '#d8ccae';
  g.fillRect(0, 0, 400, 500);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(120,96,60,${Math.random() * 0.08})`;
    g.beginPath();
    g.arc(Math.random() * 400, Math.random() * 500, Math.random() * 20, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = '#2b1f16';
  g.textAlign = 'center';
  g.font = 'bold 25px Georgia, serif';
  g.fillText('WORKS ORDER 4471', 200, 48);
  g.font = 'italic 17px Georgia, serif';
  g.fillText('HOLLOWHART FLESH No. 3', 200, 76);

  g.strokeStyle = '#6a1f1c';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(44, 94); g.lineTo(356, 94); g.stroke();

  // The swatch.
  const hex = `#${targetColour.getHexString()}`;
  g.fillStyle = hex;
  g.fillRect(120, 112, 160, 96);
  g.strokeStyle = '#2b1f16';
  g.lineWidth = 3;
  g.strokeRect(120, 112, 160, 96);
  g.fillStyle = '#4a3a2a';
  g.font = '13px Georgia, serif';
  g.fillText('matched wet', 200, 228);

  // The recipe.
  g.textAlign = 'left';
  g.fillStyle = '#2b1f16';
  g.font = 'bold 19px Georgia, serif';
  g.fillText('PARTS BY VOLUME', 56, 274);
  g.font = '21px Georgia, serif';
  let y = 312;
  for (const [id, n] of Object.entries(recipe)) {
    if (!n) continue;
    g.fillStyle = `rgb(${pigments[id].rgb.map((v) => Math.round(v * 255)).join(',')})`;
    g.fillRect(56, y - 16, 20, 20);
    g.strokeStyle = '#2b1f16';
    g.lineWidth = 1.5;
    g.strokeRect(56, y - 16, 20, 20);
    g.fillStyle = '#2b1f16';
    g.fillText(`${n}`, 90, y);
    g.fillText(pigments[id].label, 122, y);
    y += 40;
  }

  g.textAlign = 'center';
  g.font = 'italic 14px Georgia, serif';
  g.fillStyle = '#6a1f1c';
  g.fillText('Bench was re-plumbed Feb. Nobody re-did', 200, 446);
  g.fillText('the handles. Check before you draw.', 200, 466);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
