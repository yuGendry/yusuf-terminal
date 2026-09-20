/**
 * SettingsMenu.js — the complete options dialog.
 *
 * Four tabs (Graphics, Controls, Audio, Accessibility) plus a full-screen gamma
 * calibration step. Every control writes straight into the Settings store,
 * which applies live — there is no "apply" button and nothing needs a restart.
 */

import { Settings, PRESETS, DEFAULT_KEYBINDS } from '../core/Settings.js';
import { Audio } from '../audio/AudioEngine.js';
import {
  makeSlider, makeToggle, makeSelect, makeKeybind, makeButton, makeSectionHeader, el,
} from './Widgets.js';

const PCT = (v) => `${Math.round(v * 100)}%`;
const DEG = (v) => `${Math.round(v)}°`;
const MULT = (v) => `${v.toFixed(2)}×`;

/** Labels for every rebindable action, in the order they're shown. */
const BINDABLE = [
  ['forward', 'Move forward'],
  ['back', 'Move back'],
  ['left', 'Strafe left'],
  ['right', 'Strafe right'],
  ['sprint', 'Sprint'],
  ['crouch', 'Crouch'],
  ['jump', 'Jump / vault'],
  ['interact', 'Interact'],
  ['mask', 'Veilmask on / off'],
  ['lensPrev', 'Previous lens'],
  ['lensNext', 'Next lens'],
  ['flashlight', 'Flashlight'],
  ['hint', 'Hint'],
  ['journal', 'Journal'],
  ['pause', 'Pause'],
];

export class SettingsMenu {
  constructor({ input, engine, onClose }) {
    this.input = input;
    this.engine = engine;
    this.onClose = onClose;
    this.open = false;
    this.root = null;
    this._activeTab = 'graphics';
    this._build();
  }

  _build() {
    const overlay = el('div', 'sw-overlay');
    overlay.id = 'settings-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Settings');

    const dialog = el('div', 'sw-dialog sw-panel');

    // ---- head --------------------------------------------------------------
    const head = el('div', 'sw-dialog-head');
    const headText = el('div');
    headText.appendChild(el('h2', 'sw-h1', 'Settings'));
    headText.appendChild(el('p', 'sw-sub', 'Hollowhart Puppet Works — projection booth'));
    head.appendChild(headText);
    dialog.appendChild(head);

    // ---- body --------------------------------------------------------------
    const body = el('div', 'sw-dialog-body');
    const tabs = el('div', 'sw-tabs');
    const panels = el('div', 'sw-tab-panel-wrap');
    panels.style.cssText = 'flex:1;min-width:0;display:flex;';

    const tabDefs = [
      ['graphics', 'Graphics', () => this._graphicsPanel()],
      ['controls', 'Controls', () => this._controlsPanel()],
      ['audio', 'Audio', () => this._audioPanel()],
      ['access', 'Accessibility', () => this._accessPanel()],
    ];

    this._tabButtons = {};
    this._panels = {};

    for (const [id, label, builder] of tabDefs) {
      const btn = el('button', 'sw-tab', label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        Audio.uiClick();
        this._showTab(id);
      });
      btn.addEventListener('mouseenter', () => Audio.uiHover());
      tabs.appendChild(btn);
      this._tabButtons[id] = btn;

      const panel = el('div', 'sw-tab-panel sw-scroll');
      panel.hidden = true;
      panel.appendChild(builder());
      panels.appendChild(panel);
      this._panels[id] = panel;
    }

    body.append(tabs, panels);
    dialog.appendChild(body);

    // ---- foot --------------------------------------------------------------
    const foot = el('div', 'sw-dialog-foot');
    foot.appendChild(el('span', 'foot-hint', 'Changes apply immediately and are saved automatically'));

    const footBtns = el('div');
    footBtns.style.cssText = 'display:flex;gap:10px;';

    const resetBtn = el('button', 'opt-action danger', 'Reset all');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => {
      if (resetBtn.dataset.armed === '1') {
        Settings.resetAll();
        Audio.uiClick();
        resetBtn.dataset.armed = '0';
        resetBtn.textContent = 'Reset all';
      } else {
        // Two-step, because resetting every setting by misclick is miserable.
        resetBtn.dataset.armed = '1';
        resetBtn.textContent = 'Click again to confirm';
        Audio.uiDenied();
        setTimeout(() => {
          resetBtn.dataset.armed = '0';
          resetBtn.textContent = 'Reset all';
        }, 3200);
      }
    });

    const closeBtn = el('button', 'opt-action', 'Back');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => {
      Audio.uiBack();
      this.close();
    });
    closeBtn.addEventListener('mouseenter', () => Audio.uiHover());

    footBtns.append(resetBtn, closeBtn);
    foot.appendChild(footBtns);
    dialog.appendChild(foot);

    overlay.appendChild(dialog);

    // Click outside the dialog closes it.
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        Audio.uiBack();
        this.close();
      }
    });

    this.root = overlay;
    this._showTab('graphics');

    this._buildGammaScreen();
  }

  _showTab(id) {
    this._activeTab = id;
    for (const [key, btn] of Object.entries(this._tabButtons)) {
      btn.classList.toggle('active', key === id);
    }
    for (const [key, panel] of Object.entries(this._panels)) {
      panel.hidden = key !== id;
    }
  }

  // --------------------------------------------------------------------------
  // Graphics
  // --------------------------------------------------------------------------

  _graphicsPanel() {
    const frag = document.createDocumentFragment();

    frag.appendChild(makeSectionHeader('Preset'));
    frag.appendChild(makeSelect({
      label: 'Quality preset',
      description: 'Medium targets 60 fps on a mid-range laptop. Changing any single option below switches this to Custom.',
      key: 'preset',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'ultra', label: 'Ultra' },
        { value: 'custom', label: 'Custom' },
      ],
      onChange: (v) => {
        if (v !== 'custom') Settings.applyPreset(v);
      },
    }));

    frag.appendChild(makeSectionHeader('Rendering'));
    frag.appendChild(makeSlider({
      label: 'Resolution scale',
      description: 'Renders the 3D view below native resolution and upscales. The single biggest performance lever.',
      key: 'resolutionScale', min: 0.4, max: 1.0, step: 0.05, format: PCT,
    }));
    frag.appendChild(makeSelect({
      label: 'Shadow quality',
      description: 'Off removes all real-time shadows. Lighting still works, but the building loses most of its depth.',
      key: 'shadowQuality',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' },
        { value: 'ultra', label: 'Ultra' },
      ],
    }));
    frag.appendChild(makeSelect({
      label: 'Anti-aliasing',
      description: 'SMAA is sharper and costs a little more than FXAA.',
      key: 'antialias',
      options: [
        { value: 'none', label: 'Off' },
        { value: 'fxaa', label: 'FXAA' },
        { value: 'smaa', label: 'SMAA' },
      ],
    }));
    frag.appendChild(makeSelect({
      label: 'Texture filtering',
      description: 'Anisotropic filtering keeps floors sharp when viewed at a glancing angle.',
      key: 'anisotropy',
      options: [
        { value: 1, label: 'Off' },
        { value: 4, label: '4×' },
        { value: 8, label: '8×' },
        { value: 16, label: '16×' },
      ],
    }));
    frag.appendChild(makeToggle({
      label: 'Ambient occlusion',
      description: 'Contact shadows in corners and under objects. Expensive, but it is most of what makes the rooms feel solid.',
      key: 'ssao',
    }));

    frag.appendChild(makeSectionHeader('Camera & effects'));
    frag.appendChild(makeSlider({
      label: 'Field of view',
      description: 'Higher values show more of the room and reduce motion sickness for some players.',
      key: 'fov', min: 60, max: 110, step: 1, format: DEG,
    }));
    frag.appendChild(makeToggle({
      label: 'Motion blur',
      description: 'Camera-velocity blur. Smears the world when you turn quickly.',
      key: 'motionBlur',
    }));
    frag.appendChild(makeSlider({
      label: 'Motion blur intensity',
      key: 'motionBlurIntensity', min: 0, max: 1.5, step: 0.05, format: MULT,
    }));
    frag.appendChild(makeToggle({ label: 'Bloom', key: 'bloom' }));
    frag.appendChild(makeSlider({
      label: 'Bloom intensity', key: 'bloomIntensity', min: 0, max: 1.5, step: 0.05, format: MULT,
    }));
    frag.appendChild(makeToggle({ label: 'Film grain', key: 'filmGrain' }));
    frag.appendChild(makeSlider({
      label: 'Film grain intensity', key: 'filmGrainIntensity', min: 0, max: 1, step: 0.05, format: PCT,
    }));
    frag.appendChild(makeToggle({
      label: 'Chromatic aberration',
      description: 'Colour fringing at the edges of the frame. Intensifies during chases and at high mask strain.',
      key: 'chromaticAberration',
    }));
    frag.appendChild(makeSlider({
      label: 'Chromatic aberration intensity',
      key: 'chromaticAberrationIntensity', min: 0, max: 1, step: 0.05, format: PCT,
    }));
    frag.appendChild(makeSlider({
      label: 'Vignette', key: 'vignetteIntensity', min: 0, max: 1, step: 0.05, format: PCT,
    }));
    frag.appendChild(makeToggle({
      label: 'God rays & dust',
      description: 'Light shafts through windows and floating dust motes.',
      key: 'godRays',
    }));
    frag.appendChild(makeSlider({
      label: 'Particle density', key: 'particleDensity', min: 0, max: 2, step: 0.1, format: MULT,
    }));

    frag.appendChild(makeSectionHeader('Display'));
    frag.appendChild(makeButton({
      label: 'Brightness calibration',
      description: 'Open the calibration screen and set the display so the marionette is only just visible.',
      text: 'Calibrate',
      onClick: () => this.openGamma(),
    }));
    frag.appendChild(makeSelect({
      label: 'Frame rate limit',
      description: 'Capping the frame rate can reduce fan noise and keep frame times consistent.',
      key: 'maxFps',
      options: [
        { value: 0, label: 'Off' },
        { value: 30, label: '30' },
        { value: 60, label: '60' },
        { value: 120, label: '120' },
      ],
    }));

    return frag;
  }

  // --------------------------------------------------------------------------
  // Controls
  // --------------------------------------------------------------------------

  _controlsPanel() {
    const frag = document.createDocumentFragment();

    frag.appendChild(makeSectionHeader('Mouse'));
    frag.appendChild(makeSlider({
      label: 'Sensitivity', key: 'mouseSensitivity',
      min: 0.1, max: 3, step: 0.05, format: MULT,
    }));
    frag.appendChild(makeToggle({ label: 'Invert vertical look', key: 'invertY' }));

    frag.appendChild(makeSectionHeader('Key bindings'));
    const note = el('p', 'opt-desc');
    note.style.cssText = 'margin:0 0 10px;max-width:none;';
    note.textContent = 'Click a binding, then press the key you want. Press Escape to cancel. Binding a key that is already in use clears the old binding.';
    frag.appendChild(note);

    for (const [action, label] of BINDABLE) {
      frag.appendChild(makeKeybind({ label, action, input: this.input }));
    }

    frag.appendChild(makeButton({
      label: 'Restore defaults',
      description: 'Reset every key binding without touching your other settings.',
      text: 'Reset bindings',
      onClick: () => Settings.resetKeybinds(),
    }));

    return frag;
  }

  // --------------------------------------------------------------------------
  // Audio
  // --------------------------------------------------------------------------

  _audioPanel() {
    const frag = document.createDocumentFragment();

    frag.appendChild(makeSectionHeader('Volume'));
    frag.appendChild(makeSlider({ label: 'Master', key: 'volMaster', format: PCT }));
    frag.appendChild(makeSlider({
      label: 'Music', key: 'volMusic', format: PCT,
      description: 'The adaptive score. Ambient, tension and chase layers.',
    }));
    frag.appendChild(makeSlider({
      label: 'Sound effects', key: 'volSfx', format: PCT,
      description: 'Footsteps, machinery, the building settling, the things in it.',
    }));
    frag.appendChild(makeSlider({
      label: 'Voice', key: 'volVoice', format: PCT,
      description: 'Radio messages, tapes and rehearsal reels.',
    }));

    frag.appendChild(makeSectionHeader('Test'));
    frag.appendChild(makeButton({
      label: 'Play a test tone',
      description: 'Confirms audio is routed and the buses are at the level you expect.',
      text: 'Play',
      onClick: () => {
        Audio.unlock().then(() => {
          Audio.tone({ freq: 523.25, type: 'triangle', duration: 0.4, gain: 0.12, bus: 'music', reverb: 0.4 });
          Audio.tone({ freq: 392.0, type: 'triangle', duration: 0.5, gain: 0.1, bus: 'music', reverb: 0.4, when: 0.18 });
          Audio.noise({ duration: 0.3, gain: 0.08, freq: 900, bus: 'sfx', reverb: 0.3, when: 0.45 });
        });
      },
    }));

    return frag;
  }

  // --------------------------------------------------------------------------
  // Accessibility
  // --------------------------------------------------------------------------

  _accessPanel() {
    const frag = document.createDocumentFragment();

    frag.appendChild(makeSectionHeader('Subtitles'));
    frag.appendChild(makeToggle({
      label: 'Subtitles',
      description: 'All spoken lines, tapes and radio messages are captioned.',
      key: 'subtitles',
    }));
    frag.appendChild(makeSlider({
      label: 'Subtitle size', key: 'subtitleSize',
      min: 0.7, max: 2.0, step: 0.1, format: MULT,
      onChange: (v) => document.documentElement.style.setProperty('--subtitle-scale', String(v)),
    }));

    frag.appendChild(makeSectionHeader('Comfort'));
    frag.appendChild(makeToggle({
      label: 'Reduce flashing lights',
      description: 'Removes hard strobing from failing bulbs, electrical faults and the mask overload. Lights still dim and hum.',
      key: 'reduceFlashing',
      onChange: (v) => document.body.classList.toggle('reduce-flashing', v),
    }));
    frag.appendChild(makeToggle({
      label: 'Play cutscenes',
      description:
        'Off skips every cinematic outright, including the drive out and the chapter openings. Anything a cutscene unlocks is unlocked anyway.',
      key: 'cinematics',
    }));
    frag.appendChild(makeToggle({
      label: 'Reduce screen shake',
      description: 'Cuts camera shake from impacts, collapses and scares to a quarter strength.',
      key: 'reduceScreenShake',
    }));
    frag.appendChild(makeToggle({
      label: 'Reduce head bob',
      description: 'Minimises the walking camera motion.',
      key: 'reduceHeadBob',
    }));

    frag.appendChild(makeSectionHeader('Input style'));
    frag.appendChild(makeToggle({
      label: 'Hold to sprint',
      description: 'Off makes sprint a toggle instead.',
      key: 'holdToSprint',
    }));
    frag.appendChild(makeToggle({
      label: 'Hold to crouch',
      description: 'Off makes crouch a toggle instead.',
      key: 'holdToCrouch',
    }));

    frag.appendChild(makeSectionHeader('Interface'));
    frag.appendChild(makeToggle({
      label: 'Show objective',
      description: 'Displays the current objective in the pause menu and briefly when it changes.',
      key: 'showObjective',
    }));
    frag.appendChild(makeToggle({
      label: 'Crosshair',
      description: 'A small dot at the centre of the screen that expands near anything you can interact with.',
      key: 'crosshair',
    }));

    return frag;
  }

  // --------------------------------------------------------------------------
  // Gamma calibration
  // --------------------------------------------------------------------------

  _buildGammaScreen() {
    const screen = el('div');
    screen.id = 'gamma-screen';

    const copy = el('div', 'gamma-copy');
    copy.innerHTML =
      'Raise the brightness until the marionette below is <strong>only just visible</strong>.<br>' +
      'The darkest square on the strip should remain indistinguishable from the background.';
    screen.appendChild(copy);

    // Reference figure at ~4% luminance: the standard "barely visible" target.
    const figure = el('div', 'gamma-figure');
    figure.innerHTML = `
      <svg viewBox="0 0 92 120" aria-label="Calibration figure">
        <g fill="#0b0b0b">
          <circle cx="46" cy="22" r="15"/>
          <rect x="35" y="37" width="22" height="34" rx="3"/>
          <rect x="22" y="40" width="10" height="30" rx="4" transform="rotate(12 27 55)"/>
          <rect x="60" y="40" width="10" height="30" rx="4" transform="rotate(-12 65 55)"/>
          <rect x="37" y="71" width="8" height="34" rx="3"/>
          <rect x="49" y="71" width="8" height="34" rx="3"/>
        </g>
        <g stroke="#0e0e0e" stroke-width="1" fill="none">
          <line x1="40" y1="0" x2="40" y2="10"/>
          <line x1="52" y1="0" x2="52" y2="10"/>
          <line x1="27" y1="0" x2="27" y2="42"/>
          <line x1="65" y1="0" x2="65" y2="42"/>
        </g>
      </svg>`;
    screen.appendChild(figure);

    const strip = el('div', 'gamma-strip');
    for (let i = 0; i < 10; i++) {
      const v = Math.round((i / 9) * 42);
      const cell = el('div');
      cell.style.background = `rgb(${v},${v},${v})`;
      cell.dataset.label = i === 0 ? 'BLACK' : i === 9 ? 'SHADOW' : '';
      strip.appendChild(cell);
    }
    screen.appendChild(strip);

    const sliderWrap = el('div');
    sliderWrap.style.cssText = 'width:min(760px,88vw);margin-top:16px;';
    sliderWrap.appendChild(makeSlider({
      label: 'Brightness',
      key: 'brightness', min: 0.4, max: 2.0, step: 0.02, format: MULT,
    }));
    screen.appendChild(sliderWrap);

    const done = el('button', 'opt-action', 'Done');
    done.type = 'button';
    done.style.marginTop = '8px';
    done.addEventListener('click', () => {
      Audio.uiClick();
      this.closeGamma();
    });
    screen.appendChild(done);

    this.gammaScreen = screen;
  }

  openGamma() {
    document.getElementById('ui-layer').appendChild(this.gammaScreen);
    this.gammaScreen.classList.add('open');
    this._gammaEsc = (e) => {
      if (e.code === 'Escape') this.closeGamma();
    };
    window.addEventListener('keydown', this._gammaEsc);
  }

  closeGamma() {
    this.gammaScreen.classList.remove('open');
    this.gammaScreen.remove();
    window.removeEventListener('keydown', this._gammaEsc);
  }

  // --------------------------------------------------------------------------

  show() {
    if (this.open) return;
    this.open = true;
    document.getElementById('ui-layer').appendChild(this.root);
    // Force a reflow so the CSS transition actually runs on first open.
    void this.root.offsetWidth;
    this.root.classList.add('visible');

    this._esc = (e) => {
      // If a rebind is armed, Escape should cancel that, not close the dialog.
      if (e.code === 'Escape' && !this.input.captureNextKey && !this.gammaScreen.classList.contains('open')) {
        Audio.uiBack();
        this.close();
      }
    };
    window.addEventListener('keydown', this._esc);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('visible');
    window.removeEventListener('keydown', this._esc);
    setTimeout(() => this.root.remove(), 280);
    this.onClose?.();
  }

  toggle() {
    this.open ? this.close() : this.show();
  }
}
