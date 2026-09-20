/**
 * Game.js — a play session.
 *
 * Owns everything that exists only while a chapter is running: the player, the
 * mask, the torch, interaction, puzzles, the loaded level, and the checkpoint
 * state. The engine, input, physics and audio outlive it.
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { PlayerController } from '../player/PlayerController.js';
import { Flashlight } from '../player/Flashlight.js';
import { Veilmask } from '../mask/Veilmask.js';
import { Interaction } from './Interaction.js';
import { PuzzleSystem } from '../puzzles/PuzzleSystem.js';
import { Reader } from '../ui/Reader.js';
import { MaskOverlay } from '../ui/MaskOverlay.js';
import { Save } from '../save/SaveSystem.js';
import { Settings } from './Settings.js';
import { CHAPTERS, getChapter } from '../chapters/ChapterData.js';
import { clamp, damp } from '../util/MathUtil.js';

/** Chapter builders, loaded on demand so the menu does not pay for them. */
const CHAPTER_LOADERS = {
  1: () => import('../chapters/Chapter1.js').then((m) => m.buildChapter1),
  2: () => import('../chapters/Chapter2.js').then((m) => m.buildChapter2),
  3: () => import('../chapters/Chapter3.js').then((m) => m.buildChapter3),
};

export class Game extends EventBus {
  constructor({ engine, input, physics, audio, music, hud }) {
    super();
    this.engine = engine;
    this.input = input;
    this.physics = physics;
    this.audio = audio;
    this.music = music;
    this.hud = hud;

    this.chapterId = 1;
    this.level = null;
    this.player = null;
    this.paused = false;
    this.dead = false;
    this.playtime = 0;

    this.reader = new Reader();
    this.maskOverlay = new MaskOverlay();

    this._checkpoint = null;
    this._radioQueue = [];
    this._radioTimer = 0;
    this._hallucFigures = [];
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async load(chapterId, { restore = null } = {}) {
    this.chapterId = chapterId;
    this.dead = false;

    // --- systems ------------------------------------------------------------
    this.puzzles = new PuzzleSystem({ hud: this.hud, audio: this.audio, save: Save });

    this.interaction = new Interaction({
      engine: this.engine,
      input: this.input,
      physics: this.physics,
      hud: this.hud,
      audio: this.audio,
    });

    this.mask = new Veilmask({
      engine: this.engine,
      input: this.input,
      audio: this.audio,
      player: null,          // set once the player exists
      hud: this.hud,
    });

    this.flashlight = new Flashlight({
      engine: this.engine,
      input: this.input,
      player: null,
      audio: this.audio,
    });

    // --- build the level ----------------------------------------------------
    const build = await CHAPTER_LOADERS[chapterId]?.();
    if (!build) throw new Error(`Chapter ${chapterId} is not available yet`);

    const ctx = {
      physics: this.physics,
      engine: this.engine,
      audio: this.audio,
      music: this.music,
      save: Save,
      puzzles: this.puzzles,
      interaction: this.interaction,
      mask: this.mask,
      flashlight: this.flashlight,
      hud: this.hud,
      reader: this.reader,
      player: null,
      playRadio: (msg) => this.playRadio(msg),
      checkpoint: (id) => this.setCheckpoint(id),
      onPlayerCaught: (by) => this.kill(by),
      completeChapter: (n) => this.completeChapter(n),
    };
    this._ctx = ctx;

    this.level = build(ctx);

    // Colliders were just created; Rapier's broad phase has to be rebuilt
    // before anything queries it (see Physics.refreshQueries).
    this.physics.refreshQueries();

    // --- player -------------------------------------------------------------
    this.player = new PlayerController({
      engine: this.engine,
      input: this.input,
      physics: this.physics,
      spawn: this.level.spawn.clone(),
      yaw: this.level.spawnYaw ?? 0,
    });
    ctx.player = this.player;
    this.mask.player = this.player;
    this.flashlight.player = this.player;

    // The level was built before the player existed — it had to be, because
    // the spawn point is part of the level. Anything the level created that
    // needs a player reference (the AI, most obviously) gets it now.
    this.level.onPlayerReady?.(this.player);

    this.player.on('footstep', (info) => this._onFootstep(info));

    this.flashlight.addTo(this.level.scene);
    this.mask.setScene(this.level.scene);

    // --- mask wiring --------------------------------------------------------
    this.mask.on('lensChanged', (id, data) => this.maskOverlay.setLens(data));
    this.mask.on('lensUnlocked', (id, data) => {
      this.hud.say(`${data.name} lens. ${data.description}`, { duration: 7 });
    });
    this.mask.on('figure', (pos) => this._spawnFigure(pos));
    this.mask.on('overload', () => this.player.addTrauma(0.6));
    if (this.mask.lensData) this.maskOverlay.setLens(this.mask.lensData);

    this.maskOverlay.mount(document.getElementById('game-layer'));

    this.reader.onClose = null;

    // --- restore ------------------------------------------------------------
    if (restore) this._restore(restore);

    this.engine.setScene(this.level.scene);
    this.emit('loaded', chapterId);
    return this.level;
  }

  unload() {
    this.interaction?.clear();
    this.maskOverlay.unmount();
    this.reader.close();
    this.mask?.dispose();
    this.level?.dispose?.();
    this.level = null;
    this.player = null;
    for (const f of this._hallucFigures) f.parent?.remove(f);
    this._hallucFigures.length = 0;
  }

  // --------------------------------------------------------------------------
  // Frame
  // --------------------------------------------------------------------------

  update(dt) {
    if (!this.level || !this.player) return;

    // A reader (note, tape, stub) freezes the world without opening the pause
    // menu — the player is standing there reading, not out of the game.
    if (this.reader.open) {
      this.audio.updateListener?.(this.engine.camera);
      return;
    }

    this.playtime += dt;
    Save.profile.totalPlaytime += dt;

    if (this.dead) {
      this._updateDeath(dt);
      return;
    }

    // --- input-driven systems ----------------------------------------------
    this.mask.handleInput();
    this.flashlight.handleInput();

    if (this.input.pressed('hint')) this.puzzles.requestHint();

    // --- simulation ---------------------------------------------------------
    this.player.update(dt);
    this.physics.step(dt);

    this.mask.update(dt);
    this.flashlight.update(dt);
    this.interaction.update(dt, this.mask);
    this.puzzles.update(dt);

    this.level.update?.(dt, this.engine.elapsed, this.player);

    // --- presentation -------------------------------------------------------
    this.maskOverlay.update(
      this.mask.worn && this.mask.blinded <= 0 ? 1 : 0,
      this.mask.strain,
      this.mask.cracks
    );
    this.hud.update(dt, this.player, this.engine);
    this.hud.updateFlashlight?.(this.flashlight);

    this.audio.updateListener?.(this.engine.camera);
    this._updateRadio(dt);
    this._updateFigures(dt);
    this.music.update(dt);
  }

  _onFootstep(info) {
    // Levels can listen to footsteps directly — Chapter 3's Gloam hunts by
    // sound and this is the only way it learns where the player is.
    this._ctx?.onFootstep?.(info);

    // Ask the world what is underfoot, so footsteps are correct in every level
    // without the level having to declare zones.
    const origin = info.position.clone();
    origin.y += 0.25;
    const hit = this.physics.raycast(origin, { x: 0, y: -1, z: 0 }, 1.8);
    const surface = hit?.collider?.userData?.surface ?? 'wood';
    this.audio.footstep?.(surface, { loudness: info.loudness });
  }

  // --------------------------------------------------------------------------
  // Radio
  // --------------------------------------------------------------------------

  playRadio(message) {
    if (!message) return;
    this._radioQueue = message.lines.map((l) => ({ ...l }));
    this._radioTimer = 0;
    this._radioSpeaker = message.speaker ?? 'RADIO';
    this.audio.staticBurst?.(0.4, 0.06);
  }

  _updateRadio(dt) {
    if (!this._radioQueue.length) return;
    this._radioTimer += dt;
    while (this._radioQueue.length && this._radioTimer >= this._radioQueue[0].t) {
      const line = this._radioQueue.shift();
      this.hud.say(line.text, { speaker: this._radioSpeaker, duration: 5.5 });
      // Each line arrives through a dying transmitter.
      this.audio.noise?.({
        duration: 0.12, gain: 0.04, filterType: 'highpass', freq: 1400, q: 0.5, bus: 'voice',
      });
    }
  }

  // --------------------------------------------------------------------------
  // Hallucinated figures
  // --------------------------------------------------------------------------

  /**
   * A shape at the edge of vision that is gone when you look at it.
   *
   * It is removed as soon as it enters the middle of the frame, so the player
   * can never confirm it — which is the entire effect. It is also never placed
   * where a real enemy could be, so it can never be mistaken for a threat cue.
   */
  _spawnFigure(position) {
    const geo = new THREE.CapsuleGeometry(0.22, 1.1, 4, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0a0a0c, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const fig = new THREE.Mesh(geo, mat);
    fig.position.copy(position);
    fig.position.y = 0.9;
    fig.userData.life = 0;
    this.level.scene.add(fig);
    this._hallucFigures.push(fig);
  }

  _updateFigures(dt) {
    if (!this._hallucFigures.length) return;
    const cam = this.engine.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const toFig = new THREE.Vector3();

    for (let i = this._hallucFigures.length - 1; i >= 0; i--) {
      const fig = this._hallucFigures[i];
      fig.userData.life += dt;

      toFig.subVectors(fig.position, cam.position).normalize();
      const facing = toFig.dot(fwd);

      // Looking near it (or waiting) makes it stop having been there.
      const looked = facing > 0.86;
      if (looked || fig.userData.life > 6) {
        fig.material.opacity -= dt * (looked ? 9 : 2);
        if (fig.material.opacity <= 0.01) {
          fig.parent?.remove(fig);
          fig.geometry.dispose();
          fig.material.dispose();
          this._hallucFigures.splice(i, 1);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Death and checkpoints
  // --------------------------------------------------------------------------

  kill(cause = 'unknown') {
    if (this.dead) return;
    this.dead = true;
    this._deathTime = 0;
    this.input.enabled = false;
    this.player.frozen = true;
    this.mask.takeOff();
    this.music.setMood('silent');
    this.emit('died', cause);

    this.hud.showDeath?.(cause);
  }

  _updateDeath(dt) {
    this._deathTime += dt;
    // Restraint: no jump-scare sting. The picture closes in, the sound drops
    // away, and the checkpoint reloads. Being caught is punishment enough.
    this.engine.postfx.fx.fade = clamp(this._deathTime / 2.2, 0, 1);
    this.engine.postfx.fx.saturation = clamp(1 - this._deathTime / 1.4, 0, 1);

    if (this._deathTime > 2.8) {
      this.dead = false;
      this.respawn();
    }
  }

  setCheckpoint(id) {
    this._checkpoint = {
      id,
      player: this.player.serialize(),
      mask: this.mask.serialize(),
      flashlight: this.flashlight.serialize(),
      puzzles: this.puzzles.serialize(),
      level: this.level.serialize?.() ?? null,
    };
    this.saveToSlot();
    this.hud.showCheckpoint?.();
    this.emit('checkpoint', id);
  }

  respawn() {
    const cp = this._checkpoint;
    this.input.enabled = true;
    this.player.frozen = false;
    this.engine.postfx.fx.saturation = 1;
    this.engine.postfx.setFade(0);
    this.hud.hideDeath?.();

    if (cp) {
      this._restore(cp);
    } else {
      this.player.teleport(this.level.spawn.clone(), this.level.spawnYaw ?? 0);
    }

    // Let the level undo anything that must not still be running — most
    // importantly a chase, which has to be re-armed rather than resumed. A
    // player who respawns into a chase already in progress, with the enemy
    // sitting where it was when they died, is in an unwinnable loop.
    this.level.onRespawn?.(cp?.id ?? null, this.player);

    this.music.setMood('unease');
    this.emit('respawned');
  }

  _restore(data) {
    this.player.deserialize(data.player);
    this.mask.deserialize(data.mask);
    this.flashlight.deserialize(data.flashlight);
    this.puzzles.deserialize(data.puzzles);
    this.level.restore?.(data.level);
    this.mask.refreshVisibility();
  }

  // --------------------------------------------------------------------------
  // Progression
  // --------------------------------------------------------------------------

  completeChapter(n) {
    Save.unlockChapter(n + 1);
    Save.saveProfile();
    this.emit('chapterComplete', n);
  }

  saveToSlot(slot = 0) {
    const ch = getChapter(this.chapterId);
    Save.write({
      chapter: this.chapterId,
      chapterTitle: ch?.title ?? '',
      checkpoint: this._checkpoint?.id ?? 'start',
      playtime: this.playtime,
      auto: true,
      collectedStubs: Save.profile.foundStubs,
      player: this.player.serialize(),
      mask: this.mask.serialize(),
      flashlight: this.flashlight.serialize(),
      puzzles: this.puzzles.serialize(),
      level: this.level?.serialize?.() ?? null,
    }, slot);
  }

  static loadSlot(slot = 0) {
    return Save.read(slot);
  }
}
