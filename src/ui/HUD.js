/**
 * HUD.js — the in-game overlay.
 *
 * Deliberately sparse. A crosshair that reacts, a stamina arc that only appears
 * when it matters, an interaction prompt, subtitles, and the pause menu. Nothing
 * permanent sits on screen, because a clean frame is scarier than a dashboard.
 */

import { Settings } from '../core/Settings.js';
import { MenuNav } from './MenuNav.js';
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

    // Hold-to-use ring, drawn around the key glyph.
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'hold-ring');
    ring.setAttribute('viewBox', '0 0 30 30');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '15');
    circle.setAttribute('cy', '15');
    circle.setAttribute('r', '13');
    ring.appendChild(circle);
    prompt.insertBefore(ring, prompt.firstChild);
    this.holdRing = circle;

    // ---- flashlight battery ------------------------------------------------
    const torch = el('div');
    torch.id = 'torch-meter';
    torch.innerHTML = '<i class="cell"><b></b></i><span class="spares"></span>';
    root.appendChild(torch);
    this.torch = torch;
    this.torchCell = torch.querySelector('b');
    this.torchSpares = torch.querySelector('.spares');

    // ---- hint card ---------------------------------------------------------
    const hint = el('div');
    hint.id = 'hint-card';
    root.appendChild(hint);
    this.hintCard = hint;

    // ---- checkpoint --------------------------------------------------------
    const cp = el('div');
    cp.id = 'checkpoint-note';
    cp.textContent = 'Progress saved';
    root.appendChild(cp);
    this.checkpointNote = cp;

    // ---- death -------------------------------------------------------------
    const death = el('div');
    death.id = 'death-screen';
    death.innerHTML = '<div class="death-line"></div>';
    root.appendChild(death);
    this.deathScreen = death;
    this.deathLine = death.querySelector('.death-line');

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

  setPrompt(label, key = 'E', { disabled = false, hold = false } = {}) {
    const sig = `${label}|${key}|${disabled}|${hold}`;
    if (sig === this._promptSig) return;
    this._promptSig = sig;
    this._promptTarget = label;

    if (label) {
      this.promptLabel.textContent = label;
      this.promptKey.textContent = key;
      this.prompt.classList.add('show');
      this.prompt.classList.toggle('disabled', disabled);
      this.prompt.classList.toggle('hold', hold);
    } else {
      this.prompt.classList.remove('show');
      this.setHoldProgress(0);
    }
  }

  /** Ring around the prompt key, for hold-to-use interactions. */
  setHoldProgress(t) {
    if (!this.holdRing) return;
    const c = 2 * Math.PI * 13;
    this.holdRing.style.strokeDasharray = String(c);
    this.holdRing.style.strokeDashoffset = String(c * (1 - clamp(t, 0, 1)));
    this.prompt.classList.toggle('holding', t > 0.01);
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
  // Flashlight, hints, checkpoints, death
  // --------------------------------------------------------------------------

  updateFlashlight(torch) {
    if (!torch?.owned) {
      this.torch.classList.remove('show');
      return;
    }
    this.torch.classList.add('show');
    this.torch.classList.toggle('off', !torch.on);
    this.torchCell.style.width = `${clamp(torch.battery, 0, 1) * 100}%`;
    this.torch.classList.toggle('low', torch.battery < 0.25);
    this.torchSpares.textContent = torch.spares > 0 ? `+${torch.spares}` : '';
  }

  /** Show a hint tier. Stays until dismissed, because it is being read. */
  showHint(tierName, text, { tier = 1, more = false, locked = false, nextIn = 0 } = {}) {
    this.hintCard.innerHTML = '';

    const head = el('div', 'hint-head');
    head.appendChild(el('span', 'hint-tier', tierName));
    head.appendChild(el('span', 'hint-count', `${tier} of 3`));
    this.hintCard.appendChild(head);

    const body = el('p', 'hint-body', text);
    this.hintCard.appendChild(body);

    const foot = el('div', 'hint-foot');
    if (more && locked) {
      const mins = Math.ceil(nextIn / 60);
      foot.textContent = `A clearer hint unlocks in about ${mins} minute${mins === 1 ? '' : 's'}.`;
    } else if (more) {
      foot.textContent = 'Press H again for more.';
    } else {
      foot.textContent = 'That is everything.';
    }
    this.hintCard.appendChild(foot);

    this.hintCard.classList.add('show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.hintCard.classList.remove('show'), 13000);
  }

  showCheckpoint() {
    this.checkpointNote.classList.add('show');
    clearTimeout(this._cpTimer);
    this._cpTimer = setTimeout(() => this.checkpointNote.classList.remove('show'), 2600);
  }

  showDeath(cause) {
    const lines = {
      tangle: 'He only ever goes where the rail goes.',
      gloam: 'It never needed to see you.',
      choir: 'You looked away.',
      default: 'The performance continues without you.',
    };
    this.deathLine.textContent = lines[cause] ?? lines.default;
    this.deathScreen.classList.add('show');
    this.setPrompt(null);
  }

  hideDeath() {
    this.deathScreen.classList.remove('show');
  }

  /** Brief on-screen note of the active lens, shown on a swap. */
  showLens(lensData) {
    if (!lensData) return;
    this.say(`${lensData.name} lens`, { duration: 1.8 });
  }

  // --------------------------------------------------------------------------
  // Pause menu
  // --------------------------------------------------------------------------

  showPause({ onResume, onSettings, onMenu, onHint = null }) {
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
    if (onHint) add('Hint', 'Three tiers, vague to solution', onHint);
    add('Settings', null, onSettings);
    add('Main Menu', 'Your progress is saved at checkpoints', onMenu);

    document.getElementById('ui-layer').appendChild(this.pauseOverlay);
    void this.pauseOverlay.offsetWidth;
    this.pauseOverlay.classList.add('visible');
    // A player who paused with a controller has to be able to leave with one.
    this._pauseNavHandle = MenuNav.push(this.pauseOverlay, { onCancel: onResume });
  }

  hidePause() {
    this._pauseNavHandle?.pop();
    this._pauseNavHandle = null;
    this.pauseOverlay.classList.remove('visible');
    setTimeout(() => this.pauseOverlay.remove(), 260);
  }
}
