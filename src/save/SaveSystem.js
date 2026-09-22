/**
 * SaveSystem.js — persistence.
 *
 * Two separate things live in localStorage:
 *
 *  - The *profile*: everything that survives death and persists across
 *    playthroughs. Which chapters are unlocked, which notes and tapes have
 *    ever been found, which ticket stubs. The archive reads from here.
 *  - The *save slot*: the resumable run. Position, inventory, lenses, puzzle
 *    states, the current checkpoint.
 *
 * Splitting them means a player who dies and reloads never loses a collectible
 * they already read, and the Archive stays populated even after starting a new
 * game.
 */

import { EventBus } from '../util/EventBus.js';

const PROFILE_KEY = 'stitchwork.profile.v1';
const SLOT_KEY = (n) => `stitchwork.slot${n}.v1`;
const SAVE_VERSION = 1;

const EMPTY_PROFILE = {
  version: SAVE_VERSION,
  unlockedChapters: [1],
  foundNotes: [],
  foundTapes: [],
  foundStubs: [],
  unlockedLenses: [],
  endingsSeen: [],
  totalPlaytime: 0,
  firstPlayedAt: null,
};

class SaveSystemImpl extends EventBus {
  constructor() {
    super();
    this.profile = this._loadProfile();
    this.slot = 0;
  }

  // --------------------------------------------------------------------------
  // Profile
  // --------------------------------------------------------------------------

  _loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return { ...EMPTY_PROFILE };
      const parsed = JSON.parse(raw);
      // Merge against the template so a profile written by an older build
      // gains any newly added fields instead of yielding undefined.
      return {
        ...EMPTY_PROFILE,
        ...parsed,
        unlockedChapters: parsed.unlockedChapters?.length ? parsed.unlockedChapters : [1],
      };
    } catch (err) {
      console.warn('[save] profile unreadable, starting fresh', err);
      return { ...EMPTY_PROFILE };
    }
  }

  saveProfile() {
    try {
      if (!this.profile.firstPlayedAt) this.profile.firstPlayedAt = Date.now();
      localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
      this.emit('profileSaved', this.profile);
    } catch (err) {
      console.warn('[save] could not write profile', err);
    }
  }

  unlockChapter(n) {
    if (this.profile.unlockedChapters.includes(n)) return;
    this.profile.unlockedChapters.push(n);
    this.profile.unlockedChapters.sort((a, b) => a - b);
    this.saveProfile();
    this.emit('chapterUnlocked', n);
  }

  isChapterUnlocked(n) {
    return this.profile.unlockedChapters.includes(n);
  }

  get highestChapter() {
    return Math.max(...this.profile.unlockedChapters);
  }

  /** Record a collectible permanently. Returns false if already known. */
  recordCollectible(kind, id) {
    const key = kind === 'note' ? 'foundNotes' : kind === 'tape' ? 'foundTapes' : 'foundStubs';
    if (this.profile[key].includes(id)) return false;
    this.profile[key].push(id);
    this.saveProfile();
    this.emit('collectibleFound', kind, id);
    return true;
  }

  hasCollectible(kind, id) {
    const key = kind === 'note' ? 'foundNotes' : kind === 'tape' ? 'foundTapes' : 'foundStubs';
    return this.profile[key].includes(id);
  }

  get stubCount() {
    return this.profile.foundStubs.length;
  }

  recordEnding(id) {
    if (!this.profile.endingsSeen.includes(id)) {
      this.profile.endingsSeen.push(id);
      this.saveProfile();
    }
  }

  // --------------------------------------------------------------------------
  // Save slots
  // --------------------------------------------------------------------------

  /** Metadata only — used by the menu to decide whether Continue is available. */
  peekSlot(n = 0) {
    try {
      const raw = localStorage.getItem(SLOT_KEY(n));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== SAVE_VERSION) return null;
      return {
        chapter: data.chapter,
        chapterTitle: data.chapterTitle,
        checkpoint: data.checkpoint,
        savedAt: data.savedAt,
        playtime: data.playtime ?? 0,
        stubs: data.collectedStubs?.length ?? 0,
        auto: !!data.auto,
      };
    } catch {
      return null;
    }
  }

  hasSave(n = 0) {
    return this.peekSlot(n) !== null;
  }

  write(state, n = 0) {
    try {
      const payload = { ...state, version: SAVE_VERSION, savedAt: Date.now() };
      localStorage.setItem(SLOT_KEY(n), JSON.stringify(payload));
      this.emit('saved', payload, n);
      return true;
    } catch (err) {
      console.warn('[save] could not write slot', err);
      this.emit('saveFailed', err);
      return false;
    }
  }

  read(n = 0) {
    try {
      const raw = localStorage.getItem(SLOT_KEY(n));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== SAVE_VERSION) {
        console.warn('[save] slot written by a different version, ignoring');
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[save] could not read slot', err);
      return null;
    }
  }

  clearSlot(n = 0) {
    // Guarded like every other access here. The single-file build is opened
    // straight off the disk, where the page is an opaque origin and storage
    // can be refused outright — and a throw from "delete this save" would take
    // the settings screen down with it.
    try { localStorage.removeItem(SLOT_KEY(n)); } catch { /* no storage */ }
    this.emit('slotCleared', n);
  }

  /** Wipe everything, including the archive. Used by "Erase all data". */
  eraseAll() {
    try {
      localStorage.removeItem(PROFILE_KEY);
      for (let i = 0; i < 3; i++) localStorage.removeItem(SLOT_KEY(i));
    } catch { /* no storage */ }
    this.profile = { ...EMPTY_PROFILE };
    this.emit('erased');
  }
}

export const Save = new SaveSystemImpl();

/** Format a playtime in seconds as "1h 24m". */
export function formatPlaytime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

/** "3 minutes ago" / "yesterday" for the Continue button. */
export function formatWhen(timestamp) {
  if (!timestamp) return '';
  const delta = (Date.now() - timestamp) / 1000;
  if (delta < 90) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)} minutes ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} hours ago`;
  if (delta < 172800) return 'yesterday';
  return `${Math.floor(delta / 86400)} days ago`;
}
