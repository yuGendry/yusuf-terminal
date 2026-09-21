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
    marksHit: [],
    blockingDone: false,
    tineEntry: [],
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
    ],
  });

  // Costume racks forming the maze. Each is solid, so they are real cover.
  const rackRows = [
    [-17, -19, 9], [-17, -24, 9], [-17, -29, 9],
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
    objective: 'Cross the costume floor. Quietly.',
    marker: new THREE.Vector3(9, BAS_Y + 1, -22),
    hints: [
      'Whatever is down here has no eyes. Light does not give you away and darkness does not protect you. Only noise matters.',
      'Sprinting is loud, walking is audible, and crouching is almost silent — hold Ctrl and take your time. The mask hums, so take it off before you go down. If it stops moving, you stop moving too.',
      'Crouch the whole way and keep the costume racks between you and the sound. The exit is on the east wall, at the far end. If it starts coming for you, stop dead and wait — it goes to where the noise was, not to where you are.',
    ],
  });

  // The player's footsteps are what it hears — reported here, not sensed there.
  ctx.onFootstep = (info) => {
    if (gloam.enabled) gloam.hear(info.position, info.loudness);
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
      enabled: () => !state.costumeDoorOpen,
      disabledLabel: 'The cylinder has turned',
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
      'The music box on the bench is the lock — the cylinder turns when it hears the right tune. It is a tune everyone who worked here knew by heart.',
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

    onPlayerReady(player) {
      gloam.player = player;
      choir.player = player;
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
