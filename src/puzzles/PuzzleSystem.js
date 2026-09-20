/**
 * PuzzleSystem.js — puzzle registration, state, and the three-tier hint ladder.
 *
 * Every puzzle declares its own hints at the point it is defined, next to the
 * logic they describe, so a hint can never drift out of date with the puzzle.
 * The contract for the three tiers is fixed:
 *
 *   1. Points at the clue that already exists in the world.
 *   2. Explains the mechanism — what the player has misunderstood.
 *   3. Gives the answer outright.
 *
 * A hint tier is only released after the player has been stuck for a while, so
 * pressing H once does not hand over the solution.
 */

import { EventBus } from '../util/EventBus.js';
import { clamp } from '../util/MathUtil.js';

/** Seconds of being stuck on a puzzle before each tier unlocks on its own. */
const TIER_DELAYS = [0, 75, 210];

export class PuzzleSystem extends EventBus {
  constructor({ hud, audio, save }) {
    super();
    this.hud = hud;
    this.audio = audio;
    this.save = save;

    /** id -> puzzle record */
    this.puzzles = new Map();
    this.activeId = null;
    this._elapsedOnActive = 0;
  }

  /**
   * @param {object} def
   * @param {string} def.id
   * @param {string} def.name            shown in the journal
   * @param {string} def.objective       the current-objective line
   * @param {string[]} def.hints         exactly three, vague → solution
   * @param {function} [def.isSolved]    optional predicate for auto-detection
   */
  register(def) {
    if (def.hints?.length !== 3) {
      console.warn(`[puzzle] "${def.id}" should declare exactly three hints`);
    }
    this.puzzles.set(def.id, {
      solved: false,
      hintsShown: 0,
      timeStuck: 0,
      ...def,
    });
    return def.id;
  }

  /** Make a puzzle the current objective. */
  activate(id) {
    const p = this.puzzles.get(id);
    if (!p || p.solved) return;
    this.activeId = id;
    this._elapsedOnActive = 0;
    this.hud?.setObjective(p.objective);
    this.emit('activated', p);
  }

  solve(id) {
    const p = this.puzzles.get(id);
    if (!p || p.solved) return false;
    p.solved = true;
    this.audio?.puzzleSolved?.();
    this.emit('solved', p);
    if (this.activeId === id) {
      this.activeId = null;
      this.hud?.setObjective(null);
    }
    return true;
  }

  isSolved(id) {
    return !!this.puzzles.get(id)?.solved;
  }

  get active() {
    return this.activeId ? this.puzzles.get(this.activeId) : null;
  }

  /**
   * Player asked for a hint (H key, or the ? button).
   *
   * Reveals the next tier if they have been stuck long enough; otherwise
   * repeats the most recent one. Repeating rather than refusing matters — a
   * player who has forgotten the last hint should not be stonewalled.
   */
  requestHint() {
    const p = this.active;
    if (!p) {
      this.hud?.say('Nothing is puzzling you at the moment.', { duration: 2.6 });
      return null;
    }

    const earned = TIER_DELAYS.filter((d) => p.timeStuck >= d).length;
    const allowed = clamp(earned, 1, 3);

    if (p.hintsShown < allowed) {
      p.hintsShown++;
      this.emit('hintShown', p, p.hintsShown);
    }

    const text = p.hints[p.hintsShown - 1];
    const tierName = ['A thought', 'A closer look', 'The answer'][p.hintsShown - 1];

    this.hud?.showHint?.(tierName, text, {
      tier: p.hintsShown,
      more: p.hintsShown < 3,
      locked: p.hintsShown >= allowed && p.hintsShown < 3,
      nextIn: Math.max(0, TIER_DELAYS[p.hintsShown] - p.timeStuck),
    });
    this.audio?.uiClick?.();
    return text;
  }

  /** "Where do I go?" — a thread toward the current objective marker. */
  requestDirection() {
    const p = this.active;
    const target = p?.marker ?? this._fallbackMarker;
    if (!target) {
      this.hud?.say('The threads here all lead nowhere.', { duration: 2.6 });
      return null;
    }
    this.emit('showDirection', target);
    return target;
  }

  setFallbackMarker(v) {
    this._fallbackMarker = v;
  }

  update(dt) {
    const p = this.active;
    if (!p) return;
    p.timeStuck += dt;
    this._elapsedOnActive += dt;

    // Auto-detected solutions, for puzzles whose state lives in the level.
    if (!p.solved && p.isSolved?.()) this.solve(p.id);
  }

  serialize() {
    const out = {};
    for (const [id, p] of this.puzzles) {
      out[id] = { solved: p.solved, hintsShown: p.hintsShown, timeStuck: p.timeStuck };
    }
    return { active: this.activeId, puzzles: out };
  }

  deserialize(data) {
    if (!data) return;
    for (const [id, saved] of Object.entries(data.puzzles ?? {})) {
      const p = this.puzzles.get(id);
      if (!p) continue;
      p.solved = saved.solved;
      p.hintsShown = saved.hintsShown ?? 0;
      p.timeStuck = saved.timeStuck ?? 0;
    }
    if (data.active && this.puzzles.has(data.active) && !this.puzzles.get(data.active).solved) {
      this.activate(data.active);
    }
  }
}
