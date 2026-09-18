/**
 * main.js — application entry point and state machine.
 *
 * States:
 *   boot  → loading, WebGL check, physics init
 *   menu  → live theatre scene + main menu
 *   play  → a chapter (currently the movement proving ground)
 *
 * The engine, input, physics and audio are created once and persist across
 * state changes; only scenes and level content are torn down.
 */

import './styles/main.css';
import './styles/menu.css';
import './styles/hud.css';

import * as THREE from 'three';

import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Settings } from './core/Settings.js';
import { Physics, initPhysics } from './core/Physics.js';
import { Audio } from './audio/AudioEngine.js';
import { Save } from './save/SaveSystem.js';
import { setTextureAnisotropy } from './world/Textures.js';

import { MenuScene } from './menu/MenuScene.js';
import { MainMenu } from './ui/MainMenu.js';
import { SettingsMenu } from './ui/SettingsMenu.js';
import { HUD } from './ui/HUD.js';

import { PlayerController } from './player/PlayerController.js';
import { buildSandbox } from './chapters/Sandbox.js';

const boot = document.getElementById('boot');
const bootBar = boot.querySelector('#boot-bar > i');
const bootStatus = document.getElementById('boot-status');

function setProgress(pct, message) {
  bootBar.style.width = `${Math.round(pct * 100)}%`;
  if (message) bootStatus.textContent = message;
}

function bootFail(message, detail) {
  boot.classList.add('failed');
  boot.classList.remove('gone');
  bootStatus.textContent = message;
  console.error('[boot]', message, detail ?? '');
}

class App {
  constructor() {
    this.state = 'boot';
    this.engine = null;
    this.input = null;
    this.physics = null;
    this.player = null;
    this.level = null;
    this.menuScene = null;
    this.playStartedAt = 0;
  }

  async start() {
    setProgress(0.05, 'checking projector');

    const canvas = document.getElementById('viewport');

    // ---- engine ------------------------------------------------------------
    try {
      this.engine = new Engine(canvas);
    } catch (err) {
      bootFail(
        err.message?.includes('WebGL2')
          ? 'this browser cannot run the projector (WebGL2 required)'
          : 'the projector failed to start',
        err
      );
      return;
    }

    setTextureAnisotropy(Math.min(Settings.get('anisotropy'), this.engine.maxAnisotropy));
    Settings.on('change:anisotropy', (v) =>
      setTextureAnisotropy(Math.min(v, this.engine.maxAnisotropy))
    );

    setProgress(0.2, 'threading the rigging');

    // ---- input -------------------------------------------------------------
    this.input = new Input(canvas);
    this._hadLock = false;
    this.input.on('pointerlock', (locked) => {
      if (locked) this._hadLock = true;
    });

    // ---- physics -----------------------------------------------------------
    try {
      await initPhysics();
      this.physics = new Physics();
    } catch (err) {
      bootFail('the physics engine failed to load', err);
      return;
    }

    setProgress(0.45, 'winding the music box');

    // ---- audio (graph only; it stays suspended until a click) --------------
    Audio.init();

    // ---- accessibility flags that live on <body> ---------------------------
    document.body.classList.toggle('reduce-flashing', Settings.get('reduceFlashing'));
    document.documentElement.style.setProperty('--subtitle-scale', String(Settings.get('subtitleSize')));

    // ---- UI ----------------------------------------------------------------
    this.hud = new HUD();
    this.settingsMenu = new SettingsMenu({
      input: this.input,
      engine: this.engine,
      onClose: () => {
        if (this.state === 'play' && !this.paused) this.input.requestLock();
      },
    });

    this.mainMenu = new MainMenu({
      settingsMenu: this.settingsMenu,
      onNewGame: () => this.startGame({ fresh: true }),
      onContinue: () => this.startGame({ fresh: false }),
      onChapterSelect: (id) => this.startGame({ fresh: true, chapter: id }),
    });

    setProgress(0.7, 'raising the house lights');

    // ---- menu scene --------------------------------------------------------
    // Built after a frame yield so the progress bar actually paints before the
    // heavy texture generation blocks the main thread.
    await nextFrame();
    this.menuScene = new MenuScene(this.engine);
    this.mainMenu.attachScene(this.menuScene);

    setProgress(0.95, 'taking your ticket');
    await nextFrame();

    // ---- global hooks ------------------------------------------------------
    window.addEventListener('stitchwork:quit', () => this.quitToBoot());

    // Any first interaction unlocks audio.
    const unlock = () => {
      Audio.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Keep the menu marionette's idle timer honest.
    window.addEventListener('mousemove', () => this.menuScene?.notifyActivity());

    this.engine.addUpdater((dt) => this.update(dt));
    this.engine.start();

    this.enterMenu();

    setProgress(1, 'ready');
    setTimeout(() => boot.classList.add('gone'), 450);
  }

  // --------------------------------------------------------------------------
  // States
  // --------------------------------------------------------------------------

  enterMenu() {
    this.state = 'menu';
    this.input.releaseLock();
    this.input.enabled = false;
    this.engine.setScene(this.menuScene.scene);
    this.engine.postfx.fx.saturation = 0.92;
    this.engine.postfx.setFade(0);
    this.hud.hide();
    this.mainMenu.show();
  }

  startGame({ fresh = true, chapter = 1 } = {}) {
    this.mainMenu.hide();

    // Fade out, build, fade in — building a level takes long enough that a cut
    // would be jarring.
    this.engine.postfx.setFade(1);

    setTimeout(async () => {
      await nextFrame();

      if (this.level) this.disposeLevel();

      this.state = 'play';
      this.paused = false;
      this.input.enabled = true;
      this.playStartedAt = performance.now();

      // Chapters 1–5 arrive in later phases; the proving ground exercises the
      // controller, physics, lighting and post stack end to end.
      this.level = buildSandbox({ physics: this.physics, engine: this.engine });
      this.engine.setScene(this.level.scene);
      this.engine.postfx.fx.saturation = 1;

      // The level just created every one of its colliders. Rapier only rebuilds
      // its broad phase inside step(), so without this the player's first update
      // would query an empty world and fall through the floor it is standing on.
      this.physics.refreshQueries();

      this.player = new PlayerController({
        engine: this.engine,
        input: this.input,
        physics: this.physics,
        spawn: this.level.spawn.clone(),
        yaw: this.level.spawnYaw ?? 0,
      });

      this.player.on('footstep', (info) => this.level.onFootstep?.(info));

      this.hud.show();
      this.hud.setObjective(
        chapter === 1
          ? 'Proving ground — Chapter 1 arrives in the next phase'
          : `Chapter ${chapter}`
      );

      this.input.requestLock();
      this.engine.postfx.setFade(0);
    }, 420);
  }

  disposeLevel() {
    this._hadLock = false;
    this.level?.dispose?.();
    this.level = null;
    this.player = null;
  }

  quitToBoot() {
    this.input.releaseLock();
    this.engine.postfx.setFade(1);
    setTimeout(() => {
      this.mainMenu.hide();
      this.hud.hide();
      this.disposeLevel();
      this.engine.stop();
      boot.classList.remove('gone');
      bootStatus.textContent = 'the house is dark — refresh to return';
      setProgress(1);
    }, 700);
  }

  returnToMenu() {
    this.engine.postfx.setFade(1);
    setTimeout(() => {
      this.disposeLevel();
      this.enterMenu();
      this.engine.postfx.setFade(0);
    }, 450);
  }

  // --------------------------------------------------------------------------
  // Frame
  // --------------------------------------------------------------------------

  update(dt) {
    this.input.beginFrame();

    if (this.state === 'menu') {
      this.menuScene.update(dt);
    } else if (this.state === 'play') {
      this._updatePlay(dt);
    }

    this.input.endFrame();
  }

  _updatePlay(dt) {
    // Pause on Escape, or when pointer lock is lost by any other means (the
    // player pressed Escape at the OS level, or alt-tabbed away).
    //
    // The `_hadLock` latch matters: requestPointerLock() resolves a frame or
    // more after it is called, so testing `!input.locked` on its own would
    // pause the game immediately on the first frame after starting, before the
    // browser has granted the lock. Only a lock that was actually held and then
    // lost should pause.
    const lockLost = this._hadLock && !this.input.locked;
    if (this.input.pressed('pause') || (lockLost && !this.paused && !this.settingsMenu.open)) {
      this.togglePause();
    }

    if (this.paused) {
      this.level.update?.(dt, this.engine.elapsed, this.player);
      return;
    }

    this.player.update(dt);
    this.physics.step(dt);
    this.level.update?.(dt, this.engine.elapsed, this.player);
    this.hud.update(dt, this.player, this.engine);

    Save.profile.totalPlaytime += dt;
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this._hadLock = false;
      this.input.releaseLock();
      this.input.enabled = false;
      this.hud.showPause({
        onResume: () => this.togglePause(),
        onSettings: () => this.settingsMenu.show(),
        onMenu: () => {
          this.paused = false;
          this.hud.hidePause();
          this.returnToMenu();
        },
      });
      Save.saveProfile();
    } else {
      this.hud.hidePause();
      this.input.enabled = true;
      this.input.requestLock();
    }
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

// ---------------------------------------------------------------------------

const app = new App();
window.__stitchwork = app;   // handy for debugging from the console

app.start().catch((err) => bootFail('something came apart during setup', err));
