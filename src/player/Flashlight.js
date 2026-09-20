/**
 * Flashlight.js — the torch found in Chapter 1, and its battery.
 *
 * A dying flashlight is a horror device, not a lighting fixture. This one:
 *  - lags behind the camera, so sweeping a room feels like swinging a weight;
 *  - browns out as the cell drains, dropping both range and colour temperature;
 *  - can be smacked to buy a few more seconds, which costs noise.
 *
 * It is a SpotLight rather than a PointLight so it costs one shadow pass.
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { Settings } from '../core/Settings.js';
import { clamp, damp, lerp, randRange } from '../util/MathUtil.js';

/** Seconds of continuous use from a full cell. */
const CELL_SECONDS = 330;

export class Flashlight extends EventBus {
  constructor({ engine, input, player, audio }) {
    super();
    this.engine = engine;
    this.input = input;
    this.player = player;
    this.audio = audio;

    this.owned = false;
    this.on = false;
    this.battery = 1;
    this.spares = 0;

    /** 0..1 — how much light is actually coming out right now. */
    this.output = 0;
    this._flickerT = 0;
    this._brownout = 0;
    this._smackBoost = 0;

    this.group = new THREE.Group();
    this.group.name = 'flashlight';

    // Aimed down -Z; the group is oriented each frame toward a lagged target.
    this.light = new THREE.SpotLight(0xfff0d6, 0, 26, Math.PI * 0.20, 0.42, 1.4);
    this.light.castShadow = true;
    this.light.shadow.mapSize.setScalar(1024);
    this.light.shadow.bias = -0.0022;
    this.light.shadow.normalBias = 0.02;
    this.light.shadow.camera.near = 0.15;
    this.light.shadow.camera.far = 28;
    this.light.userData.maxShadowSize = 2048;

    this.target = new THREE.Object3D();
    this.light.target = this.target;

    // A weak, wide, unshadowed spill so the player's immediate surroundings are
    // not pitch black outside the cone.
    this.spill = new THREE.PointLight(0xffe9c8, 0, 3.4, 2);
    this.spill.castShadow = false;

    this.group.add(this.light, this.spill);

    this._aim = new THREE.Vector3();
    this._lagDir = new THREE.Vector3(0, 0, -1);
    this._tmp = new THREE.Vector3();
  }

  addTo(scene) {
    scene.add(this.group, this.target);
  }

  give({ battery = 1 } = {}) {
    if (this.owned) return;
    this.owned = true;
    this.battery = battery;
    this.emit('acquired');
  }

  addSpare(n = 1) {
    this.spares += n;
    this.emit('sparesChanged', this.spares);
  }

  /** Swap in a fresh cell. Returns false if there are none. */
  reload() {
    if (this.spares <= 0) return false;
    this.spares--;
    this.battery = 1;
    this._brownout = 0;
    this.audio?.flashlightReload?.();
    this.emit('reloaded', this.spares);
    return true;
  }

  toggle() {
    if (!this.owned) return;
    if (!this.on && this.battery <= 0.001) {
      this.audio?.flashlightClick?.(true);
      return;
    }
    this.on = !this.on;
    this.audio?.flashlightClick?.(false);
    this.emit('toggled', this.on);
  }

  /**
   * Hitting the torch. Real behaviour for a corroded contact: a burst of light,
   * then a slightly worse baseline. Loud enough to be a bad idea near something.
   */
  smack() {
    if (!this.owned || !this.on) return;
    this._smackBoost = 1;
    this._brownout = Math.max(0, this._brownout - 0.35);
    this.audio?.flashlightSmack?.();
    this.emit('smacked');
  }

  handleInput() {
    if (!this.owned) return;
    if (this.input.pressed('flashlight')) this.toggle();
  }

  update(dt) {
    if (!this.owned) {
      this.light.intensity = 0;
      this.spill.intensity = 0;
      return;
    }

    // --- drain -------------------------------------------------------------
    if (this.on && this.battery > 0) {
      this.battery = clamp(this.battery - dt / CELL_SECONDS, 0, 1);
      if (this.battery <= 0) {
        this.on = false;
        this.emit('died');
        this.audio?.flashlightClick?.(true);
      }
    }

    // --- brownout ----------------------------------------------------------
    // Below a quarter charge the cell starts sagging, and the sag itself
    // fluctuates — that unsteadiness is the tell that it is about to go.
    const low = clamp(1 - this.battery / 0.28, 0, 1);
    this._brownout = damp(this._brownout, low, 1.2, dt);

    this._smackBoost = Math.max(0, this._smackBoost - dt * 1.4);

    let target = 0;
    if (this.on) {
      target = 1 - this._brownout * 0.62;

      // Irregular stutter once it is really failing.
      if (low > 0.35 && !Settings.get('reduceFlashing')) {
        this._flickerT -= dt;
        if (this._flickerT <= 0) {
          this._flickerT = randRange(0.08, lerp(1.6, 0.25, low));
          this._stutter = Math.random() < low * 0.7 ? randRange(0.1, 0.5) : 1;
        }
        target *= this._stutter ?? 1;
      }

      target = clamp(target + this._smackBoost * 0.55, 0, 1.35);
    }

    // Snap dark, ease bright — the asymmetry of a real filament.
    this.output = damp(this.output, target, target < this.output ? 26 : 9, dt);

    // three.js applies inverse-square falloff, so a torch that should read as
    // bright at 8m needs an intensity in the tens, not single digits.
    this.light.intensity = this.output * 95;
    this.spill.intensity = this.output * 1.6;

    // A dying cell goes orange as the filament cools.
    const warmth = lerp(1, 0.55, this._brownout);
    this.light.color.setRGB(1, lerp(0.86, 0.72, this._brownout), lerp(0.74, 0.42, 1 - warmth));
    this.light.distance = lerp(9, 26, this.output);
    this.light.angle = lerp(Math.PI * 0.26, Math.PI * 0.20, this.output);

    this._updateTransform(dt);
  }

  /**
   * Position and aim. The beam lags the camera by a fraction of a second and
   * sways with the player's stride, so it reads as something held in a hand.
   */
  _updateTransform(dt) {
    const cam = this.engine.camera;

    // Held slightly right of centre and below the eyeline.
    const offset = this._tmp.set(0.22, -0.16, 0).applyQuaternion(cam.quaternion);
    this.group.position.copy(cam.position).add(offset);
    this.light.position.set(0, 0, 0);
    this.spill.position.set(0, 0, 0);

    // Lag the aim direction behind where the camera is actually looking.
    cam.getWorldDirection(this._aim);
    const lag = Settings.get('reduceHeadBob') ? 22 : 13;
    this._lagDir.lerp(this._aim, clamp(lag * dt, 0, 1)).normalize();

    // Stride sway, scaled by how fast the player is moving.
    const speed = clamp((this.player?.moveSpeed ?? 0) / 3, 0, 2);
    const t = this.engine.elapsed;
    const swayX = Math.sin(t * 5.1) * 0.016 * speed;
    const swayY = Math.cos(t * 9.7) * 0.011 * speed;

    this.target.position
      .copy(this.group.position)
      .addScaledVector(this._lagDir, 10);
    this.target.position.x += swayX * 10;
    this.target.position.y += swayY * 10;
    this.target.updateMatrixWorld();
  }

  serialize() {
    return { owned: this.owned, on: this.on, battery: this.battery, spares: this.spares };
  }

  deserialize(d) {
    if (!d) return;
    this.owned = !!d.owned;
    this.on = !!d.on;
    this.battery = d.battery ?? 1;
    this.spares = d.spares ?? 0;
  }
}
