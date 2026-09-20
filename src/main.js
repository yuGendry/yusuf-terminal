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
import './styles/reader.css';

import * as THREE from 'three';

import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Settings } from './core/Settings.js';
import { Physics, initPhysics } from './core/Physics.js';
import { Audio } from './audio/AudioEngine.js';
import { Save } from './save/SaveSystem.js';
import { CHAPTERS } from './chapters/ChapterData.js';
import { setTextureAnisotropy } from './world/Textures.js';

import { MenuScene } from './menu/MenuScene.js';
import { MainMenu } from './ui/MainMenu.js';
import { SettingsMenu } from './ui/SettingsMenu.js';
import { HUD } from './ui/HUD.js';

import { installGameSounds } from './audio/GameSounds.js';
import { MusicEngine } from './audio/MusicEngine.js';
import { Game } from './core/Game.js';

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
    installGameSounds(Audio);
    this.music = new MusicEngine(Audio);
    Audio.onUnlocked(() => this.music.start());

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

    this.game = new Game({
      engine: this.engine,
      input: this.input,
      physics: this.physics,
      audio: Audio,
      music: this.music,
      hud: this.hud,
    });
    this.game.on('chapterComplete', (n) => this.onChapterComplete(n));

    this.mainMenu = new MainMenu({
      settingsMenu: this.settingsMenu,
      onNewGame: () => this.startGame({ fresh: true, chapter: 1 }),
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

  async startGame({ fresh = true, chapter = 1 } = {}) {
    this.mainMenu.hide();
    this.engine.postfx.setFade(1);
    this.state = 'loading';

    const saved = fresh ? null : Game.loadSlot(0);
    const targetChapter = saved?.chapter ?? chapter;

    // Let the fade actually reach black, and the boot bar repaint, before the
    // main thread disappears into texture generation.
    await wait(430);
    setProgress(0.1, 'setting the stage');
    boot.classList.remove('gone');

    try {
      if (this.game.level) this.game.unload();
      await nextFrame();

      await this.game.load(targetChapter, { restore: saved });

      this.state = 'play';
      this.paused = false;
      this.input.enabled = true;
      this._hadLock = false;

      const ch = CHAPTERS.find((c) => c.id === targetChapter);
      this.hud.show();
      this.hud.setObjective(this.game.puzzles.active?.objective ?? ch?.title ?? '');

      setProgress(1, 'ready');
      boot.classList.add('gone');

      this.music.setMood('calm');
      this.input.requestLock();
      this.engine.postfx.setFade(0);

      this.showChapterCard(ch);
    } catch (err) {
      console.error('[game] could not start chapter', err);
      boot.classList.add('failed');
      bootStatus.textContent = `chapter ${targetChapter} failed to open`;
      this.state = 'menu';
      setTimeout(() => {
        boot.classList.add('gone');
        boot.classList.remove('failed');
        this.enterMenu();
        this.engine.postfx.setFade(0);
      }, 2600);
    }
  }

  /** The chapter title card: a beat of quiet before the level starts. */
  showChapterCard(ch) {
    if (!ch) return;
    const card = document.createElement('div');
    card.id = 'chapter-card';
    card.innerHTML =
      `<div class="num">Chapter ${ch.id}</div>` +
      `<div class="name">${ch.title}</div>` +
      `<div class="sub">${ch.subtitle}</div>`;
    document.getElementById('game-layer').appendChild(card);
    void card.offsetWidth;
    card.classList.add('show');
    setTimeout(() => {
      card.classList.remove('show');
      setTimeout(() => card.remove(), 1800);
    }, 4200);
  }

  onChapterComplete(n) {
    this.input.releaseLock();
    this.input.enabled = false;
    this.engine.postfx.setFade(1);
    this.music.setMood('silent');

    setTimeout(async () => {
      const next = n + 1;
      if (CHAPTER_AVAILABLE.includes(next)) {
        await this.startGame({ fresh: true, chapter: next });
      } else {
        // Beyond the built chapters, return to the menu with the unlock.
        this.game.unload();
        this.enterMenu();
        this.engine.postfx.setFade(0);
        this.hud.say(
          `Chapter ${n} complete. The next chapter is not built yet — thank you for playing this far.`,
          { duration: 9 }
        );
      }
    }, 1800);
  }

  disposeLevel() {
    this._hadLock = false;
    this.game?.unload();
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
      this.music?.update(dt);
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
    //
    // A reader (note, tape, stub) is not a pause: the game freezes itself while
    // it is open, and Escape is handled by the reader.
    const readerOpen = this.game.reader.open;
    const lockLost = this._hadLock && !this.input.locked && !readerOpen;

    if ((this.input.pressed('pause') && !readerOpen) ||
        (lockLost && !this.paused && !this.settingsMenu.open)) {
      this.togglePause();
    }

    if (this.paused) return;

    this.game.update(dt);
    Save.profile.totalPlaytime += 0;   // Game owns the accounting
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this._hadLock = false;
      this.input.releaseLock();
      this.input.enabled = false;
      this.hud.showPause({
        onResume: () => this.togglePause(),
        onHint: () => this.game.puzzles?.requestHint(),
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

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Chapters that actually exist. The menu unlocks beyond this; the game stops. */
const CHAPTER_AVAILABLE = [1, 2];

// ---------------------------------------------------------------------------

const app = new App();
window.__stitchwork = app;   // handy for debugging from the console

app.start().catch((err) => bootFail('something came apart during setup', err));
