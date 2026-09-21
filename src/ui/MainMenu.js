/**
 * MainMenu.js — the front of the game.
 *
 * Sits over the live MenuScene. Owns the title treatment, the button column,
 * and the sub-dialogs it can open (chapter select, archive, credits). Settings
 * is a separate module because the pause menu opens the same instance.
 */

import { Audio } from '../audio/AudioEngine.js';
import { Save, formatWhen, formatPlaytime } from '../save/SaveSystem.js';
import { CHAPTERS, TOTAL_STUBS, isChapterBuilt, BUILT_CHAPTERS } from '../chapters/ChapterData.js';
import { el } from './Widgets.js';
import { Settings } from '../core/Settings.js';

const TITLE = 'STITCHWORK';

export class MainMenu {
  constructor({ settingsMenu, onNewGame, onContinue, onChapterSelect }) {
    this.settingsMenu = settingsMenu;
    this.onNewGame = onNewGame;
    this.onContinue = onContinue;
    this.onChapterSelect = onChapterSelect;

    this.visible = false;
    this.menuScene = null;
    this._build();
  }

  _build() {
    const root = el('div');
    root.id = 'main-menu';

    // ---- title -------------------------------------------------------------
    const titleBlock = el('div', 'title-block');

    const h1 = el('h1');
    h1.id = 'game-title';
    // One span per letter so each can drift on its own timer.
    [...TITLE].forEach((ch, i) => {
      const span = el('span', 'ch', ch);
      span.style.setProperty('--i', String(i));
      h1.appendChild(span);
    });
    titleBlock.appendChild(h1);

    // The stitch that sews itself closed under the title.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'stitch-line');
    svg.setAttribute('viewBox', '0 0 560 14');
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // A gentle running stitch, rising and falling like hand sewing.
    path.setAttribute('d', 'M0 9 C 40 3, 80 13, 120 7 S 200 2, 240 9 S 320 13, 360 6 S 440 3, 480 10 S 540 6, 560 8');
    svg.appendChild(path);
    titleBlock.appendChild(svg);

    const sub = el('p', null, 'Hollowhart Puppet Works · est. 1931 · closed 1986');
    sub.id = 'game-subtitle';
    titleBlock.appendChild(sub);

    root.appendChild(titleBlock);

    // ---- buttons -----------------------------------------------------------
    const nav = el('nav');
    nav.id = 'menu-buttons';
    this.nav = nav;
    root.appendChild(nav);

    // ---- footer ------------------------------------------------------------
    const footer = el('div');
    footer.id = 'menu-footer';
    footer.appendChild(el('span', null, 'An original work of fiction'));
    const version = el('span', null, 'build 0.1.0');
    version.id = 'menu-version';
    footer.appendChild(version);
    root.appendChild(footer);

    // ---- easter egg --------------------------------------------------------
    const whisper = el('div');
    whisper.id = 'wren-whisper';
    whisper.innerHTML =
      '&ldquo;You took your time.<br>I kept your seat warm.&rdquo;' +
      '<span class="sig">— W.</span>';
    this.whisper = whisper;
    root.appendChild(whisper);

    this.root = root;
    this._buildButtons();
  }

  /** Rebuilt whenever the menu is shown, so Continue reflects the latest save. */
  _buildButtons() {
    this.nav.innerHTML = '';

    const save = Save.peekSlot(0);
    const highest = Save.highestChapter;

    const add = (label, hint, handler, { disabled = false } = {}) => {
      const btn = el('button', 'sw-btn');
      btn.type = 'button';
      btn.appendChild(document.createTextNode(label));
      if (hint) btn.appendChild(el('span', 'hint', hint));
      btn.disabled = disabled;
      if (!disabled) {
        btn.addEventListener('click', () => {
          Audio.uiClick();
          handler();
        });
        btn.addEventListener('mouseenter', () => Audio.uiHover());
      } else {
        btn.addEventListener('click', () => Audio.uiDenied());
      }
      this.nav.appendChild(btn);
      return btn;
    };

    if (save) {
      const ch = CHAPTERS.find((c) => c.id === save.chapter);
      add(
        'Continue',
        `Ch. ${save.chapter} — ${ch?.title ?? '?'} · ${formatWhen(save.savedAt)}`,
        () => this.onContinue()
      );
    }

    add(
      'New Game',
      save ? 'This will overwrite your current run' : null,
      () => {
        if (!save) return this.onNewGame();
        this._confirm(
          'Start a new game?',
          'Your current run will be overwritten. Anything you have already found stays in the Archive.',
          () => this.onNewGame()
        );
      }
    );

    // Never disabled. It used to be greyed out until you had finished the
    // first chapter, which meant the one thing you could not do from a fresh
    // install was look at what was in the game.
    add(
      'Chapter Select',
      `${BUILT_CHAPTERS.length} of ${CHAPTERS.length} built — all playable`,
      () => this._openChapterSelect()
    );

    add('Settings', null, () => this.settingsMenu.show());

    const found = Save.profile.foundNotes.length + Save.profile.foundTapes.length;
    add(
      'Archive',
      found > 0 ? `${found} recovered · ${Save.stubCount}/${TOTAL_STUBS} stubs` : 'Nothing recovered yet',
      () => this._openArchive(),
      { disabled: found === 0 && Save.stubCount === 0 }
    );

    add('Credits', null, () => this._openCredits());

    // "Quit" can't close a browser tab it didn't open, so it does the honest
    // thing instead: returns you to the boot screen and stops the engine.
    add('Quit', 'Return to the projection booth', () => {
      this._confirm('Leave the theatre?', 'The game will stop and your progress is already saved.', () => {
        window.dispatchEvent(new CustomEvent('stitchwork:quit'));
      });
    });
  }

  // --------------------------------------------------------------------------
  // Sub-dialogs
  // --------------------------------------------------------------------------

  _dialog(title, subtitle, contentBuilder, { wide = false } = {}) {
    const overlay = el('div', 'sw-overlay');
    const dialog = el('div', 'sw-dialog sw-panel');
    if (wide) dialog.style.width = 'min(1000px, 94vw)';

    const head = el('div', 'sw-dialog-head');
    const headText = el('div');
    headText.appendChild(el('h2', 'sw-h1', title));
    if (subtitle) headText.appendChild(el('p', 'sw-sub', subtitle));
    head.appendChild(headText);
    dialog.appendChild(head);

    const body = el('div', 'sw-dialog-body');
    const panel = el('div', 'sw-tab-panel sw-scroll');
    panel.appendChild(contentBuilder());
    body.appendChild(panel);
    dialog.appendChild(body);

    const foot = el('div', 'sw-dialog-foot');
    foot.appendChild(el('span', 'foot-hint', 'Escape to go back'));
    const back = el('button', 'opt-action', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => {
      Audio.uiBack();
      close();
    });
    back.addEventListener('mouseenter', () => Audio.uiHover());
    foot.appendChild(back);
    dialog.appendChild(foot);

    overlay.appendChild(dialog);
    document.getElementById('ui-layer').appendChild(overlay);
    void overlay.offsetWidth;
    overlay.classList.add('visible');

    const onKey = (e) => {
      if (e.code === 'Escape') {
        Audio.uiBack();
        close();
      }
    };
    function close() {
      overlay.classList.remove('visible');
      window.removeEventListener('keydown', onKey);
      setTimeout(() => overlay.remove(), 280);
    }
    window.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        Audio.uiBack();
        close();
      }
    });

    return { overlay, close };
  }

  _confirm(title, message, onYes) {
    const { close } = this._dialog(title, null, () => {
      const frag = document.createDocumentFragment();
      const p = el('p');
      p.style.cssText = 'font-size:18px;line-height:1.6;color:var(--bone-dim);margin:6px 0 26px;max-width:56ch;';
      p.textContent = message;
      frag.appendChild(p);

      const btns = el('div');
      btns.style.cssText = 'display:flex;gap:12px;';

      const yes = el('button', 'opt-action danger', 'Yes, continue');
      yes.type = 'button';
      yes.addEventListener('click', () => {
        Audio.uiClick();
        close();
        onYes();
      });
      const no = el('button', 'opt-action', 'Cancel');
      no.type = 'button';
      no.addEventListener('click', () => {
        Audio.uiBack();
        close();
      });
      btns.append(yes, no);
      frag.appendChild(btns);
      return frag;
    });
  }

  _openChapterSelect() {
    this._dialog('Chapter Select', 'Replaying a chapter does not erase your current run', () => {
      const frag = document.createDocumentFragment();

      for (const ch of CHAPTERS) {
        // Built, not unlocked. See BUILT_CHAPTERS.
        const unlocked = isChapterBuilt(ch.id);
        const reached = Save.isChapterUnlocked(ch.id);
        const card = el('div');
        card.style.cssText = `
          display:flex; gap:20px; align-items:flex-start;
          padding:18px 0; border-bottom:1px solid rgba(232,224,210,0.06);
          opacity:${unlocked ? 1 : 0.32};`;

        const num = el('div', null, String(ch.id).padStart(2, '0'));
        num.style.cssText = `
          font-family:var(--title-font); font-size:40px; line-height:1;
          color:${unlocked ? 'var(--blood-lit)' : 'rgba(232,224,210,0.2)'};
          min-width:60px;`;
        card.appendChild(num);

        const text = el('div');
        text.style.cssText = 'flex:1;min-width:0;';
        const t = el('div', null, ch.title);
        t.style.cssText = 'font-size:23px;color:var(--bone);letter-spacing:0.04em;';
        text.appendChild(t);

        const st = el('div', null, unlocked ? ch.subtitle : 'Not built yet');
        st.style.cssText = 'font-family:var(--mono-font);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(232,224,210,0.32);margin-top:4px;';
        text.appendChild(st);

        if (unlocked) {
          const blurb = el('p', null, ch.blurb);
          blurb.style.cssText = 'font-size:16px;line-height:1.55;color:rgba(232,224,210,0.5);margin:10px 0 0;max-width:62ch;font-style:italic;';
          text.appendChild(blurb);

          const meta = el('div');
          meta.style.cssText = 'font-family:var(--mono-font);font-size:10px;letter-spacing:0.14em;color:rgba(232,224,210,0.28);margin-top:8px;';
          const foundStubs = Save.profile.foundStubs.filter((s) => s.startsWith(`ch${ch.id}`)).length;
          meta.textContent =
            `~${ch.estimatedMinutes} MIN · STUBS ${foundStubs}/${ch.stubs}` +
            (ch.lensName ? ` · LENS: ${ch.lensName.toUpperCase()}` : ' · FINALE') +
            (reached ? '' : ' · NOT YET REACHED');
          text.appendChild(meta);
        }
        card.appendChild(text);

        if (unlocked) {
          const play = el('button', 'opt-action', 'Play');
          play.type = 'button';
          play.style.flexShrink = '0';
          play.addEventListener('click', () => {
            Audio.uiClick();
            this.onChapterSelect(ch.id);
          });
          play.addEventListener('mouseenter', () => Audio.uiHover());
          card.appendChild(play);
        }

        frag.appendChild(card);
      }
      return frag;
    }, { wide: true });
  }

  _openArchive() {
    this._dialog('Archive', 'Everything you have recovered from the building', () => {
      const frag = document.createDocumentFragment();

      const summary = el('div');
      summary.style.cssText = 'display:flex;gap:36px;margin:4px 0 22px;';
      const stat = (n, label) => {
        const d = el('div');
        const v = el('div', null, String(n));
        v.style.cssText = 'font-family:var(--title-font);font-size:34px;color:var(--bone);line-height:1;';
        const l = el('div', null, label);
        l.style.cssText = 'font-family:var(--mono-font);font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(232,224,210,0.3);margin-top:6px;';
        d.append(v, l);
        return d;
      };
      summary.append(
        stat(Save.profile.foundNotes.length, 'Notes'),
        stat(Save.profile.foundTapes.length, 'Tapes'),
        stat(`${Save.stubCount}/${TOTAL_STUBS}`, 'Ticket stubs'),
        stat(formatPlaytime(Save.profile.totalPlaytime), 'Time inside'),
      );
      frag.appendChild(summary);

      const note = el('p');
      note.style.cssText = 'font-size:17px;line-height:1.65;color:rgba(232,224,210,0.45);max-width:62ch;font-style:italic;';
      note.textContent = Save.stubCount >= TOTAL_STUBS
        ? 'You have all twelve. She left one in every room she was ever alone in.'
        : 'Collected notes, tapes and rehearsal reels are readable here once found. Twelve ticket stubs are hidden across the building — find all of them to change how this ends.';
      frag.appendChild(note);

      return frag;
    });
  }

  _openCredits() {
    this._dialog('Credits', 'Stitchwork', () => {
      const frag = document.createDocumentFragment();
      const sections = [
        ['Design, code, art and music', 'Built as an original work. No characters, designs, names or assets from any existing game were used.'],
        ['Rendering', 'three.js (MIT). All geometry is constructed from primitives at runtime; all textures are generated procedurally on a canvas.'],
        ['Physics', 'Rapier (Apache-2.0), compiled to WebAssembly.'],
        ['Audio', 'Every sound in the game — the score, the Hollowhart Lullaby, footsteps, machinery and voices — is synthesised in the browser with the Web Audio API. No audio files are shipped.'],
        ['Typography', 'Special Elite, Cormorant Garamond and IBM Plex Mono, served by Google Fonts under the SIL Open Font License.'],
        ['With thanks', 'To everyone who has ever been frightened of a doll and could not explain why.'],
      ];
      for (const [h, b] of sections) {
        const head = el('div', 'opt-section', h);
        const body = el('p');
        body.style.cssText = 'font-size:17px;line-height:1.65;color:rgba(232,224,210,0.5);margin:10px 0 4px;max-width:66ch;';
        body.textContent = b;
        frag.append(head, body);
      }
      return frag;
    });
  }

  // --------------------------------------------------------------------------

  attachScene(menuScene) {
    this.menuScene = menuScene;
    menuScene.onEasterEgg = () => this._playEasterEgg();
  }

  _playEasterEgg() {
    this.whisper.classList.add('show');
    Audio.staticBurst(0.5, 0.05);
    // A single detuned music-box note, far off.
    Audio.tone({
      freq: 415.3, type: 'triangle', duration: 1.6,
      attack: 0.01, decay: 0.7, sustain: 0.18, release: 2.4,
      gain: 0.05, bus: 'music', reverb: 0.8, detune: -18,
    });
    setTimeout(() => this.whisper.classList.remove('show'), 11000);
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this._buildButtons();
    document.getElementById('ui-layer').appendChild(this.root);
    document.getElementById('static-overlay').classList.add('on');
    void this.root.offsetWidth;
    this.root.classList.add('visible');
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.root.classList.add('leaving');
    this.root.classList.remove('visible');
    document.getElementById('static-overlay').classList.remove('on');
    setTimeout(() => {
      this.root.remove();
      this.root.classList.remove('leaving');
    }, 400);
  }
}
