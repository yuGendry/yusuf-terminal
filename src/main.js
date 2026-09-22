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
import './styles/cinematic.css';

import * as THREE from 'three';

import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Settings } from './core/Settings.js';
import { Physics, initPhysics } from './core/Physics.js';
import { Audio } from './audio/AudioEngine.js';
import { Save } from './save/SaveSystem.js';
import { CHAPTERS, BUILT_CHAPTERS } from './chapters/ChapterData.js';
import { setTextureAnisotropy } from './world/Textures.js';

import { MenuScene } from './menu/MenuScene.js';
import { MenuNav } from './ui/MenuNav.js';
import { MainMenu } from './ui/MainMenu.js';
import { SettingsMenu } from './ui/SettingsMenu.js';
import { HUD } from './ui/HUD.js';
import { ChapterScreen } from './ui/ChapterScreen.js';

import { buildIntroSequence } from './cinematics/IntroSequence.js';
import { buildChapterOpening, buildChapterEnding } from './cinematics/ChapterCinematics.js';

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
    this.level = null;
    this.menuScene = null;
    this.cinematic = null;
    this.autoAdvance = false;
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
      if (locked) {
        this._hadLock = true;
        this._hideLockPrompt();
      }
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

    // A URL escape hatch for the automated harness and for anyone who wants to
    // get straight into a chapter: ?nocine=1 turns cutscenes off for this load
    // without writing the setting.
    if (new URLSearchParams(location.search).has('nocine')) {
      Settings.set('cinematics', false);
      this.autoAdvance = true;
    }

    // ---- accessibility flags that live on <body> ---------------------------
    document.body.classList.toggle('reduce-flashing', Settings.get('reduceFlashing'));
    document.documentElement.style.setProperty('--subtitle-scale', String(Settings.get('subtitleSize')));

    // ---- UI ----------------------------------------------------------------
    this.hud = new HUD();
    this.chapterScreen = new ChapterScreen();
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
      // The archive reads notes and plays tapes with the same reader the game
      // uses in a level, so a note reread from the menu looks exactly like the
      // note picked up off the floor it was lying on.
      reader: this.game.reader,
      onNewGame: () => this.startGame({ fresh: true, chapter: 1, intro: true }),
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

  /** The live player, if a chapter is loaded. Game owns it; this is for tools. */
  get player() { return this.game?.player ?? null; }

  // --------------------------------------------------------------------------
  // States
  // --------------------------------------------------------------------------

  enterMenu() {
    this.state = 'menu';
    clearTimeout(this._lockTimer);
    this._hideLockPrompt();
    this.input.releaseLock();
    this.input.enabled = false;
    this.engine.setScene(this.menuScene.scene);
    this.engine.postfx.fx.saturation = 0.92;
    this.engine.postfx.setFade(0);
    this.hud.hide();
    this.mainMenu.show();
  }

  /**
   * Take the player from wherever they are into a chapter.
   *
   * The sequence is deliberate and always the same shape:
   *
   *    [intro drive] → chapter title page → [opening cinematic] → play
   *
   * The title page is what makes the rest possible: it is up on screen for the
   * whole of the load, so the chapter can be built while the player is reading
   * an epigraph rather than while they stare at a black screen wondering if
   * the game has crashed.
   */
  async startGame({ fresh = true, chapter = 1, intro = false } = {}) {
    this.mainMenu.hide();
    this.state = 'loading';

    const saved = fresh ? null : Game.loadSlot(0);
    const targetChapter = saved?.chapter ?? chapter;
    const ch = CHAPTERS.find((c) => c.id === targetChapter);

    // ---- the drive out ------------------------------------------------------
    if (intro && targetChapter === 1) {
      try {
        await this.playIntroDrive();
      } catch (err) {
        // An intro that fails is not a reason to fail the game.
        console.warn('[intro] could not play the opening', err);
      }
    } else {
      this.engine.postfx.setFade(1);
      await wait(430);
    }

    // ---- the title page (covers the load) -----------------------------------
    this.music?.setTheme?.(targetChapter, intro ? 0.5 : 3.0);

    if (ch) {
      this.chapterScreen.show(ch, {
        scoreTitle: this.music?.themeTitle ?? '',
        stubsFound: (Save.profile?.foundStubs ?? [])
          .filter((id) => id.startsWith(`ch${targetChapter}-`)).length,
      });
      this.chapterScreen.progress(0.12);
    }

    // The page is a full-screen DOM element, so the 3D fade underneath it can
    // come straight back off — there is nothing to see through it.
    this.engine.postfx.setFade(1);

    try {
      if (this.game.level) this.game.unload();
      await nextFrame();
      this.chapterScreen.progress(0.3);
      await nextFrame();

      await this.game.load(targetChapter, { restore: saved });
      this.chapterScreen.progress(0.9);
      await nextFrame();

      this.paused = false;
      this._hadLock = false;
      this.hud.hide();

      this.chapterScreen.ready();
      await this.chapterScreen.waitForPlayer({
        auto: this.autoAdvance,
        minimumDwell: this.autoAdvance ? 300 : 2200,
      });
      this.chapterScreen.hide();

      // ---- opening cinematic ------------------------------------------------
      if (!saved) {
        try {
          await this.playCinematic(buildChapterOpening({
            engine: this.engine,
            input: this.input,
            audio: Audio,
            music: this.music,
            level: this.game.level,
            player: this.game.player,
            chapterId: targetChapter,
          }));
        } catch (err) {
          console.warn('[cinematic] chapter opening failed', err);
        }
      }

      // ---- play -------------------------------------------------------------
      this.state = 'play';
      this.input.enabled = true;
      this._hadLock = false;

      this.hud.show();
      this.hud.setObjective(this.game.puzzles.active?.objective ?? ch?.title ?? '');

      this.music.setMood('calm');
      this.engine.postfx.setFade(0);
      this.takeControl();
    } catch (err) {
      console.error('[game] could not start chapter', err);
      this.chapterScreen.hide();
      boot.classList.remove('gone');
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

  /**
   * Hand the mouse back to the player.
   *
   * Pointer lock can only be requested from inside a user gesture, and by the
   * time a chapter starts the player's last gesture was a keypress on the
   * title page — two cinematics and twenty seconds ago. Chrome refuses that
   * request outright.
   *
   * So: try anyway (it succeeds when the player skipped straight through, and
   * that is the common case on a replay), and if the browser says no, put up a
   * prompt that turns their next click into the gesture. Silently failing here
   * is not an option — the player would be standing in the lobby unable to
   * look around, with nothing on screen telling them why.
   */
  takeControl() {
    this.input.requestLock();

    clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => {
      if (this.state !== 'play' || this.input.locked || this.paused) return;
      this._showLockPrompt();
    }, 500);
  }

  _showLockPrompt() {
    if (this._lockPrompt) return;

    const el = document.createElement('div');
    el.className = 'lock-prompt';
    el.innerHTML = '<div class="lp-ring"></div><div class="lp-text">Click to take control</div>';
    document.getElementById('game-layer').appendChild(el);
    void el.offsetWidth;
    el.classList.add('show');
    this._lockPrompt = el;

    const take = () => {
      this.input.requestLock();
      this._hideLockPrompt();
    };
    el.addEventListener('pointerdown', take);
    this._lockTake = take;
    window.addEventListener('pointerdown', take);
  }

  _hideLockPrompt() {
    if (!this._lockPrompt) return;
    window.removeEventListener('pointerdown', this._lockTake);
    const el = this._lockPrompt;
    this._lockPrompt = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 500);
  }

  // --------------------------------------------------------------------------
  // Cinematics
  // --------------------------------------------------------------------------

  /**
   * Run a cinematic to completion.
   *
   * Input stays *enabled at the browser level* but disabled for gameplay: the
   * skip check reads raw key state (`isCodeDown`), which is recorded whether
   * or not gameplay input is accepted, so the player can hold to skip without
   * also being able to walk around behind the letterbox.
   */
  playCinematic(cine) {
    return new Promise((resolve) => {
      // A player who has turned cutscenes off, or a headless test run, still
      // needs everything the cinematic was responsible for setting up — so it
      // is started and immediately skipped, rather than never run. Cinematic
      // .skip() fires every remaining beat, so the world ends up identical.
      const play = Settings.get('cinematics');

      this.cinematic = cine;
      this.state = 'cinematic';
      this.input.enabled = false;
      this.input.releaseLock();
      this.hud.hide();
      // A control prompt left over from gameplay would sit over the shot, and
      // its scrim would take half the light out of it.
      clearTimeout(this._lockTimer);
      this._hideLockPrompt();

      cine.on('finished', () => {
        this.cinematic = null;
        resolve();
        // Deferred: the overlay is still fading out, and a cinematic that owns
        // its own set is still the scene being rendered until whatever comes
        // next swaps it. Freeing either on this frame would show the player a
        // hard-cut overlay and, worse, hand the renderer dead buffers.
        setTimeout(() => cine.dispose?.(), 1200);
      });

      cine.start();
      if (!play) cine.skip();
    });
  }

  /** The opening: forty-eight seconds in a car, arriving at the factory. */
  async playIntroDrive() {
    this.engine.postfx.setFade(1);
    await wait(320);

    const cine = buildIntroSequence({
      engine: this.engine,
      input: this.input,
      audio: Audio,
      music: this.music,
    });

    // The drive has its own set; the menu scene must not be torn down, because
    // quitting back to the menu has to find it still standing.
    await this.playCinematic(cine);
    this.engine.postfx.setFade(1);
  }

  /**
   * A chapter has been beaten.
   *
   * The ending cinematic plays in the level the player just finished, before
   * anything is unloaded — which is the point of running it here rather than
   * in Game: by the time this is over the level is still standing, so the
   * camera has somewhere to be.
   */
  async onChapterComplete(n) {
    this.input.releaseLock();
    this.input.enabled = false;
    this.hud.hide();

    try {
      await this.playCinematic(buildChapterEnding({
        engine: this.engine,
        input: this.input,
        audio: Audio,
        music: this.music,
        level: this.game.level,
        player: this.game.player,
        chapterId: n,
      }));
    } catch (err) {
      console.warn('[cinematic] chapter ending failed', err);
      this.engine.postfx.setFade(1);
      await wait(900);
    }

    this.music.setMood('silent');

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
      MenuNav.update(dt, this.input);
    } else if (this.state === 'cinematic') {
      // A cinematic owns the camera and the clock. Nothing else ticks — no
      // physics, no AI — so a player who leaves one running is not quietly
      // being hunted behind the letterbox.
      this.music?.update(dt);
      this.cinematic?.update(dt);
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

    if (this.paused) {
      // The pause menu is a front end too, and a player who paused with a
      // controller has to be able to un-pause with it.
      MenuNav.update(dt, this.input);
      return;
    }

    this.game.update(dt);
    Save.profile.totalPlaytime += 0;   // Game owns the accounting
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this._hadLock = false;
      clearTimeout(this._lockTimer);
      this._hideLockPrompt();
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
      this.takeControl();
    }
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Which chapters have a level behind them. Shared with the menu. */
const CHAPTER_AVAILABLE = BUILT_CHAPTERS;

// ---------------------------------------------------------------------------

const app = new App();
window.__stitchwork = app;   // handy for debugging from the console

app.start().catch((err) => bootFail('something came apart during setup', err));
