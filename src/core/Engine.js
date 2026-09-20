/**
 * Engine.js — owns the WebGL renderer, the camera, the render loop and the
 * post-processing chain. Scenes are swapped in and out (menu scene, chapter
 * scenes); the engine itself persists for the whole session.
 */

import * as THREE from 'three';
import { Settings } from './Settings.js';
import { PostFX } from './PostFX.js';
import { EventBus } from '../util/EventBus.js';
import { clamp } from '../util/MathUtil.js';

const SHADOW_MAP_SIZE = {
  off: 0,
  low: 1024,
  high: 2048,
  ultra: 4096,
};

export class Engine extends EventBus {
  constructor(canvas) {
    super();
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // handled in post (FXAA/SMAA) so it composes with HDR
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
    });

    if (!this.renderer.capabilities.isWebGL2) {
      throw new Error('STITCHWORK requires WebGL2.');
    }

    // All intermediate buffers stay linear; the final post pass does ACES
    // tonemapping and the sRGB encode itself, so the renderer must not also
    // convert on the way out or everything double-encodes.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.camera = new THREE.PerspectiveCamera(
      Settings.get('fov'),
      window.innerWidth / window.innerHeight,
      0.06,
      400
    );

    this.scene = null;
    this.postfx = new PostFX(this);

    this.clock = new THREE.Clock();
    this.elapsed = 0;

    /**
     * Debug clock multiplier. Left at 1 in the shipping game; the headless
     * test harness winds it up so a forty-eight second cinematic can be
     * verified in four seconds of software rendering instead of five minutes.
     */
    this.timeScale = 1;
    this.frame = 0;

    // Rolling frame-time average, used by the adaptive-quality watchdog and by
    // the debug readout.
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    this._updaters = new Set();
    this._running = false;
    this._rafId = 0;
    this._lastTime = 0;

    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    this._bindSettings();
    this.applyQuality();
    this._onResize();
  }

  // --------------------------------------------------------------------------
  // Settings wiring
  // --------------------------------------------------------------------------

  _bindSettings() {
    Settings.on('change:resolutionScale', () => this._onResize());
    Settings.on('change:fov', (v) => {
      this.baseFov = v;
      this.camera.fov = v;
      this.camera.updateProjectionMatrix();
    });
    Settings.on('change:shadowQuality', () => this.applyShadowQuality());
    Settings.on('change:anisotropy', () => this.applyAnisotropy());
    for (const key of ['ssao', 'bloom', 'motionBlur', 'filmGrain', 'chromaticAberration', 'antialias']) {
      Settings.on(`change:${key}`, () => this.postfx.rebuild());
    }
    Settings.on('change:preset', () => {
      this.applyQuality();
      this.postfx.rebuild();
      this._onResize();
    });

    this.baseFov = Settings.get('fov');
  }

  applyQuality() {
    this.applyShadowQuality();
    this.applyAnisotropy();
  }

  applyShadowQuality() {
    const q = Settings.get('shadowQuality');
    const size = SHADOW_MAP_SIZE[q] ?? 2048;
    this.renderer.shadowMap.enabled = size > 0;
    this.renderer.shadowMap.type =
      q === 'ultra' ? THREE.PCFSoftShadowMap
      : q === 'low' ? THREE.PCFShadowMap
      : THREE.PCFSoftShadowMap;
    this.shadowMapSize = size;

    // Re-point every existing shadow-casting light at the new map size.
    //
    // This may only ever *downgrade*. Whether a light casts at all is a level
    // authoring decision — a shadow-casting point light costs six render passes
    // for its cube map, so levels enable it on a handful of key lights and leave
    // fills unshadowed. Turning them all on here would quietly multiply the
    // frame cost of every scene.
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (!obj.isLight || !obj.shadow) return;

        // Remember what the level asked for the first time we see this light.
        if (obj.userData.authoredCastShadow === undefined) {
          obj.userData.authoredCastShadow = obj.castShadow;
        }
        const authored = obj.userData.authoredCastShadow;

        if (size > 0 && authored) {
          const want = Math.min(size, obj.userData.maxShadowSize ?? size);
          if (obj.shadow.mapSize.width !== want) {
            obj.shadow.mapSize.setScalar(want);
            // A resized shadow map must be released or three keeps the old one.
            if (obj.shadow.map) {
              obj.shadow.map.dispose();
              obj.shadow.map = null;
            }
          }
        }
        obj.castShadow = size > 0 && authored;
      });
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  applyAnisotropy() {
    const want = clamp(Settings.get('anisotropy'), 1, this.maxAnisotropy);
    if (!this.scene) return;
    this.scene.traverse((obj) => {
      const mat = obj.material;
      if (!mat) return;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        for (const slot of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'metalnessMap']) {
          const tex = m[slot];
          if (tex && tex.anisotropy !== want) {
            tex.anisotropy = want;
            tex.needsUpdate = true;
          }
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // Scene management
  // --------------------------------------------------------------------------

  setScene(scene) {
    this.scene = scene;
    this.postfx.setScene(scene);
    this.applyShadowQuality();
    this.applyAnisotropy();
    this.emit('sceneChanged', scene);
  }

  /** Register a per-frame callback. Returns an unregister function. */
  addUpdater(fn) {
    this._updaters.add(fn);
    return () => this._updaters.delete(fn);
  }

  // --------------------------------------------------------------------------
  // Sizing
  // --------------------------------------------------------------------------

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Cap the device pixel ratio: a 3x phone screen at full res is a slideshow
    // and the difference past 2x is invisible under film grain anyway.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = clamp(Settings.get('resolutionScale'), 0.4, 1.0);

    this.width = w;
    this.height = h;
    this.pixelRatio = dpr * scale;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.postfx.setSize(w, h, this.pixelRatio);

    this.emit('resize', w, h);
  }

  // --------------------------------------------------------------------------
  // Loop
  // --------------------------------------------------------------------------

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }

  _tick(now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._tick);

    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    // An fps cap is implemented by skipping frames rather than by sleeping,
    // which keeps the rAF cadence aligned with the display.
    const cap = Settings.get('maxFps');
    if (cap > 0) {
      this._capAccum = (this._capAccum || 0) + dt;
      if (this._capAccum < 1 / cap) return;
      dt = this._capAccum;
      this._capAccum = 0;
    }

    // A long pause (tab hidden, breakpoint) must not teleport the player
    // through a wall on the next frame.
    dt = Math.min(dt, 0.1);

    // Applied after the clamp so the clamp stays a real-time guard rather than
    // something the multiplier can defeat.
    if (this.timeScale !== 1) dt *= this.timeScale;

    this.elapsed += dt;
    this.frame++;

    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      this.emit('fps', this.fps);
    }

    for (const fn of this._updaters) {
      try {
        fn(dt, this.elapsed);
      } catch (err) {
        console.error('[engine] updater threw', err);
      }
    }

    this.renderer.info.reset();
    if (this.scene) this.postfx.render(dt);

    this.emit('afterRender', dt);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.postfx.dispose();
    this.renderer.dispose();
  }
}
