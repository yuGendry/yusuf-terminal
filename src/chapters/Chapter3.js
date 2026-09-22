/**
 * Chapter3.js — "Rehearsal"
 *
 * Rehearsal hall → the stair down → costume storage → the practice room.
 *
 * Structure:
 *   .   THE ECHO LENS     — in the prompt corner
 *   P1  The Blocking      — Echo tutorial: watch the 1986 rehearsal, walk her marks
 *   S   The Long Dark     — Gloam. Blind. Noise is the only thing that can hurt you
 *   P2  The Music Box     — play the first phrase of the lullaby to open the door
 *   P3  The Gramophone    — wind it to hold the Choir still, cross the room
 *   C   The Choir         — the last crossing, with the music running out
 *
 * The chapter's idea is that this floor is still working. Chapters 1 and 2 were
 * abandoned buildings; this one has a schedule, and everything in it is doing
 * its job. The Echo lens makes that literal — the rehearsal never stopped.
 */

import * as THREE from 'three';
import { material } from '../world/Materials.js';
import { LevelKit } from '../world/LevelKit.js';
import { EchoGhost, createEchoOperator } from '../world/EchoGhost.js';
import { Choir } from '../ai/Choir.js';
import { Gloam } from '../ai/Gloam.js';
import { NOTES, TAPES, STUBS, RADIO } from './StoryContent.js';
import { noteFreq } from '../audio/MusicEngine.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/**
 * The music-box lock: the first phrase of the Hollowhart Lullaby.
 * Six tines, six notes, in this order. The Echo ghost plays exactly this.
 */
const LULLABY_PHRASE = ['D5', 'F5', 'A5', 'G5', 'F5', 'E5'];
const TINE_NOTES = ['D5', 'E5', 'F5', 'G5', 'A5', 'Bb5'];   // the six tines, left to right

/** The three blocking marks, in the order the 1986 actor hits them. */
const MARK_ORDER = [0, 2, 1];

export function buildChapter3(ctx) {
  const { physics, engine, audio, music, save, puzzles, interaction, mask, flashlight, hud, reader } = ctx;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04040c);
  scene.fog = new THREE.FogExp2(0x08080f, 0.026);

  const kit = new LevelKit({ scene, physics, engine, audio });
  const rng = makeRng(1986_3);

  kit.ambience({ strength: 1.05, sky: 0x2b3040 });

  // Continuity for players arriving via Chapter Select.
  if (!mask.owned) {
    mask.give();
    mask.unlockLens('threadlight');
  }
  if (!mask.unlocked.includes('ember')) mask.unlockLens('ember');
  if (!flashlight.owned) flashlight.give({ battery: 0.55 });

  const state = {
    echoFound: false,
    lanternDone: false,
    marksHit: [],
    blockingDone: false,
    tineEntry: [],
    callEntry: [],
    callDone: false,
    cylinderFound: false,
    cylinderFitted: false,
    costumeDoorOpen: false,
    gramophoneWinds: 0,
    gramophoneTime: 0,
    choirStarted: false,
    chapterDone: false,
  };

  const ghosts = [];
  const echoActive = () => mask.active && mask.lens === 'echo';

  // ==========================================================================
  // REHEARSAL HALL
  // ==========================================================================

  const HALL = { w: 26, d: 24, h: 8.4, x: 0, z: 3 };
  kit.room({
    width: HALL.w, depth: HALL.d, height: HALL.h, x: HALL.x, z: HALL.z,
    floorMat: material('stageFloor', { repeat: 6 }),
    wallMat: material('wallPlasterClean', { repeat: 4 }),
    ceilMat: material('ceiling', { repeat: 4 }),
    surface: 'wood',
    openings: [
      { side: 's', at: 0, width: 1.8, top: 2.4 },     // in
      { side: 'n', at: -6, width: 2.2, top: 2.4 },    // to the stairwell
      { side: 'e', at: 0, width: 1.8, top: 2.4 },     // to the green room
    ],
  });

  // A mirrored wall along the west side, as every rehearsal room has. The
  // reflection is faked with a dark glossy plane — a real mirror would double
  // the scene cost, and at this light level nobody can tell.
  kit.box(0.08, 3.6, 19, -12.9, 2.0, 3, new THREE.MeshPhysicalMaterial({
    color: 0x14161c, roughness: 0.12, metalness: 0.6,
    clearcoat: 1, clearcoatRoughness: 0.08,
  }), { surface: 'tile', shadow: false });

  // The barre.
  for (let i = 0; i < 3; i++) {
    kit.box(0.05, 0.05, 4.6, -12.5, 1.05, -5 + i * 6, material('paintedWood', { color: 0x6a4f34 }), { surface: 'wood' });
  }

  kit.window(12.9, 3.8, -4, { width: 1.5, height: 2.6, rotY: -Math.PI / 2, boarded: true, rayLength: 9, rayIntensity: 0.18 });
  kit.window(12.9, 3.8, 4, { width: 1.5, height: 2.6, rotY: -Math.PI / 2, boarded: true, rayLength: 9, rayIntensity: 0.18 });
  kit.window(12.9, 3.8, 11, { width: 1.5, height: 2.6, rotY: -Math.PI / 2, boarded: true, rayLength: 9, rayIntensity: 0.15 });
  kit.dust(new THREE.Vector3(0, 3.5, 3), new THREE.Vector3(26, 7, 24), { count: 1500, seed: 61 });

  kit.practical(0, 6.2, 3, { intensity: 26, distance: 15, flicker: { chance: 0.4, severity: 0.8, seed: 91 } });
  kit.practical(-3, 6.2, -5, { intensity: 18, distance: 11, flicker: { chance: 0.6, severity: 0.9, seed: 92 } });
  kit.practical(3, 6.2, 11, { intensity: 16, distance: 11, castShadow: false, flicker: { chance: 0.7, severity: 0.9, seed: 93 } });
  kit.sconce(12.6, 2.7, 0, { rotY: -Math.PI / 2, intensity: 8 });

  // Stacked chairs and a piano, because the room is still dressed for work.
  for (let i = 0; i < 12; i++) {
    kit.crate(6.5 + (i % 3) * 0.55, 0.28 + Math.floor(i / 3) * 0.55, 6.2 + (i % 2) * 0.5, 0.5, { mass: 6 });
  }
  const piano = kit.box(1.5, 1.05, 0.7, 7.4, 0.52, -6.4, material('paintedWood', { color: 0x1d1512 }), { surface: 'wood', rotY: -0.4 });

  // ==========================================================================
  // THE ECHO LENS — the prompt corner
  // ==========================================================================

  const promptDesk = kit.table(-8.2, 0, 7.0, { width: 1.1, depth: 0.6, height: 0.82 });

  const echoCase = new THREE.Group();
  {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.16), material('feltDark'));
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.012, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xa98fd6, roughness: 0.08, metalness: 0,
        transmission: 0.82, thickness: 0.01, ior: 1.6,
        transparent: true, opacity: 0.86,
        emissive: 0x7a5fb0, emissiveIntensity: 0.7,
      })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.y = 0.045;
    box.add(lens);
    echoCase.add(box);
  }
  echoCase.position.set(-8.2, 0.88, 7.0);
  echoCase.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(echoCase);

  const echoGlow = new THREE.PointLight(0xa98fd6, 2.4, 3.2, 2);
  echoGlow.position.set(-8.2, 1.02, 7.0);
  scene.add(echoGlow);

  puzzles.register({
    id: 'ch3-lens',
    name: 'The Third Lens',
    objective: 'Find the Echo lens in the prompt corner.',
    marker: new THREE.Vector3(-8.2, 1, 7),
    hints: [
      'The prompt corner is where the stage manager sits — downstage left, by the door, with a desk and a script. Look for the desk.',
      'It is in the same kind of felt-lined case as the last one, on the prompt desk in the far corner of the rehearsal hall.',
      'South-west corner of the rehearsal hall, on the small desk. Open the case, then press Q or R to cycle to the Echo lens.',
    ],
  });
  puzzles.activate('ch3-lens');

  interaction.register({
    object: echoCase,
    reach: 2.2,
    label: 'Open the lens case',
    enabled: () => !state.echoFound,
    onUse: () => {
      state.echoFound = true;
      mask.unlockLens('echo');
      echoCase.visible = false;
      echoGlow.intensity = 0;
      interaction.unregister(echoCase);
      puzzles.solve('ch3-lens');
      hud.say('The glass is cold, and something is moving in it.', { duration: 4 });
      setTimeout(() => {
        ctx.playRadio(RADIO['ch3-radio-1']);
        puzzles.activate('ch3-blocking');
      }, 1600);
    },
  });

  // ==========================================================================
  // PUZZLE 1 — The Blocking
  // ==========================================================================
  //
  // Three chalk marks. With Echo you watch the 1986 actor walk them in a
  // specific order, pausing on each. Standing on them in that order unbolts
  // the north door. Without the lens the marks are visible but their order is
  // not — which is exactly the lesson: Echo tells you what *happened here*.

  const markPositions = [
    new THREE.Vector3(-4.5, 0.02, 2.0),
    new THREE.Vector3(4.5, 0.02, -3.0),
    new THREE.Vector3(0.0, 0.02, -6.5),
  ];

  const markMeshes = markPositions.map((p, i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.44, 24),
      new THREE.MeshBasicMaterial({ color: 0xbdb49c, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(p);
    scene.add(ring);

    // A brighter ring that only appears once the mark has been hit.
    const lit = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.48, 24),
      new THREE.MeshBasicMaterial({
        color: 0xa98fd6, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    lit.rotation.x = -Math.PI / 2;
    lit.position.copy(p).add(new THREE.Vector3(0, 0.005, 0));
    lit.visible = false;
    scene.add(lit);

    return { ring, lit, index: i };
  });

  // The ghost of the rehearsal: enters from the prompt side, walks the marks.
  const blockingGhost = new EchoGhost({
    scene,
    audio, hud,
    duration: 22,
    whisper: 'Again. From the top.',
    path: [
      new THREE.Vector3(-8.2, 0, 7.6),
      markPositions[MARK_ORDER[0]].clone().setY(0),
      markPositions[MARK_ORDER[0]].clone().setY(0),
      markPositions[MARK_ORDER[1]].clone().setY(0),
      markPositions[MARK_ORDER[1]].clone().setY(0),
      markPositions[MARK_ORDER[2]].clone().setY(0),
      markPositions[MARK_ORDER[2]].clone().setY(0),
      new THREE.Vector3(-8.2, 0, 7.6),
    ],
    beats: MARK_ORDER.map((markIndex, step) => ({
      t: 4 + step * 5.5,
      action: () => {
        // The mark she is standing on brightens as she reaches it, which is
        // how the player reads the order without any text.
        const m = markMeshes[markIndex];
        m.ring.material.color.setHex(0xa98fd6);
        m.ring.material.opacity = 0.95;
        setTimeout(() => {
          if (!state.blockingDone) {
            m.ring.material.color.setHex(0xbdb49c);
            m.ring.material.opacity = 0.45;
          }
        }, 1600);
        audio?.toneAt?.(markPositions[markIndex], {
          freq: 330 + step * 60, type: 'sine', duration: 0.5,
          attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.6,
          gain: 0.05, reverb: 0.8,
        });
      },
    })),
  });
  ghosts.push(blockingGhost);

  const northDoor = kit.door({
    x: -7.1, z: -8.95, width: 2.2, height: 2.4, locked: true, name: 'hall-north',
  });
  interaction.register({
    object: northDoor.object,
    reach: 2.4,
    label: () => (northDoor.isLocked ? 'Bolted from the far side' : northDoor.isOpen ? 'Close' : 'Open'),
    enabled: () => !northDoor.isLocked,
    disabledLabel: 'Bolted from the far side',
    deniedMessage: 'Bolted. Something on the other side decides when this opens.',
    onUse: () => northDoor.toggle(),
  });

  puzzles.register({
    id: 'ch3-blocking',
    name: 'The Blocking',
    objective: 'The north door is bolted. Hit the marks.',
    marker: markPositions[0].clone(),
    hints: [
      'There are three chalk marks on the rehearsal-hall floor, and a rehearsal that never finished. Put the mask on with the Echo lens and watch what the room does.',
      'She enters from the prompt corner and walks all three in a fixed order, pausing on each one. Order is the whole puzzle — stand on them yourself in the same order. Getting one wrong resets you to the start.',
      'The order is: the mark on the west side of the room, then the one in the far north corner, then the one on the east side. Stand in each ring until it lights.',
    ],
  });

  // Mark detection.
  kit.onUpdate((dt, t, player) => {
    if (!player || state.blockingDone) return;

    for (const m of markMeshes) {
      const p = markPositions[m.index];
      const near = Math.hypot(player.position.x - p.x, player.position.z - p.z) < 0.55;
      if (!near) { m._inside = false; continue; }
      if (m._inside) continue;
      m._inside = true;

      const expected = MARK_ORDER[state.marksHit.length];
      if (m.index === expected) {
        state.marksHit.push(m.index);
        m.lit.visible = true;
        audio?.toneAt?.(p, {
          freq: 440 + state.marksHit.length * 110, type: 'sine', duration: 0.4,
          attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.7, gain: 0.07, reverb: 0.7,
        });

        if (state.marksHit.length === 3) {
          state.blockingDone = true;
          puzzles.solve('ch3-blocking');
          northDoor.unlock();
          northDoor.open();
          hud.say('Somewhere behind the wall, a bolt slides back. It sounds pleased.', { duration: 4.5 });
          hud.setObjective('Take the stair down.');
          setTimeout(() => {
            ctx.checkpoint('ch3-blocking-done');
            puzzles.activate('ch3-gloam');
          }, 1500);
        }
      } else if (state.marksHit.length > 0) {
        // Wrong mark: reset, audibly, but with no other punishment.
        state.marksHit = [];
        markMeshes.forEach((mm) => { mm.lit.visible = false; });
        audio?.uiDenied?.();
        hud.say('Not that one. She starts again from the prompt side.', { duration: 3 });
      }
    }
  });

  // ==========================================================================
  // PUZZLE 4 — The Magic Lantern
  // ==========================================================================
  //
  // The green room, east off the rehearsal hall. A three-disc magic lantern
  // with a photograph of the company broken across the discs; align all three
  // and the projection resolves.
  //
  // Mechanically this is the one thing the game has not asked for yet —
  // rotation, not sequence, not pitch, not deduction from labels. The
  // projection updates on every turn, so the player is never guessing: they
  // can see how wrong they are and in which direction.

  const GREEN = { x: 20, z: 3, w: 14, d: 12, h: 5.0 };
  kit.room({
    width: GREEN.w, depth: GREEN.d, height: GREEN.h, x: GREEN.x, z: GREEN.z, y: 0,
    floorMat: material('lobbyFloor', { repeat: 4 }),
    wallMat: material('wallpaperLobby', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'carpet',
    openings: [{ side: 'w', at: 0, width: 1.8, top: 2.4 }],
  });

  kit.practical(GREEN.x, 4.2, GREEN.z + 3, { intensity: 15, distance: 10, flicker: { chance: 0.5, severity: 0.85, seed: 96 } });
  // On the east wall, not the north one — it was mounted nine centimetres in
  // front of the projection, dead centre, with its shade in the middle of the
  // picture.
  kit.sconce(GREEN.x + 6.7, 2.5, GREEN.z - 3, { rotY: -Math.PI / 2, intensity: 6 });
  kit.dust(new THREE.Vector3(GREEN.x, 2.4, GREEN.z), new THREE.Vector3(14, 5, 12), { count: 600, seed: 62 });
  kit.sign(13.1, 2.5, GREEN.z, 'GREEN ROOM', { rotY: Math.PI / 2 });

  // Worn furniture — this is where they waited.
  kit.table(GREEN.x + 4.6, 0, GREEN.z + 3.6, { width: 2.0, depth: 0.9 });
  for (let i = 0; i < 6; i++) {
    kit.box(0.5, 0.45, 0.5, GREEN.x + 3.2 + (i % 3) * 0.9, 0.22, GREEN.z + 1.4 + Math.floor(i / 3) * 0.8,
      material('seatVelvet', { repeat: 1 }), { surface: 'carpet', rotY: rng() * 0.5, shadow: false });
  }
  kit.shelving(GREEN.x + 6.4, 0, GREEN.z - 2, { width: 4, height: 2.4, rotY: Math.PI / 2, shelves: 4, fill: 0.8 });

  // --- the lantern ----------------------------------------------------------
  const LANTERN_X = GREEN.x;
  const LANTERN_Z = GREEN.z + 4.2;
  const SCREEN_Z = GREEN.z - 5.85;      // the north wall of the green room

  kit.box(1.2, 0.9, 0.8, LANTERN_X, 0.45, LANTERN_Z,
    material('paintedWood', { color: 0x2a1c12 }), { surface: 'wood', tile: 1.0 });

  const lanternBody = kit.box(0.7, 0.5, 0.9, LANTERN_X, 1.16, LANTERN_Z,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal', tile: 0.5, solid: false });

  const lanternLamp = new THREE.PointLight(0xfff0cc, 1.6, 2.2, 2);
  lanternLamp.position.set(LANTERN_X, 1.16, LANTERN_Z - 0.6);
  scene.add(lanternLamp);

  // The projection. One canvas, redrawn from the three discs' rotations, so
  // the screen can never disagree with the machine.
  const projCanvas = document.createElement('canvas');
  projCanvas.width = 512;
  projCanvas.height = 384;
  const projTex = new THREE.CanvasTexture(projCanvas);
  projTex.colorSpace = THREE.SRGBColorSpace;

  const projection = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.55),
    new THREE.MeshStandardMaterial({
      // A projection is added light, not a painted surface: its blacks are
      // the wall and its brights are the beam. So the albedo is almost nothing
      // and the picture rides entirely on the emissive map.
      //
      // With a normal diffuse map it washed out completely the moment the
      // player pointed their own torch at it — which they will, because it is
      // dark and they are looking for something — and the picture, which is
      // the entire puzzle, stopped being readable at exactly the moment they
      // went to read it.
      color: 0x090807,
      emissiveMap: projTex, emissive: 0xffffff, emissiveIntensity: 1.1,
      roughness: 1, metalness: 0,
    })
  );
  projection.position.set(LANTERN_X, 2.0, SCREEN_Z + 0.06);
  scene.add(projection);

  // Three discs. `turn` is 0..3; the answer is all three at 0.
  const DISCS = [
    { turn: 1, mesh: null },
    { turn: 3, mesh: null },
    { turn: 2, mesh: null },
  ];

  const drawProjection = () => {
    drawCompanyPhoto(projCanvas, DISCS.map((d) => d.turn));
    projTex.needsUpdate = true;
    const solved = DISCS.every((d) => d.turn === 0);
    projection.material.emissiveIntensity = solved ? 1.6 : 1.1;
  };

  DISCS.forEach((disc, i) => {
    const dx = LANTERN_X - 0.24 + i * 0.24;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.022, 8, 20),
      material('brass')
    );
    ring.position.set(dx, 1.42, LANTERN_Z);
    ring.castShadow = true;
    scene.add(ring);

    // A notch, so the player can see the disc turn.
    const notch = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.09, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x6a1f1c, roughness: 0.6 })
    );
    notch.position.set(0, 0.15, 0);
    ring.add(notch);
    disc.mesh = ring;
    ring.rotation.z = -disc.turn * Math.PI / 2;

    interaction.register({
      object: ring,
      reach: 2.0,
      label: () => `Turn the ${['first', 'second', 'third'][i]} disc`,
      enabled: () => !state.lanternDone,
      disabledLabel: 'The picture is whole',
      onUse: () => {
        if (state.lanternDone) return;
        disc.turn = (disc.turn + 1) % 4;
        ring.rotation.z = -disc.turn * Math.PI / 2;
        audio?.leverClunk?.(ring.position);
        drawProjection();

        if (DISCS.every((d) => d.turn === 0)) {
          state.lanternDone = true;
          puzzles.solve('ch3-lantern');
          audio?.puzzleSolved?.();
          lanternLamp.intensity = 2.8;
          hud.say('Forty-three of them on the stage, and one more at the back who is not standing on the floor.', { duration: 7 });
        }
      },
    });
  });

  drawProjection();

  puzzles.register({
    id: 'ch3-lantern',
    name: 'The Magic Lantern',
    objective: 'Put the picture back together.',
    marker: new THREE.Vector3(LANTERN_X, 1.4, LANTERN_Z),
    hints: [
      'The green room is east off the rehearsal hall. The lantern on the table is still projecting; what it is projecting does not line up.',
      'Three glass discs, each carrying a third of the picture, each turnable a quarter at a time — and turning one slides that band of the projection sideways. The brass index mark on a ring tells you where that disc is.',
      'Line the bands up so the picture runs straight across. From where they start that is three turns of the first ring, one of the second and two of the third, which leaves all three index marks straight up.',
    ],
  });

  placeNote(scene, interaction, reader, save, 'ch3-note-lantern', new THREE.Vector3(LANTERN_X + 4.6, 0.85, GREEN.z + 3.6), 0.4);

  // ==========================================================================
  // THE STAIR DOWN + COSTUME STORAGE (the Gloam section)
  // ==========================================================================

  const BAS_Y = -3.2;

  // --- the stairwell --------------------------------------------------------
  //
  // This room did not exist, and the chapter could not be finished without it.
  // The stair descended out of the hall's north doorway straight into the
  // costume store's SOUTH wall — an unbroken slab across the full width of the
  // stairway and its full height, measured. The store's only declared openings
  // were on its north and east walls, so nothing pointed at the hole the stair
  // needed.
  //
  // doorcheck could never have found it: a hand-built flight of treads through
  // a wall is not a declared opening, so there was nothing for it to test.
  kit.room({
    width: 6, depth: 5, height: 5.8, x: -6, z: -11.5, y: BAS_Y,
    floorMat: material('tileFloor', { repeat: 2 }),
    wallMat: material('wallPlaster', { repeat: 3 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'tile',
    openings: [
      // Sills are measured from this room's own floor at y = -3.2, so 3.2 is
      // the hall's floor at world y = 0.
      { side: 's', at: 0, width: 2.2, sill: 3.2, top: 5.6 },
      { side: 'n', at: 0, width: 2.4, top: 2.4 },
    ],
  });

  // A slab at the head of the flight, level with the hall floor.
  kit.box(2.2, 0.4, 0.7, -6, -0.2, -9.35, material('tileFloor', { repeat: 1 }), { surface: 'tile' });

  // Fourteen treads, dropping the full 3.2m from the hall floor to the store.
  for (let i = 0; i < 14; i++) {
    const top = -0.229 * (i + 1);
    kit.box(2.2, 0.5, 0.32, -6, top - 0.25, -9.7 - i * 0.32,
      material('tileFloor', { repeat: 1 }), { surface: 'tile', shadow: false });
  }
  kit.sconce(-3.2, BAS_Y + 3.6, -11.5, { rotY: -Math.PI / 2, intensity: 7, flicker: { chance: 0.6, severity: 0.9, seed: 95 } });

  // --- costume storage ------------------------------------------------------
  //
  // A long, low, branching storage floor. Deliberately dim and deliberately
  // full of soft things: the room is built to eat sound, so the player's own
  // footsteps are the loudest thing in it.
  //
  // 30 x 20, grown west. The east wall carries the practice room and the south
  // wall now carries the stairwell, so neither can move.
  kit.room({
    width: 30, depth: 20, height: 3.7, x: -6, z: -24, y: BAS_Y,
    floorMat: material('tileFloor', { repeat: 8 }),
    wallMat: material('wallPlaster', { repeat: 6 }),
    ceilMat: material('ceiling', { repeat: 5 }),
    surface: 'tile',
    openings: [
      { side: 's', at: 0, width: 2.4, top: 2.4 },     // from the stairwell
      // World z -22, from a centre at -24. The old value put this at z = -16,
      // two rooms' worth away from the practice room's west door, opening onto
      // the void between them.
      { side: 'e', at: 2, width: 1.8, top: 2.4 },
      // West, into the crossover and the dressing rooms. The music box on the
      // east side does not work until you have been through here.
      { side: 'w', at: 0, width: 1.8, top: 2.4 },
    ],
  });

  // Costume racks forming the maze. Each is solid, so they are real cover.
  //
  // The x = -17 column used to be three nine-metre racks at z = -19, -24 and
  // -29. Overlapping, they were a continuous wall of costume from z = -33.5 to
  // -14.5 — the full depth of the room — which did not matter while the only
  // ways out were east and south. The west doorway to the crossover is on the
  // far side of it, so that column now leaves a four-metre aisle on the line
  // of the door.
  const rackRows = [
    [-17, -19, 7], [-17, -30, 7],
    [-9, -20, 7], [-9, -28, 7],
    [-1, -19, 7], [-1, -27, 7],
    [6, -18, 6], [6, -25, 6],
  ];
  for (const [rx, rz, len] of rackRows) {
    // The rail.
    kit.box(0.06, 0.06, len, rx, BAS_Y + 1.85, rz, material('rustedSteel', { repeat: 1 }), { surface: 'metal' });
    for (const end of [-1, 1]) {
      kit.box(0.08, 1.9, 0.08, rx, BAS_Y + 0.95, rz + end * len / 2, material('rustedSteel', { repeat: 1 }), { surface: 'metal' });
    }
    // The costumes: one instanced mesh per rack, hanging in a solid block.
    const n = Math.floor(len * 3);
    const garments = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.26, 1.3, 7, 1, true),
      material('curtain'),
      n
    );
    garments.castShadow = true;
    garments.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const gz = rz - len / 2 + 0.25 + (i / (n - 1)) * (len - 0.5);
      q.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
      m.compose(new THREE.Vector3(rx + randRange(-0.05, 0.05), BAS_Y + 1.1, gz), q, one);
      garments.setMatrixAt(i, m);
    }
    garments.instanceMatrix.needsUpdate = true;
    scene.add(garments);

    // Collision for the rack as a whole, so it is real cover.
    kit.box(0.6, 1.9, len, rx, BAS_Y + 0.95, rz, material('feltDark'), {
      surface: 'carpet', solid: true, shadow: false,
    });
  }

  // Almost no light. Two failing tubes and the player's torch.
  kit.practical(-13, BAS_Y + 2.9, -20, { intensity: 11, distance: 8, cordLength: 0.4, flicker: { chance: 0.85, severity: 0.95, seed: 121 } });
  kit.practical(2, BAS_Y + 2.9, -28, { intensity: 9, distance: 7, cordLength: 0.4, flicker: { chance: 0.9, severity: 0.95, seed: 122 } });
  kit.practical(-6, BAS_Y + 2.9, -17, { intensity: 8, distance: 7, cordLength: 0.4, castShadow: false, flicker: { chance: 0.9, severity: 0.95, seed: 123 } });
  kit.dust(new THREE.Vector3(-6, BAS_Y + 1.5, -24), new THREE.Vector3(30, 3, 20), { count: 900, seed: 81 });

  // --- Gloam ---------------------------------------------------------------
  const gloam = new Gloam({
    scene, physics, engine, audio, music,
    player: null,
    hearingRange: 20,
    patrol: [
      new THREE.Vector3(-17, BAS_Y, -16),
      new THREE.Vector3(-17, BAS_Y, -31),
      new THREE.Vector3(3, BAS_Y, -31),
      new THREE.Vector3(6, BAS_Y, -16),
    ],
  });
  gloam.on('caught', () => ctx.onPlayerCaught('gloam'));

  puzzles.register({
    id: 'ch3-gloam',
    name: 'The Long Dark',
    objective: 'Cross the costume floor. Quietly. The way on is west.',
    marker: new THREE.Vector3(9, BAS_Y + 1, -22),
    hints: [
      'Whatever is down here has no eyes. Light does not give you away and darkness does not protect you. Only noise matters.',
      'Sprinting is loud, walking is audible, and crouching is almost silent — hold Ctrl and take your time. The mask hums, so take it off before you go down. If it stops moving, you stop moving too.',
      'Crouch the whole way and keep the costume racks between you and the sound. The exit is on the east wall, at the far end. If it starts coming for you, stop dead and wait — it goes to where the noise was, not to where you are.',
    ],
  });

  // The player's footsteps are what it hears — reported here, not sensed there.
  //
  // `crossoverNoise` is declared down with the crossover itself and hoists.
  // A step off the worn boards in there lands on somebody's discarded scenery
  // and is very much louder than a step anywhere else in the chapter.
  ctx.onFootstep = (info) => {
    if (!gloam.enabled) return;
    const debris = crossoverNoise(info.position);
    if (debris > 0) {
      audio?.woodSnap?.(info.position);
      gloam.hear(info.position, Math.min(1, info.loudness + debris));
      return;
    }
    gloam.hear(info.position, info.loudness);
  };

  kit.trigger({
    x: -6, z: -15.4, y: BAS_Y + 1.5, width: 4, depth: 3,
    onEnter: () => {
      gloam.start();
      music.setMood('tension');
      ctx.playRadio(RADIO['ch3-radio-2']);
    },
  });

  // ==========================================================================
  // THE CROSSOVER  —  Chapter 3's second pursuit beat
  // ==========================================================================
  //
  // Forty feet of everything nobody would carry upstairs, running west out of
  // the costume store. It is the only way to the dressing rooms, and the music
  // box on the far side of the building does not work without what is in one
  // of them.
  //
  // The beat exists to make the player hold two lenses in their head at once,
  // which nothing before this asks of them. Echo shows the path the crew wore
  // down the middle of the boards over eleven years of two shows a night, and
  // that worn strip is the only ground in the room that is quiet. But Echo is
  // worn on the mask, and the mask hums, and Gloam hears the hum before it
  // hears anything else. So the loop is: look, take it off, walk what you
  // remember, lose it, stop, look again. The answer is visible the whole time
  // and looking at it is what gets you killed.

  const CROSS = { x: -33, z: -24, w: 24, d: 5, h: 3.4 };
  const PATH_HALF = 0.95;   // metres either side of the centreline that are quiet

  kit.room({
    width: CROSS.w, depth: CROSS.d, height: CROSS.h, x: CROSS.x, z: CROSS.z, y: BAS_Y,
    floorMat: material('stageFloor', { repeat: 8 }),
    wallMat: material('wallPlaster', { repeat: 5 }),
    ceilMat: material('ceiling', { repeat: 4 }),
    surface: 'wood',
    piers: false,
    openings: [
      { side: 'e', at: 0, width: 1.8, top: 2.4 },   // to the costume store
      { side: 'w', at: 0, width: 1.8, top: 2.4 },   // to the dressing rooms
    ],
  });

  /**
   * How much louder a step is for being taken off the boards.
   *
   * Declared as a function rather than a const arrow because the footstep hook
   * above refers to it and function declarations hoist. It is only ever called
   * during play, by which time `CROSS` has initialised.
   */
  function crossoverNoise(p) {
    if (p.x < CROSS.x - CROSS.w / 2 || p.x > CROSS.x + CROSS.w / 2) return 0;
    if (p.z < CROSS.z - CROSS.d / 2 || p.z > CROSS.z + CROSS.d / 2) return 0;
    const off = Math.abs(p.z - CROSS.z);
    if (off <= PATH_HALF) return 0;
    // Ramps up over the half-metre either side of the boards, so the edge of
    // safety is something you can feel your way along rather than a tripwire.
    return clamp((off - PATH_HALF) / 0.5, 0, 1) * 0.62;
  }

  // The worn path, under Echo. Eleven years of the same feet in the dark.
  {
    // The canvas runs long-side-along-X to match the quad, so the gradient
    // that softens the edges of the path runs across the corridor (V) and the
    // footfalls run along it (U). The first version was 64x512 with the quad
    // spun by PI/2 about Z to compensate, which does not work: a plane laid
    // flat by rotation.x has its width on X and its height on Z already, and
    // the extra spin put a twenty-three metre strip across a five metre room,
    // most of it inside the walls.
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1024, 96);
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, 'rgba(169,143,214,0)');
    grad.addColorStop(0.5, 'rgba(169,143,214,0.8)');
    grad.addColorStop(1, 'rgba(169,143,214,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 96);
    // Footfalls, wandering a little the way a path worn in the dark does.
    for (let i = 0; i < 190; i++) {
      const x = (i / 190) * 1024;
      const wobble = Math.sin(i * 0.31) * 9 + Math.sin(i * 0.11) * 5;
      g.fillStyle = `rgba(222,208,250,${0.22 + Math.random() * 0.45})`;
      g.beginPath();
      g.ellipse(x, 48 + wobble + (i % 2 ? 9 : -9), 9, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const boards = new THREE.Mesh(
      new THREE.PlaneGeometry(CROSS.w - 1.2, PATH_HALF * 2 + 0.5),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    boards.rotation.x = -Math.PI / 2;
    boards.position.set(CROSS.x, BAS_Y + 0.025, CROSS.z);
    boards.userData.lensOnly = 'echo';
    scene.add(boards);
  }

  // The junk either side. Solid, so it is cover as well as a hazard — and so
  // that walking into it in the dark tells you where the edge of the path is.
  {
    const junkRng = makeRng(31_986);
    const mats = ['paintedWood', 'rustedSteel', 'feltDark'];
    for (let i = 0; i < 34; i++) {
      const side = i % 2 ? 1 : -1;
      const px = CROSS.x - CROSS.w / 2 + 1.4 + (i / 34) * (CROSS.w - 2.8) + junkRng() * 0.6;
      const pz = CROSS.z + side * (PATH_HALF + 0.55 + junkRng() * 0.9);
      const kind = Math.floor(junkRng() * 3);
      const mat = material(mats[kind], { repeat: 1, color: kind === 0 ? 0x33261b : undefined });
      if (kind === 0) {
        // A flat, leaning on the wall.
        kit.box(0.12, 1.9 + junkRng() * 0.8, 1.2 + junkRng(), px, BAS_Y + 1.1, pz, mat,
          { surface: 'wood', rotY: side * (1.4 + junkRng() * 0.3), shadow: false });
      } else if (kind === 1) {
        // A stage weight or a hamper.
        const h = 0.4 + junkRng() * 0.5;
        kit.box(0.6 + junkRng() * 0.4, h, 0.5 + junkRng() * 0.5, px, BAS_Y + h / 2, pz, mat,
          { surface: 'metal', rotY: junkRng() * 1.2, shadow: false });
      } else {
        // A roll of cloth.
        const roll = new THREE.Mesh(
          new THREE.CylinderGeometry(0.19, 0.19, 1.3 + junkRng() * 0.7, 9),
          mat
        );
        roll.rotation.z = Math.PI / 2;
        roll.rotation.y = junkRng() * 0.8;
        roll.position.set(px, BAS_Y + 0.19, pz);
        roll.castShadow = true;
        scene.add(roll);
        physics.addStaticBox({ x: 0.7, y: 0.19, z: 0.19 }, { x: px, y: BAS_Y + 0.19, z: pz }, null, { surface: 'carpet' });
      }
    }
  }

  kit.practical(-27, BAS_Y + 3.0, -24, {
    intensity: 7, distance: 7, cordLength: 0.3, castShadow: false,
    flicker: { chance: 0.95, severity: 1, seed: 141 },
  });
  kit.dust(new THREE.Vector3(CROSS.x, BAS_Y + 1.4, CROSS.z), new THREE.Vector3(CROSS.w, 3, CROSS.d), { count: 600, seed: 142 });

  kit.sign(-22.2, BAS_Y + 1.95, -22.6, 'CROSSOVER', { height: 0.3, width: 1.5, rotY: Math.PI / 2 });
  placeNote(scene, interaction, reader, save, 'ch3-note-crossover',
    new THREE.Vector3(-22.4, BAS_Y + 0.03, -25.2), 0.4);

  // Once the west door is open this thing works both rooms.
  kit.trigger({
    x: -21, z: -24, y: BAS_Y + 1.5, width: 2.4, depth: 3, once: true,
    onEnter: () => {
      gloam.patrol.push(
        new THREE.Vector3(-26, BAS_Y, CROSS.z),
        new THREE.Vector3(-42, BAS_Y, CROSS.z),
        new THREE.Vector3(-26, BAS_Y, CROSS.z)
      );
      hud.say('The boards under your feet stop being boards.', { duration: 3.4 });
    },
  });

  // ==========================================================================
  // THE DRESSING ROOMS
  // ==========================================================================

  const CORR = { x: -47.4, z: -24, w: 4.8, d: 26, h: 3.2 };
  /** North to south. Room 3 sits directly opposite the way in. */
  const DRESSING_Z = [-34, -29, -24, -19, -14];
  const DEAD_ROOM = 3;                       // the one nobody is ever called to
  const CALL_ORDER = [5, 2, 4, 1];           // the sheet, with 3 left out

  kit.room({
    width: CORR.w, depth: CORR.d, height: CORR.h, x: CORR.x, z: CORR.z, y: BAS_Y,
    floorMat: material('lobbyFloor', { repeat: 4 }),
    wallMat: material('wallPlasterClean', { repeat: 5 }),
    ceilMat: material('ceiling', { repeat: 4 }),
    surface: 'wood',
    piers: false,
    openings: [
      { side: 'e', at: 0, width: 1.8, top: 2.4 },
      ...DRESSING_Z.map((dz) => ({ side: 'w', at: dz - CORR.z, width: 1.2, top: 2.3 })),
    ],
  });

  const dressingRooms = DRESSING_Z.map((dz, i) => {
    const number = i + 1;
    const dead = number === DEAD_ROOM;
    const rx = -52.5;

    kit.room({
      width: 5.4, depth: 4.6, height: 3.0, x: rx, z: dz, y: BAS_Y,
      floorMat: material('lobbyFloor', { repeat: 2 }),
      wallMat: material('wallPlasterClean', { repeat: 2 }),
      ceilMat: material('ceiling', { repeat: 2 }),
      surface: 'wood',
      piers: false,
      trim: true,
      openings: [{ side: 'e', at: 0, width: 1.2, top: 2.3 }],
    });

    // The mirror and its bulbs. A dressing room is a mirror with a table under
    // it; everything else in the room is optional.
    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.0),
      new THREE.MeshStandardMaterial({
        color: 0x1a1a1e, roughness: 0.08, metalness: 0.92,
        emissive: 0x05060a, emissiveIntensity: 1,
      })
    );
    mirror.position.set(rx - 2.6, BAS_Y + 1.55, dz);
    mirror.rotation.y = Math.PI / 2;
    scene.add(mirror);

    const bulbs = [];
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 6),
        material(dead ? 'bulbOff' : 'bulbOn', dead ? {} : { emissive: 0xffd9a0, emissiveIntensity: 3 })
      );
      bulb.position.set(rx - 2.52, BAS_Y + 1.55 + Math.sin(a) * 0.66, dz + Math.cos(a) * 0.95);
      scene.add(bulb);
      bulbs.push(bulb);
    }
    if (!dead) {
      kit.practical(rx - 2.2, BAS_Y + 2.3, dz, {
        intensity: 9, distance: 5, cordLength: 0.2, castShadow: false,
        flicker: { chance: 0.25, severity: 0.5, seed: 150 + i },
      });
    }

    kit.table(rx - 2.2, BAS_Y, dz, { width: 0.6, depth: 1.8, height: 0.76, rotY: Math.PI / 2 });
    kit.box(0.5, 0.9, 0.5, rx + 1.6, BAS_Y + 0.45, dz - 1.2,
      material('paintedWood', { color: 0x352618 }), { surface: 'wood', shadow: false });

    // The name plate on the corridor wall beside the door. Plates face east,
    // into the corridor: a plane's normal is +Z, so +PI/2 sends it to +X.
    const plate = kit.sign(-49.6, BAS_Y + 2.05, dz, `${number}`, {
      height: 0.26, width: 0.34, rotY: Math.PI / 2,
      colour: dead ? '#5d564a' : '#d8cdb4',
    });

    return { number, dead, z: dz, x: rx, bulbs, plate, mirror };
  });

  // Room 3. Paid for, lit, and given to nobody for eleven years.
  {
    const room = dressingRooms[DEAD_ROOM - 1];

    // The cylinder, on the dressing table under a cold light.
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.22, 14),
      material('brass')
    );
    cylinder.rotation.z = Math.PI / 2;
    cylinder.position.set(room.x - 2.2, BAS_Y + 0.82, room.z);
    cylinder.castShadow = true;
    scene.add(cylinder);

    // Pins along it, so it reads as the thing that plays a tune rather than as
    // a bit of pipe.
    for (let i = 0; i < 26; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), material('brass'));
      pin.position.set(
        room.x - 2.2 - 0.09 + (i / 26) * 0.18,
        BAS_Y + 0.82 + Math.sin(a) * 0.058,
        room.z + Math.cos(a) * 0.058
      );
      scene.add(pin);
    }

    const cold = new THREE.PointLight(0x9fb4d0, 3.2, 3.2, 2);
    cold.position.set(room.x - 2.2, BAS_Y + 1.5, room.z);
    scene.add(cold);

    interaction.register({
      object: cylinder,
      reach: 2.2,
      label: 'Take the cylinder',
      enabled: () => !state.cylinderFound,
      onUse: () => {
        state.cylinderFound = true;
        cylinder.visible = false;
        interaction.unregister(cylinder);
        audio?.leverClunk?.(cylinder.position);
        hud.say('Brass, and heavier than it looks. Twenty-six pins in a spiral.', { duration: 4 });
        hud.setObjective('Get back to the music box. The crossover is the only way.');
        puzzles.activate('ch3-tannoy');
      },
    });

    placeNote(scene, interaction, reader, save, 'ch3-note-cylinder',
      new THREE.Vector3(room.x + 0.6, BAS_Y + 0.03, room.z + 1.4), -0.3);
    placeStub(scene, interaction, reader, save, 'ch3-stub-3',
      new THREE.Vector3(room.x - 1.2, BAS_Y + 0.02, room.z - 1.5));
  }

  // ==========================================================================
  // PUZZLE — The Calls Panel
  // ==========================================================================
  //
  // Stage management called the company down for beginners on this. Run the
  // call properly and it goes out over the one horn on this floor that is
  // still wired — at the dead end past dressing room 1, twenty-five metres
  // from the panel and a long way from the only route home.
  //
  // The sheet gives four rooms. There are five buttons. The fifth is 3, and
  // pressing it fails the whole call, which is what the note above the panel
  // says in as many words and what the ghost on the book shows you by reaching
  // for it, stopping, and moving on.

  const PANEL_POS = new THREE.Vector3(CORR.x, BAS_Y + 1.35, -11.32);
  const HORN_POS = new THREE.Vector3(CORR.x, BAS_Y + 2.6, -36.6);

  const callButtons = [];
  {
    const back = kit.box(1.5, 0.9, 0.12, PANEL_POS.x, PANEL_POS.y, PANEL_POS.z,
      material('paintedWood', { color: 0x2b2a2e }), { surface: 'metal', solid: false, shadow: false });
    back.name = 'calls-panel';

    for (let i = 0; i < 5; i++) {
      const number = i + 1;
      // The panel faces north and is read facing south, so screen-right is
      // -X: laying the buttons out in increasing X put "1" on the right and
      // the row read backwards.
      const bx = PANEL_POS.x + 0.56 - i * 0.28;

      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.058, 0.05, 16),
        material('bulbOff')
      );
      button.rotation.x = Math.PI / 2;
      // The panel is on the corridor's south wall and faces north, which is
      // -Z: a plane's normal is +Z, so the plate and every label on it are
      // turned by PI. The buttons stand proud on the -Z side to match.
      button.position.set(bx, PANEL_POS.y + 0.06, PANEL_POS.z - 0.09);
      button.userData.callNumber = number;
      scene.add(button);

      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#17161a';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#cbbf9f';
      g.font = 'bold 42px "IBM Plex Mono", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${number}`, 32, 35);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 0.1),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide })
      );
      label.position.set(bx, PANEL_POS.y - 0.09, PANEL_POS.z - 0.07);
      label.rotation.y = Math.PI;
      scene.add(label);

      callButtons.push({ number, mesh: button });
    }

    // The call lamp: one quarter per room answered.
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x1a1713, emissive: 0xffb066, emissiveIntensity: 0 })
    );
    lamp.position.set(PANEL_POS.x, PANEL_POS.y + 0.29, PANEL_POS.z - 0.08);
    scene.add(lamp);

    const lampLight = new THREE.PointLight(0xffb066, 0, 2.6, 2);
    lampLight.position.copy(lamp.position).setZ(lamp.position.z - 0.3);
    scene.add(lampLight);

    kit.sign(PANEL_POS.x, PANEL_POS.y + 0.62, PANEL_POS.z - 0.07, 'CALLS', {
      height: 0.2, width: 0.8, rotY: Math.PI,
    });

    // The panel is the destination at the dark end of a dark corridor, so it
    // gets the one working bulb down here. Nothing else in the room is lit
    // well enough to draw the player the length of it.
    kit.practical(PANEL_POS.x, BAS_Y + 2.7, PANEL_POS.z - 0.9, {
      intensity: 11, distance: 7, cordLength: 0.3, castShadow: false,
      flicker: { chance: 0.2, severity: 0.4, seed: 152 },
    });

    const paintLamp = () => {
      const t = state.callDone ? 1 : state.callEntry.length / CALL_ORDER.length;
      lamp.material.emissiveIntensity = t * 4;
      lampLight.intensity = t * 5;
    };

    const flashButton = (number, colour = 0xffd9a0) => {
      const b = callButtons.find((x) => x.number === number);
      if (!b) return;
      b.mesh.material = material('bulbOn', { emissive: colour, emissiveIntensity: 5 });
      setTimeout(() => { b.mesh.material = material('bulbOff'); }, 420);
    };

    const pressCall = (number) => {
      if (state.callDone) return;
      audio?.toneAt?.(PANEL_POS, {
        freq: 520 + number * 40, type: 'square', duration: 0.12,
        attack: 0.002, decay: 0.08, sustain: 0.2, release: 0.1, gain: 0.05,
      });
      // The panel clicks. Everything in this building makes a noise.
      gloam.hear(PANEL_POS, 0.3);

      const want = CALL_ORDER[state.callEntry.length];
      if (number !== want) {
        state.callEntry = [];
        paintLamp();
        flashButton(number, 0xc23b2e);
        audio?.uiDenied?.();
        hud.say(
          number === DEAD_ROOM
            ? 'The lamp goes out. Somewhere above you, something notices.'
            : 'The lamp goes out. The call resets.',
          { duration: 2.8 }
        );
        if (number === DEAD_ROOM) {
          // Calling the room nobody is called to is not merely wrong.
          gloam.hear(PANEL_POS, 0.85);
          dressingRooms[DEAD_ROOM - 1].bulbs.forEach((b) => {
            b.material = material('bulbOn', { emissive: 0xc23b2e, emissiveIntensity: 4 });
            setTimeout(() => { b.material = material('bulbOff'); }, 1400);
          });
        }
        return;
      }

      flashButton(number);
      state.callEntry.push(number);
      paintLamp();

      if (state.callEntry.length < CALL_ORDER.length) {
        hud.say(`Room ${number} answers.`, { duration: 1.6 });
        return;
      }

      // The call goes out.
      state.callDone = true;
      state.callEntry = [];
      paintLamp();
      puzzles.solve('ch3-tannoy');
      hud.setObjective('Cross back while it is answering the call.');

      // Four rising tones over the horn at the far end, then the announcement.
      [0, 0.35, 0.7, 1.05].forEach((delay, i) => {
        setTimeout(() => {
          audio?.toneAt?.(HORN_POS, {
            freq: [392, 523, 659, 784][i], type: 'triangle', duration: 0.5,
            attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.4, gain: 0.11, reverb: 0.8,
          });
        }, delay * 1000);
      });
      setTimeout(() => {
        hud.say('"Your calls, ladies and gentlemen. This is your beginners call."', { duration: 5 });
        audio?.noise?.({ duration: 2.2, gain: 0.05, filterType: 'bandpass', freq: 900, q: 1.4, reverb: 0.7 });
        gloam.lure(HORN_POS, 26);
        ctx.playRadio(RADIO['ch3-radio-5']);
        music.setMood('chase');
        ctx.checkpoint('ch3-tannoy-done');
      }, 1600);
      setTimeout(() => {
        if (!state.chapterDone) music.setMood('tension');
      }, 28000);
    };

    for (const b of callButtons) {
      interaction.register({
        object: b.mesh,
        reach: 1.9,
        label: () => `Call dressing room ${b.number}`,
        enabled: () => !state.callDone,
        disabledLabel: 'The call has gone out',
        onUse: () => pressCall(b.number),
      });
    }

    paintLamp();
  }

  // The horn at the dead end. It has to be visible from the panel end of the
  // corridor, because the player needs to understand where the sound will
  // come from before they decide to make it.
  {
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.5, 14, 1, true),
      material('rustedSteel', { repeat: 1 })
    );
    horn.rotation.x = -Math.PI / 2;
    horn.position.copy(HORN_POS);
    horn.castShadow = true;
    scene.add(horn);
    kit.sign(CORR.x, BAS_Y + 2.0, -36.7, 'BEGINNERS', { height: 0.22, width: 1.1, rotY: 0 });
  }

  placeNote(scene, interaction, reader, save, 'ch3-note-calls',
    new THREE.Vector3(CORR.x + 1.6, BAS_Y + 0.03, -12.4), 0.2);

  // The ghost on the book, running the call for the last time. She reaches for
  // 3, stops, and goes on — which is the answer, shown rather than written.
  {
    let step = 0;
    const SEQUENCE = [...CALL_ORDER.slice(0, 2), DEAD_ROOM, ...CALL_ORDER.slice(2)];
    const operator = createEchoOperator({
      scene,
      position: new THREE.Vector3(CORR.x + 0.7, BAS_Y, -12.3),
      facing: Math.PI,
      actionEvery: 1.4,
      onAction: () => {
        const number = SEQUENCE[step % SEQUENCE.length];
        const b = callButtons.find((x) => x.number === number);
        if (b) {
          const skipped = number === DEAD_ROOM;
          b.mesh.material = material('bulbOn', {
            // She hovers over 3 and it barely lights: a hand that went out and
            // came back. Anything brighter reads as a press.
            emissive: skipped ? 0x4a3d66 : 0xa98fd6,
            emissiveIntensity: skipped ? 0.8 : 5,
          });
          setTimeout(() => { if (!state.callDone) b.mesh.material = material('bulbOff'); }, skipped ? 620 : 360);
        }
        step++;
      },
    });
    ghosts.push({
      update: (dt, playerPos, active) => operator.update(dt, playerPos, active),
      dispose: () => operator.dispose(),
    });
  }

  puzzles.register({
    id: 'ch3-tannoy',
    name: 'The Calls Panel',
    objective: 'Run the beginners call. Five buttons, four rooms.',
    marker: PANEL_POS.clone(),
    hints: [
      'The panel at the end of the dressing-room corridor called the company down for beginners. It is loud, it is heard everywhere on this floor, and that is not a problem — it is the reason to use it.',
      'There are five rooms and the call is four. The note pinned above the panel says which one is never called, and somebody is still standing at the panel running the call: put the Echo lens on and watch which buttons light. The one she reaches for and does not press is the one to leave alone.',
      'Press 5, then 2, then 4, then 1. Never 3. When the call goes out over the horn at the far end of the corridor, the thing in the crossover goes to answer it — that is your window to get back east to the music box, and it lasts about twenty-five seconds.',
    ],
  });

  // ==========================================================================
  // PUZZLE 2 — The Music Box
  // ==========================================================================
  //
  // The costume-storage exit is locked by a music-box cylinder. Six tines.
  // Play the first phrase of the lullaby. The Echo operator at the bench plays
  // it for you, over and over, forever.

  const boxStand = kit.table(8.4, BAS_Y, -18.5, { width: 1.0, depth: 0.6, height: 0.8 });

  const musicBox = new THREE.Group();
  musicBox.position.set(8.4, BAS_Y + 0.84, -18.5);
  scene.add(musicBox);

  const boxBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.34), material('paintedWood', { color: 0x3a2a1c }));
  boxBody.castShadow = true;
  musicBox.add(boxBody);

  const tines = [];
  for (let i = 0; i < 6; i++) {
    const tine = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.012, 0.22 - i * 0.018),
      material('brass')
    );
    tine.position.set(-0.22 + i * 0.088, 0.09, 0);
    tine.castShadow = true;
    tine.userData.tineIndex = i;
    musicBox.add(tine);
    tines.push(tine);
  }

  // The cylinder itself, which is not in the box when you find it. Chapter 3
  // used to hand you a working music box two rooms into the basement; the
  // crossover and the dressing rooms are on the other side of this.
  const boxCylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.22, 14),
    material('brass')
  );
  boxCylinder.rotation.z = Math.PI / 2;
  boxCylinder.position.set(0, 0.02, -0.11);
  boxCylinder.visible = false;
  musicBox.add(boxCylinder);

  // The empty seat it goes into, so the absence is legible rather than just an
  // interaction that refuses.
  const boxWell = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.05, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0d0a07, roughness: 1 })
  );
  boxWell.position.set(0, 0.06, -0.11);
  musicBox.add(boxWell);

  interaction.register({
    object: boxBody,
    reach: 2.0,
    label: () => (state.cylinderFitted ? 'The cylinder is seated' : 'Fit the cylinder'),
    enabled: () => state.cylinderFound && !state.cylinderFitted,
    disabledLabel: () => (state.cylinderFitted
      ? 'The cylinder is seated'
      : 'The cylinder is missing from its seat'),
    onUse: () => {
      state.cylinderFitted = true;
      boxCylinder.visible = true;
      boxWell.visible = false;
      audio?.leverClunk?.(musicBox.position);
      hud.say('It drops into the seat and the whole box settles. Six tines, waiting.', { duration: 4 });
      hud.setObjective('Play the first phrase of the lullaby.');
      puzzles.activate('ch3-music');
    },
  });

  const boxLight = new THREE.PointLight(0xffc98a, 2.6, 3.4, 2);
  boxLight.position.set(8.4, BAS_Y + 1.25, -18.5);
  scene.add(boxLight);

  // The hinge sits half a leaf on the +z side of the opening it fills; the
  // opening is now at world z = -22.
  const costumeDoor = kit.door({
    x: 8.2, z: -21.15, y: BAS_Y, width: 1.7, height: 2.3, locked: true, name: 'costume-exit', rotY: Math.PI / 2,
  });

  const playTine = (i, { quiet = false } = {}) => {
    const freq = noteFreq(TINE_NOTES[i]);
    tines[i].position.y = 0.075;
    setTimeout(() => { tines[i].position.y = 0.09; }, 90);
    audio?.toneAt?.(musicBox.position, {
      freq, type: 'sine', duration: 0.9,
      attack: 0.003, decay: 0.55, sustain: 0.12, release: 1.2,
      gain: quiet ? 0.045 : 0.09, reverb: 0.75, detune: -8,
    });
    audio?.toneAt?.(musicBox.position, {
      freq: freq * 2.76, type: 'sine', duration: 0.4,
      attack: 0.002, decay: 0.25, sustain: 0.1, release: 0.5,
      gain: quiet ? 0.012 : 0.024, reverb: 0.7,
    });
  };

  const pressTine = (i) => {
    if (!state.cylinderFitted) return;
    playTine(i);
    // A struck tine is a real sound in the world — the thing downstairs hears
    // it. Solving this puzzle loudly has a cost.
    if (gloam.enabled) gloam.hear(musicBox.position, 0.55);

    state.tineEntry.push(TINE_NOTES[i]);
    const want = LULLABY_PHRASE[state.tineEntry.length - 1];

    if (TINE_NOTES[i] !== want) {
      state.tineEntry = [];
      setTimeout(() => {
        audio?.uiDenied?.();
        hud.say('The cylinder slips. It will not take a wrong note.', { duration: 2.8 });
      }, 420);
      return;
    }

    if (state.tineEntry.length === LULLABY_PHRASE.length) {
      state.tineEntry = [];
      state.costumeDoorOpen = true;
      costumeDoor.unlock();
      costumeDoor.open();
      puzzles.solve('ch3-music');
      audio?.puzzleSolved?.();
      hud.say('The whole cylinder turns over once, and the door gives.', { duration: 4 });
      hud.setObjective('Go through to the practice room.');
      setTimeout(() => {
        ctx.checkpoint('ch3-music-done');
        puzzles.activate('ch3-choir');
      }, 1600);
    }
  };

  tines.forEach((tine) => {
    interaction.register({
      object: tine,
      reach: 1.8,
      label: () => `Strike the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][tine.userData.tineIndex]} tine`,
      enabled: () => state.cylinderFitted && !state.costumeDoorOpen,
      disabledLabel: () => (state.costumeDoorOpen
        ? 'The cylinder has turned'
        : 'Nothing under the tines to turn'),
      onUse: () => pressTine(tine.userData.tineIndex),
    });
  });

  // The Echo operator who plays it, endlessly.
  {
    let step = 0;
    const operator = createEchoOperator({
      scene,
      position: new THREE.Vector3(8.4, BAS_Y, -19.4),
      facing: 0,
      actionEvery: 1.1,
      onAction: () => {
        const note = LULLABY_PHRASE[step % LULLABY_PHRASE.length];
        const tineIndex = TINE_NOTES.indexOf(note);
        if (tineIndex >= 0) {
          playTine(tineIndex, { quiet: true });
          // Flash the tine she strikes, so a player watching can read the
          // sequence by eye as well as by ear.
          const t = tines[tineIndex];
          const original = t.material;
          t.material = material('bulbOn', { emissive: 0xa98fd6, emissiveIntensity: 5 });
          setTimeout(() => { t.material = original; }, 320);
        }
        step++;
        // A pause at the end of the phrase, so the loop point is obvious.
        if (step % LULLABY_PHRASE.length === 0) step += 0;
      },
      onUpdateExtra: null,
    });
    ghosts.push({
      update: (dt, playerPos, active) => operator.update(dt, playerPos, active),
      dispose: () => operator.dispose(),
    });
  }

  puzzles.register({
    id: 'ch3-music',
    name: 'The Music Box',
    objective: 'Six tines. Play the right six notes.',
    marker: new THREE.Vector3(8.4, BAS_Y + 1, -18.5),
    hints: [
      'The music box on the bench is the lock — the cylinder turns when it hears the right tune. It is a tune everyone who worked here knew by heart. The box is missing its cylinder, and the cylinder is a long way west of here.',
      'Someone is still sitting at that bench playing it. Put the mask on with the Echo lens and watch her hands: the tine she strikes lights up. She plays the same six notes on a loop.',
      'Left to right, the tines are D, E, F, G, A, B-flat. The phrase is D — F — A — G — F — E, so strike tines 1, 3, 5, 4, 3, 2 in that order. Every strike is loud, so do it when nothing is nearby.',
    ],
  });

  // ==========================================================================
  // PUZZLE 3 + CHASE — The Practice Room
  // ==========================================================================

  // Widened from 18 to 22, which brings its west wall from x = 11 to x = 9 —
  // where the costume store's east wall actually is. They were two metres
  // apart, with the store's east doorway opening onto the gap.
  const PRAC = { x: 20, z: -22, w: 22, d: 22, h: 6.6 };
  kit.room({
    width: PRAC.w, depth: PRAC.d, height: PRAC.h, x: PRAC.x, z: PRAC.z, y: BAS_Y,
    floorMat: material('lobbyFloor', { repeat: 5 }),
    wallMat: material('wallPlasterClean', { repeat: 4 }),
    ceilMat: material('ceiling', { repeat: 3 }),
    surface: 'wood',
    openings: [
      { side: 'w', at: 0, width: 1.8, top: 2.4 },
      { side: 'e', at: 0, width: 1.8, top: 2.4 },   // the way out
    ],
  });

  kit.practical(PRAC.x, BAS_Y + 4.8, PRAC.z, { intensity: 14, distance: 11, flicker: { chance: 0.3, severity: 0.6, seed: 141 } });
  kit.dust(new THREE.Vector3(PRAC.x, BAS_Y + 2, PRAC.z), new THREE.Vector3(22, 6, 22), { count: 1100, seed: 91 });

  // Tiered choir stands.
  for (let tier = 0; tier < 3; tier++) {
    kit.box(10, 0.3 + tier * 0.3, 1.5, PRAC.x, BAS_Y + (0.3 + tier * 0.3) / 2, PRAC.z - 4 + tier * 1.5,
      material('paintedWood', { color: 0x3a2a1e }), { surface: 'wood' });
  }

  // --- the gramophone -------------------------------------------------------
  const gram = new THREE.Group();
  gram.position.set(PRAC.x - 6.5, BAS_Y, PRAC.z + 5.5);
  scene.add(gram);
  {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.5), material('paintedWood', { color: 0x2f2118 }));
    cab.position.y = 0.42;
    cab.castShadow = true;
    gram.add(cab);
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.7, 14, 1, true),
      material('brass')
    );
    horn.position.set(0, 1.15, 0);
    horn.rotation.x = -0.5;
    horn.castShadow = true;
    gram.add(horn);
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), material('brass'));
    crank.position.set(0.34, 0.5, 0);
    crank.rotation.z = Math.PI / 2;
    gram.add(crank);
    gram.userData.crank = crank;
  }

  const gramLight = new THREE.PointLight(0xffb066, 0, 6, 2);
  gramLight.position.set(PRAC.x - 6.5, BAS_Y + 1.3, PRAC.z + 5.5);
  scene.add(gramLight);

  const choir = new Choir({
    scene, physics, engine, audio, music,
    player: null,
    count: 11,
    origin: new THREE.Vector3(PRAC.x, BAS_Y, PRAC.z - 1),
    spread: 6.2,
  });
  choir.on('caught', () => ctx.onPlayerCaught('choir'));

  const WIND_SECONDS = 26;

  interaction.register({
    object: gram,
    reach: 2.2,
    holdTime: 1.6,
    label: () => (state.gramophoneTime > 1 ? 'Wind it further' : 'Wind the gramophone'),
    onUse: () => {
      state.gramophoneWinds++;
      state.gramophoneTime = Math.min(state.gramophoneTime + WIND_SECONDS, WIND_SECONDS * 1.5);
      choir.setHeld(true);
      gramLight.intensity = 5;
      audio?.leverClunk?.(gram.position);
      music.singChoirPhrase?.(audio?.panner?.(gram.position, { bus: 'music', reverb: 0.7 }), 0.8);
      hud.say('The lullaby starts. Every head in the room turns to listen.', { duration: 3.4 });
    },
  });

  kit.onUpdate((dt) => {
    if (state.gramophoneTime > 0) {
      state.gramophoneTime = Math.max(0, state.gramophoneTime - dt);
      gram.userData.crank.rotation.x += dt * 3;
      // The horn dims as the spring runs down — the player's clock.
      const frac = clamp(state.gramophoneTime / WIND_SECONDS, 0, 1);
      gramLight.intensity = 1.5 + frac * 4;

      if (state.gramophoneTime <= 0) {
        choir.setHeld(false);
        gramLight.intensity = 0;
        if (state.choirStarted && !state.chapterDone) {
          hud.say('The music stops.', { duration: 2.2 });
          audio?.staticBurst?.(0.3, 0.05);
        }
      }
    }
  });

  puzzles.register({
    id: 'ch3-choir',
    name: 'The Practice Room',
    objective: 'Get across the practice room.',
    marker: new THREE.Vector3(PRAC.x + 8, BAS_Y + 1, PRAC.z),
    hints: [
      'They only move when nobody is looking at them — not when your back is turned, but when nobody is looking. The gramophone by the door holds them still while it plays.',
      'Wind the gramophone before you start crossing. It runs for about twenty-five seconds and you can hear it winding down. You can go back and wind it again, but only if you can still reach it.',
      'Wind it fully, walk — do not sprint, sprinting makes you miss where they are — and keep turning to sweep the room with your eyes as you go. Any doll you are actually looking at cannot move. The exit is the door in the east wall.',
    ],
  });

  kit.trigger({
    x: PRAC.x - 8, z: PRAC.z, y: BAS_Y + 1.5, width: 2.5, depth: 5,
    onEnter: () => {
      if (state.choirStarted) return;
      state.choirStarted = true;
      ctx.checkpoint('ch3-choir-start');
      choir.start();
      music.setMood('tension');
      ctx.playRadio(RADIO['ch3-radio-3']);
    },
  });

  kit.trigger({
    x: PRAC.x + 8.5, z: PRAC.z, y: BAS_Y + 1.5, width: 2, depth: 3,
    onEnter: () => {
      if (state.chapterDone) return;
      state.chapterDone = true;
      choir.stop();
      gloam.stop();
      music.setMood('calm');
      hud.say('The door closes behind you. The humming does not stop; it just gets quieter.', { duration: 5 });
      setTimeout(() => ctx.completeChapter(3), 3400);
    },
  });

  // ==========================================================================
  // COLLECTIBLES
  // ==========================================================================

  placeNote(scene, interaction, reader, save, 'ch3-note-blocking', new THREE.Vector3(-8.2, 0.86, 7.3), 0.3);
  placeNote(scene, interaction, reader, save, 'ch3-note-tuning', new THREE.Vector3(8.4, BAS_Y + 0.84, -18.0), -0.3);
  placeNote(scene, interaction, reader, save, 'ch3-note-marta', new THREE.Vector3(-15.6, BAS_Y + 0.05, -23), 0.9);
  placeNote(scene, interaction, reader, save, 'ch3-note-hearing', new THREE.Vector3(-6.0, BAS_Y + 0.05, -16.4), -0.5);
  placeNote(scene, interaction, reader, save, 'ch3-note-choir', new THREE.Vector3(PRAC.x - 6.5, BAS_Y + 0.9, PRAC.z + 5.1), 0.2);

  placeStub(scene, interaction, reader, save, 'ch3-stub-1', new THREE.Vector3(7.4, 1.07, -6.4));
  placeStub(scene, interaction, reader, save, 'ch3-stub-2', new THREE.Vector3(5.6, BAS_Y + 0.04, -27.5));

  placeTape(scene, interaction, reader, save, 'ch3-tape-rehearsal', new THREE.Vector3(-8.6, 0.05, 5.4));

  // ==========================================================================

  return {
    scene,
    kit,
    spawn: new THREE.Vector3(0, 1.2, 13.0),
    spawnYaw: 0,
    state,

    // Exposed so the portrait and playtest scripts can find them. They are
    // the two things in this chapter worth photographing, and a tool that
    // has to guess at a level's internals photographs nothing.
    gloam,
    choir,

    onPlayerReady(player) {
      gloam.player = player;
      choir.player = player;
    },

    /** What caught them, so the jumpscare frames the right thing. */
    subjectFor(cause) {
      if (cause === 'gloam') return gloam.root;
      if (cause === 'choir') return choir.nearestDoll;
      return null;
    },

    onRespawn() {
      // Put every encounter back to its start so a death is a retry, not a
      // continuation of the situation that killed you.
      gloam.reset();
      choir.reset();
      choir.setHeld(false);
      state.gramophoneTime = 0;
      gramLight.intensity = 0;

      if (!state.chapterDone) {
        state.choirStarted = false;
        state.callEntry = [];
        if (state.blockingDone) {
          // Already past the hall; Gloam stays awake but loses the scent.
          gloam.start();
        }
      }
      music.setMood('unease');
    },

    update(dt, time, player) {
      kit.update(dt, time, player);

      const echo = echoActive();
      for (const g of ghosts) g.update(dt, player.position, echo);

      if (gloam.enabled) gloam.update(dt, { maskHum: mask.hum });
      if (choir.enabled) choir.update(dt);
    },

    serialize: () => ({ ...state }),
    restore(data) { Object.assign(state, data ?? {}); },

    dispose() {
      gloam.dispose();
      choir.dispose();
      for (const g of ghosts) g.dispose();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isLine) o.geometry?.dispose();
      });
    },
  };
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

/**
 * The magic lantern's slide, drawn from the three discs' rotations.
 *
 * The photograph is cut into three horizontal bands — sky, the company, the
 * stage floor — one to a disc. A disc turned a quarter, a half or three
 * quarters draws its band rotated, which shears the picture apart exactly the
 * way a misaligned lantern does: the content is all still there and none of it
 * lines up.
 *
 * Drawing it this way rather than shipping four pre-made images means the
 * screen and the machine can never disagree, and the near-misses are legible —
 * one disc out is obviously one disc out.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} turns  quarter-turns of each disc, 0..3
 */
function drawCompanyPhoto(canvas, turns) {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d');

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0b0906';
  g.fillRect(0, 0, W, H);

  const band = H / 3;

  /** Paint one third of the photograph into a scratch canvas. */
  const paintBand = (index) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = band;
    const b = c.getContext('2d');

    // Sepia stock, brighter at the top.
    const sky = b.createLinearGradient(0, 0, 0, band);
    sky.addColorStop(0, index === 0 ? '#f0e3c2' : '#ddcaa1');
    sky.addColorStop(1, index === 2 ? '#8a7350' : '#b8a27a');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, band);

    if (index === 0) {
      // The fly tower and the top of the proscenium arch.
      b.fillStyle = '#3c3122';
      b.fillRect(0, 0, W, 18);
      for (let i = 0; i < 9; i++) {
        b.fillRect(24 + i * 54, 0, 12, 40 + (i % 3) * 14);
      }
      b.fillStyle = '#2c2418';
      b.beginPath();
      b.moveTo(40, band);
      b.lineTo(40, 46);
      b.lineTo(W - 40, 46);
      b.lineTo(W - 40, band);
      b.closePath();
      b.stroke();
    } else if (index === 1) {
      // The company, in a row. Heads and shoulders, all the same height —
      // except one at the back, which is the point of the picture.
      b.fillStyle = '#2f2718';
      for (let i = 0; i < 21; i++) {
        const x = 16 + i * 23;
        b.fillRect(x, band - 44, 15, 44);
        b.beginPath();
        b.arc(x + 7.5, band - 50, 7.5, 0, Math.PI * 2);
        b.fill();
      }
      // The forty-fourth: taller, further back, feet above the line.
      b.fillStyle = '#1d180f';
      b.fillRect(W * 0.62, band - 74, 17, 60);
      b.beginPath();
      b.arc(W * 0.62 + 8.5, band - 82, 9.5, 0, Math.PI * 2);
      b.fill();
    } else {
      // The stage floor, and the footlights along its lip.
      b.fillStyle = '#4a3c28';
      b.fillRect(0, band - 34, W, 34);
      b.fillStyle = '#d8c48e';
      for (let i = 0; i < 16; i++) {
        b.beginPath();
        b.ellipse(22 + i * 31, band - 30, 7, 4, 0, 0, Math.PI * 2);
        b.fill();
      }
    }

    // Grain and the circular vignette of a lantern slide.
    const img = b.getImageData(0, 0, W, band);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    b.putImageData(img, 0, 0);

    return c;
  };

  for (let i = 0; i < 3; i++) {
    const strip = paintBand(i);
    const turn = ((turns[i] ?? 0) % 4 + 4) % 4;

    // A quarter turn SLIDES the band, it does not rotate the image.
    //
    // A disc carries its picture round its rim and the gate shows one arc of
    // it, so turning the disc scrolls that band sideways and wraps. Rotating
    // the band in place instead — which the first version did — takes a strip
    // 512 wide and 128 tall and stands it on end, so seven eighths of the band
    // falls outside the gate and the plate reads as missing rather than
    // misaligned. Sliding keeps every piece of the photograph on the plate,
    // which is what lets the player see how far out each disc is.
    const offset = (turn * W) / 4;

    g.save();
    g.beginPath();
    g.rect(0, i * band, W, band);
    g.clip();
    g.drawImage(strip, -offset, i * band);
    g.drawImage(strip, W - offset, i * band);
    g.restore();
  }

  // The lantern's own circular mask, over the whole plate.
  // Gentle. A lantern's circular mask should frame the plate, not eat it —
  // at 0.95 alpha from a third of the way out it took everything but a strip
  // down the middle, which on a puzzle you have to read is fatal.
  const mask = g.createRadialGradient(W / 2, H / 2, H * 0.52, W / 2, H / 2, H * 0.88);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(1, 'rgba(6,5,4,0.75)');
  g.fillStyle = mask;
  g.fillRect(0, 0, W, H);
}
