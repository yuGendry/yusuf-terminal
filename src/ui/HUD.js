/**
 * HUD.js — the in-game overlay.
 *
 * Deliberately sparse. A crosshair that reacts, a stamina arc that only appears
 * when it matters, an interaction prompt, subtitles, and the pause menu. Nothing
 * permanent sits on screen, because a clean frame is scarier than a dashboard.
 */

import { Settings } from '../core/Settings.js';
import { Audio } from '../audio/AudioEngine.js';
import { el } from './Widgets.js';
import { clamp, damp } from '../util/MathUtil.js';

export class HUD {
  constructor() {
    this.layer = document.getElementById('game-layer');
    this.visible = false;
    this._staminaAlpha = 0;
    this._promptTarget = null;
    this._build();
  }

  _build() {
    const root = el('div');
    root.id = 'hud';

    // ---- crosshair ---------------------------------------------------------
    const cross = el('div');
    cross.id = 'crosshair';
    cross.innerHTML = '<i class="dot"></i><i class="ring"></i>';
    root.appendChild(cross);
    this.crosshair = cross;

    // ---- stamina -----------------------------------------------------------
    const stamina = el('div');
    stamina.id = 'stamina';
    stamina.innerHTML = '<div class="bar"><i></i></div>';
    root.appendChild(stamina);
    this.stamina = stamina;
    this.staminaFill = stamina.querySelector('i');

    // ---- interaction prompt ------------------------------------------------
    const prompt = el('div');
    prompt.id = 'interact-prompt';
    prompt.innerHTML = '<span class="key">E</span><span class="label"></span>';
    root.appendChild(prompt);
    this.prompt = prompt;
    this.promptLabel = prompt.querySelector('.label');
    this.promptKey = prompt.querySelector('.key');

    // ---- objective toast ---------------------------------------------------
    const objective = el('div');
    objective.id = 'objective-toast';
    root.appendChild(objective);
    this.objectiveToast = objective;

    // ---- subtitles ---------------------------------------------------------
    const subs = el('div');
    subs.id = 'subtitles';
    root.appendChild(subs);
    this.subtitles = subs;

    // ---- vitals (breathing vignette hook) ---------------------------------
    const vitals = el('div');
    vitals.id = 'vitals';
    root.appendChild(vitals);
    this.vitals = vitals;

    this.root = root;
    this._buildPause();
  }

  _buildPause() {
    const overlay = el('div', 'sw-overlay');
    overlay.id = 'pause-overlay';

    const dialog = el('div', 'sw-dialog sw-panel');
    dialog.style.width = 'min(520px, 92vw)';

    const head = el('div', 'sw-dialog-head');
    const headText = el('div');
    headText.appendChild(el('h2', 'sw-h1', 'Paused'));
    const objLine = el('p', 'sw-sub', '');
    headText.appendChild(objLine);
    head.appendChild(headText);
    dialog.appendChild(head);
    this.pauseObjective = objLine;

    const body = el('div', 'sw-dialog-body');
    const panel = el('div', 'sw-tab-panel');
    const nav = el('nav');
    nav.style.cssText = 'display:flex;flex-direction:column;gap:1px;';
    panel.appendChild(nav);
    body.appendChild(panel);
    dialog.appendChild(body);
    this.pauseNav = nav;

    const foot = el('div', 'sw-dialog-foot');
    foot.appendChild(el('span', 'foot-hint', 'Escape to resume'));
    dialog.appendChild(foot);

    overlay.appendChild(dialog);
    this.pauseOverlay = overlay;
  }

  // --------------------------------------------------------------------------

  show() {
    if (this.visible) return;
    this.visible = true;
    this.layer.appendChild(this.root);
    this.layer.setAttribute('aria-hidden', 'false');
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.root.remove();
    this.layer.setAttribute('aria-hidden', 'true');
  }

  update(dt, player, engine) {
    if (!this.visible) return;

    // Crosshair only when enabled, and it opens up near something usable.
    this.crosshair.style.display = Settings.get('crosshair') ? '' : 'none';
    this.crosshair.classList.toggle('active', !!this._promptTarget);

    // The stamina arc fades in when it's being spent and out when it's full,
    // so the screen is clean during quiet exploration.
    const wantsStamina = player.stamina < 0.995 || player.exhausted ? 1 : 0;
    this._staminaAlpha = damp(this._staminaAlpha, wantsStamina, 4, dt);
    this.stamina.style.opacity = this._staminaAlpha.toFixed(3);
    this.staminaFill.style.width = `${clamp(player.stamina, 0, 1) * 100}%`;
    this.stamina.classList.toggle('exhausted', player.exhausted);

    // Breath vignette: the screen tightens as the player runs out of air.
    this.vitals.style.opacity = (player.breath ?? 0).toFixed(3);
  }

  // --------------------------------------------------------------------------
  // Prompts, objectives, subtitles
  // --------------------------------------------------------------------------

  setPrompt(label, key = 'E') {
    if (label === this._promptTarget) return;
    this._promptTarget = label;
    if (label) {
      this.promptLabel.textContent = label;
      this.promptKey.textContent = key;
      this.prompt.classList.add('show');
    } else {
      this.prompt.classList.remove('show');
    }
  }

  setObjective(text) {
    this.objective = text;
    this.pauseObjective.textContent = text ?? '';
    if (!Settings.get('showObjective') || !text) return;

    this.objectiveToast.textContent = text;
    this.objectiveToast.classList.add('show');
    clearTimeout(this._objTimer);
    this._objTimer = setTimeout(() => {
      this.objectiveToast.classList.remove('show');
    }, 5200);
  }

  /** Show a subtitle line for `duration` seconds. */
  say(text, { speaker = null, duration = 4 } = {}) {
    if (!Settings.get('subtitles')) return;
    const line = el('div', 'sub-line');
    if (speaker) line.appendChild(el('span', 'sub-speaker', speaker));
    line.appendChild(el('span', 'sub-text', text));
    this.subtitles.appendChild(line);
    void line.offsetWidth;
    line.classList.add('show');

    setTimeout(() => {
      line.classList.remove('show');
      setTimeout(() => line.remove(), 500);
    }, duration * 1000);

    // Never stack more than three lines; older ones drop off the top.
    while (this.subtitles.children.length > 3) {
      this.subtitles.firstChild.remove();
    }
  }

  clearSubtitles() {
    this.subtitles.innerHTML = '';
  }

  // --------------------------------------------------------------------------
  // Pause menu
  // --------------------------------------------------------------------------

  showPause({ onResume, onSettings, onMenu }) {
    this.pauseNav.innerHTML = '';

    const add = (label, hint, handler) => {
      const btn = el('button', 'sw-btn');
      btn.type = 'button';
      btn.appendChild(document.createTextNode(label));
      if (hint) btn.appendChild(el('span', 'hint', hint));
      btn.addEventListener('click', () => {
        Audio.uiClick();
        handler();
      });
      btn.addEventListener('mouseenter', () => Audio.uiHover());
      this.pauseNav.appendChild(btn);
    };

    add('Resume', null, onResume);
    add('Settings', null, onSettings);
    add('Main Menu', 'Your progress is saved at checkpoints', onMenu);

    document.getElementById('ui-layer').appendChild(this.pauseOverlay);
    void this.pauseOverlay.offsetWidth;
    this.pauseOverlay.classList.add('visible');
  }

  hidePause() {
    this.pauseOverlay.classList.remove('visible');
    setTimeout(() => this.pauseOverlay.remove(), 260);
  }
}
