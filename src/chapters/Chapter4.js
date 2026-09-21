/**
 * Chapter4.js — "Backstage"
 *
 * The landing → the pump room → the flooded hall → Odile's laboratory →
 * the cut stair → the Threadworks → the lift.
 *
 * Structure:
 *   P1  The Pumps       — fetch the wheel through deep water, then three valves
 *                         in the order the door card gives
 *   S   The Deep End    — Gloam, in thigh-deep water. Wading is loud and
 *                         crouching does not help, so the stealth vocabulary
 *                         from Chapter 3 is deliberately broken
 *   .   THE HOLLOW LENS — in Odile's desk
 *   P2  The Cut Stair   — cross a staircase that was removed in 1989 and is
 *                         only solid while you are wearing Hollow
 *   P3  The Warp        — thread four heads in the order the tags run
 *   P4  The Counterweight — close the sluice and re-flood the floor you spent
 *                         the chapter draining, to float the lift gate open
 *   C   The Understudy  — it walks, it never stops, and the water is rising
 *
 * The chapter's idea is that the water is the level design. Every space is two
 * spaces — one flooded and one drained — and almost every mechanic in it is
 * really a question about which of the two you are standing in.
 */

import * as THREE from 'three';
import { material } from '../world/Materials.js';
import { LevelKit } from '../world/LevelKit.js';
import { Gloam } from '../ai/Gloam.js';
import { Understudy } from '../ai/Understudy.js';
import { NOTES, TAPES, STUBS, RADIO } from './StoryContent.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/** Floor heights. Everything in the chapter hangs off these two numbers. */
const UPPER_Y = 0;
const LOWER_Y = -5;

/** Water surface heights, as depths above the lower floor. */
const DEPTH_FLOOD = 1.15;    // thigh: loud, slow, Gloam's element
const DEPTH_DRAINED = 0.16;  // ankle: quiet enough to think in
const DEPTH_SURGE = 1.75;    // the finale, and still rising

/**
 * The three pump valves, in the order the card on the door gives them.
 *
 * The wheel fits all three and they are mounted left to right in a different
 * order, so the puzzle is entirely about reading the labels rather than about
 * trying combinations — there are only six, and a puzzle a player can brute
 * force in under a minute is not a puzzle.
 */
const VALVE_ORDER = ['intake', 'return', 'sluice'];
const VALVE_LAYOUT = ['sluice', 'intake', 'return'];   // left to right on the wall

/**
 * The loom. Four heads, four spools, and four tags that give the order.
 *
 * `TAG_SEQUENCE` is the order the heads must be threaded in; the spools sit in
 * a different order again, so the answer is "read the tags, then look at which
 * spool feeds which head" rather than "try things".
 */
const TAG_SEQUENCE = [2, 0, 3, 1];

export function buildChapter4(ctx) {
  const { physics, engine, audio, music, save, puzzles, interaction, mask, flashlight, hud, reader } = ctx;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03060a);
  scene.fog = new THREE.FogExp2(0x050a0e, 0.030);

  const kit = new LevelKit({ scene, physics, engine, audio });
  const rng = makeRng(1989_4);

  kit.ambience({ strength: 0.85, sky: 0x1c2a34, ground: 0x060809 });

  // Continuity for players arriving via Chapter Select.
  if (!mask.owned) {
    mask.give();
    mask.unlockLens('threadlight');
  }
  for (const lens of ['ember', 'echo']) {
    if (!mask.unlocked.includes(lens)) mask.unlockLens(lens);
  }
  if (!flashlight.owned) flashlight.give({ battery: 0.5 });

  const state = {
    wheelTaken: false,
    valvesOpened: [],
    drained: false,
    hollowFound: false,
    stairCrossed: false,
    warp: [],
    warpDone: false,
    sluiceClosed: false,
    chaseStarted: false,
    chapterDone: false,
    /** Live water surface height, animated toward `waterTarget`. */
    waterY: LOWER_Y + DEPTH_FLOOD,
    waterTarget: LOWER_Y + DEPTH_FLOOD,
  };

  // ==========================================================================
  // WATER
  // ==========================================================================
  //
  // Flooded rooms are declared as rectangles rather than inferred from the
  // geometry, because "is the player in water" has to be answerable cheaply,
  // every frame, for the player and for anything hunting them — and a raycast
  // per query would be both slower and wrong (it would find the floor under a
  // walkway rather than the walkway).

  const FLOODED = [
    { x0: 1.5, x1: 10.5, z0: -18, z1: -4 },      // the foot of the stairwell
    { x0: -18, x1: 18, z0: -46, z1: -18 },       // the hall
    { x0: 18, x1: 34, z0: -39, z1: -25 },        // Odile's laboratory
    { x0: -28, x1: 12, z0: -86, z1: -56 },       // the Threadworks
    { x0: -14, x1: -2, z0: -96, z1: -86 },       // the lift lobby
  ];

  /** Depth of standing water at a world position, in metres. 0 when dry. */
  function waterAt(x, z, y = LOWER_Y) {
    // Anything standing above the surface is not in it, whatever the footprint
    // says — that is what keeps the gallery and the cut stair dry.
    if (y > state.waterY) return 0;
    for (const r of FLOODED) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        return Math.max(0, state.waterY - LOWER_Y);
      }
    }
    return 0;
  }

  // Deliberately NOT a MeshPhysicalMaterial with transmission.
  //
  // Real transmission needs three.js's separate transmissive pass, which
  // renders the scene again into its own target — and this game does not use
  // EffectComposer, it renders into targets it owns and keeps the depth
  // texture alive across the whole frame. The transmissive pass produced
  // nothing at all here: a surface that was in the scene, in the frustum, and
  // completely invisible. A plain semi-transparent standard material is both
  // robust and, at this light level, indistinguishable.
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a20,
    roughness: 0.09,
    metalness: 0.55,
    emissive: 0x06131a,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const waterPlanes = [];
  for (const r of FLOODED) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    // Segmented, so the ripple below has vertices to move.
    const geo = new THREE.PlaneGeometry(w, d, Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(d / 2)));
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((r.x0 + r.x1) / 2, state.waterY, (r.z0 + r.z1) / 2);
    mesh.renderOrder = 2;
    scene.add(mesh);
    waterPlanes.push({ mesh, base: geo.attributes.position.array.slice() });
  }

  kit.onUpdate((dt, t) => {
    // The surface moves toward its target slowly. A tank this size does not
    // change level in a second, and the slowness is the point during the
    // finale — you can watch it come up.
    state.waterY = damp(state.waterY, state.waterTarget, 0.55, dt);

    for (const { mesh, base } of waterPlanes) {
      mesh.position.y = state.waterY;
      const pos = mesh.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i];
        const y = base[i + 1];
        arr[i + 2] = base[i + 2]
          + Math.sin(t * 0.9 + x * 0.35) * 0.022
          + Math.sin(t * 1.37 + y * 0.28) * 0.016;
      }
      pos.needsUpdate = true;
    }
  });

  // ==========================================================================
  // LANDING — where Chapter 3 leaves you
  // ==========================================================================

  kit.room({
    width: 24, depth: 18, height: 5.5, x: 0, z: 5, y: UPPER_Y,
    floorMat: material('tileFloor', { repeat: 5 }),
    wallMat: material('wallPlaster', { repeat: 4 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'tile',
    openings: [
      { side: 's', at: 0, width: 2.0, top: 2.4 },     // in, from the stairs above
      { side: 'w', at: 0, width: 1.8, top: 2.4 },     // to the pump room
      { side: 'n', at: 6, width: 3.0, top: 2.8 },     // to the stairwell down
    ],
  });

  kit.practical(0, 4.6, 5, { intensity: 20, distance: 13, flicker: { chance: 0.5, severity: 0.85, seed: 201 } });
  kit.practical(-7, 4.6, 10, { intensity: 14, distance: 10, castShadow: false, flicker: { chance: 0.7, severity: 0.9, seed: 202 } });
  kit.dust(new THREE.Vector3(0, 2.6, 5), new THREE.Vector3(24, 5, 18), { count: 900, seed: 41 });

  // The spools they carried up here in 1989 and never carried back down.
  for (let i = 0; i < 14; i++) {
    const sx = -10 + (i % 7) * 0.9;
    const sz = 11.6 + Math.floor(i / 7) * 1.0;
    const spool = kit.box(0.7, 0.62, 0.7, sx, 0.31, sz,
      material('paintedWood', { color: 0x4b3a29 }), { surface: 'wood', rotY: rng() * 0.4, shadow: false });
    spool.userData.name = 'spool';
  }
  kit.shelving(11.4, 0, 2, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4, fill: 0.8 });
  kit.table(4.5, 0, 11.5, { width: 2.2, depth: 0.9 });

  // A tide mark, at the height the water reached in 1989 and stayed.
  for (const [w, d, x, z, rotY] of [
    [24, 0.09, 0, -4.1, 0], [24, 0.09, 0, 14.1, 0],
    [0.09, 18, -12.1, 5, 0], [0.09, 18, 12.1, 5, 0],
  ]) {
    kit.box(w, 0.09, d, x, 1.25, z,
      new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 1 }),
      { surface: 'tile', solid: false, shadow: false, rotY });
  }

  // ==========================================================================
  // THE STAIRWELL — down to the water
  // ==========================================================================

  kit.room({
    width: 9, depth: 14, height: 10.5, x: 6, z: -11, y: LOWER_Y,
    floorMat: material('tileFloor', { repeat: 3 }),
    wallMat: material('wallPlaster', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'tile',
    openings: [
      // Measured from this room's own floor at y = -5, so a sill of 5 is the
      // landing's floor at world y = 0. Getting this wrong is a doorway four
      // metres up a wall with nothing under it.
      { side: 's', at: 0, width: 3.0, sill: 5, top: 7.8 },
      { side: 'n', at: 0, width: 3.0, top: 2.8 },
    ],
  });

  // A slab at the top, because the doorway is at z = -4 and the first tread is
  // at -5.2: without this there is a metre of nothing to walk into.
  kit.box(3, 0.4, 1.4, 6, -0.2, -4.5, material('tileFloor', { repeat: 1 }), { surface: 'tile' });

  // Twenty treads down. A single straight flight rather than a switchback:
  // the player is about to be told the water is dangerous, and a straight run
  // lets them see the surface coming up at them the whole way down.
  const STEPS = 20;
  const RISE = 0.25;
  const GOING = 0.55;
  for (let i = 0; i < STEPS; i++) {
    const top = -RISE * (i + 1);
    const cz = -5.2 - GOING * i - GOING / 2;
    kit.box(3, 0.5, GOING, 6, top - 0.25, cz,
      material('tileFloor', { repeat: 1 }), { surface: 'tile', shadow: false });
  }

  // Handrail down the west side of the flight.
  for (let i = 0; i < 6; i++) {
    const cz = -5.6 - i * 1.9;
    const y = -RISE * (i * 3.45) - 0.4;
    kit.box(0.07, 1.0, 0.07, 4.6, y + 0.5, cz, material('rustedSteel', { repeat: 1 }),
      { surface: 'metal', shadow: false, solid: false });
  }

  kit.sconce(9.7, LOWER_Y + 6.4, -8, { rotY: -Math.PI / 2, intensity: 7, flicker: { chance: 0.6, severity: 0.9, seed: 203 } });
  kit.sconce(2.3, LOWER_Y + 3.0, -15, { rotY: Math.PI / 2, intensity: 6 });

  // ==========================================================================
  // PUZZLE 1 — The Pumps
  // ==========================================================================

  kit.room({
    width: 18, depth: 16, height: 5.5, x: -21, z: 5, y: UPPER_Y,
    floorMat: material('tileFloor', { repeat: 4 }),
    wallMat: material('wallPlasterClean', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'tile',
    openings: [{ side: 'e', at: 0, width: 1.8, top: 2.4 }],
  });

  kit.practical(-21, 4.6, 5, { intensity: 22, distance: 13, flicker: { chance: 0.3, severity: 0.6, seed: 204 } });
  kit.practical(-27, 4.6, 10, { intensity: 14, distance: 9, castShadow: false });
  kit.dust(new THREE.Vector3(-21, 2.4, 5), new THREE.Vector3(18, 5, 16), { count: 700, seed: 42 });

  // Three pump housings along the north wall, with pipework running between
  // them and up through the ceiling.
  for (let i = 0; i < 3; i++) {
    const px = -27 + i * 5;
    kit.box(2.2, 1.5, 1.4, px, 0.75, -1.2, material('rustedSteel', { repeat: 1 }),
      { surface: 'metal', tile: 0.9 });
    kit.box(0.34, 3.4, 0.34, px + 0.7, 3.2, -1.2, material('rustedSteel', { repeat: 1 }),
      { surface: 'metal', tile: 0.7, shadow: false });
  }
  // The manifold the three pipes run into.
  kit.box(12.5, 0.4, 0.4, -24.2, 4.6, -1.2, material('rustedSteel', { repeat: 1 }),
    { surface: 'metal', tile: 0.7, shadow: false, solid: false });

  const VALVE_INFO = {
    intake: { label: 'INTAKE', colour: 0x3f6f8a },
    return: { label: 'RETURN', colour: 0x8a6a3f },
    sluice: { label: 'SLUICE', colour: 0x6f8a3f },
  };

  const valves = [];
  VALVE_LAYOUT.forEach((id, i) => {
    const px = -26.5 + i * 5;
    const group = new THREE.Group();
    group.position.set(px, 1.65, -1.9);
    scene.add(group);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8),
      material('rustedSteel', { repeat: 1 })
    );
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 0.15;
    group.add(stem);

    // The square socket the wheel fits into. Empty until the wheel is found,
    // which is the whole reason the player has to go into the water.
    const socket = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 })
    );
    socket.position.z = 0.32;
    group.add(socket);

    // A painted plate. This is the clue: the card on the door gives an order
    // and these are not in it.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.3),
      new THREE.MeshStandardMaterial({ map: makeValvePlate(VALVE_INFO[id].label), roughness: 0.92 })
    );
    plate.position.set(0, 0.62, 0.04);
    group.add(plate);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x14100c, emissive: VALVE_INFO[id].colour, emissiveIntensity: 0.1, roughness: 0.4,
      })
    );
    lamp.position.set(0.44, 0.62, 0.06);
    group.add(lamp);

    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    valves.push({ id, group, lamp, open: false, wheel: null });
  });

  /** A hand wheel, built twice: once in the water, once on each valve. */
  function makeWheel() {
    const g = new THREE.Group();
    const brass = material('brass');
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.028, 8, 20), brass);
    g.add(rim);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.025), brass);
      spoke.rotation.z = (i * Math.PI) / 4;
      g.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10), brass);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // --- the wheel, on a bracket on the hall's west wall -----------------------
  //
  // Hung on the wall rather than left standing in open water: a wheel floating
  // half a metre from the nearest surface is the exact class of thing the
  // reachability check exists to catch, and it looks like a bug even when it
  // is reachable.
  const WHEEL_X = -17.5;
  kit.box(0.14, 0.44, 0.44, WHEEL_X - 0.26, LOWER_Y + 1.05, -40,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.5 });

  const loseWheel = makeWheel();
  loseWheel.position.set(WHEEL_X, LOWER_Y + 1.05, -40);
  loseWheel.rotation.y = Math.PI / 2;
  scene.add(loseWheel);

  // Through Threadlight it is the only brass thing still connected to anything.
  const wheelGlow = new THREE.PointLight(0x6fe3d4, 1.4, 4, 2);
  wheelGlow.position.copy(loseWheel.position);
  wheelGlow.userData.lensOnly = 'threadlight';
  scene.add(wheelGlow);

  interaction.register({
    object: loseWheel,
    reach: 2.2,
    label: 'Take the pump wheel',
    enabled: () => !state.wheelTaken,
    onUse: () => {
      state.wheelTaken = true;
      loseWheel.visible = false;
      wheelGlow.intensity = 0;
      interaction.unregister(loseWheel);
      audio?.leverClunk?.(loseWheel.position);
      hud.say('A pump wheel. It fits a square socket, and there are three of those upstairs.', { duration: 5 });
      puzzles.activate('ch4-pumps');
      // The wheel appears on every valve at once — the player is carrying it,
      // and making them re-fit it three times would be three interactions
      // that ask nothing.
      for (const v of valves) {
        v.wheel = makeWheel();
        v.wheel.position.set(0, 0, 0.36);
        v.wheel.rotation.y = 0;
        v.group.add(v.wheel);
      }
    },
  });

  /** Reset the sequence, loudly, so a wrong order is unmistakable. */
  function failValves(reason) {
    state.valvesOpened = [];
    for (const v of valves) {
      v.open = false;
      v.lamp.material.emissiveIntensity = 0.1;
    }
    state.waterTarget = LOWER_Y + DEPTH_FLOOD;
    audio?.staticBurst?.(0.5, 0.12);
    audio?.distantThud?.(new THREE.Vector3(-21, 1, -1.2));
    hud.say(reason, { duration: 5.5 });
  }

  for (const v of valves) {
    interaction.register({
      object: v.group,
      reach: 2.4,
      holdTime: 1.1,
      label: () => (v.open ? `${VALVE_INFO[v.id].label} — open` : `Open the ${VALVE_INFO[v.id].label.toLowerCase()} valve`),
      enabled: () => state.wheelTaken && !state.drained && !v.open,
      disabledLabel: () => (state.wheelTaken ? `${VALVE_INFO[v.id].label} valve` : 'The stem is bare — it needs a wheel'),
      onUse: () => {
        if (state.drained || v.open) return;

        const expected = VALVE_ORDER[state.valvesOpened.length];
        v.wheel && (v.wheel.userData.spin = true);
        audio?.leverClunk?.(v.group.position);

        if (v.id !== expected) {
          failValves(
            `Wrong order. The ${VALVE_INFO[v.id].label.toLowerCase()} line backs up and the hall takes it. Start again.`
          );
          return;
        }

        v.open = true;
        v.lamp.material.emissiveIntensity = 2.2;
        state.valvesOpened.push(v.id);

        if (state.valvesOpened.length < VALVE_ORDER.length) {
          hud.say(`${VALVE_INFO[v.id].label} open.`, { duration: 2.4 });
          return;
        }

        // All three, in order.
        state.drained = true;
        state.waterTarget = LOWER_Y + DEPTH_DRAINED;
        puzzles.solve('ch4-pumps');
        audio?.puzzleSolved?.();
        music.setMood('unease');
        hud.say('The sluice opens. Somewhere below you, a very large amount of water starts to leave.', { duration: 6 });
        setTimeout(() => {
          ctx.playRadio(RADIO['ch4-radio-2']);
          puzzles.activate('ch4-hollow');
        }, 4200);
      },
    });
  }

  kit.onUpdate((dt) => {
    for (const v of valves) {
      if (v.wheel?.userData.spin) {
        v.wheel.rotation.z += dt * 6;
        v.wheel.userData.spinTime = (v.wheel.userData.spinTime ?? 0) + dt;
        if (v.wheel.userData.spinTime > 1.1) {
          v.wheel.userData.spin = false;
          v.wheel.userData.spinTime = 0;
        }
      }
    }
  });

  // The card on the door: the whole answer, on the way in.
  {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.78),
      new THREE.MeshStandardMaterial({ map: makeOrderCard(), roughness: 0.95, side: THREE.DoubleSide })
    );
    card.position.set(-12.25, 1.72, 3.4);
    card.rotation.y = -Math.PI / 2;
    scene.add(card);

    const cardLight = new THREE.SpotLight(0xffe0b0, 26, 4, Math.PI / 5, 0.55, 2);
    cardLight.position.set(-13.4, 3.2, 3.4);
    cardLight.target.position.set(-12.3, 1.7, 3.4);
    scene.add(cardLight, cardLight.target);
  }

  puzzles.register({
    id: 'ch4-pumps',
    name: 'The Pumps',
    objective: 'Get the water down.',
    marker: new THREE.Vector3(-24, 2, -1.5),
    hints: [
      'The pumps still have power; what they do not have is a handle. There is a wheel hanging on a bracket on the west wall of the flooded hall, and it fits all three stems.',
      'The order matters and it is written down. There is a card wired to the pump room door — read it before you touch anything.',
      'Intake, then return, then sluice. They are not mounted in that order: left to right the wall reads SLUICE, INTAKE, RETURN, so the sequence is middle, right, left.',
    ],
  });

  // ==========================================================================
  // THE FLOODED HALL — and Gloam
  // ==========================================================================

  const HALL = { x: 0, z: -32, w: 36, d: 28, h: 8 };
  kit.room({
    width: HALL.w, depth: HALL.d, height: HALL.h, x: HALL.x, z: HALL.z, y: LOWER_Y,
    floorMat: material('tileFloor', { repeat: 7 }),
    wallMat: material('wallPlaster', { repeat: 5 }),
    ceilMat: material('ceiling', { repeat: 4 }),
    surface: 'tile',
    openings: [
      { side: 's', at: 6, width: 3.0, top: 2.8 },
      { side: 'e', at: 0, width: 2.0, top: 2.4 },
      // The cut stair's doorway: four metres up a wall with nothing under it.
      { side: 'n', at: -8, width: 2.4, sill: 4.2, top: 6.6 },
    ],
  });

  kit.dust(new THREE.Vector3(HALL.x, LOWER_Y + 3, HALL.z), new THREE.Vector3(36, 7, 28), { count: 1200, seed: 43 });

  // Columns down the middle. They are what makes the hall navigable in the
  // dark, what the Understudy has to come around, and what the player hides
  // behind while Gloam casts about.
  for (let i = 0; i < 6; i++) {
    const cx = -12 + (i % 3) * 12;
    const cz = -26 - Math.floor(i / 3) * 12;
    kit.box(1.1, HALL.h, 1.1, cx, LOWER_Y + HALL.h / 2, cz,
      material('wallPlaster', { repeat: 1 }), { surface: 'tile', tile: 2.2 });
  }

  // Emergency lighting only: cold, sparse, and reflected off the water.
  for (const [lx, lz] of [[-14, -22], [14, -22], [-14, -42], [14, -42], [0, -32]]) {
    const l = new THREE.PointLight(0x9fd0c8, 9, 15, 2);
    l.position.set(lx, LOWER_Y + 6.2, lz);
    scene.add(l);
    const fitting = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.16, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x1a201f, emissive: 0x9fd0c8, emissiveIntensity: 1.2, roughness: 0.5,
      })
    );
    fitting.position.set(lx, LOWER_Y + 6.3, lz);
    scene.add(fitting);
  }

  // Floating debris, which is also the clearest read on the water level: when
  // it settles onto the tiles, the hall has drained.
  const flotsam = [];
  for (let i = 0; i < 22; i++) {
    const fx = randRange(-16, 16);
    const fz = randRange(-44, -20);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(randRange(0.3, 0.9), 0.14, randRange(0.3, 0.8)),
      material('paintedWood', { color: rng() > 0.5 ? 0x3c2e20 : 0x2a2a24 })
    );
    mesh.position.set(fx, state.waterY, fz);
    mesh.rotation.y = rng() * Math.PI;
    scene.add(mesh);
    flotsam.push({ mesh, phase: rng() * Math.PI * 2, restY: LOWER_Y + 0.08 });
  }

  kit.onUpdate((dt, t) => {
    for (const f of flotsam) {
      const floatY = state.waterY - 0.04 + Math.sin(t * 0.8 + f.phase) * 0.03;
      f.mesh.position.y = Math.max(f.restY, floatY);
      f.mesh.rotation.z = Math.sin(t * 0.5 + f.phase) * 0.05;
    }
  });

  const gloam = new Gloam({
    scene, physics, engine, audio, music,
    player: null,
    hearingRange: 26,
    patrol: [
      new THREE.Vector3(-13, LOWER_Y + 0.5, -24),
      new THREE.Vector3(13, LOWER_Y + 0.5, -26),
      new THREE.Vector3(12, LOWER_Y + 0.5, -42),
      new THREE.Vector3(-14, LOWER_Y + 0.5, -41),
    ],
  });
  gloam.on('caught', () => ctx.onPlayerCaught('gloam'));

  // Footsteps are the only thing it knows about. Water multiplies them, which
  // is applied on the player rather than here so that anything else that makes
  // noise in water is loud too.
  ctx.onFootstep = (info) => {
    if (gloam.enabled) gloam.hear(info.position, info.loudness);
  };

  kit.trigger({
    x: 6, z: -19.5, y: LOWER_Y + 1.5, width: 3.4, depth: 3,
    onEnter: () => {
      ctx.checkpoint('ch4-hall');
      if (state.drained) return;
      gloam.start();
      music.setMood('tension');
      hud.say('Thigh-deep, and every step you take is the loudest thing on this floor.', { duration: 5.5 });
    },
  });

  // ==========================================================================
  // ODILE'S LABORATORY — the Hollow lens
  // ==========================================================================

  const LAB = { x: 26, z: -32, w: 16, d: 14, h: 4.8 };
  kit.room({
    width: LAB.w, depth: LAB.d, height: LAB.h, x: LAB.x, z: LAB.z, y: LOWER_Y,
    floorMat: material('tileFloor', { repeat: 4 }),
    wallMat: material('wallPlasterClean', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'tile',
    openings: [{ side: 'w', at: 0, width: 2.0, top: 2.4 }],
  });

  kit.practical(LAB.x, LOWER_Y + 4.0, LAB.z, { intensity: 16, distance: 11, flicker: { chance: 0.35, severity: 0.7, seed: 205 } });
  kit.sconce(LAB.x + 7.6, LOWER_Y + 2.6, LAB.z - 4, { rotY: -Math.PI / 2, intensity: 7 });

  // Her desk, her drawers, and a wall of drawings of the building that do not
  // match the building.
  const desk = kit.table(LAB.x + 3.5, LOWER_Y, LAB.z + 3.5, { width: 2.4, depth: 1.1, height: 0.82, rotY: 0.2 });
  kit.shelving(LAB.x - 6.6, LOWER_Y, LAB.z, { width: 5, height: 2.6, rotY: Math.PI / 2, shelves: 5, fill: 0.9 });
  kit.table(LAB.x, LOWER_Y, LAB.z - 5.2, { width: 3.0, depth: 1.0 });

  for (let i = 0; i < 4; i++) {
    const plan = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.66),
      new THREE.MeshStandardMaterial({ map: makeBluePrint(i), roughness: 0.95, side: THREE.DoubleSide })
    );
    plan.position.set(LAB.x - 4 + i * 2.6, LOWER_Y + 2.1, LAB.z - 6.85);
    scene.add(plan);
  }

  const hollowCase = new THREE.Group();
  {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.18), material('feltDark'));
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.054, 0.012, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0x2a3140, roughness: 0.05, metalness: 0.1,
        transmission: 0.7, thickness: 0.012, ior: 1.7,
        transparent: true, opacity: 0.9,
        emissive: 0x141a26, emissiveIntensity: 1.2,
      })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.y = 0.05;
    box.add(lens);
    hollowCase.add(box);
  }
  hollowCase.position.set(LAB.x + 3.5, LOWER_Y + 0.88, LAB.z + 3.5);
  hollowCase.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(hollowCase);

  const hollowGlow = new THREE.PointLight(0x5a6c88, 2.0, 3.4, 2);
  hollowGlow.position.set(LAB.x + 3.5, LOWER_Y + 1.02, LAB.z + 3.5);
  scene.add(hollowGlow);

  puzzles.register({
    id: 'ch4-hollow',
    name: 'The Fourth Lens',
    objective: 'Find the Hollow lens.',
    marker: new THREE.Vector3(LAB.x + 3.5, LOWER_Y + 1, LAB.z + 3.5),
    hints: [
      'She kept it. Whatever else is down here, the one room that was hers is the one worth searching.',
      'The laboratory is through the east wall of the hall. The lens is in its case, on her desk.',
      'East door out of the flooded hall, then the desk in the far right corner. Open the case, and cycle to Hollow with Q or R.',
    ],
  });

  interaction.register({
    object: hollowCase,
    reach: 2.2,
    label: 'Open the lens case',
    enabled: () => !state.hollowFound,
    onUse: () => {
      state.hollowFound = true;
      mask.unlockLens('hollow');
      hollowCase.visible = false;
      hollowGlow.intensity = 0;
      interaction.unregister(hollowCase);
      puzzles.solve('ch4-hollow');
      hud.say('The glass is not dark. It is showing you something, and it is somewhere else.', { duration: 5 });
      setTimeout(() => puzzles.activate('ch4-stair'), 2200);
    },
  });

  // ==========================================================================
  // PUZZLE 2 — The Cut Stair
  // ==========================================================================
  //
  // A flight that was cut out of the building in 1989 and left exactly where
  // it was. It is solid only while the player is wearing Hollow, which is the
  // most expensive lens in the game — so the puzzle is not "can you see it"
  // but "can you get across before the mask tears itself off you".
  //
  // The colliders are toggled rather than always present. A permanently solid
  // invisible staircase would let a player cross it blind on their second
  // attempt, which throws away the one moment the lens exists for.

  const cutStair = [];
  {
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x8fa6c4,
      emissive: 0x2a3950,
      emissiveIntensity: 1.5,
      roughness: 0.7,
      transparent: true,
      opacity: 0.62,
    });

    const TREADS = 14;
    for (let i = 0; i < TREADS; i++) {
      const top = LOWER_Y + (4.2 / TREADS) * (i + 1);
      const cz = -34.5 - i * 0.62;
      const mesh = kit.box(2.2, 0.16, 0.62, -8, top - 0.08, cz, ghostMat,
        { surface: 'wood', shadow: false });
      mesh.userData.lensOnly = 'hollow';
      cutStair.push(mesh);
    }

    // A landing at the top, in front of the doorway.
    const pad = kit.box(2.4, 0.16, 1.6, -8, LOWER_Y + 4.12, -45.2, ghostMat, { surface: 'wood', shadow: false });
    pad.userData.lensOnly = 'hollow';
    cutStair.push(pad);
  }

  /** Solid only while Hollow is being worn. */
  let stairSolid = false;
  function setStairSolid(on) {
    if (on === stairSolid) return;
    stairSolid = on;
    for (const mesh of cutStair) {
      physics.setColliderEnabled(mesh.userData.physics, on);
    }
  }
  setStairSolid(false);

  puzzles.register({
    id: 'ch4-stair',
    name: 'The Cut Stair',
    objective: 'Reach the gallery, four metres up the north wall.',
    marker: new THREE.Vector3(-8, LOWER_Y + 2.5, -40),
    hints: [
      'There is a doorway in the north wall of the hall with nothing under it. There was a staircase there until 1989. It was never taken away — it was only removed.',
      'Hollow shows you the building as it was drawn. Put the mask on with the fourth lens and look at the north wall.',
      'Wear Hollow, walk up, and keep walking. The lens burns Strain about four times as fast as the others, so do not stop halfway to admire it — if the mask tears off while you are up there, you fall.',
    ],
  });

  kit.trigger({
    x: -8, z: -45.4, y: LOWER_Y + 5, width: 2.2, depth: 1.8,
    onEnter: () => {
      if (state.stairCrossed) return;
      state.stairCrossed = true;
      ctx.checkpoint('ch4-gallery');
      puzzles.solve('ch4-stair');
      audio?.puzzleSolved?.();
      gloam.stop();
      hud.say('Solid ground. Behind you, the stair is not there any more.', { duration: 4.5 });
      setTimeout(() => puzzles.activate('ch4-warp'), 2400);
    },
  });

  // ==========================================================================
  // THE GALLERY — and the sluice control
  // ==========================================================================

  const GAL = { x: -8, z: -51, w: 20, d: 10, h: 4.5, y: -0.8 };
  kit.room({
    width: GAL.w, depth: GAL.d, height: GAL.h, x: GAL.x, z: GAL.z, y: GAL.y,
    floorMat: material('stageFloor', { repeat: 4 }),
    wallMat: material('wallPlasterClean', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'wood',
    openings: [
      { side: 's', at: 0, width: 2.4, top: 2.4 },
      { side: 'n', at: 0, width: 2.4, top: 2.4 },
    ],
  });

  kit.practical(GAL.x, GAL.y + 3.8, GAL.z, { intensity: 14, distance: 10, flicker: { chance: 0.4, severity: 0.8, seed: 206 } });
  kit.sconce(GAL.x - 9.6, GAL.y + 2.4, GAL.z, { rotY: Math.PI / 2, intensity: 6 });
  kit.shelving(GAL.x + 8.4, GAL.y, GAL.z, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4, fill: 0.7 });

  // The sluice control: a lever on the gallery rail overlooking the hall.
  const sluice = new THREE.Group();
  sluice.position.set(GAL.x + 5.5, GAL.y + 0.9, GAL.z + 4.2);
  scene.add(sluice);
  {
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.34),
      material('rustedSteel', { repeat: 1 })
    );
    housing.position.y = 0.05;
    sluice.add(housing);
    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.62, 0.07),
      material('brass')
    );
    lever.position.set(0, 0.62, 0.1);
    lever.rotation.x = -0.6;
    sluice.add(lever);
    sluice.userData.lever = lever;
    sluice.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  const sluiceLight = new THREE.PointLight(0x9fd0c8, 1.6, 3.5, 2);
  sluiceLight.position.set(GAL.x + 5.5, GAL.y + 1.6, GAL.z + 4.2);
  scene.add(sluiceLight);

  // ==========================================================================
  // PUZZLE 3 — The Warp
  // ==========================================================================

  const TW = { x: -8, z: -71, w: 40, d: 30, h: 10 };
  kit.room({
    width: TW.w, depth: TW.d, height: TW.h, x: TW.x, z: TW.z, y: LOWER_Y,
    floorMat: material('tileFloor', { repeat: 8 }),
    wallMat: material('wallPlaster', { repeat: 6 }),
    ceilMat: material('ceiling', { repeat: 5 }),
    surface: 'tile',
    openings: [
      { side: 's', at: 0, width: 2.4, sill: 4.2, top: 6.6 },
      { side: 'n', at: 0, width: 2.4, top: 2.6 },
    ],
  });

  kit.dust(new THREE.Vector3(TW.x, LOWER_Y + 4, TW.z), new THREE.Vector3(40, 9, 30), { count: 1500, seed: 44 });

  // The steel stair down from the gallery doorway to the floor.
  for (let i = 0; i < 17; i++) {
    const top = LOWER_Y + 4.2 - (4.2 / 17) * (i + 1);
    const cz = -56.8 - i * 0.6;
    kit.box(2.2, 0.5, 0.6, TW.x, top - 0.25, cz,
      material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.9, shadow: false });
  }
  kit.box(2.4, 0.4, 1.6, TW.x, LOWER_Y + 4.0, -56.0,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.9 });

  // Cold overhead light in a very tall room: it should feel like a cathedral
  // that someone put machinery in.
  for (const [lx, lz] of [[-22, -62], [6, -62], [-22, -80], [6, -80], [TW.x, -71]]) {
    const l = new THREE.PointLight(0x9fd0c8, 12, 20, 2);
    l.position.set(lx, LOWER_Y + 8.4, lz);
    scene.add(l);
    const fitting = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.24),
      new THREE.MeshStandardMaterial({
        color: 0x1a201f, emissive: 0x9fd0c8, emissiveIntensity: 1.1, roughness: 0.5,
      })
    );
    fitting.position.set(lx, LOWER_Y + 8.5, lz);
    scene.add(fitting);
  }

  // --- the spool wall -------------------------------------------------------
  //
  // Instanced: four hundred spools is the image the whole chapter has been
  // pointing at, and four hundred meshes is four hundred draw calls.
  {
    const COLS = 26;
    const ROWS = 14;
    const COUNT = COLS * ROWS;
    const spoolGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.3, 8);
    const spools = new THREE.InstancedMesh(
      spoolGeo, material('paintedWood', { color: 0x6b5238 }), COUNT
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    const one = new THREE.Vector3(1, 1, 1);
    let i = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        m.compose(
          new THREE.Vector3(-26.6 + c * 1.5, LOWER_Y + 0.9 + r * 0.55, -85.4),
          q, one
        );
        spools.setMatrixAt(i++, m);
      }
    }
    spools.instanceMatrix.needsUpdate = true;
    spools.castShadow = false;
    scene.add(spools);

    // The frame they sit in.
    for (let r = 0; r <= ROWS; r++) {
      kit.box(39, 0.07, 0.4, TW.x, LOWER_Y + 0.72 + r * 0.55, -85.4,
        material('rustedSteel', { repeat: 1 }), { surface: 'metal', solid: false, shadow: false });
    }
  }

  // --- the loom -------------------------------------------------------------
  const LOOM_X = TW.x;
  const LOOM_Z = -68;

  kit.box(9, 0.8, 2.6, LOOM_X, LOWER_Y + 0.4, LOOM_Z,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 1.1 });
  kit.box(9, 0.3, 0.3, LOOM_X, LOWER_Y + 3.4, LOOM_Z - 1.0,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', solid: false, shadow: false });

  const HEAD_COLOURS = [0xc23b2e, 0x3f8a6f, 0xc9a227, 0x6a5fb0];
  const HEAD_NAMES = ['RED', 'GREEN', 'AMBER', 'VIOLET'];

  const heads = [];
  for (let i = 0; i < 4; i++) {
    const hx = LOOM_X - 3.3 + i * 2.2;
    const group = new THREE.Group();
    group.position.set(hx, LOWER_Y + 0.8, LOOM_Z);
    scene.add(group);

    // A threading head: a spindle, an eye, and a hook. It is machinery, but it
    // is machinery shaped like something waiting to be fed.
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 1.5, 10),
      material('rustedSteel', { repeat: 1 })
    );
    post.position.y = 0.75;
    group.add(post);

    const eye = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.03, 8, 16),
      material('brass')
    );
    eye.position.y = 1.55;
    group.add(eye);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x14100c, emissive: HEAD_COLOURS[i], emissiveIntensity: 0.15, roughness: 0.4,
      })
    );
    lamp.position.set(0, 1.9, 0);
    group.add(lamp);

    // The tag. This is the clue, and it is readable from a metre away.
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.24),
      new THREE.MeshStandardMaterial({
        map: makeLoomTag(HEAD_NAMES[i], TAG_SEQUENCE.indexOf(i) + 1),
        roughness: 0.94, side: THREE.DoubleSide,
      })
    );
    tag.position.set(0, 1.2, 0.2);
    group.add(tag);

    // Through Threadlight, the thread that would run from this head to its
    // spool — which is how the player confirms a head before committing.
    const thread = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 17, 5),
      new THREE.MeshBasicMaterial({
        color: HEAD_COLOURS[i], transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    thread.position.set(0, 1.55, -8.6);
    thread.rotation.x = Math.PI / 2;
    thread.userData.lensOnly = 'threadlight';
    group.add(thread);

    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    heads.push({ index: i, group, lamp, threaded: false });
  }

  function failWarp() {
    state.warp = [];
    for (const h of heads) {
      h.threaded = false;
      h.lamp.material.emissiveIntensity = 0.15;
    }
    audio?.staticBurst?.(0.4, 0.1);
    hud.say('The head takes the thread and keeps it. The whole warp has to be drawn back.', { duration: 5 });
  }

  for (const h of heads) {
    interaction.register({
      object: h.group,
      reach: 2.4,
      holdTime: 0.9,
      label: () => (h.threaded ? `${HEAD_NAMES[h.index]} — threaded` : `Thread the ${HEAD_NAMES[h.index].toLowerCase()} head`),
      enabled: () => !state.warpDone && !h.threaded,
      onUse: () => {
        if (state.warpDone || h.threaded) return;

        const expected = TAG_SEQUENCE[state.warp.length];
        if (h.index !== expected) { failWarp(); return; }

        h.threaded = true;
        h.lamp.material.emissiveIntensity = 2.4;
        state.warp.push(h.index);
        audio?.leverClunk?.(h.group.position);

        if (state.warp.length < TAG_SEQUENCE.length) {
          hud.say(`${HEAD_NAMES[h.index]} threaded. ${TAG_SEQUENCE.length - state.warp.length} to go.`, { duration: 2.6 });
          return;
        }

        state.warpDone = true;
        puzzles.solve('ch4-warp');
        audio?.puzzleSolved?.();
        hud.say('The loom takes up. Above the lift, a counterweight moves for the first time in ten years — and stops, because it is sitting on the floor of a drained tank.', { duration: 8 });
        setTimeout(() => puzzles.activate('ch4-counterweight'), 5000);
      },
    });
  }

  puzzles.register({
    id: 'ch4-warp',
    name: 'The Warp',
    objective: 'Thread the loom.',
    marker: new THREE.Vector3(LOOM_X, LOWER_Y + 1.6, LOOM_Z),
    hints: [
      'The four heads take thread in a set order, and it is not left to right. Each one has a tag wired to it.',
      'Read all four tags before you touch anything. The number on the tag is the position in the warp, not the position on the bench.',
      'Amber first, then red, then violet, then green. Thread them in that order and the loom takes up.',
    ],
  });

  // ==========================================================================
  // PUZZLE 4 — The Counterweight
  // ==========================================================================
  //
  // The inversion the chapter is built toward: the water the player has spent
  // the whole level getting rid of is the only thing that can float the lift
  // gate open, so the last puzzle is undoing the first one. It is also what
  // wakes the thing in the tank, which is why it is the last thing they do.

  const LIFT = { x: -8, z: -91, w: 12, d: 10, h: 6 };
  kit.room({
    width: LIFT.w, depth: LIFT.d, height: LIFT.h, x: LIFT.x, z: LIFT.z, y: LOWER_Y,
    floorMat: material('tileFloor', { repeat: 3 }),
    wallMat: material('wallPlasterClean', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'tile',
    openings: [{ side: 's', at: 0, width: 2.4, top: 2.6 }],
  });

  kit.practical(LIFT.x, LOWER_Y + 5.0, LIFT.z, { intensity: 18, distance: 10, flicker: { chance: 0.5, severity: 0.9, seed: 207 } });

  // The lift car, behind a gate that is currently down.
  const liftCar = kit.box(3.6, 3.0, 3.0, LIFT.x, LOWER_Y + 1.5, LIFT.z - 3.2,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 1.0, solid: false });
  liftCar.visible = false;   // it is behind the gate; the gate is the object

  const liftGate = kit.box(3.4, 2.8, 0.18, LIFT.x, LOWER_Y + 1.4, LIFT.z - 4.6,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.8 });

  const liftLight = new THREE.PointLight(0xffb066, 0, 6, 2);
  liftLight.position.set(LIFT.x, LOWER_Y + 2.4, LIFT.z - 3.4);
  scene.add(liftLight);

  // The counterweight tank, visible through a grille beside the gate: the
  // player can watch the water come up it.
  const cwTank = kit.box(1.6, 5.4, 1.2, LIFT.x + 4.2, LOWER_Y + 2.7, LIFT.z - 3.6,
    new THREE.MeshPhysicalMaterial({
      color: 0x2a3138, roughness: 0.2, metalness: 0.1,
      transmission: 0.6, thickness: 0.3, transparent: true, opacity: 0.4,
    }), { surface: 'metal', solid: false, shadow: false });

  const counterweight = kit.box(1.1, 0.9, 0.8, LIFT.x + 4.2, LOWER_Y + 0.45, LIFT.z - 3.6,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.6, solid: false });

  interaction.register({
    object: sluice,
    reach: 2.4,
    holdTime: 1.6,
    label: () => (state.sluiceClosed ? 'The sluice is shut' : 'Close the sluice'),
    enabled: () => state.warpDone && !state.sluiceClosed,
    disabledLabel: () => (state.warpDone ? 'The sluice is shut' : 'The sluice gate — open'),
    onUse: () => {
      if (state.sluiceClosed) return;
      state.sluiceClosed = true;
      state.drained = false;
      state.waterTarget = LOWER_Y + DEPTH_SURGE;
      sluice.userData.lever.rotation.x = 0.6;
      audio?.leverClunk?.(sluice.position);
      puzzles.solve('ch4-counterweight');
      hud.say('The gate drops. Everything you drained starts coming back.', { duration: 5 });
      ctx.playRadio(RADIO['ch4-radio-3']);
      startChase();
    },
  });

  puzzles.register({
    id: 'ch4-counterweight',
    name: 'The Counterweight',
    objective: 'Get the lift gate open.',
    marker: new THREE.Vector3(GAL.x + 5.5, GAL.y + 1.4, GAL.z + 4.2),
    hints: [
      'The winch works and the gate does not move, because the counterweight is sitting on the bottom of an empty tank. It is not a weight. It is a float.',
      'You emptied the tank yourself. The lever that did it is on the gallery rail, overlooking the hall.',
      'Go back up to the gallery and close the sluice. The floor floods again, the counterweight lifts, and the gate goes up — and then get to the lift, because you will not be alone down here.',
    ],
  });

  kit.onUpdate((dt) => {
    // The counterweight floats, and the gate rises with it. One number drives
    // the tank, the gate and the light, so they can never disagree.
    const rise = clamp((state.waterY - (LOWER_Y + DEPTH_DRAINED)) / (DEPTH_SURGE - DEPTH_DRAINED), 0, 1);
    counterweight.position.y = LOWER_Y + 0.45 + rise * 3.6;
    liftGate.position.y = LOWER_Y + 1.4 + rise * 2.9;
    liftLight.intensity = rise * 6;
    // The collider is toggled in update() instead of here, and only when it
    // actually changes: setColliderEnabled refreshes Rapier's scene queries,
    // and doing that on every frame would rebuild the broad phase sixty times
    // a second for a gate that moves once.
  });

  // ==========================================================================
  // THE CHASE — the Understudy
  // ==========================================================================

  const understudy = new Understudy({
    scene, physics, engine, audio, music,
    player: null,
    spawn: new THREE.Vector3(TW.x + 14, LOWER_Y, -60),
    waterAt: (x, z) => waterAt(x, z),
  });
  understudy.on('caught', () => ctx.onPlayerCaught('understudy'));

  function startChase() {
    if (state.chaseStarted) return;
    state.chaseStarted = true;
    ctx.checkpoint('ch4-chase');
    gloam.stop();
    understudy.start();
    music.setMood('chase');
    engine.postfx.fx.chromaBoost = 0.35;
    hud.say('Something comes down the stair from the gallery. It is in no hurry at all.', { duration: 5 });
  }

  kit.trigger({
    x: LIFT.x, z: LIFT.z - 3.4, y: LOWER_Y + 1.4, width: 2.6, depth: 2.4,
    onEnter: () => {
      if (state.chapterDone) return;
      if (!state.sluiceClosed) return;   // the gate is still down
      state.chapterDone = true;
      understudy.stop();
      gloam.stop();
      music.setMood('silent');
      engine.postfx.fx.chromaBoost = 0;
      hud.say('The gate comes down behind you and the car starts to climb. Below, the water closes over the Threadworks.', { duration: 6 });
      setTimeout(() => ctx.completeChapter(4), 4200);
    },
  });

  // ==========================================================================
  // COLLECTIBLES
  // ==========================================================================

  placeNote(scene, interaction, reader, save, 'ch4-note-pumps', new THREE.Vector3(-11.0, 0.03, 4.4), -1.2);
  placeNote(scene, interaction, reader, save, 'ch4-note-water', new THREE.Vector3(4.6, 0.85, 11.4), 0.4);
  placeNote(scene, interaction, reader, save, 'ch4-note-stair', new THREE.Vector3(GAL.x - 6.2, GAL.y + 0.05, GAL.z - 3.2), 0.7);
  placeNote(scene, interaction, reader, save, 'ch4-note-threadwork', new THREE.Vector3(LOOM_X + 3.2, LOWER_Y + 0.85, LOOM_Z + 1.0), -0.3);

  placeStub(scene, interaction, reader, save, 'ch4-stub-1', new THREE.Vector3(GAL.x + 7.6, GAL.y + 0.05, GAL.z + 3.1));
  placeStub(scene, interaction, reader, save, 'ch4-stub-2', new THREE.Vector3(LAB.x + 3.5, LOWER_Y + 0.86, LAB.z + 3.0));

  placeTape(scene, interaction, reader, save, 'ch4-tape-threadworks', new THREE.Vector3(LAB.x - 2.4, LOWER_Y + 0.05, LAB.z - 5.0));

  // ==========================================================================
  // SCRIPTING
  // ==========================================================================

  puzzles.activate('ch4-pumps');

  kit.trigger({
    x: 0, z: 9, y: 1.5, width: 6, depth: 3,
    onEnter: () => {
      ctx.playRadio(RADIO['ch4-radio-1']);
      music.setMood('unease');
    },
  });

  // ==========================================================================

  let lastGateSolid = null;

  return {
    scene,
    kit,
    spawn: new THREE.Vector3(0, UPPER_Y + 1.2, 12),
    spawnYaw: 0,
    state,

    onPlayerReady(player) {
      gloam.player = player;
      understudy.player = player;
    },

    onRespawn() {
      understudy.reset();
      gloam.reset();
      engine.postfx.fx.chromaBoost = 0;

      if (state.chaseStarted && !state.chapterDone) {
        // Put the chase back to its opening conditions rather than dropping
        // the player back in beside whatever killed them.
        understudy.start();
        music.setMood('chase');
      } else if (!state.drained) {
        gloam.start();
        music.setMood('tension');
      } else {
        music.setMood('unease');
      }
    },

    update(dt, time, player) {
      kit.update(dt, time, player);

      // --- the water, as a thing the player is standing in -------------------
      const feet = player.position.y - 0.9;
      const depth = waterAt(player.position.x, player.position.z, feet);

      if (depth > 0.04) {
        // Wading is slow, and — this is the whole chapter — loud. Crouching
        // in half a metre of water is not quiet, so the Chapter 3 vocabulary
        // stops working and the player has to get out of the water instead.
        player.env.speedScale = clamp(1 - depth * 0.46, 0.4, 1);
        player.env.noiseScale = 1 + depth * 1.5;
        player.env.surface = 'water';
        player.env.waterDepth = depth;
        player.env.name = 'water';
      } else if (player.env.name === 'water') {
        player.env.speedScale = 1;
        player.env.noiseScale = 1;
        player.env.surface = null;
        player.env.waterDepth = 0;
        player.env.name = null;
      }

      // --- the cut stair -----------------------------------------------------
      setStairSolid(mask.active && mask.lens === 'hollow');

      // --- the lift gate -----------------------------------------------------
      const rise = clamp((state.waterY - (LOWER_Y + DEPTH_DRAINED)) / (DEPTH_SURGE - DEPTH_DRAINED), 0, 1);
      const gateSolid = rise < 0.82;
      if (gateSolid !== lastGateSolid) {
        lastGateSolid = gateSolid;
        physics.setColliderEnabled(liftGate.userData.physics, gateSolid);
      }

      if (gloam.enabled) gloam.update(dt, { maskHum: mask.hum });
      if (understudy.enabled) understudy.update(dt);
    },

    serialize: () => ({ ...state }),
    restore(data) { Object.assign(state, data ?? {}); },

    dispose() {
      gloam.dispose();
      understudy.dispose();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isLine) o.geometry?.dispose();
      });
    },
  };
}

/* ==========================================================================
   Painted surfaces
   ========================================================================== */

/** A stencilled valve plate: INTAKE / RETURN / SLUICE. */
function makeValvePlate(label) {
  const c = document.createElement('canvas');
  c.width = 312; c.height = 120;
  const g = c.getContext('2d');

  g.fillStyle = '#1d211f';
  g.fillRect(0, 0, 312, 120);
  g.strokeStyle = '#6f7d73';
  g.lineWidth = 4;
  g.strokeRect(8, 8, 296, 104);

  g.fillStyle = '#cfd8cf';
  g.font = 'bold 54px "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 156, 62);

  // Weathering, so it reads as painted metal rather than as a UI label.
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(20,26,22,${Math.random() * 0.35})`;
    g.beginPath();
    g.arc(Math.random() * 312, Math.random() * 120, Math.random() * 9, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The card wired to the pump room door.
 *
 * It gives the answer outright, in the order the valves have to be turned, and
 * then the valves are mounted in a different order on the wall. The puzzle is
 * noticing that those two facts are not the same fact.
 */
function makeOrderCard() {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 512;
  const g = c.getContext('2d');

  g.fillStyle = '#d6cbae';
  g.fillRect(0, 0, 384, 512);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(120,96,60,${Math.random() * 0.09})`;
    g.beginPath();
    g.arc(Math.random() * 384, Math.random() * 512, Math.random() * 22, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = '#2b1f16';
  g.textAlign = 'center';
  g.font = 'bold 28px Georgia, serif';
  g.fillText('PUMP HOUSE', 192, 56);
  g.font = '16px Georgia, serif';
  g.fillText('sub-level 1', 192, 82);

  g.strokeStyle = '#6a1f1c';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(48, 104); g.lineTo(336, 104); g.stroke();

  g.fillStyle = '#6a1f1c';
  g.font = 'bold 22px Georgia, serif';
  g.fillText('OPEN IN THIS ORDER', 192, 140);

  g.textAlign = 'left';
  g.fillStyle = '#2b1f16';
  const rows = [['1.', 'INTAKE'], ['2.', 'RETURN'], ['3.', 'SLUICE']];
  rows.forEach(([n, name], i) => {
    const y = 200 + i * 62;
    g.font = 'bold 40px Georgia, serif';
    g.fillText(n, 86, y);
    g.fillText(name, 150, y);
  });

  g.textAlign = 'center';
  g.font = 'italic 15px Georgia, serif';
  g.fillStyle = '#4a3a2a';
  g.fillText('They are not mounted in this order.', 192, 418);
  g.fillText('Read the plates. Do not guess.', 192, 440);
  g.font = '13px Georgia, serif';
  g.fillText('— G. HALE, MAINTENANCE', 192, 478);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * One of Odile's drawings. Blueprint lines on dark paper, with a staircase
 * drawn in at the north wall of the hall — the one that is not there.
 */
function makeBluePrint(variant) {
  const c = document.createElement('canvas');
  c.width = 448; c.height = 330;
  const g = c.getContext('2d');

  g.fillStyle = '#0e2237';
  g.fillRect(0, 0, 448, 330);

  g.strokeStyle = 'rgba(180,215,240,0.16)';
  g.lineWidth = 1;
  for (let x = 0; x < 448; x += 16) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 330); g.stroke();
  }
  for (let y = 0; y < 330; y += 16) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(448, y); g.stroke();
  }

  const ink = 'rgba(206,228,246,0.9)';
  g.strokeStyle = ink;
  g.lineWidth = 2.5;

  // A plan of the floor, varied a little per sheet.
  const ox = 44 + variant * 6;
  g.strokeRect(ox, 54, 360 - variant * 10, 214);
  g.strokeRect(ox + 40, 92, 108, 70);
  g.strokeRect(ox + 200, 120, 120, 96);

  // The stair, drawn as stairs are drawn: a run of parallel lines with an
  // arrow through them.
  g.lineWidth = 1.8;
  for (let i = 0; i < 9; i++) {
    const y = 60 + i * 9;
    g.beginPath(); g.moveTo(ox + 176, y); g.lineTo(ox + 232, y); g.stroke();
  }
  g.beginPath();
  g.moveTo(ox + 204, 150); g.lineTo(ox + 204, 58);
  g.moveTo(ox + 196, 70); g.lineTo(ox + 204, 58); g.lineTo(ox + 212, 70);
  g.stroke();

  g.fillStyle = ink;
  g.font = '13px "Courier New", monospace';
  g.fillText(['SUB-LEVEL 2', 'THREADWORKS', 'NORTH STAIR', 'AS BUILT'][variant % 4], ox, 300);
  g.font = '11px "Courier New", monospace';
  g.fillText('O. VANTH  —  1979', ox + 240, 300);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A loom tag: a colour name and the position it takes in the warp. */
function makeLoomTag(name, position) {
  const c = document.createElement('canvas');
  c.width = 272; c.height = 192;
  const g = c.getContext('2d');

  g.fillStyle = '#ded2b4';
  g.fillRect(0, 0, 272, 192);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(110,88,56,${Math.random() * 0.12})`;
    g.beginPath();
    g.arc(Math.random() * 272, Math.random() * 192, Math.random() * 14, 0, Math.PI * 2);
    g.fill();
  }

  g.strokeStyle = '#3a2c1e';
  g.lineWidth = 3;
  g.strokeRect(10, 10, 252, 172);

  g.fillStyle = '#2b1f16';
  g.textAlign = 'center';
  g.font = 'bold 30px Georgia, serif';
  g.fillText(name, 136, 58);

  g.font = '13px Georgia, serif';
  g.fillText('takes the warp', 136, 88);

  g.fillStyle = '#6a1f1c';
  g.font = 'bold 74px Georgia, serif';
  g.fillText(String(position), 136, 156);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ==========================================================================
   Collectible placement
   ========================================================================== */

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
  body.position.y = 0.23;
  tv.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x0a0d0c, roughness: 0.25, emissive: 0x0a1410, emissiveIntensity: 1 })
  );
  screen.position.set(0, 0.23, 0.225);
  tv.add(screen);
  tv.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(tv);

  const glow = new THREE.PointLight(0x7fd7c4, 1.6, 3, 2);
  glow.position.copy(position).add(new THREE.Vector3(0, 0.4, 0.4));
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
