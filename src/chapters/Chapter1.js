/**
 * Chapter1.js — "Curtain Call"
 *
 * Lobby → ticket office → the house → the stage → the rigging.
 *
 * Structure:
 *   P1  The Ticket Window   — a physical reach puzzle; teaches looking closely
 *   .   THE VEILMASK        — acquired; Threadlight unlocked
 *   P2  The Breaker Run     — teaches the lens: follow threads to their source
 *   P3  The Lighting Board  — the chapter's real puzzle; six sliders, three lights
 *   C   The Rigging Run     — Mister Tangle, 50 seconds, ends at the fire door
 *
 * The teaching order is deliberate: the player solves one puzzle with their
 * eyes, is given the lens, solves one that is *only* possible with the lens,
 * then solves one where the lens supplies information but they still have to
 * think. By the chase they can read a rail layout at a glance, which is the
 * one skill the chase tests.
 */

import * as THREE from 'three';
import { material } from '../world/Materials.js';
import { LevelKit } from '../world/LevelKit.js';
import { RailNetwork, MisterTangle } from '../ai/MisterTangle.js';
import { NOTES, TAPES, STUBS, RADIO } from './StoryContent.js';
import { clamp, damp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/**
 * The lighting-board solution.
 *
 * Sliders are wired to spotlights in a scrambled order, which the player can
 * only discover through the Threadlight lens. The poster backstage shows which
 * *lights* must be lit — never which sliders — so the lens is load-bearing and
 * the answer cannot be brute-forced by feel.
 */
const BOARD_WIRING = [3, 0, 5, 1, 4, 2];   // slider index -> spotlight index
const BOARD_TARGET = [0, 2, 4];            // spotlights the poster shows lit

export function buildChapter1(ctx) {
  const { physics, engine, audio, music, save, puzzles, interaction, mask, flashlight, hud, reader } = ctx;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03030a);
  scene.fog = new THREE.FogExp2(0x07080e, 0.022);

  const kit = new LevelKit({ scene, physics, engine, audio });
  const rng = makeRng(1986);

  // The light floor for the whole chapter. Everything else is practicals.
  kit.ambience({ strength: 1.15 });

  const state = {
    ticketDrawerOpen: false,
    breakersOn: [false, false, false],
    boardSliders: [0, 0, 0, 0, 0, 0],
    stageDoorOpen: false,
    chaseStarted: false,
    chaseDone: false,
    lightsOn: false,
  };

  // ==========================================================================
  // LOBBY  — the player enters through the coal door at the south end
  // ==========================================================================

  const lobby = kit.room({
    width: 20, depth: 16, height: 8.5, x: 0, z: 0,
    floorMat: material('lobbyFloor', { repeat: 6 }),
    wallMat: material('wallpaperLobby', { repeat: 4 }),
    ceilMat: material('ceiling', { repeat: 4 }),
    surface: 'carpet',
    openings: [
      { side: 'n', at: 0, width: 3.4, top: 3.2 },      // into the house
      // The ticket window. Both sides of this wall must agree it is a window
      // and not a doorway: a sill here, a sill in the office, and the counter
      // between them. `walkable: false` tells the passability check that the
      // counter blocking it is the point, not a bug.
      { side: 'e', at: -3, width: 1.6, sill: 1.0, top: 2.1, walkable: false },
    ],
  });

  // Runner carpet down the centre, which also tells the player where to walk.
  kit.box(3.6, 0.02, 15, 0, 0.011, 0, material('seatVelvet', { repeat: 4 }), {
    surface: 'carpet', solid: false, shadow: false,
  });

  // Boarded entrance doors behind the player — the way they came in.
  kit.window(0, 2.4, 7.9, { width: 3.2, height: 3.6, boarded: true, rayLength: 9, rayIntensity: 0.12 });

  // Two more windows high on the west wall, doing most of the lighting work.
  kit.window(-9.9, 3.6, -2, { width: 1.6, height: 2.4, rotY: Math.PI / 2, boarded: true, rayLength: 9, rayIntensity: 0.19 });
  kit.window(-9.9, 3.6, 3, { width: 1.6, height: 2.4, rotY: Math.PI / 2, boarded: true, rayLength: 9, rayIntensity: 0.19 });

  kit.dust(new THREE.Vector3(0, 3, 0), new THREE.Vector3(20, 6, 16), { count: 900, seed: 11 });

  // A grand staircase stub going nowhere (the upper floor collapsed).
  for (let i = 0; i < 6; i++) {
    const h = 0.19 * (i + 1);
    kit.box(4.2, h, 0.34, 6.4, h / 2, -5.4 + i * 0.34, material('lobbyFloor', { repeat: 1 }), { surface: 'wood' });
  }
  kit.box(4.4, 0.9, 2.2, 6.4, 1.6, -7.2, material('paintedWood', { color: 0x241a12 }), { surface: 'wood' });
  // Rubble blocking the top.
  for (let i = 0; i < 9; i++) {
    kit.crate(5.2 + rng() * 2.4, 2.3 + rng() * 0.6, -7.6 + rng() * 1.2, randRange(0.3, 0.7));
  }

  kit.practical(0, 5.9, 2, { intensity: 22, distance: 13, flicker: { chance: 0.55, severity: 0.9, seed: 3 } });
  kit.sconce(-9.6, 2.6, 5, { rotY: Math.PI / 2, intensity: 7, flicker: { chance: 0.3, severity: 0.6, seed: 8 } });
  kit.sconce(9.6, 2.6, 5, { rotY: -Math.PI / 2, intensity: 7 });

  // Set dressing: a velvet rope line nobody will ever queue in again.
  for (let i = 0; i < 5; i++) {
    const px = -5 + i * 2.2;
    kit.box(0.09, 0.92, 0.09, px, 0.46, 4.2, material('brass'), { surface: 'metal' });
    const ballTop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), material('brass'));
    ballTop.position.set(px, 0.96, 4.2);
    ballTop.castShadow = true;
    scene.add(ballTop);
  }

  // ==========================================================================
  // PUZZLE 1 — The Ticket Window
  // ==========================================================================
  //
  // The office door is locked. The torch is visible through the ticket window,
  // in a drawer on the far side. The window's brass grille has one bent bar.
  // Looking closely (crouching to eye level) shows the gap. Reaching through
  // opens the drawer from the inside.
  //
  // No lens needed: this is the puzzle that teaches "look at things".

  kit.room({
    width: 5, depth: 4.4, height: 3.0, x: 12.4, z: -3,
    floorMat: material('lobbyFloor', { repeat: 2 }),
    wallMat: material('wallPlaster', { repeat: 2 }),
    ceilMat: material('ceiling', { repeat: 2 }),
    surface: 'wood',
    // A real window: wall below the counter, glassless gap above it, header
    // over the top. The gap spans standing eye height so the player can see
    // the torch on the far side, which is the entire premise of the puzzle.
    openings: [{ side: 'w', at: 0, width: 1.6, sill: 1.0, top: 2.1, walkable: false }],
    walls: { n: true, s: true, e: true, w: true },
  });

  // The counter and the grille.
  //
  // The window is in the office's WEST wall (the wall at x = 9.9), so it opens
  // along Z. Everything in it has to be laid out along Z as well: a grille
  // whose bars march along X runs straight out through the wall into the
  // lobby, and the player's view into the office is blocked by its own bars.
  const WINDOW_X = 9.9;
  const WINDOW_Z = -3;

  // Counter: shallow through the wall, wide along it.
  kit.box(0.55, 0.12, 1.5, WINDOW_X - 0.05, 1.05, WINDOW_Z,
    material('paintedWood', { color: 0x3a2a1c }), { surface: 'wood' });

  const grille = new THREE.Group();
  grille.position.set(WINDOW_X, 1.78, WINDOW_Z);
  scene.add(grille);

  const BENT_BAR = 6;   // the one somebody has already been through
  for (let i = 0; i < 9; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.0, 6), material('brass'));
    // Spaced along Z, across the opening.
    bar.position.set(0, 0, -0.6 + i * 0.15);
    // One bar is bent aside. This is the whole puzzle, stated in geometry.
    if (i === BENT_BAR) {
      bar.rotation.x = 0.38;
      bar.position.z += 0.07;
    }
    bar.castShadow = true;
    grille.add(bar);
  }

  // Top and bottom rails, so it reads as a fitted grille rather than loose bars.
  for (const ry of [-0.5, 0.5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.4), material('brass'));
    rail.position.set(0, ry, 0);
    rail.castShadow = true;
    grille.add(rail);
  }

  kit.sconce(12.4, 2.4, -1.2, { intensity: 6, flicker: { chance: 0.8, severity: 0.95, seed: 21 } });

  // A little light over the ticket window itself, so the grille — and the bar
  // that has been bent aside — is legible from the lobby.
  const windowLamp = new THREE.PointLight(0xffc98a, 6, 5, 2);
  windowLamp.position.set(WINDOW_X - 0.5, 2.5, WINDOW_Z);
  windowLamp.castShadow = false;
  scene.add(windowLamp);

  // The drawer, with the torch in it.
  const drawer = kit.box(0.7, 0.16, 0.5, 12.2, 0.85, -3.2,
    material('paintedWood', { color: 0x3a2a1c }), { surface: 'wood', solid: false });

  const torchMesh = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.23, 12), material('steel', { repeat: 1 }));
    body.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.04, 0.07, 12), material('brass'));
    head.rotation.z = Math.PI / 2;
    head.position.x = 0.15;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), material('bulbOff'));
    lens.rotation.y = Math.PI / 2;
    lens.position.x = 0.186;
    torchMesh.add(body, head, lens);
  }
  // The torch starts in the drawer, deep in the office. When the drawer opens
  // it rolls forward onto the counter, on the player's side of the grille —
  // otherwise it sits ~3m away behind a wall, further than any sane reach, and
  // the player can see the thing they need and simply cannot take it.
  const TORCH_IN_DRAWER = new THREE.Vector3(12.2, 0.94, -3.2);
  // On the counter, on the player's side of the wall — the wall slab itself
  // occupies x 9.73..10.07, so anything at 10.05 is buried inside it.
  const TORCH_ON_COUNTER = new THREE.Vector3(9.62, 1.17, -3.0);

  torchMesh.position.copy(TORCH_IN_DRAWER);
  torchMesh.rotation.y = 0.4;
  torchMesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  torchMesh.visible = false;
  scene.add(torchMesh);

  // A small light on it once it is out, so it cannot be missed in the dark.
  const torchGlint = new THREE.PointLight(0xffe0b0, 0, 2.2, 2);
  torchGlint.position.copy(TORCH_ON_COUNTER).add(new THREE.Vector3(0, 0.2, 0));
  scene.add(torchGlint);

  puzzles.register({
    id: 'ch1-ticket',
    name: 'The Ticket Window',
    objective: 'Find a way into the ticket office.',
    marker: new THREE.Vector3(9.9, 1.4, -3),
    hints: [
      'The office door is bolted from the inside, but the ticket window is not glass — it is bars. Get down to the counter and look along them.',
      'One of the bars has been bent aside, low down on the right. Somebody has been through this window before you. The gap is wide enough for an arm, not for you.',
      'Crouch at the counter, look at the bent bar on the right of the grille, and reach through. The drawer on the far side opens from the inside.',
    ],
  });
  puzzles.activate('ch1-ticket');

  interaction.register({
    object: grille,
    reach: 1.9,
    label: () => (state.ticketDrawerOpen ? 'The drawer is empty' : 'Reach through the bent bar'),
    enabled: () => !state.ticketDrawerOpen,
    disabledLabel: 'The drawer is empty',
    onUse: () => {
      state.ticketDrawerOpen = true;
      drawer.position.x += 0.28;
      audio?.leverClunk?.(TORCH_IN_DRAWER);

      // It rolls out of the drawer, across the counter, to the window.
      torchMesh.visible = true;
      torchGlint.intensity = 2.2;
      let roll = 0;
      const rollUpdate = kit.onUpdate((dt) => {
        if (roll >= 1) return;
        roll = Math.min(1, roll + dt * 1.4);
        const e = roll * roll * (3 - 2 * roll);   // smoothstep
        torchMesh.position.lerpVectors(TORCH_IN_DRAWER, TORCH_ON_COUNTER, e);
        torchMesh.rotation.z -= dt * 7;
      });
      void rollUpdate;

      hud.say('Something rolls forward in the drawer, and keeps rolling.', { duration: 3.4 });
      puzzles.solve('ch1-ticket');
      setTimeout(() => puzzles.activate('ch1-mask'), 900);
    },
  });

  interaction.register({
    object: torchMesh,
    reach: 2.6,
    label: 'Take the torch',
    enabled: () => state.ticketDrawerOpen,
    onUse: () => {
      flashlight.give({ battery: 0.62 });
      torchMesh.visible = false;
      torchGlint.intensity = 0;
      hud.say('A torch. Half a cell left, and somebody has scratched a W into the barrel.', { duration: 4.5 });
      hud.setObjective('Find the way into the house.');
      interaction.unregister(torchMesh);
    },
  });

  // ==========================================================================
  // THE VEILMASK — on the box-office counter, under a ledger
  // ==========================================================================

  const maskProp = new THREE.Group();
  {
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), material('porcelainClean'));
    face.rotation.x = Math.PI;
    face.scale.set(1, 1.18, 0.72);
    maskProp.add(face);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), material('feltDark'));
      eye.position.set(side * 0.042, -0.012, -0.072);
      maskProp.add(eye);
    }
  }
  maskProp.position.set(-2.4, 1.12, 5.6);
  maskProp.rotation.set(-0.35, 0.4, 0);
  maskProp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(maskProp);

  kit.table(-2.4, 0, 5.6, { width: 1.6, depth: 0.8 });
  // A hard little light on the mask, so the player finds it without being told.
  const maskSpot = new THREE.SpotLight(0xfff0d0, 22, 6, Math.PI / 7, 0.6, 2);
  maskSpot.position.set(-2.4, 4.2, 5.2);
  maskSpot.target.position.set(-2.4, 1.1, 5.6);
  maskSpot.castShadow = true;
  maskSpot.shadow.mapSize.setScalar(1024);
  maskSpot.shadow.bias = -0.002;
  scene.add(maskSpot, maskSpot.target);

  puzzles.register({
    id: 'ch1-mask',
    name: 'The Package',
    objective: 'Wren sent you something. Find it.',
    marker: new THREE.Vector3(-2.4, 1.2, 5.6),
    hints: [
      'You came in through the lobby. Whatever she left you, she left it where you would walk past it.',
      'There is a light still burning over the box-office counter, on the west side of the lobby. Nothing else in this building is lit on purpose.',
      'The mask is on the counter under the ledger, west side of the lobby. Pick it up, then press F to put it on.',
    ],
  });

  interaction.register({
    object: maskProp,
    reach: 2.2,
    label: 'Take the porcelain mask',
    onUse: () => {
      mask.give();
      mask.unlockLens('threadlight');
      maskProp.visible = false;
      interaction.unregister(maskProp);
      puzzles.solve('ch1-mask');

      reader.showNote(NOTES['ch1-note-wren']);
      save.recordCollectible('note', 'ch1-note-wren');

      reader.onClose = () => {
        reader.onClose = null;
        hud.say('Press F to put the mask on.', { duration: 6 });
        hud.setObjective('Put the mask on.');
        music.setMood('unease');
        setTimeout(() => ctx.playRadio(RADIO['ch1-radio-2']), 3000);
        puzzles.activate('ch1-breakers');
      };
    },
  });

  // ==========================================================================
  // HOUSE — the auditorium
  // ==========================================================================

  const STAGE_Z = -34;
  const STAGE_H = 1.2;

  const house = kit.room({
    width: 24, depth: 26, height: 13.5, x: 0, z: -21,
    floorMat: material('lobbyFloor', { repeat: 7 }),
    wallMat: material('wallPlaster', { repeat: 5 }),
    ceilMat: material('ceiling', { repeat: 5 }),
    surface: 'carpet',
    openings: [
      { side: 's', at: 0, width: 3.4, top: 3.2 },
      { side: 'n', at: 0, width: 24, top: 11 },     // fully open onto the stage
    ],
    walls: { n: false, s: true, e: true, w: true },
  });

  kit.dust(new THREE.Vector3(0, 5, -21), new THREE.Vector3(24, 10, 26), { count: 1400, seed: 5 });

  // --- house lighting -------------------------------------------------------
  //
  // The auditorium used to be lit only by the stage rig and the house lights,
  // both of which are off until the player solves a puzzle — which left the
  // biggest room in the chapter pitch black, with the three breaker boxes the
  // puzzle depends on invisible against the walls. Dark is the point, but
  // unnavigable is not.
  //
  // What is on is what would plausibly still be on: the emergency circuit.

  // Exit signs at the back of the house. Cold green, which also separates this
  // room from the warm lobby behind it.
  for (const ex of [-9.5, 9.5]) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.08), material('exitSign'));
    sign.position.set(ex, 3.1, -8.6);
    scene.add(sign);
    const l = new THREE.PointLight(0x2ecc71, 5, 7, 2);
    l.position.set(ex, 3.0, -8.3);
    l.castShadow = false;
    scene.add(l);
  }

  // Aisle sconces down both side walls. Most are failing; two are dead.
  const sconceZs = [-12, -17, -22, -27];
  sconceZs.forEach((sz, i) => {
    for (const side of [-1, 1]) {
      const dead = (i === 2 && side < 0) || (i === 0 && side > 0);
      kit.sconce(side * 11.5, 2.9, sz, {
        rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        intensity: dead ? 0 : 11,
        distance: 9,
        flicker: dead ? null : { chance: 0.45 + i * 0.1, severity: 0.85, seed: 100 + i * 7 + side },
      });
    }
  });

  // The ghost light: a single bare bulb on a stand, downstage centre.
  //
  // Theatres genuinely leave one burning on an empty stage overnight — partly
  // so nobody walks into the orchestra pit, and traditionally to give the
  // building's ghosts a stage of their own so they do not want yours. It is
  // the right object for this room in every sense, and it gives the player a
  // fixed point to navigate the whole auditorium by.
  {
    const stand = new THREE.Group();
    stand.position.set(-1.6, STAGE_H, -32.2);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 14), material('rustedSteel', { repeat: 1 }));
    base.castShadow = true;
    stand.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.75, 8), material('rustedSteel', { repeat: 1 }));
    pole.position.y = 0.9;
    pole.castShadow = true;
    stand.add(pole);
    const cage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.26, 10, 1, true),
      material('rustedSteel', { repeat: 1 })
    );
    cage.position.y = 1.86;
    stand.add(cage);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 10),
      material('bulbOn', { emissive: 0xffd9a0, emissiveIntensity: 7 })
    );
    bulb.position.y = 1.86;
    bulb.scale.y = 1.3;
    stand.add(bulb);

    const ghost = new THREE.PointLight(0xffc98a, 46, 26, 2);
    ghost.position.y = 1.86;
    ghost.castShadow = true;
    ghost.shadow.mapSize.setScalar(1024);
    ghost.shadow.bias = -0.004;
    ghost.shadow.normalBias = 0.03;
    ghost.shadow.camera.near = 0.1;
    ghost.shadow.camera.far = 26;
    ghost.userData.maxShadowSize = 1024;
    stand.add(ghost);

    scene.add(stand);

    // It breathes rather than flickers — this bulb has been burning for ten
    // years and is the one thing in the building that still works properly.
    kit.onUpdate((dt, t) => {
      const b = 1 + Math.sin(t * 0.7) * 0.04 + Math.sin(t * 2.3) * 0.015;
      ghost.intensity = 46 * b;
      bulb.material.emissiveIntensity = 7 * b;
    });
  }

  // A weak bounce so the ceiling and the upper walls are not a black lid.
  const houseFill = new THREE.PointLight(0x9fb4d0, 9, 30, 1.6);
  houseFill.position.set(0, 7.5, -20);
  houseFill.castShadow = false;
  scene.add(houseFill);

  // --- seating (instanced: ~120 seats for four draw calls) ------------------
  buildSeating(scene, kit, rng);

  // --- stage ---------------------------------------------------------------
  kit.box(22, STAGE_H, 9, 0, STAGE_H / 2, STAGE_Z, material('stageFloor', { repeat: 4 }), { surface: 'wood' });

  // Rehearsal treads at the front of the stage.
  //
  // Not decoration — without them the stage is a 1.2m wall. The character
  // controller auto-steps 0.42m and a jump clears about 0.74m, so a player
  // simply cannot get up, which makes the lighting board unreachable and the
  // chapter unfinishable. Every working theatre has a set of these pushed
  // against the apron for exactly this reason.
  const STAGE_FRONT = STAGE_Z + 4.5;
  const buildTreads = (tx) => {
    const steps = 5;
    const rise = STAGE_H / steps;
    const tread = 0.34;
    for (let i = 0; i < steps; i++) {
      const h = rise * (i + 1);
      // Lowest tread furthest from the stage, climbing toward it.
      const tz = STAGE_FRONT + (steps - i) * tread - tread / 2;
      kit.box(1.9, h, tread, tx, h / 2, tz,
        material('paintedWood', { color: 0x3b2c20 }), { surface: 'wood' });
    }
    // A handrail, which also makes the steps readable from across the house.
    for (const side of [-1, 1]) {
      kit.box(0.07, 0.95, steps * tread + 0.2, tx + side * 1.0, STAGE_H * 0.55 + 0.5,
        STAGE_FRONT + (steps * tread) / 2,
        material('rustedSteel', { repeat: 1 }), { surface: 'metal' });
    }
  };

  // Two sets, stage left and stage right, so the player meets one whichever
  // side of the house they come down.
  buildTreads(-6.5);
  buildTreads(6.5);

  // Proscenium.
  const archMat = material('paintedWood', { color: 0x2e2018 });
  for (const side of [-1, 1]) {
    kit.box(1.0, 11, 1.2, side * 11.0, 5.5, -30.4, archMat, { surface: 'wood' });
  }
  kit.box(24, 1.8, 1.2, 0, 10.1, -30.4, archMat, { surface: 'wood' });

  // Curtains, drawn back.
  buildCurtains(scene, kit, rng, STAGE_Z);

  // ==========================================================================
  // PUZZLE 2 — The Breaker Run
  // ==========================================================================
  //
  // The lighting board is dead. Three breakers in the house feed it, but the
  // conduit runs are buried in plaster and the breaker labels have rotted off.
  // Through Threadlight, each breaker's thread runs to what it actually feeds —
  // and only one of the three goes to the board. The other two feed the house
  // lights (which wake Tangle early — a real cost, not a fail state).

  const breakerPositions = [
    new THREE.Vector3(-11.4, 1.5, -14),
    new THREE.Vector3(11.4, 1.5, -18),
    new THREE.Vector3(-11.4, 1.5, -26),
  ];
  // Breaker 1 is the board. The others are the house lights and a dead circuit.
  const BREAKER_ROLE = ['house', 'board', 'dead'];

  const breakerMeshes = [];
  breakerPositions.forEach((pos, i) => {
    // Painted grey rather than rusted: against aged plaster a rusted box is
    // almost invisible, and the player has to be able to spot these from the
    // aisle. The enamel plate above each one is the other half of that.
    const boxMesh = kit.box(0.34, 0.5, 0.18, pos.x, pos.y, pos.z,
      material('steel', { repeat: 1 }), { surface: 'metal', solid: false });

    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.09),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.75, side: THREE.DoubleSide })
    );
    plate.position.set(pos.x + (pos.x < 0 ? 0.1 : -0.1), pos.y + 0.34, pos.z);
    plate.rotation.y = pos.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(plate);

    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.16, 0.05),
      material('paintedWood', { color: 0x6a1f1c })
    );
    lever.position.set(pos.x + (pos.x < 0 ? 0.12 : -0.12), pos.y + 0.1, pos.z);
    lever.castShadow = true;
    scene.add(lever);
    breakerMeshes.push({ boxMesh, lever, pos, role: BREAKER_ROLE[i], index: i });

    // The Threadlight run: a glowing cable from the breaker to whatever it
    // actually feeds. Only visible through the lens — this is the puzzle.
    const dest = BREAKER_ROLE[i] === 'board'
      ? new THREE.Vector3(3.2, 1.5, -31.5)
      : BREAKER_ROLE[i] === 'house'
        ? new THREE.Vector3(0, 10.4, -21)
        : new THREE.Vector3(pos.x, 0.2, pos.z + (pos.z < -20 ? -3 : 3));

    addThreadRun(scene, pos, dest, BREAKER_ROLE[i] === 'dead' ? 0x555555 : 0x6fe3d4);
  });

  puzzles.register({
    id: 'ch1-breakers',
    name: 'The Breaker Run',
    objective: 'Get power to the stage.',
    marker: breakerPositions[1].clone(),
    hints: [
      'The lighting board on the stage is dead. Something upstream of it is switched off. There are three breaker boxes around the walls of the house.',
      'The labels rotted off decades ago, so throwing them blind is a gamble. The mask shows you where a cable actually goes — put it on and look at each box before you touch it.',
      'The breaker on the east wall, about halfway down the house, is the one whose thread runs forward to the stage. Throw that one. The other two feed the house lights, and you do not want those on.',
    ],
  });

  breakerMeshes.forEach((b) => {
    interaction.register({
      object: b.boxMesh,
      reach: 2.2,
      label: () => (state.breakersOn[b.index] ? 'Throw the breaker off' : 'Throw the breaker on'),
      onUse: () => {
        state.breakersOn[b.index] = !state.breakersOn[b.index];
        b.lever.rotation.z = state.breakersOn[b.index] ? 0.9 : 0;
        audio?.leverClunk?.(b.pos);

        if (b.role === 'board') {
          if (state.breakersOn[b.index]) {
            hud.say('Something under the stage starts humming.', { duration: 3.2 });
            puzzles.solve('ch1-breakers');
            setTimeout(() => puzzles.activate('ch1-board'), 800);
          }
        } else if (b.role === 'house') {
          // A real consequence, not a failure: the house lights come up and
          // something in the rigging notices.
          state.lightsOn = state.breakersOn[b.index];
          houseLights.forEach((l) => { l.intensity = state.lightsOn ? 26 : 0; });
          if (state.lightsOn) {
            hud.say('The house lights come up. Every seat is suddenly visible.', { duration: 4 });
            music.setMood('tension');
            audio?.distantThud?.(new THREE.Vector3(0, 9, -32));
            setTimeout(() => {
              if (state.lightsOn) hud.say('Something in the rigging shifts its weight.', { duration: 3.5 });
            }, 4200);
          } else {
            music.setMood('unease');
          }
        } else {
          hud.say('Nothing. The thread from this one just stops in the floor.', { duration: 3.2 });
        }
      },
    });
  });

  const houseLights = [];
  for (const [lx, lz] of [[-6, -16], [6, -16], [-6, -26], [6, -26]]) {
    const l = new THREE.PointLight(0xffd9a8, 0, 18, 2);
    l.position.set(lx, 10.2, lz);
    l.castShadow = false;
    scene.add(l);
    houseLights.push(l);
  }

  // ==========================================================================
  // PUZZLE 3 — The Lighting Board
  // ==========================================================================

  const boardGroup = new THREE.Group();
  boardGroup.position.set(3.2, 0, -31.6);
  scene.add(boardGroup);

  // A desk, not a cabinet. The faders sit on the TOP surface where a standing
  // player can look down at them; on the front face they end up tucked under
  // the desk's own top edge, and the view ray hits the woodwork before it ever
  // reaches the fader — the control is visible and simply cannot be aimed at.
  const BOARD_TOP = STAGE_H + 0.92;
  kit.box(2.1, 0.92, 0.75, 3.2, STAGE_H + 0.46, -31.6,
    material('rustedSteel', { repeat: 1 }), { surface: 'metal' });

  const sliderHandles = [];
  const spotlights = [];

  // Six spotlights on the bar above the stage.
  for (let i = 0; i < 6; i++) {
    const sx = -7.5 + i * 3.0;
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.42, 12),
      material('rustedSteel', { repeat: 1 })
    );
    housing.position.set(sx, 9.0, -33);
    housing.rotation.x = 0.5;
    housing.castShadow = true;
    scene.add(housing);

    const spot = new THREE.SpotLight(0xfff2d8, 0, 20, Math.PI / 11, 0.45, 2);
    spot.position.set(sx, 8.8, -33);
    spot.target.position.set(sx, STAGE_H, -34.6);
    spot.castShadow = i < 3;      // only some cast, to keep the cost sane
    if (spot.castShadow) {
      spot.shadow.mapSize.setScalar(1024);
      spot.shadow.bias = -0.002;
    }
    scene.add(spot, spot.target);

    // The stage mark each spotlight hits — chalked circles on the boards.
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.4, 20),
      new THREE.MeshBasicMaterial({ color: 0xbdb49c, transparent: true, opacity: 0.4 })
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(sx, STAGE_H + 0.012, -34.6);
    scene.add(mark);

    spotlights.push({ spot, housing, index: i, x: sx });
  }

  // Faders on the desk top, travelling front-to-back the way real ones do.
  const FADER_OUT = -31.38;    // slider at zero, nearest the operator
  const FADER_FULL = -31.78;   // slider at full

  for (let i = 0; i < 6; i++) {
    const sx = 3.2 - 0.75 + i * 0.3;

    // The slot the fader runs in, cut into the desk top.
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.012, 0.46),
      material('feltDark')
    );
    track.position.set(sx, BOARD_TOP + 0.006, (FADER_OUT + FADER_FULL) / 2);
    scene.add(track);

    // A numbered plate at the head of each slot, so the player can refer to
    // "slider 4" without counting from an arbitrary end.
    const numberPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0xd8d2c4, roughness: 0.8, side: THREE.DoubleSide,
      })
    );
    numberPlate.position.set(sx, BOARD_TOP + 0.007, FADER_OUT + 0.14);
    numberPlate.rotation.x = -Math.PI / 2;
    scene.add(numberPlate);

    // Chunky knobs. A fader cap sized like a real one is a 7cm target seen
    // from a metre away at a steep angle, which is fussy to hit with a
    // crosshair; making them taller and wider costs nothing and the desk
    // still reads correctly.
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.13, 0.1),
      material('paintedWood', { color: 0xc9a227 })
    );
    handle.position.set(sx, BOARD_TOP + 0.075, FADER_OUT);
    handle.castShadow = true;
    handle.userData.sliderIndex = i;
    scene.add(handle);
    sliderHandles.push(handle);

    // The Threadlight wiring: a thread from this fader to the lamp it
    // actually controls. Tangled deliberately — they cross.
    const target = spotlights[BOARD_WIRING[i]];
    addThreadRun(
      scene,
      new THREE.Vector3(sx, BOARD_TOP, -31.6),
      new THREE.Vector3(target.x, 8.8, -33),
      0x6fe3d4,
      { sag: 0.6 }
    );
  }

  const applyBoard = () => {
    for (let i = 0; i < 6; i++) {
      const lightIndex = BOARD_WIRING[i];
      // Intensity scaled for inverse-square falloff at ~8m throw.
      spotlights[lightIndex].spot.intensity = state.boardSliders[i] * 260;
    }
    const lit = spotlights.map((s) => s.spot.intensity > 200);
    const want = spotlights.map((_, i) => BOARD_TARGET.includes(i));
    const correct = lit.every((v, i) => v === want[i]);
    if (correct && !state.stageDoorOpen) onBoardSolved();
  };

  sliderHandles.forEach((handle) => {
    const i = handle.userData.sliderIndex;
    interaction.register({
      object: handle,
      reach: 2.4,
      label: () => `Slider ${i + 1} — ${state.boardSliders[i] > 0.5 ? 'full' : 'out'}`,
      onUse: () => {
        state.boardSliders[i] = state.boardSliders[i] > 0.5 ? 0 : 1;
        handle.position.z = FADER_OUT + (FADER_FULL - FADER_OUT) * state.boardSliders[i];
        audio?.leverClunk?.(handle.position);
        applyBoard();
      },
    });
  });

  // A shaded lamp over the desk. The board is the room's second focal point
  // after the ghost light, and the player has to be able to read six faders.
  {
    const lampLight = new THREE.SpotLight(0xffe0b0, 26, 5.5, Math.PI / 5, 0.5, 2);
    lampLight.position.set(3.2, STAGE_H + 2.0, -31.5);
    lampLight.target.position.set(3.2, BOARD_TOP, -31.6);
    lampLight.castShadow = false;
    scene.add(lampLight, lampLight.target);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.18, 12, 1, true),
      material('brass')
    );
    shade.position.set(3.2, STAGE_H + 2.02, -31.5);
    scene.add(shade);
  }

  // The poster: the clue. Shows three lights on three marks — by position.
  const poster = buildPoster(scene, kit);

  puzzles.register({
    id: 'ch1-board',
    name: 'The Lighting Board',
    objective: 'Light the stage the way the poster shows it.',
    marker: new THREE.Vector3(3.2, 2, -31.6),
    hints: [
      'The torn rehearsal poster backstage is a lighting plan. It shows which marks on the stage should be lit — look at where the light falls in the picture, and at the chalk circles on the boards.',
      'The sliders are not wired in order. Slider one does not control light one. Put the mask on at the board and follow each thread up to the lamp it actually reaches.',
      'Push sliders 2, 5 and 6 to full, and leave 1, 3 and 4 out. Slider 2 feeds the first lamp, slider 6 the third and slider 5 the fifth — the three marks the poster shows.',
    ],
  });

  function onBoardSolved() {
    state.stageDoorOpen = true;
    puzzles.solve('ch1-board');
    stageDoor.unlock();
    stageDoor.open();
    hud.say('Behind the stage, a bolt draws back.', { duration: 3.4 });
    hud.setObjective('Go through the door behind the stage.');
    music.setMood('unease');
  }

  const stageDoor = kit.door({
    x: -1.1, y: STAGE_H, z: -38.2, width: 1.3, height: 2.3, locked: true, name: 'stage-rear',
  });
  interaction.register({
    object: stageDoor.object,
    reach: 2.4,
    label: () => (stageDoor.isLocked ? 'Bolted from the far side' : stageDoor.isOpen ? 'Close' : 'Open'),
    enabled: () => !stageDoor.isLocked,
    disabledLabel: 'Bolted from the far side',
    deniedMessage: 'Bolted. The lighting board holds it.',
    onUse: () => stageDoor.toggle(),
  });

  // ==========================================================================
  // THE RIGGING — where the chase happens
  // ==========================================================================

  const rails = new RailNetwork();
  // A grid of fly rails over the stage and out across the house.
  const railY = 9.4;
  const rowA = rails.addPath([[-9, railY, -33], [-3, railY, -33], [3, railY, -33], [9, railY, -33]]);
  const rowB = rails.addPath([[-9, railY, -28], [-3, railY, -28], [3, railY, -28], [9, railY, -28]]);
  const rowC = rails.addPath([[-9, railY, -22], [-3, railY, -22], [3, railY, -22], [9, railY, -22]]);
  // Cross-links, so he can change rows — but only at four points.
  rails.connect(rowA[0], rowB[0]);
  rails.connect(rowA[3], rowB[3]);
  rails.connect(rowB[1], rowC[1]);
  rails.connect(rowB[2], rowC[2]);
  rails.buildMesh(scene);

  // Catwalks the player runs along, above the house.
  const catwalkY = 7.2;
  const catwalks = [];
  const addCatwalk = (x1, z1, x2, z2) => {
    const mid = new THREE.Vector3((x1 + x2) / 2, catwalkY, (z1 + z2) / 2);
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rotY = Math.atan2(x2 - x1, z2 - z1);
    const deck = kit.box(1.5, 0.12, len, mid.x, catwalkY, mid.z,
      material('steel', { repeat: 2 }), { surface: 'metal', rotY });
    // Handrails, which also stop the player walking off in the dark.
    for (const side of [-1, 1]) {
      kit.box(0.06, 1.0, len,
        mid.x + side * 0.72 * Math.cos(rotY),
        catwalkY + 0.56,
        mid.z - side * 0.72 * Math.sin(rotY),
        material('rustedSteel', { repeat: 1 }), { surface: 'metal', rotY });
    }
    catwalks.push(deck);
    return deck;
  };

  addCatwalk(-7, -36, -7, -20);
  addCatwalk(-7, -20, 7, -20);
  addCatwalk(7, -20, 7, -12);
  // The dead-end branch — the wrong choice in the forced fork.
  addCatwalk(-7, -26, 2, -26);

  // --- the back wall, WITH a hole in it ------------------------------------
  //
  // A door is a mesh that swings and a collider that is removed when it opens.
  // It does not cut the wall it is mounted in. Building the back wall as one
  // unbroken slab meant the door unbolted, swung open, and revealed solid
  // plaster — the chapter's third puzzle completed onto a dead end.
  //
  // Two openings: the doorway itself, and a high one at catwalk level where
  // the stairwell comes back out over the house.
  //
  // They OVERLAP in X — the catwalk leaves the stairwell directly above the
  // door — so the wall is laid out as explicit vertical bands rather than as
  // two independent holes. Punching them separately builds the low band of the
  // high opening straight across the doorway, and the door swings open onto a
  // fresh piece of wall.
  const BACK_Z = -38.4;
  const BACK_TOP = STAGE_H + 8;
  const DOOR_L = -1.1;
  const DOOR_R = 0.2;          // pivot + leaf width
  const DOOR_TOP = STAGE_H + 2.3;
  const EXIT_L = DOOR_L;       // shares the doorway's left edge
  const EXIT_R = 0.9;          // the high opening's right edge
  const EXIT_BOTTOM = catwalkY - 0.25;
  const EXIT_TOP = catwalkY + 2.4;

  const backMat = material('wallPlaster', { repeat: 4 });
  const backWall = (xFrom, xTo, yFrom, yTo) => {
    const w = xTo - xFrom;
    const h = yTo - yFrom;
    if (w <= 0.01 || h <= 0.01) return;
    kit.box(w, h, 0.4, (xFrom + xTo) / 2, (yFrom + yTo) / 2, BACK_Z, backMat,
      { surface: 'wood', shadow: false });
  };

  // Band 1: solid, west of everything.
  backWall(-11, DOOR_L, STAGE_H, BACK_TOP);

  // Band 2: the doorway, which is also under the high opening. Wall exists
  // only between the door head and the underside of the catwalk opening.
  backWall(DOOR_L, DOOR_R, DOOR_TOP, EXIT_BOTTOM);
  backWall(DOOR_L, DOOR_R, EXIT_TOP, BACK_TOP);

  // Band 3: under the high opening only — no door here, so wall to the floor.
  backWall(DOOR_R, EXIT_R, STAGE_H, EXIT_BOTTOM);
  backWall(DOOR_R, EXIT_R, EXIT_TOP, BACK_TOP);

  // Band 4: solid, east of everything.
  backWall(EXIT_R, 11, STAGE_H, BACK_TOP);

  // --- the backstage stairwell ---------------------------------------------
  //
  // Straight on from the door, and climb. The stair runs AWAY from the stage
  // rather than across the passage: a staircase rising sideways means walking
  // through the door puts you alongside the treads rather than at the foot of
  // them, and it is entirely possible to cross the room without ever meeting
  // the stair you are looking for.
  //
  // Six metres of rise needs about nine metres of run, so the passage is deep
  // rather than wide. There is nothing behind the stage to collide with.
  const WELL_BACK = -52.0;
  const WELL_W = 9;
  // The stair run is offset WEST of the catwalk that leaves the top of it.
  // Routing the catwalk back over its own staircase means the player climbs
  // until their head meets its underside and simply stops, two thirds of the
  // way up, with nothing to indicate why.
  const WELL_CX = -1.0;
  const STAIR_X = -3.6;
  const EXIT_X = -0.1;
  const wellCz = (BACK_Z + WELL_BACK) / 2;
  const wellDepth = BACK_Z - WELL_BACK;

  kit.floor(WELL_W, wellDepth, WELL_CX, wellCz, material('tileFloor', { repeat: 3 }),
    { y: STAGE_H, surface: 'tile' });
  kit.ceiling(WELL_W, wellDepth, WELL_CX, wellCz, BACK_TOP, material('ceiling', { repeat: 3 }));

  kit.box(WELL_W, BACK_TOP - STAGE_H, 0.4, WELL_CX, (STAGE_H + BACK_TOP) / 2, WELL_BACK,
    backMat, { surface: 'wood', shadow: false });
  for (const side of [-1, 1]) {
    kit.box(0.4, BACK_TOP - STAGE_H, wellDepth, WELL_CX + side * WELL_W / 2,
      (STAGE_H + BACK_TOP) / 2, wellCz, backMat, { surface: 'wood', shadow: false });
  }

  // The stair: treads wide across the passage, climbing away from the stage.
  {
    const steps = 28;
    const rise = (catwalkY - STAGE_H) / steps;   // ~0.21m, an easy auto-step
    const tread = 0.34;
    const startZ = BACK_Z - 1.0;
    for (let i = 0; i < steps; i++) {
      const h = STAGE_H + rise * (i + 1);
      kit.box(2.4, h - STAGE_H, tread, STAIR_X, (STAGE_H + h) / 2, startZ - i * tread,
        material('steel', { repeat: 1 }), { surface: 'metal' });
    }
    // Landing at the top, level with the catwalks, wide enough to turn on.
    kit.box(5.2, 0.16, 2.0, (STAIR_X + EXIT_X) / 2, catwalkY, startZ - steps * tread - 1.0,
      material('steel', { repeat: 2 }), { surface: 'metal' });

    // Handrails the whole way up, which also read as an arrow pointing up.
    for (const side of [-1, 1]) {
      const runLen = steps * tread + 1.6;
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, Math.hypot(runLen, catwalkY - STAGE_H)),
        material('rustedSteel', { repeat: 1 })
      );
      rail.position.set(
        STAIR_X + side * 1.15,
        (STAGE_H + catwalkY) / 2 + 0.95,
        startZ - runLen / 2 + 0.5
      );
      rail.rotation.x = -Math.atan2(catwalkY - STAGE_H, runLen);
      rail.castShadow = true;
      scene.add(rail);
    }
  }

  // Out through the high opening, back over the house, onto the main run.
  // The north run sits east of the stair so it never crosses above it.
  addCatwalk(EXIT_X, -49.8, EXIT_X, -36.0);
  addCatwalk(EXIT_X, -36.0, -7, -36.0);

  // Two weak lights, so the stairwell is not a black shaft.
  kit.sconce(WELL_CX + 4.0, STAGE_H + 2.2, BACK_Z - 2.0, { rotY: -Math.PI / 2, intensity: 9, flicker: { chance: 0.5, severity: 0.8, seed: 171 } });
  kit.sconce(WELL_CX - 4.0, catwalkY - 0.8, WELL_BACK + 3.0, { rotY: Math.PI / 2, intensity: 9 });

  // Fire door at the end of the run.
  const fireDoorGroup = new THREE.Group();
  fireDoorGroup.position.set(7, catwalkY, -11.4);
  scene.add(fireDoorGroup);
  const fireDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.1, 0.12),
    material('rustedSteel', { repeat: 1 })
  );
  fireDoor.position.y = 1.05;
  fireDoor.castShadow = true;
  fireDoorGroup.add(fireDoor);
  const exitSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.2, 0.06),
    material('exitSign')
  );
  exitSign.position.set(0, 2.4, 0);
  fireDoorGroup.add(exitSign);
  const exitGlow = new THREE.PointLight(0x2ecc71, 3.5, 5, 2);
  exitGlow.position.set(0, 2.4, 0.2);
  fireDoorGroup.add(exitGlow);

  // ==========================================================================
  // MISTER TANGLE
  // ==========================================================================

  const tangle = new MisterTangle({
    scene, rails, player: ctx.player, audio, music, physics, engine,
  });

  tangle.on('caught', () => ctx.onPlayerCaught('tangle'));

  // ==========================================================================
  // COLLECTIBLES
  // ==========================================================================

  placeNote(kit, interaction, scene, reader, save, 'ch1-note-timecard', new THREE.Vector3(12.9, 1.1, -4.4), 0.4);
  placeNote(kit, interaction, scene, reader, save, 'ch1-note-boxoffice',
    // On the box office table (top at y 0.81, x -3.2..-1.6, z 5.2..6.0), not
    // beside it: at x -3.4 it hung 20cm off the end of the table and 30cm above
    // the surface, which reads as a bug the moment a torch finds it.
    new THREE.Vector3(-2.9, 0.85, 5.86), -0.2);
  placeNote(kit, interaction, scene, reader, save, 'ch1-note-child', new THREE.Vector3(-9.5, 0.55, 1.2), 1.1);

  placeStub(kit, interaction, scene, reader, save, 'ch1-stub-1', new THREE.Vector3(8.2, 0.08, 6.6));
  placeStub(kit, interaction, scene, reader, save, 'ch1-stub-2', new THREE.Vector3(-10.4, 0.5, -24.5));
  placeStub(kit, interaction, scene, reader, save, 'ch1-stub-3', new THREE.Vector3(-6.4, catwalkY + 0.12, -33.2));

  placeTape(kit, interaction, scene, reader, save, 'ch1-tape-commercial', new THREE.Vector3(11.6, 1.05, -1.6), kit);

  // ==========================================================================
  // SCRIPTING
  // ==========================================================================

  kit.trigger({
    x: 0, z: 4, width: 8, depth: 3, y: 1.5,
    onEnter: () => {
      music.setMood('unease');
      setTimeout(() => ctx.playRadio(RADIO['ch1-radio-1']), 1200);
    },
  });

  // Entering the house for the first time.
  kit.trigger({
    x: 0, z: -9.5, width: 4, depth: 2, y: 1.5,
    onEnter: () => {
      hud.say('Four hundred and twelve tickets. Three hundred and eighty-eight seats.', { duration: 4.5 });
      audio?.distantThud?.(new THREE.Vector3(0, 9, -32));
    },
  });

  // --- the chase trigger ---------------------------------------------------
  //
  // The checkpoint is set at the TOP OF THE STAIRS, several metres before this
  // trigger — never inside it. A checkpoint inside its own trigger means the
  // player respawns already in the chase, underneath Mister Tangle, and dies
  // again on the next swing: a loop they cannot get out of.
  const chaseCheckpoint = kit.trigger({
    x: -8.6, z: -32.2, width: 3, depth: 3, y: catwalkY + 1.5,
    onEnter: () => ctx.checkpoint('before-chase'),
  });

  const chaseTrigger = kit.trigger({
    x: -7, z: -28.5, width: 4, depth: 3, y: catwalkY + 1.5,
    onEnter: () => startChase(),
  });

  function startChase() {
    if (state.chaseStarted) return;
    state.chaseStarted = true;

    // Every spotlight snaps on at once.
    spotlights.forEach((s) => { s.spot.intensity = 300; });
    houseLights.forEach((l) => { l.intensity = 30; });

    audio?.woodSnap?.(new THREE.Vector3(0, 9.5, -33));
    ctx.player.addTrauma(0.5);
    music.setMood('chase');
    engine.postfx.fx.chromaBoost = 1;

    hud.say('The stage lights come up on an empty house.', { duration: 3 });
    hud.setObjective('Get to the fire door.');

    tangle.spawnNear(new THREE.Vector3(-7, railY, -33));
    tangle.awareness = 1;
    tangle.lastKnown.copy(ctx.player.position);

    setTimeout(() => ctx.playRadio(RADIO['ch1-radio-3']), 2200);
  }

  // Scripted catwalk collapse partway through the run.
  let collapseDone = false;
  const collapseTrigger = kit.trigger({
    x: -7, z: -24, width: 3, depth: 2, y: catwalkY + 1.5,
    onEnter: () => {
      if (collapseDone) return;
      collapseDone = true;
      audio?.woodSnap?.(new THREE.Vector3(-7, catwalkY, -22));
      ctx.player.addTrauma(0.55);
      hud.say('The deck gives behind you.', { duration: 2.4 });
    },
  });

  // Reaching the fire door ends the chapter.
  kit.trigger({
    x: 7, z: -11.8, width: 2.6, depth: 1.6, y: catwalkY + 1.5,
    onEnter: () => {
      if (state.chaseDone) return;
      state.chaseDone = true;
      tangle.setState('recovering');
      tangle.enabled = false;
      music.setMood('calm');
      engine.postfx.fx.chromaBoost = 0;
      audio?.woodSnap?.(new THREE.Vector3(7, catwalkY, -11.4));
      hud.say('The fire door slams. Something is caught in it, and it does not let go quietly.', { duration: 5 });
      setTimeout(() => ctx.completeChapter(1), 3400);
    },
  });

  // ==========================================================================

  return {
    scene,
    kit,
    spawn: new THREE.Vector3(0, 1.2, 6.4),
    // Facing -Z: down the lobby toward the house, not back at the boarded
    // doors the player just came through.
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

    /**
     * Put the chase back to its starting conditions so the player gets a clean
     * run at it, rather than respawning into the middle of one.
     */
    onRespawn() {
      if (!state.chaseDone) {
        state.chaseStarted = false;
        chaseTrigger.reset();
        tangle.enabled = false;
        tangle.root.visible = false;
        tangle.awareness = 0;
        tangle.reach = 0;
        tangle.setState('dormant');
        collapseDone = false;
        collapseTrigger.reset();

        // Put the lights back down; startChase() raises them again.
        spotlights.forEach((s) => { s.spot.intensity = 0; });
        houseLights.forEach((l) => { l.intensity = state.lightsOn ? 26 : 0; });
        engine.postfx.fx.chromaBoost = 0;
        music.setMood('unease');

        // The board puzzle stays solved — re-solving it after every death
        // would be busywork, not tension.
        if (state.stageDoorOpen) {
          state.boardSliders.forEach((v, i) => {
            if (v > 0.5) spotlights[BOARD_WIRING[i]].spot.intensity = 260;
          });
        }
      }
    },

    update(dt, time, player) {
      kit.update(dt, time, player);
      if (tangle.enabled) {
        tangle.update(dt, {
          maskHum: mask.hum,
          playerNoise: player.noiseLevel,
        });
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

/**
 * A glowing cable run, visible only through Threadlight.
 *
 * Drawn as a sagging curve rather than a straight line, because a straight
 * line reads as a UI element and a catenary reads as a physical cable that
 * someone ran through a building.
 */
function addThreadRun(scene, from, to, color = 0x6fe3d4, { sag = 0.35, segments = 24 } = {}) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = from.clone().lerp(to, t);
    // Parabolic droop, strongest in the middle.
    p.y -= Math.sin(t * Math.PI) * sag * from.distanceTo(to) * 0.12;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(segments)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  line.userData.lensOnly = 'threadlight';
  scene.add(line);

  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segments, 0.03, 5, false),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  tube.userData.lensOnly = 'threadlight';
  scene.add(tube);

  return { line, tube };
}

function buildSeating(scene, kit, rng) {
  const seatMat = material('seatVelvet');
  const frameMat = material('paintedWood', { color: 0x241a14 });

  const rows = 12;
  const perRow = 11;
  const max = rows * perRow;

  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.72, 0.09), seatMat, max);
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.1, 0.5), seatMat, max);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.48, 0.42), frameMat, max * 2);
  for (const im of [backs, bases, legs]) {
    im.castShadow = true;
    im.receiveShadow = true;
  }

  const seatM = new THREE.Matrix4();
  const partM = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);

  let nB = 0; let nS = 0; let nL = 0;

  for (let r = 0; r < rows; r++) {
    const z = -14 - r * 1.15;
    for (let s = 0; s < perRow; s++) {
      const offset = (s - (perRow - 1) / 2) * 0.72;
      if (Math.abs(offset) < 0.1) continue;
      const x = offset + Math.sign(offset) * 1.5;

      const fallen = rng() < 0.08;
      p.set(x, 0, z);
      e.set(0, (rng() - 0.5) * 0.06, 0);
      if (fallen) {
        e.set((rng() - 0.5) * 0.7, e.y, (rng() - 0.5) * 2.0);
        p.y = 0.3;
        p.x += (rng() - 0.5) * 0.5;
      }
      seatM.compose(p, q.setFromEuler(e), one);

      const place = (im, idx, px, py, pz, rx = 0) => {
        partM.compose(
          new THREE.Vector3(px, py, pz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)),
          one
        );
        im.setMatrixAt(idx, out.multiplyMatrices(seatM, partM));
      };

      place(backs, nB++, 0, 0.86, 0.2, -0.12);
      place(bases, nS++, 0, 0.72, 0.16, rng() > 0.35 ? -1.32 : 0);
      place(legs, nL++, -0.32, 0.24, 0.05);
      place(legs, nL++, 0.32, 0.24, 0.05);
    }
  }

  backs.count = nB; bases.count = nS; legs.count = nL;
  for (const im of [backs, bases, legs]) {
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    scene.add(im);
  }
}

function buildCurtains(scene, kit, rng, stageZ) {
  const curtainMat = material('curtain');
  const foldGeo = new THREE.CylinderGeometry(1, 1.15, 1, 8, 1, true, 0, Math.PI * 1.35);
  const swags = new THREE.InstancedMesh(foldGeo, curtainMat, 16);
  swags.castShadow = true;
  swags.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let n = 0;

  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const r = 0.38 + rng() * 0.22;
      pos.set(side * (9.6 - i * 0.3), 5.2, stageZ + 3.2 + (rng() - 0.5) * 0.4);
      q.setFromEuler(new THREE.Euler(0, side * (0.4 + rng() * 0.5), 0));
      scl.set(r, 9.2, r);
      swags.setMatrixAt(n++, m.compose(pos, q, scl));
    }
  }
  swags.count = n;
  swags.instanceMatrix.needsUpdate = true;
  scene.add(swags);
}

/** The rehearsal poster: the lighting-board clue, rendered as a texture. */
function buildPoster(scene, kit) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 512;
  const g = c.getContext('2d');

  g.fillStyle = '#cabfa0';
  g.fillRect(0, 0, 384, 512);

  // Age and foxing.
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(120,90,50,${Math.random() * 0.1})`;
    const r = Math.random() * 22;
    g.beginPath();
    g.arc(Math.random() * 384, Math.random() * 512, r, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = '#2a1f16';
  g.textAlign = 'center';
  g.font = 'bold 27px Georgia, serif';
  g.fillText('LIGHTING PLAN', 192, 58);
  g.font = '15px Georgia, serif';
  g.fillText('Act III — the Understudy alone', 192, 86);

  // The stage, drawn in plan, with six marks. Three are filled.
  g.strokeStyle = '#2a1f16';
  g.lineWidth = 2;
  g.strokeRect(40, 150, 304, 200);

  const marks = [0, 1, 2, 3, 4, 5];
  const lit = [0, 2, 4];
  for (const i of marks) {
    const x = 68 + i * 51;
    const y = 250;
    g.beginPath();
    g.arc(x, y, 18, 0, Math.PI * 2);
    if (lit.includes(i)) {
      // A lit mark: filled, with rays.
      g.fillStyle = '#2a1f16';
      g.fill();
      g.strokeStyle = '#2a1f16';
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(x + Math.cos(ang) * 23, y + Math.sin(ang) * 23);
        g.lineTo(x + Math.cos(ang) * 31, y + Math.sin(ang) * 31);
        g.stroke();
      }
    } else {
      g.strokeStyle = '#2a1f16';
      g.setLineDash([4, 4]);
      g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = '#2a1f16';
    g.font = '13px Georgia, serif';
    g.fillText(String(i + 1), x, y + 46);
  }

  g.font = 'italic 14px Georgia, serif';
  g.fillText('Marks 1, 3 and 5 only.', 192, 390);
  g.fillText('House dark. No followspot.', 192, 412);
  g.font = '12px Georgia, serif';
  g.fillStyle = '#6a1f1c';
  g.fillText('— and do NOT bring the house up —', 192, 446);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.46),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide })
  );
  poster.position.set(-5.4, 2.3, -38.1);
  poster.rotation.y = 0.05;
  scene.add(poster);

  // A little light so it is findable in the dark.
  const l = new THREE.PointLight(0xffd9a8, 4, 4, 2);
  l.position.set(-5.4, 2.9, -37.4);
  scene.add(l);

  return poster;
}

/* --- collectible placement ------------------------------------------------ */

function placeNote(kit, interaction, scene, reader, save, id, position, rotY = 0) {
  const note = NOTES[id];
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.21, 0.28),
    material('paper')
  );
  mesh.position.copy(position);
  mesh.rotation.set(-Math.PI / 2 + 0.06, rotY, 0);
  mesh.receiveShadow = true;
  scene.add(mesh);

  interaction.register({
    object: mesh,
    reach: 2.2,
    label: 'Read',
    onUse: () => {
      reader.showNote(note);
      save.recordCollectible('note', id);
      interaction.unregister(mesh);
      mesh.visible = false;
    },
  });
  return mesh;
}

function placeStub(kit, interaction, scene, reader, save, id, position) {
  const stub = STUBS[id];
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xcdbfa0, roughness: 0.9, side: THREE.DoubleSide })
  );
  mesh.position.copy(position);
  mesh.rotation.set(-Math.PI / 2, Math.random() * Math.PI, 0);
  scene.add(mesh);

  // Stubs glow faintly through Threadlight — Wren handled every one of them,
  // and the lens shows what has been touched.
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
    object: mesh,
    reach: 2.0,
    label: 'A ticket stub',
    onUse: () => {
      const isNew = save.recordCollectible('stub', id);
      reader.showStub(stub, { found: save.stubCount, total: 12 });
      interaction.unregister(mesh);
      mesh.visible = false;
      glow.visible = false;
      glow.userData.lensOnly = undefined;
    },
  });
  return mesh;
}

function placeTape(kit, interaction, scene, reader, save, id, position) {
  const tape = TAPES[id];

  // A television on a trolley, with the cassette already in it.
  const tv = new THREE.Group();
  tv.position.copy(position);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.44), material('paintedWood', { color: 0x2d2926 }));
  body.castShadow = true;
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
    object: tv,
    reach: 2.4,
    label: 'Play the tape',
    onUse: () => {
      save.recordCollectible('tape', id);
      screen.material.emissiveIntensity = 3;
      reader.showTape(tape);
    },
  });
  return tv;
}
