/**
 * IntroDrive.js — "the drive out".
 *
 * 1996. Rain, a country road at night, and the Hollowhart Puppet Works coming
 * up out of the dark. The player sits in the passenger seat of their own car
 * looking through a windscreen.
 *
 * Everything is procedural and everything moves toward the camera rather than
 * the camera moving forward: the road is a scrolling texture, the trees and
 * poles are instanced and recycled once they pass behind, and the factory is a
 * silhouette that grows. That means the drive can run for as long as it needs
 * to without building a kilometre of geometry.
 */

import * as THREE from 'three';
import { material } from '../world/Materials.js';
import { getTexture } from '../world/Textures.js';
import { clamp, lerp, randRange, makeRng } from '../util/MathUtil.js';

export function buildIntroDrive({ engine, audio }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060b);
  scene.fog = new THREE.FogExp2(0x070810, 0.026);

  const rng = makeRng(1996);
  const updaters = [];

  // --- sky -----------------------------------------------------------------
  //
  // A flat black background makes every silhouette float: with nothing behind
  // it, the factory reads as a lit shape in a void rather than as a building
  // against a sky. A dome with a horizon gradient and some cloud break costs
  // one draw call and gives the whole sequence a top and a bottom.
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(400, 48, 28),
    new THREE.MeshBasicMaterial({
      map: (() => {
        const tex = new THREE.CanvasTexture(makeSkyCanvas());
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        return tex;
      })(),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    })
  );
  skyDome.renderOrder = -1;
  scene.add(skyDome);

  // ==========================================================================
  // The car
  // ==========================================================================
  //
  // Modelled from the driver's eye: you see the dash, the wheel rim, the
  // A-pillars and the top of the bonnet. Anything behind the seat is never
  // on camera, so it does not exist.

  const car = new THREE.Group();
  scene.add(car);

  const trimMat = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.85 });
  // Vinyl: almost black and completely matte. At roughness 0.7 and a lighter
  // base it catches the cabin lamp and becomes a glowing orange slab across
  // the bottom third of every forward shot.
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 0.99 });

  // Dashboard, sloping away toward the screen.
  //
  // The depth matters: at 0.62 deep and centred on z = -0.72 the dashboard
  // extends back to z = -0.41, which is behind the instruments — so the
  // gauges end up inside the dashboard and the close-up on them is a close-up
  // of the back of a box. The dash stops at z = -0.60 and the binnacle stands
  // proud of it, the way a real one does.
  const dash = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.34, 0.5), dashMat);
  dash.position.set(0, 0.6, -0.85);
  dash.rotation.x = -0.28;
  car.add(dash);

  // --- instruments ---------------------------------------------------------
  //
  // The camera holds on these for three seconds at thirty centimetres, so the
  // gauges are drawn as proper dial faces rather than glowing discs. A disc
  // with an emissive material and a bar across it photographs as an orange
  // smear; a painted face with a scale, numerals and a chrome bezel
  // photographs as a car built in about 1981.
  const binnacle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.26), dashMat);
  binnacle.position.set(-0.36, 0.8, -0.58);
  binnacle.rotation.x = -0.45;
  car.add(binnacle);

  const needles = [];
  const GAUGES = [
    { dx: -0.5, face: makeGaugeCanvas({ max: 100, step: 10, label: 'MPH', minor: 2 }) },
    { dx: -0.22, face: makeGaugeCanvas({ max: 8, step: 1, label: 'RPM  x1000', minor: 2, redline: 6 }) },
  ];

  for (const { dx, face } of GAUGES) {
    const tex = new THREE.CanvasTexture(face);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.082, 32),
      // Not emissive enough to be a light source — lit by the cabin lamp, with
      // just enough glow to read as backlit.
      new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xff8c3a,
        emissiveIntensity: 0.8, roughness: 0.55,
      })
    );
    dial.position.set(dx, 0.83, -0.435);
    dial.rotation.x = -0.45;
    car.add(dial);

    // A chrome bezel catching the cabin light.
    const bezel = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.005, 6, 28),
      new THREE.MeshStandardMaterial({ color: 0x40382e, roughness: 0.35, metalness: 0.8 })
    );
    bezel.position.set(dx, 0.83, -0.433);
    bezel.rotation.x = -0.45;
    car.add(bezel);

    // The needle: a dark arm with a lit tip, pivoting about the dial centre.
    const needlePivot = new THREE.Group();
    needlePivot.position.set(dx, 0.83, -0.427);
    needlePivot.rotation.x = -0.45;
    car.add(needlePivot);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.0055, 0.062, 0.003),
      new THREE.MeshStandardMaterial({
        color: 0xd8493a, emissive: 0xc23b2e, emissiveIntensity: 0.55, roughness: 0.5,
      })
    );
    arm.position.y = 0.026;
    needlePivot.add(arm);

    const hub = new THREE.Mesh(
      new THREE.CircleGeometry(0.009, 12),
      new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.6 })
    );
    hub.position.z = 0.001;
    needlePivot.add(hub);

    needles.push(needlePivot);
  }

  // The radio, dead since forty miles back. Its display is the only cold light
  // in the cabin, which is why the shot cuts here on that line.
  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.075, 0.04), dashMat);
  radio.position.set(-0.02, 0.73, -0.54);
  radio.rotation.x = -0.45;
  car.add(radio);

  const radioFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.03),
    new THREE.MeshStandardMaterial({
      color: 0x05130d, emissive: 0x1fbf72, emissiveIntensity: 0.5, roughness: 0.4,
    })
  );
  radioFace.position.set(-0.02, 0.745, -0.516);
  radioFace.rotation.x = -0.45;
  car.add(radioFace);
  updaters.push((dt, t) => {
    // Hunting for a station it will not find.
    radioFace.material.emissiveIntensity = 0.5 + (Math.sin(t * 3.7) > 0.86 ? 0.5 : 0);
  });

  // Steering wheel — only the top of the rim is in shot.
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.018, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0x0f0c0a, roughness: 0.55 })
  );
  wheel.position.set(-0.36, 0.66, -0.42);
  wheel.rotation.x = 1.15;
  car.add(wheel);
  updaters.push((dt, t) => {
    // The small constant corrections of someone driving a wet road.
    wheel.rotation.z = Math.sin(t * 0.55) * 0.09 + Math.sin(t * 1.7) * 0.03;
  });

  // A-pillars and roof lip, framing the shot.
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.12), trimMat);
    pillar.position.set(side * 0.95, 1.15, -0.5);
    pillar.rotation.z = side * 0.14;
    car.add(pillar);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 0.5), trimMat);
  roof.position.set(0, 1.63, -0.55);
  car.add(roof);

  // The bonnet, catching the headlights.
  const bonnet = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.06, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x2a1e1a, roughness: 0.42, metalness: 0.5 })
  );
  bonnet.position.set(0, 0.56, -1.85);
  bonnet.rotation.x = 0.03;
  car.add(bonnet);

  // --- the passenger seat --------------------------------------------------
  //
  // The only things in this car that say who is driving: a road atlas folded
  // open to the wrong page, a cassette out of its case, and a photograph the
  // camera lingers on for two seconds in the middle of the drive.

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x160f0c, roughness: 0.98 })
  );
  seat.position.set(0.56, 0.5, 0.12);
  car.add(seat);

  const seatBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.7, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 0.95 })
  );
  seatBack.position.set(0.56, 0.86, 0.44);
  seatBack.rotation.x = 0.16;
  car.add(seatBack);

  // A folded map.
  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xc9bda0, roughness: 0.95, side: THREE.DoubleSide })
  );
  // Pushed right and back, against the door. It is set dressing; when the
  // camera comes down to the photograph the map must not be the biggest thing
  // in the shot.
  map.position.set(0.93, 0.565, 0.34);
  map.rotation.set(-Math.PI / 2, 0, 0.42);
  car.add(map);

  // The photograph.
  //
  // Drawn rather than modelled. The camera comes to within thirty centimetres
  // of this thing and holds on it for six seconds, so it is the one surface in
  // the whole sequence that has to survive being looked at — and two figures
  // painted into a canvas read as people, where two extruded rectangles read
  // as two extruded rectangles.
  const photo = new THREE.Group();
  photo.position.set(0.42, 0.567, 0.02);
  photo.rotation.set(-Math.PI / 2, 0, -0.22);
  car.add(photo);

  const photoTex = new THREE.CanvasTexture(makePhotographCanvas());
  photoTex.colorSpace = THREE.SRGBColorSpace;
  photoTex.anisotropy = 8;

  const photoPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.2),
    new THREE.MeshStandardMaterial({
      map: photoTex, roughness: 0.42, metalness: 0, side: THREE.DoubleSide,
    })
  );
  photo.add(photoPlane);

  // A cassette, label side up.
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(0.105, 0.012, 0.067),
    new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.6 })
  );
  tape.position.set(0.62, 0.566, -0.16);
  tape.rotation.y = 0.5;
  car.add(tape);

  const tapeLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.9 })
  );
  tapeLabel.position.set(0.62, 0.573, -0.16);
  tapeLabel.rotation.set(-Math.PI / 2, 0, 0.5);
  car.add(tapeLabel);

  // --- the windscreen, and the rain on it ----------------------------------
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.95, 1.0),
    new THREE.MeshPhysicalMaterial({
      color: 0x8fa0ae, roughness: 0.14, metalness: 0,
      transmission: 0.95, thickness: 0.01, ior: 1.45,
      transparent: true, opacity: 0.22,
    })
  );
  screen.position.set(0, 1.05, -1.02);
  screen.rotation.x = -0.24;
  car.add(screen);

  // Beads of water clinging to the glass, instanced. They creep downward and
  // are reset by the wiper.
  //
  // The material matters more than the count. Given a glossy near-white and a
  // warm cabin light 70cm away, 220 beads read as a swarm of orange sparks
  // rather than as rain; a cool, mostly-transparent, fairly rough bead picks
  // up the road ahead instead of the dashboard behind, which is what water on
  // a windscreen actually does.
  const BEADS = 220;
  const beadGeo = new THREE.SphereGeometry(0.0055, 6, 5);
  const beads = new THREE.InstancedMesh(beadGeo, new THREE.MeshPhysicalMaterial({
    color: 0x6a7682, roughness: 0.28, metalness: 0,
    transmission: 0.82, thickness: 0.006, ior: 1.33,
    transparent: true, opacity: 0.34,
  }), BEADS);
  const beadState = [];
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < BEADS; i++) {
      const s = { x: randRange(-0.9, 0.9), y: randRange(-0.45, 0.45), v: randRange(0.02, 0.09), sc: randRange(0.6, 2.0) };
      beadState.push(s);
      m.compose(new THREE.Vector3(s.x, s.y, 0.004), new THREE.Quaternion(), new THREE.Vector3(s.sc, s.sc, s.sc));
      beads.setMatrixAt(i, m);
    }
    beads.instanceMatrix.needsUpdate = true;
  }
  screen.add(beads);

  // --- the wiper ------------------------------------------------------------
  const wiperPivot = new THREE.Group();
  wiperPivot.position.set(-0.62, -0.46, 0.01);
  screen.add(wiperPivot);
  const wiperArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.9, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 })
  );
  wiperArm.position.y = 0.45;
  wiperPivot.add(wiperArm);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.82, 0.016),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 })
  );
  blade.position.y = 0.5;
  wiperPivot.add(blade);

  let wiperPhase = 0;
  let lastSweep = -1;
  updaters.push((dt, t) => {
    // A slow intermittent sweep — 3.1s per cycle — with a pause at the rest
    // position, which is what makes it feel like a real wiper rather than a
    // metronome.
    wiperPhase = (wiperPhase + dt / 3.1) % 1;
    const active = Math.min(wiperPhase / 0.55, 1);
    const swing = wiperPhase < 0.55
      ? Math.sin(active * Math.PI) * 1.55
      : 0;
    wiperPivot.rotation.z = swing;

    // Wipe the beads it passes.
    const sweepId = Math.floor(wiperPhase * 2);
    if (sweepId !== lastSweep) {
      lastSweep = sweepId;
      audio?.noise?.({
        duration: 0.35, gain: 0.05, filterType: 'bandpass',
        freq: randRange(500, 900), freqEnd: 300, q: 2.5, attack: 0.08,
      });
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < BEADS; i++) {
      const s = beadState[i];
      s.y -= s.v * dt * (0.4 + s.sc * 0.3);
      // Cleared by the blade, or fallen off the bottom.
      const bladeX = -0.62 + Math.sin(swing) * 0.85;
      if (s.y < -0.5 || (swing > 0.05 && Math.abs(s.x - bladeX) < 0.09)) {
        s.x = randRange(-0.9, 0.9);
        s.y = randRange(0.1, 0.48);
        s.v = randRange(0.02, 0.09);
      }
      m.compose(new THREE.Vector3(s.x, s.y, 0.004), q, new THREE.Vector3(s.sc, s.sc, s.sc));
      beads.setMatrixAt(i, m);
    }
    beads.instanceMatrix.needsUpdate = true;
  });

  // ==========================================================================
  // The road
  // ==========================================================================

  const roadTex = getTexture('metal', { seed: 55, rust: 0.15, paintHue: 220, paintSat: 0.02, paintLight: 0.08 }, 512);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex.map, normalMap: roadTex.normalMap, roughnessMap: roadTex.roughnessMap,
    roughness: 0.62, metalness: 0,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
  roadMat.map.repeat.set(2, 40);
  roadMat.normalMap.repeat.set(2, 40);
  roadMat.roughnessMap.repeat.set(2, 40);

  // The moor either side. Without it the road is a ribbon floating in front of
  // a sky, and the horizon is wherever the verge happens to stop.
  const moor = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0x0a0c0a, roughness: 1 })
  );
  moor.rotation.x = -Math.PI / 2;
  moor.position.set(0, -0.06, -160);
  scene.add(moor);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 260), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -120);
  road.receiveShadow = true;
  scene.add(road);

  // Centre line: dashes that scroll with the road.
  const DASHES = 40;
  const dashes = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.14, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x9a9483, emissive: 0x2a2620, roughness: 0.9 }),
    DASHES
  );
  dashes.rotation.x = -Math.PI / 2;
  scene.add(dashes);

  // Verges, so the road has edges in the headlights.
  for (const side of [-1, 1]) {
    const verge = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 260),
      new THREE.MeshStandardMaterial({ color: 0x16180f, roughness: 1 })
    );
    verge.rotation.x = -Math.PI / 2;
    verge.position.set(side * 6.2, -0.02, -120);
    scene.add(verge);
  }

  // Trees and telegraph poles, instanced and recycled.
  const SCENERY = 34;
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.2, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x16120e, roughness: 1 }),
    SCENERY
  );
  const canopyMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.5, 4.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x0d1410, roughness: 1 }),
    SCENERY
  );
  scene.add(trunkMesh, canopyMesh);

  const scenery = [];
  for (let i = 0; i < SCENERY; i++) {
    scenery.push({
      side: i % 2 === 0 ? -1 : 1,
      z: -(i / SCENERY) * 240 - rng() * 6,
      off: randRange(6.5, 11),
      scale: randRange(0.7, 1.5),
      spin: rng() * Math.PI,
    });
  }

  // ==========================================================================
  // Rain
  // ==========================================================================

  const RAIN = 1200;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN * 6);   // line segments
  for (let i = 0; i < RAIN; i++) {
    const x = randRange(-24, 24);
    const y = randRange(0, 22);
    const z = randRange(-90, 6);
    const len = randRange(0.5, 1.3);
    rainPos[i * 6] = x;      rainPos[i * 6 + 1] = y;        rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x + 0.18; rainPos[i * 6 + 4] = y - len; rainPos[i * 6 + 5] = z;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
    color: 0x9fb4c8, transparent: true, opacity: 0.32,
  }));
  rain.frustumCulled = false;
  scene.add(rain);

  // ==========================================================================
  // The factory
  // ==========================================================================

  const factory = new THREE.Group();
  factory.position.set(3.5, 0, -210);
  scene.add(factory);
  {
    // Brickwork. A flat colour under a single floodlight photographs as an
    // orange rectangle with hard edges; the courses and the mortar are what
    // make the facade read as a building forty metres away rather than as a
    // lit panel.
    const brickTex = getTexture(
      'tile', { seed: 7, tiles: 14, hue: 16, sat: 0.3, light: 0.14, groutDark: 0.66 }, 512);
    for (const key of ['map', 'normalMap', 'roughnessMap']) {
      const t = brickTex[key];
      if (!t) continue;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(9, 5);
    }
    const brick = new THREE.MeshStandardMaterial({
      map: brickTex.map,
      normalMap: brickTex.normalMap,
      roughnessMap: brickTex.roughnessMap,
      color: 0x8a6a56,
      roughness: 1,
    });

    const main = new THREE.Mesh(new THREE.BoxGeometry(34, 17, 22), brick);
    main.position.y = 8.5;
    factory.add(main);

    // A saw-tooth roof, which is what a factory of this age would have.
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(34, 3.2, 1.2), brick);
      tooth.position.set(0, 18.4, -9 + i * 3.6);
      tooth.rotation.x = 0.5;
      factory.add(tooth);
    }

    // The tower with the clock that stopped.
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 30, 7), brick);
    tower.position.set(-13, 15, 4);
    factory.add(tower);

    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 24),
      new THREE.MeshStandardMaterial({
        color: 0x161310, emissive: 0x2e2a20, emissiveIntensity: 0.9, roughness: 0.8,
      })
    );
    clock.position.set(-13, 24, 7.6);
    factory.add(clock);
    for (const [len, ang] of [[1.5, -0.35], [1.0, 2.4]]) {
      const hand = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, len, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x0a0806 })
      );
      hand.position.set(-13 + Math.sin(ang) * len / 2, 24 + Math.cos(ang) * len / 2, 7.72);
      hand.rotation.z = -ang;
      factory.add(hand);
    }

    // A chimney, and the one window with something behind it.
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 26, 12), brick);
    stack.position.set(15, 13, -6);
    factory.add(stack);

    // Grimed, not glazed. At roughness 0.4 these catch the yard lamp and half
    // the elevation lights up, which ruins the one line the shot has to sell:
    // that exactly one window is lit.
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x05070b, emissive: 0x04060a, roughness: 0.94, metalness: 0,
    });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.2), windowMat);
        win.position.set(-13.5 + c * 3.4, 4 + r * 5, 11.05);
        factory.add(win);
      }
    }
    // One lit window, high up. It should not be lit.
    const lit = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 2.2),
      new THREE.MeshStandardMaterial({
        color: 0x140f08, emissive: 0xffb066, emissiveIntensity: 1.6, roughness: 0.5,
      })
    );
    lit.position.set(6.3, 14, 11.05);
    factory.add(lit);
    const litGlow = new THREE.PointLight(0xffb066, 60, 30, 2);
    litGlow.position.set(6.3, 14, 12);
    factory.add(litGlow);
    updaters.push((dt, t) => {
      const f = 1 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 7.1) * 0.03;
      litGlow.intensity = 60 * f;
      lit.material.emissiveIntensity = 1.6 * f;
    });

    // The sign on the gable.
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024; signCanvas.height = 192;
    const g = signCanvas.getContext('2d');
    g.fillStyle = '#0d0b09';
    g.fillRect(0, 0, 1024, 192);
    g.fillStyle = '#6a5f48';
    g.font = 'bold 96px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('HOLLOWHART', 512, 96);
    g.font = '40px Georgia, serif';
    g.fillText('PUPPET WORKS', 512, 152);
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 4.1),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 })
    );
    sign.position.set(0, 19.5, 11.2);
    factory.add(sign);
  }

  // A chain-link gate at the end of the road.
  const gate = new THREE.Group();
  gate.position.set(0, 0, -186);
  scene.add(gate);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 5, 8),
      material('rustedSteel', { repeat: 1 })
    );
    post.position.set(side * 4.6, 2.5, 0);
    gate.add(post);
  }
  const gateSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    // Matte and dark. A saturated red board catches the headlights at point
    // blank and blooms into a white rectangle across the middle of the shot,
    // which is exactly where the factory is supposed to be.
    new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 1 })
  );
  gateSign.position.set(0, 2.2, 0.1);
  gate.add(gateSign);

  // The yard lamp on the left post — a failing sodium fitting that is the only
  // reason the facade is visible at all when the car stops. Without it the
  // arrival is a shot of the dark where a factory would be.
  const yardLamp = new THREE.SpotLight(0xffb45e, 0, 90, 0.8, 0.5, 1.5);
  yardLamp.position.set(-4.6, 5.4, -1.2);
  yardLamp.target.position.set(1.0, 7.0, -30);
  gate.add(yardLamp, yardLamp.target);

  const lampHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0x1a140c, emissive: 0xffb45e, emissiveIntensity: 0.9, roughness: 0.6,
    })
  );
  lampHead.position.copy(yardLamp.position);
  gate.add(lampHead);

  // ==========================================================================
  // Light
  // ==========================================================================

  scene.add(new THREE.HemisphereLight(0x1a2030, 0x05060a, 0.35));

  const moon = new THREE.DirectionalLight(0x8fa8d0, 0.5);
  moon.position.set(-20, 40, -30);
  scene.add(moon);

  // Headlights: two spots aimed down the road, plus the wash on the bonnet.
  const heads = [];
  for (const side of [-1, 1]) {
    const h = new THREE.SpotLight(0xfff0d0, 900, 90, Math.PI / 9, 0.55, 1.5);
    h.position.set(side * 0.72, 0.58, -2.4);
    h.target.position.set(side * 2.0, 0, -50);
    h.castShadow = side > 0;
    if (h.castShadow) {
      h.shadow.mapSize.setScalar(1024);
      h.shadow.bias = -0.004;
      h.shadow.camera.far = 90;
    }
    scene.add(h, h.target);
    heads.push(h);
  }

  // --- cabin light ---------------------------------------------------------
  //
  // Two lamps, both deliberately short-range. Light in three.js falls off with
  // the square of distance, so a single "glow" bright enough to reach the
  // passenger seat is also bright enough to set the windscreen alight 70cm
  // away. Splitting it means each surface can be lit to the level the shot
  // needs without the other one blowing out.

  // 1. The instrument glow: tight, warm, and clipped before it reaches the glass.
  //    Mounted at the headliner, not on the dash. Instrument light in a real
  //    car comes from behind the dial faces — which here is the dials' own
  //    emissive map — and a lamp sat 20cm off the binnacle instead turns the
  //    whole instrument surround into a glowing orange slab across the bottom
  //    of every forward shot. Distance falls off with the square, so 20cm is
  //    eleven times the illumination of 65cm.
  const cabin = new THREE.PointLight(0xff8c3a, 0.5, 1.4, 2);
  cabin.position.set(-0.24, 1.42, -0.12);
  car.add(cabin);

  // 2. The wash across the passenger seat. Without it the photograph — which
  //    the middle third of the sequence is entirely about — is a black
  //    rectangle in a black car.
  //    A spot rather than a point, because a point light here also washes the
  //    dashboard and the inside of the windscreen, and a lit dashboard with an
  //    unlit road beyond it looks like a mistake.
  //    Kept to a tight pool: a seat lit evenly from edge to edge is a flat
  //    brown rectangle, whereas a pool with the corners falling into black
  //    gives the shot somewhere to be.
  const seatLamp = new THREE.SpotLight(0xffc98a, 1.5, 1.25, 0.62, 0.85, 2);
  seatLamp.position.set(0.3, 1.34, 0.02);
  seatLamp.target.position.set(0.5, 0.56, 0.06);
  car.add(seatLamp, seatLamp.target);

  // A trace of skyglow through the side windows, so the dash and the wheel are
  // silhouettes rather than absences.
  const rim = new THREE.DirectionalLight(0x7f95bb, 0.3);
  rim.position.set(3, 2.2, 1.5);
  rim.target.position.set(-0.4, 0.8, -0.8);
  car.add(rim, rim.target);

  // ==========================================================================
  // Motion
  // ==========================================================================

  // The whole drive is 880 metres of road. The car holds 22 m/s until it has
  // 110 metres left, then sheds 2.2 m/s² — which is exactly the distance that
  // deceleration needs — so it comes to rest at the gate without a fudge.
  const TOTAL = 880;
  const CRUISE = 22;
  const BRAKE_AT = 770;
  const BRAKE_RATE = 2.2;

  const state = {
    speed: CRUISE,
    distance: 0,
    /** 0 at the start of the road, 1 with the bonnet against the gate. */
    approach: 0,
    arrived: false,
  };

  updaters.push((dt, t) => {
    state.distance += state.speed * dt;

    // Scroll the road surface rather than moving the mesh.
    const scroll = (state.distance * 0.04) % 1;
    roadMat.map.offset.y = -scroll;
    roadMat.normalMap.offset.y = -scroll;
    roadMat.roughnessMap.offset.y = -scroll;

    // Centre-line dashes.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < DASHES; i++) {
      let z = -(i * 6) + (state.distance % 6);
      if (z > 4) z -= DASHES * 6;
      m.compose(new THREE.Vector3(0, 0.01, z - 6), q, one);
      dashes.setMatrixAt(i, m);
    }
    dashes.instanceMatrix.needsUpdate = true;

    // Scenery, recycled behind the camera.
    const tm = new THREE.Matrix4();
    const cm = new THREE.Matrix4();
    for (let i = 0; i < scenery.length; i++) {
      const s = scenery[i];
      s.z += state.speed * dt;
      if (s.z > 12) {
        s.z -= 250;
        s.off = randRange(6.5, 11);
        s.scale = randRange(0.7, 1.5);
      }
      const x = s.side * s.off;
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.spin, 0));
      tm.compose(new THREE.Vector3(x, 3 * s.scale, s.z), rot, new THREE.Vector3(s.scale, s.scale, s.scale));
      trunkMesh.setMatrixAt(i, tm);
      cm.compose(new THREE.Vector3(x, 7 * s.scale, s.z), rot, new THREE.Vector3(s.scale, s.scale, s.scale));
      canopyMesh.setMatrixAt(i, cm);
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;

    // Rain falls and streaks backward with the car's motion.
    const rp = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN; i++) {
      const base = i * 6;
      const fall = (14 + (i % 7)) * dt;
      rp[base + 1] -= fall;
      rp[base + 4] -= fall;
      rp[base + 2] += state.speed * dt;
      rp[base + 5] += state.speed * dt;
      if (rp[base + 1] < 0 || rp[base + 2] > 8) {
        const x = randRange(-24, 24);
        const y = randRange(12, 24);
        const z = randRange(-90, -10);
        const len = randRange(0.5, 1.3);
        rp[base] = x; rp[base + 1] = y; rp[base + 2] = z;
        rp[base + 3] = x + 0.18; rp[base + 4] = y - len; rp[base + 5] = z;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;

    // The factory and the gate ride the approach curve rather than raw
    // distance, so they arrive on the beat the sequence was cut to.
    state.approach = clamp(state.distance / TOTAL, 0, 1);
    const a = state.approach;

    // Where these two end up is the whole composition of the last shot. The
    // gate stops far enough back that its sign is not in the lens, and the
    // factory stops close enough to fill the frame from the ground to well
    // above the top of the windscreen.
    factory.position.z = lerp(-300, -42, a);
    gate.position.z = lerp(-262, -15, a);

    // The building grows faster than the gate because it is further away; that
    // parallax is the only depth cue a flat silhouette gets.
    const looming = lerp(1, 1.06, a);
    factory.scale.setScalar(looming);

    if (state.distance > BRAKE_AT && !state.arrived) {
      state.speed = Math.max(0, state.speed - dt * BRAKE_RATE);
      if (state.speed < 0.25) {
        state.speed = 0;
        state.distance = TOTAL;
        state.approach = 1;
        state.arrived = true;
      }
    }

    // Arriving: the headlights drop to sidelights as the car stops, and the
    // yard lamp takes over. Full beams at a standstill three metres from a
    // sign would white out the end of the sequence.
    const stopping = clamp((state.approach - 0.9) / 0.1, 0, 1);
    for (const h of heads) h.intensity = lerp(900, 95, stopping);
    yardLamp.intensity = lerp(0, 1500, clamp((state.approach - 0.55) / 0.35, 0, 1))
      * (0.82 + Math.sin(t * 17) * 0.06 + Math.sin(t * 2.7) * 0.12);

    // Engine vibration through the instrument glow.
    cabin.intensity = 1.1 + Math.sin(t * 9) * 0.06 * (state.speed / CRUISE);

    // The gauges read the car's actual speed, so they fall as it brakes. A
    // speedometer pinned at fifty while the car comes to a stop is the kind of
    // detail nobody consciously notices and everybody feels.
    //
    // NEEDLE_ZERO and NEEDLE_SWEEP convert a fraction of the painted scale
    // into a mesh rotation. The painted scale runs clockwise in canvas space
    // from 0.75π, and canvas Y is flipped when it becomes a texture, so the
    // needle's Z rotation runs the opposite way and starts a quarter turn
    // round from the painted zero.
    const NEEDLE_ZERO = -Math.PI * 1.25;
    const NEEDLE_SWEEP = Math.PI * 1.5;
    const jitter = Math.sin(t * 6.1) * 0.006 + Math.sin(t * 19) * 0.002;

    const mph = state.speed * 2.2369;
    const rpm = state.speed > 0.2 ? 0.9 + (state.speed / CRUISE) * 1.8 : 0.75;

    needles[0].rotation.z = NEEDLE_ZERO - (mph / 100 + jitter) * NEEDLE_SWEEP;
    needles[1].rotation.z = NEEDLE_ZERO - (rpm / 8 + jitter * 1.8) * NEEDLE_SWEEP;
  });

  return {
    scene,
    state,
    /** Named points the cinematic can frame. */
    props: { car, photo, tape, factory, gate, wheel, binnacle, screen },
    update(dt, t) {
      for (const fn of updaters) fn(dt, t);
    },
    dispose() {
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isLine) o.geometry?.dispose();
      });
    },
  };
}


/**
 * The snapshot on the passenger seat.
 *
 * A 1994 print with a white border, a date stamp in the corner, and two people
 * outside a house on an overcast afternoon: a tall figure and a small one, the
 * small one a step in front. Painted in silhouette against a blown-out sky,
 * because a silhouette at this resolution reads as a person and a face does
 * not — it reads as a smudge, and a smudged face on a photograph of the
 * missing sister is the wrong kind of unsettling.
 */
function makePhotographCanvas() {
  const c = document.createElement('canvas');
  c.width = 340;
  c.height = 400;
  const g = c.getContext('2d');

  // The border of the print.
  g.fillStyle = '#ece4d2';
  g.fillRect(0, 0, 340, 400);

  const x0 = 22, y0 = 22, w = 296, h = 300;

  // Sky: overcast, slightly green with age.
  const sky = g.createLinearGradient(0, y0, 0, y0 + h);
  sky.addColorStop(0, '#cfc9ad');
  sky.addColorStop(0.55, '#b8b295');
  sky.addColorStop(1, '#9d9a7f');
  g.fillStyle = sky;
  g.fillRect(x0, y0, w, h);

  // A house behind them, flat and low-contrast, the way a cheap lens renders
  // a background it has not focused on.
  g.fillStyle = '#8b8168';
  g.fillRect(x0 + 24, y0 + 96, 150, 128);
  g.beginPath();
  g.moveTo(x0 + 14, y0 + 98);
  g.lineTo(x0 + 99, y0 + 48);
  g.lineTo(x0 + 184, y0 + 98);
  g.closePath();
  g.fillStyle = '#756c56';
  g.fill();
  g.fillStyle = '#5d5645';
  g.fillRect(x0 + 60, y0 + 140, 26, 34);
  g.fillRect(x0 + 116, y0 + 140, 26, 34);
  g.fillRect(x0 + 88, y0 + 176, 26, 48);

  // A tree on the right, just a mass.
  g.fillStyle = '#6f7355';
  g.beginPath();
  g.ellipse(x0 + 244, y0 + 108, 46, 54, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4e4636';
  g.fillRect(x0 + 240, y0 + 150, 9, 76);

  // Ground.
  g.fillStyle = '#7e7a5c';
  g.fillRect(x0, y0 + 224, w, h - 224);

  // The two of them. Tall figure on the left, the small one half a step ahead.
  const figure = (cx, baseY, height, shade) => {
    const hw = height * 0.16;             // half shoulder width
    g.fillStyle = shade;
    // legs
    g.fillRect(cx - hw * 0.55, baseY - height * 0.44, hw * 0.44, height * 0.44);
    g.fillRect(cx + hw * 0.12, baseY - height * 0.44, hw * 0.44, height * 0.44);
    // body
    g.beginPath();
    g.moveTo(cx - hw, baseY - height * 0.42);
    g.lineTo(cx - hw * 0.82, baseY - height * 0.8);
    g.lineTo(cx + hw * 0.82, baseY - height * 0.8);
    g.lineTo(cx + hw, baseY - height * 0.42);
    g.closePath();
    g.fill();
    // head
    g.beginPath();
    g.arc(cx, baseY - height * 0.88, height * 0.1, 0, Math.PI * 2);
    g.fill();
  };

  figure(x0 + 120, y0 + 282, 176, '#3b3628');
  figure(x0 + 178, y0 + 288, 118, '#453f2e');

  // Sun-faded corner, and the wear of something carried in a pocket.
  const fade = g.createRadialGradient(x0 + w, y0, 10, x0 + w * 0.4, y0 + h * 0.6, w);
  fade.addColorStop(0, 'rgba(255,248,224,0.34)');
  fade.addColorStop(1, 'rgba(255,248,224,0)');
  g.fillStyle = fade;
  g.fillRect(x0, y0, w, h);

  // Grain.
  const img = g.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, x0, y0);

  // The date the lab printed on the border.
  g.fillStyle = '#c8763a';
  g.font = '19px "Courier New", monospace';
  g.textAlign = 'right';
  g.fillText('14 07 94', 318, 366);

  return c;
}


/**
 * One instrument face.
 *
 * Painted with a 225-degree scale starting at the seven o'clock position,
 * which is the layout of essentially every mechanical car gauge — and the
 * reason it reads instantly as a car dial rather than as a clock or a meter.
 */
function makeGaugeCanvas({ max, step, label, minor = 2, redline = null }) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2, r = S * 0.44;

  g.fillStyle = '#0d0b09';
  g.beginPath();
  g.arc(cx, cy, S / 2, 0, Math.PI * 2);
  g.fill();

  // A faint dished highlight, as if the face is not quite flat.
  const dish = g.createRadialGradient(cx, cy - r * 0.4, 4, cx, cy, r);
  dish.addColorStop(0, 'rgba(255,190,120,0.09)');
  dish.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = dish;
  g.fillRect(0, 0, S, S);

  const SWEEP = Math.PI * 1.5;              // 270° of canvas arc
  const START = Math.PI * 0.75;             // 7 o'clock, measured clockwise
  const angle = (v) => START + (v / max) * SWEEP;

  const ticks = Math.round(max / step);
  for (let i = 0; i <= ticks; i++) {
    const v = i * step;
    const a = angle(v);
    const inRed = redline !== null && v >= redline;

    g.strokeStyle = inRed ? '#c23b2e' : '#d8cdb4';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.lineTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16));
    g.stroke();

    g.fillStyle = inRed ? '#c23b2e' : '#e0d6bd';
    g.font = 'bold 24px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(v), cx + Math.cos(a) * (r - 34), cy + Math.sin(a) * (r - 34));

    // Minor graduations between the numbered marks.
    if (i < ticks) {
      for (let m = 1; m < minor; m++) {
        const am = angle(v + (step * m) / minor);
        g.strokeStyle = 'rgba(216,205,180,0.5)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(am) * r, cy + Math.sin(am) * r);
        g.lineTo(cx + Math.cos(am) * (r - 9), cy + Math.sin(am) * (r - 9));
        g.stroke();
      }
    }
  }

  g.fillStyle = 'rgba(216,205,180,0.65)';
  g.font = '17px "Helvetica Neue", Arial, sans-serif';
  g.fillText(label, cx, cy + r * 0.52);

  return c;
}


/**
 * The night sky over the moor.
 *
 * An equirectangular strip: the bottom half is the horizon glow of a town
 * somewhere off to the left, the top half is overcast breaking up, and there
 * is one thin gap with the moon behind it. Painted rather than simulated,
 * because a sky that is only ever seen through a windscreen for forty seconds
 * needs to be atmospheric, not accurate.
 */
function makeSkyCanvas() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Zenith to horizon.
  // Kept very dark on purpose. This is a moonlit overcast at two in the
  // morning: anything brighter and the factory stops being a silhouette, and
  // the silhouette is the only thing the shot is for. The dome is drawn
  // without fog, so whatever is painted here is what reaches the screen.
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#010207');
  grad.addColorStop(0.42, '#02040b');
  grad.addColorStop(0.62, '#050912');
  grad.addColorStop(0.78, '#0a1020');
  grad.addColorStop(1.00, '#03040a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Sodium glow from a town below the horizon, left of the road.
  const town = g.createRadialGradient(W * 0.28, H * 0.82, 10, W * 0.28, H * 0.82, W * 0.3);
  town.addColorStop(0, 'rgba(255,164,78,0.12)');
  town.addColorStop(1, 'rgba(255,164,78,0)');
  g.fillStyle = town;
  g.fillRect(0, 0, W, H);

  // Cloud: soft overlapping ellipses, lighter where the moon is behind them.
  let seed = 4021;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  // Heavily blurred, or the ellipses read as grey blobs pasted on the sky
  // rather than as cloud.
  g.filter = 'blur(34px)';
  for (let i = 0; i < 70; i++) {
    const x = rand() * W;
    const y = H * 0.3 + rand() * H * 0.45;
    const rx = 60 + rand() * 190;
    const ry = 16 + rand() * 46;
    // Closer to the moon → brighter rim.
    const d = Math.abs(x - W * 0.66) / W;
    const lit = Math.max(0, 0.1 - d * 0.28);
    g.fillStyle = `rgba(${90 + lit * 560}, ${100 + lit * 540}, ${124 + lit * 480}, ${0.02 + lit * 0.9})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rand() * 0.4 - 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';

  // The moon, mostly behind cloud.
  const moon = g.createRadialGradient(W * 0.66, H * 0.3, 2, W * 0.66, H * 0.3, 110);
  moon.addColorStop(0, 'rgba(226,236,255,0.34)');
  moon.addColorStop(0.18, 'rgba(190,206,236,0.11)');
  moon.addColorStop(1, 'rgba(160,180,220,0)');
  g.fillStyle = moon;
  g.fillRect(0, 0, W, H);

  return c;
}
