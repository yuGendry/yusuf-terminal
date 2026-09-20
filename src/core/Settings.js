/**
 * Settings.js — central, persisted, live-applied configuration.
 *
 * Every subsystem reads from this store rather than holding its own copy, and
 * subscribes to change events so that moving a slider updates the running game
 * immediately. Values are written to localStorage on every change (debounced).
 */

import { EventBus } from '../util/EventBus.js';

const STORAGE_KEY = 'stitchwork.settings.v1';

/** Graphics presets. `custom` is what you get the moment you touch any slider. */
export const PRESETS = {
  low: {
    resolutionScale: 0.7,
    shadowQuality: 'off',
    ssao: false,
    bloom: false,
    motionBlur: false,
    filmGrain: true,
    chromaticAberration: false,
    antialias: 'none',
    godRays: false,
    particleDensity: 0.25,
    anisotropy: 1,
  },
  medium: {
    resolutionScale: 0.85,
    shadowQuality: 'low',
    ssao: false,
    bloom: true,
    motionBlur: true,
    filmGrain: true,
    chromaticAberration: true,
    antialias: 'fxaa',
    godRays: true,
    particleDensity: 0.55,
    anisotropy: 4,
  },
  high: {
    resolutionScale: 1.0,
    shadowQuality: 'high',
    ssao: true,
    bloom: true,
    motionBlur: true,
    filmGrain: true,
    chromaticAberration: true,
    antialias: 'smaa',
    godRays: true,
    particleDensity: 1.0,
    anisotropy: 8,
  },
  ultra: {
    resolutionScale: 1.0,
    shadowQuality: 'ultra',
    ssao: true,
    bloom: true,
    motionBlur: true,
    filmGrain: true,
    chromaticAberration: true,
    antialias: 'smaa',
    godRays: true,
    particleDensity: 1.6,
    anisotropy: 16,
  },
};

export const DEFAULT_KEYBINDS = {
  forward:    'KeyW',
  back:       'KeyS',
  left:       'KeyA',
  right:      'KeyD',
  sprint:     'ShiftLeft',
  crouch:     'ControlLeft',
  jump:       'Space',
  interact:   'KeyE',
  mask:       'KeyF',
  lensPrev:   'KeyQ',
  lensNext:   'KeyR',
  flashlight: 'KeyL',
  hint:       'KeyH',
  journal:    'KeyJ',
  pause:      'Escape',
};

const DEFAULTS = {
  // ---- graphics -----------------------------------------------------------
  preset: 'high',
  ...PRESETS.high,
  motionBlurIntensity: 0.55,
  bloomIntensity: 0.55,
  filmGrainIntensity: 0.4,
  chromaticAberrationIntensity: 0.4,
  vignetteIntensity: 0.6,
  brightness: 1.0,          // gamma calibration screen writes this
  fov: 75,
  maxFps: 0,                // 0 = uncapped

  // ---- controls -----------------------------------------------------------
  mouseSensitivity: 1.0,
  invertY: false,
  keybinds: { ...DEFAULT_KEYBINDS },

  // ---- audio --------------------------------------------------------------
  volMaster: 0.85,
  volMusic: 0.7,
  volSfx: 0.9,
  volVoice: 1.0,

  // ---- accessibility ------------------------------------------------------
  subtitles: true,
  subtitleSize: 1.0,
  reduceFlashing: false,
  reduceScreenShake: false,
  reduceHeadBob: false,
  holdToSprint: true,
  holdToCrouch: true,
  showObjective: true,
  crosshair: true,
  cinematics: true,
};

/** Keys that, when changed individually, flip `preset` to "custom". */
const PRESET_KEYS = new Set(Object.keys(PRESETS.high));

class SettingsStore extends EventBus {
  constructor() {
    super();
    this.values = { ...DEFAULTS, keybinds: { ...DEFAULT_KEYBINDS } };
    this._saveTimer = 0;
    this.load();
  }

  get(key) {
    return this.values[key];
  }

  /** Read-only snapshot, safe to hand to subsystems. */
  all() {
    return { ...this.values, keybinds: { ...this.values.keybinds } };
  }

  /**
   * Set one value. Emits `change:<key>` and a generic `change`, so subsystems
   * can react granularly (a resolution change is expensive; a grain slider is
   * not) without polling.
   */
  set(key, value, { silent = false } = {}) {
    if (this.values[key] === value) return;
    const prev = this.values[key];
    this.values[key] = value;

    // Touching a quality knob directly means the player is no longer on a preset.
    if (PRESET_KEYS.has(key) && this.values.preset !== 'custom') {
      this.values.preset = 'custom';
      if (!silent) this.emit('change:preset', 'custom', this.values.preset);
    }

    if (!silent) {
      this.emit(`change:${key}`, value, prev);
      this.emit('change', key, value, prev);
    }
    this.scheduleSave();
  }

  /** Apply a whole graphics preset at once. */
  applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    for (const [k, v] of Object.entries(preset)) {
      this.values[k] = v;
      this.emit(`change:${k}`, v);
    }
    this.values.preset = name;
    this.emit('change:preset', name);
    this.emit('change', 'preset', name);
    this.scheduleSave();
  }

  setKeybind(action, code) {
    if (!(action in this.values.keybinds)) return;
    // Clear any other action already using this code, so we never end up with
    // two actions on one key.
    for (const [a, c] of Object.entries(this.values.keybinds)) {
      if (a !== action && c === code) this.values.keybinds[a] = null;
    }
    this.values.keybinds[action] = code;
    this.emit('change:keybinds', this.values.keybinds);
    this.emit('change', 'keybinds', this.values.keybinds);
    this.scheduleSave();
  }

  resetKeybinds() {
    this.values.keybinds = { ...DEFAULT_KEYBINDS };
    this.emit('change:keybinds', this.values.keybinds);
    this.scheduleSave();
  }

  resetAll() {
    this.values = { ...DEFAULTS, keybinds: { ...DEFAULT_KEYBINDS } };
    for (const k of Object.keys(this.values)) this.emit(`change:${k}`, this.values[k]);
    this.emit('change', '*', null);
    this.scheduleSave();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Merge rather than replace, so settings added in a later build still
      // get their defaults instead of becoming undefined.
      this.values = {
        ...DEFAULTS,
        ...parsed,
        keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds || {}) },
      };
    } catch (err) {
      console.warn('[settings] could not read saved settings, using defaults', err);
    }
  }

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 250);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (err) {
      console.warn('[settings] could not persist settings', err);
    }
  }
}

export const Settings = new SettingsStore();
