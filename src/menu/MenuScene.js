/**
 * MenuScene.js — the live 3D backdrop behind the main menu.
 *
 * A slow dolly down the centre aisle of the ruined Hollowhart auditorium toward
 * a single lit marionette on the stage. The camera never stops moving and never
 * loops visibly: the push is a long ease that resets with a cut hidden behind a
 * fade, and the puppet's idle sway is built from incommensurate sines.
 *
 * The one piece of interactivity: if the mouse sits still for a few seconds,
 * the marionette turns its head and looks directly down the lens.
 */

import * as THREE from 'three';
import { material } from '../world/Materials.js';
import { buildPuppet, animateHang, lookAtTarget } from '../world/Puppet.js';
import { createDust, createGodRay, createHangingLight, Flicker } from '../world/Atmosphere.js';
import { Settings } from '../core/Settings.js';
import { makeRng, damp, clamp, lerp, smoothstep } from '../util/MathUtil.js';

export class MenuScene {
  constructor(engine) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    this.updaters = [];
    this.time = 0;

    this._idleTime = 0;
    this._watchWeight = 0;
    this._pushT = 0;
    this._easterEggFired = false;

    this.onEasterEgg = null;

    this._build();
  }

  _build() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x030303);
    // Exponential-squared fog at 0.055 removes ~70% of a surface 20m away, and
    // the stage is 23m from the back of the house — the whole set was being
    // erased. 0.019 keeps the depth cue while leaving the stage readable.
    scene.fog = new THREE.FogExp2(0x070810, 0.019);

    const rng = makeRng(4242);

    // ---- room shell --------------------------------------------------------
    const W = 16;   // auditorium width
    const D = 26;   // depth from back wall to stage
    const H = 9;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      material('lobbyFloor', { repeat: 5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -D / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      material('ceiling', { repeat: 4 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, H, -D / 2);
    scene.add(ceil);

    const wallMat = material('wallpaperLobby', { repeat: 3 });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
      wall.rotation.y = side * -Math.PI / 2;
      wall.position.set(side * W / 2, H / 2, -D / 2);
      wall.receiveShadow = true;
      scene.add(wall);
    }
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
    backWall.position.set(0, H / 2, 1);
    backWall.rotation.y = Math.PI;
    scene.add(backWall);

    // ---- stage -------------------------------------------------------------
    const stageZ = -D + 3;
    const stageH = 1.15;

    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(W - 1.5, stageH, 7),
      material('stageFloor', { repeat: 3 })
    );
    stage.position.set(0, stageH / 2, stageZ - 2.2);
    stage.castShadow = true;
    stage.receiveShadow = true;
    scene.add(stage);

    // Proscenium arch — the frame that makes it read as a theatre.
    const archMat = material('paintedWood', { color: 0x2e2018 });
    const flutePositions = [];
    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 1.1), archMat);
      col.position.set(side * (W / 2 - 0.9), H / 2, stageZ + 1.4);
      col.castShadow = true;
      col.receiveShadow = true;
      scene.add(col);

      // Fluting: three shallow half-cylinders per column, instanced below.
      for (let f = 0; f < 3; f++) {
        flutePositions.push([side * (W / 2 - 0.9) + (f - 1) * 0.26, H / 2, stageZ + 0.85]);
      }
    }
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(W, 1.5, 1.1), archMat);
    archTop.position.set(0, H - 0.75, stageZ + 1.4);
    archTop.castShadow = true;
    scene.add(archTop);

    const fluteMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.11, H, 8, 1, false, 0, Math.PI),
      archMat,
      flutePositions.length
    );
    {
      const fm = new THREE.Matrix4();
      const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
      const fs = new THREE.Vector3(1, 1, 1);
      flutePositions.forEach(([x, y, z], i) => {
        fluteMesh.setMatrixAt(i, fm.compose(new THREE.Vector3(x, y, z), fq, fs));
      });
      fluteMesh.instanceMatrix.needsUpdate = true;
    }
    scene.add(fluteMesh);

    // ---- curtains ----------------------------------------------------------
    // Drawn back to either side, built from overlapping cylinders so they read
    // as heavy folded fabric rather than flat planes.
    // Every fold shares one geometry and one material, so the whole of both
    // curtains plus the valance costs two draw calls instead of thirty-six.
    const curtainMat = material('curtain');

    const foldGeo = new THREE.CylinderGeometry(1, 1.15, 1, 8, 1, true, 0, Math.PI * 1.35);
    const swagCount = 14;
    const swags = new THREE.InstancedMesh(foldGeo, curtainMat, swagCount);
    swags.castShadow = true;
    swags.receiveShadow = true;
    swags.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    let n = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const r = 0.34 + rng() * 0.2;
        pos.set(
          side * (W / 2 - 2.1) + side * i * 0.28,
          (H - 0.6) / 2 + 0.3,
          stageZ + 0.6 + (rng() - 0.5) * 0.3
        );
        q.setFromEuler(new THREE.Euler(0, side * (0.4 + rng() * 0.5), 0));
        scl.set(r, H - 0.6, r);
        swags.setMatrixAt(n++, m.compose(pos, q, scl));
      }
    }
    swags.count = n;
    swags.instanceMatrix.needsUpdate = true;
    scene.add(swags);

    // Valance across the top of the arch.
    const valanceGeo = new THREE.CylinderGeometry(1, 0.78, 1, 7, 1, true, 0, Math.PI * 1.4);
    const valance = new THREE.InstancedMesh(valanceGeo, curtainMat, 22);
    valance.castShadow = true;
    valance.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let i = 0; i < 22; i++) {
      pos.set(-W / 2 + 0.6 + i * (W - 1.2) / 21, H - 1.9, stageZ + 0.9);
      q.setFromEuler(new THREE.Euler(0, i % 2 ? 0.5 : -0.4, 0));
      scl.set(0.28, 1.5, 0.28);
      valance.setMatrixAt(i, m.compose(pos, q, scl));
    }
    valance.instanceMatrix.needsUpdate = true;
    scene.add(valance);

    // ---- seating -----------------------------------------------------------
    this._buildSeats(scene, rng, W, stageZ);

    // ---- the marionette ----------------------------------------------------
    const puppet = buildPuppet({
      preset: 'marionette',
      scale: 1.35,
      strings: true,
      stringHeight: 2.6,
      faceStyle: 'smile',
      clothColor: 0x4a1d28,
    });
    puppet.root.position.set(0, stageH, stageZ - 2.6);
    puppet.root.rotation.y = Math.PI;   // face the audience
    puppet.root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    scene.add(puppet.root);
    this.puppet = puppet;

    // ---- lighting ----------------------------------------------------------
    // Almost nothing: one hard key from above the stage, one weak bounce, and
    // a dying practical over the aisle. Darkness is the point.
    // NOTE ON INTENSITIES: three.js applies physically correct inverse-square
    // falloff, so a light's intensity has to scale with the square of its
    // throw. The key below sits ~8m from the puppet, so it needs ~60× the
    // number that would light something at 1m.
    const ambient = new THREE.HemisphereLight(0x2a3340, 0x0a0806, 0.5);
    scene.add(ambient);

    const key = new THREE.SpotLight(0xffd9a8, 260, 26, Math.PI / 7, 0.5, 2);
    key.position.set(0.8, H - 1.2, stageZ + 2.5);
    key.target.position.set(0, stageH + 0.9, stageZ - 2.6);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(2048);
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.022;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 24;
    scene.add(key, key.target);
    this.keyLight = key;

    // A cold rim from stage left separates the puppet from the black behind it.
    const rim = new THREE.SpotLight(0x6f8fbf, 90, 20, Math.PI / 6, 0.7, 2);
    rim.position.set(-5.5, 4.5, stageZ - 5.5);
    rim.target.position.set(0, stageH + 1.0, stageZ - 2.6);
    rim.castShadow = false;
    scene.add(rim, rim.target);

    // Footlights: a row of weak warm bulbs along the stage lip, uplighting the
    // puppet's face. The single most effective horror lighting trick there is.
    const footRow = new THREE.Group();
    for (let i = -3; i <= 3; i++) {
      const l = new THREE.PointLight(0xff9a4d, 5.5, 7, 2);
      l.position.set(i * 1.5, stageH + 0.12, stageZ + 1.0);
      footRow.add(l);

      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10, 1, true),
        material('brass')
      );
      housing.position.copy(l.position).setY(stageH + 0.07);
      footRow.add(housing);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        material('bulbOn', { emissive: 0xff9a4d, emissiveIntensity: 3 })
      );
      glow.position.copy(l.position);
      footRow.add(glow);
    }
    scene.add(footRow);
    this.footLights = footRow;

    const aisleLamp = createHangingLight({
      color: 0xffb066,
      intensity: 26,
      distance: 11,
      cordLength: 1.4,
      castShadow: true,
      flicker: { chance: 0.55, severity: 0.9, seed: 12 },
    });
    aisleLamp.position.set(0, H, -6);
    scene.add(aisleLamp);
    this.updaters.push((dt, t) => aisleLamp.userData.update(dt, t));

    // The key light has its own slow, subtle instability.
    this.keyFlicker = new Flicker(key, {
      baseIntensity: 260, chance: 0.14, severity: 0.45, burstLength: [0.04, 0.2], seed: 7,
    });
    this.updaters.push((dt, t) => this.keyFlicker.update(dt, t));

    // ---- atmosphere --------------------------------------------------------
    const ray = createGodRay({
      radiusTop: 0.45, radiusBottom: 2.4, length: H - stageH,
      color: 0xffd6a0, intensity: 0.2, noiseAmount: 0.7,
    });
    ray.position.set(0.8, H - 1.2, stageZ + 2.2);
    ray.rotation.x = 0.16;
    scene.add(ray);
    this.updaters.push((dt, t) => ray.userData.update(t));

    const dust = createDust({
      count: 1400,
      bounds: new THREE.Vector3(W, H, D),
      center: new THREE.Vector3(0, H / 2, -D / 2),
      size: 22,
      seed: 3,
    });
    scene.add(dust);
    this.updaters.push((dt, t) => dust.userData.update(t, this.scene, this.engine.camera));

    // ---- camera path -------------------------------------------------------
    this.camStart = new THREE.Vector3(0.6, 1.75, -2.5);
    this.camEnd = new THREE.Vector3(-0.4, 1.45, -14.5);
    this.lookTarget = new THREE.Vector3(0, stageH + 1.25, stageZ - 2.6);
    this.puppetHeadWorld = new THREE.Vector3();
  }

  _buildSeats(scene, rng, W, stageZ) {
    // Rows of folded theatre seats with a scatter of them tipped over.
    //
    // Every seat shares four geometries, so the entire auditorium — around 80
    // seats — costs four draw calls via InstancedMesh rather than three hundred.
    // A menu that renders behind a UI has no business eating the frame budget.
    const seatMat = material('seatVelvet');
    const frameMat = material('paintedWood', { color: 0x241a14 });

    const rows = 9;
    const perRow = 9;
    const rowSpacing = 1.15;
    const seatSpacing = 0.72;
    const aisle = 1.4;

    const max = rows * perRow;

    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.72, 0.09), seatMat, max);
    const basesFolded = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.1, 0.5), seatMat, max);
    const basesOpen = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.1, 0.5), seatMat, max);
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.48, 0.42), frameMat, max * 2);

    for (const im of [backs, basesFolded, basesOpen, legs]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    }

    // Each seat is composed in its own local space and then transformed by the
    // seat's world matrix, which is what lets a fallen seat tip as one object.
    const seatM = new THREE.Matrix4();
    const partM = new THREE.Matrix4();
    const out = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);

    let nBack = 0, nFolded = 0, nOpen = 0, nLeg = 0;

    for (let r = 0; r < rows; r++) {
      const z = -4.5 - r * rowSpacing;
      for (let sIdx = 0; sIdx < perRow; sIdx++) {
        // Leave the centre aisle clear so the camera can push down it.
        const offset = (sIdx - (perRow - 1) / 2) * seatSpacing;
        if (Math.abs(offset) < 0.1) continue;
        const x = offset + Math.sign(offset) * aisle;

        const fallen = rng() < 0.09;
        const folded = rng() > 0.3;

        // --- the seat's own transform ---
        p.set(x, 0, z);
        e.set(0, (rng() - 0.5) * 0.06, 0);
        if (fallen) {
          e.set((rng() - 0.5) * 0.8, e.y, (rng() - 0.5) * 2.2);
          p.y = 0.3;
          p.x += (rng() - 0.5) * 0.6;
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

        place(backs, nBack++, 0, 0.86, 0.2, -0.12);

        if (folded) place(basesFolded, nFolded++, 0, 0.72, 0.16, -1.32);
        else place(basesOpen, nOpen++, 0, 0.5, -0.06, 0);

        place(legs, nLeg++, -0.32, 0.24, 0.05);
        place(legs, nLeg++, 0.32, 0.24, 0.05);
      }
    }

    backs.count = nBack;
    basesFolded.count = nFolded;
    basesOpen.count = nOpen;
    legs.count = nLeg;
    for (const im of [backs, basesFolded, basesOpen, legs]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
  }

  /** Called by the menu when the mouse moves, to reset the idle timer. */
  notifyActivity() {
    this._idleTime = 0;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;

    for (const fn of this.updaters) fn(dt, t);

    // ---- camera push -------------------------------------------------------
    // A 46-second ease from the back of the house toward the stage. When it
    // completes it eases back out again rather than cutting, so the motion is
    // continuous and the player never sees a seam.
    const period = 92;
    const phase = (t % period) / period;
    const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    const eased = smoothstep(0, 1, tri);
    this._pushT = eased;

    const cam = this.engine.camera;
    cam.position.lerpVectors(this.camStart, this.camEnd, eased);

    // Hand-held float, so the shot never feels locked to a rail.
    cam.position.x += Math.sin(t * 0.21) * 0.10 + Math.sin(t * 0.53) * 0.03;
    cam.position.y += Math.sin(t * 0.17 + 1.3) * 0.055;
    cam.position.z += Math.sin(t * 0.13 + 2.7) * 0.06;

    // ---- the puppet --------------------------------------------------------
    animateHang(this.puppet, t, { amount: 1 });

    this._idleTime += dt;

    // After 4s of no mouse movement, the marionette notices the camera.
    const wantsWatch = this._idleTime > 4 ? 1 : 0;
    this._watchWeight = damp(this._watchWeight, wantsWatch, 1.6, dt);

    if (this._watchWeight > 0.01) {
      lookAtTarget(this.puppet, cam.position, this._watchWeight);
    } else {
      const head = this.puppet.joints.head;
      head.rotation.y = lerp(head.rotation.y, 0, 0.05);
      head.rotation.x = lerp(head.rotation.x, 0, 0.05);
    }

    // The Wren easter egg: 60 seconds of stillness.
    if (!this._easterEggFired && this._idleTime > 60) {
      this._easterEggFired = true;
      this.onEasterEgg?.();
    }
    if (this._idleTime < 1) this._easterEggFired = false;

    // ---- look-at -----------------------------------------------------------
    // The camera leads slightly toward the puppet's head once it's watching,
    // which makes the moment land without a cut.
    this.puppet.joints.head.getWorldPosition(this.puppetHeadWorld);
    const target = this.lookTarget.clone().lerp(this.puppetHeadWorld, this._watchWeight * 0.7);
    target.x += Math.sin(t * 0.19) * 0.12;
    cam.lookAt(target);

    // The footlights breathe, which keeps the whole frame subtly alive.
    const breathe = 0.75 + Math.sin(t * 0.4) * 0.12;
    for (const child of this.footLights.children) {
      if (child.isPointLight) child.intensity = breathe * 7.3;
    }
  }

  /** Called when the menu hands control to the game. */
  dispose() {
    this.scene.traverse((obj) => {
      if (obj.isMesh || obj.isPoints || obj.isLine) {
        obj.geometry?.dispose();
      }
    });
    this.updaters.length = 0;
  }
}
