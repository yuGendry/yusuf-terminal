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
import { getNote, getTape, getStub } from '../chapters/StoryContent.js';
import { chapterArt } from './ChapterArt.js';
import { el } from './Widgets.js';
import { MenuNav } from './MenuNav.js';
import { Settings } from '../core/Settings.js';

const TITLE = 'STITCHWORK';

export class MainMenu {
  constructor({ settingsMenu, reader = null, onNewGame, onContinue, onChapterSelect }) {
    this.settingsMenu = settingsMenu;
    // The archive needs somewhere to show what it finds. It is the same reader
    // the game uses in a level, so a note read from the menu looks exactly
    // like the note read off the floor it was lying on.
    this.reader = reader;
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

    // ---- the run panel -----------------------------------------------------
    // The right two thirds of this screen were empty, and the single most
    // useful thing a front end can tell you is where you left off. Built here
    // and refilled on every show, because it changes every time you play.
    const run = el('aside');
    run.id = 'menu-run';
    this.runPanel = run;
    root.appendChild(run);

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
  /** The "where you left off" panel, rebuilt with the buttons. */
  _buildRunPanel() {
    const box = this.runPanel;
    box.innerHTML = '';

    const save = Save.peekSlot(0);
    const stubs = Save.stubCount;
    const notes = Save.profile.foundNotes.length + Save.profile.foundTapes.length;

    if (!save) {
      box.classList.add('empty');
      box.appendChild(el('div', 'run-k', 'No run in progress'));
      box.appendChild(el('p', 'run-blurb',
        'Hollowhart Puppet Works closed on the fourteenth of November 1986, '
        + 'between the half and beginners, and nobody has been inside since. '
        + 'Your sister went in on Tuesday.'));
      return;
    }
    box.classList.remove('empty');

    const ch = CHAPTERS.find((c) => c.id === save.chapter);
    box.appendChild(el('div', 'run-k', 'Where you left off'));
    box.appendChild(el('div', 'run-ch', `Chapter ${String(save.chapter).padStart(2, '0')} — ${ch?.title ?? '?'}`));
    if (ch?.subtitle) box.appendChild(el('div', 'run-sub', ch.subtitle));
    box.appendChild(el('div', 'run-when', formatWhen(save.savedAt)));

    const stats = el('div', 'run-stats');
    const stat = (v, l) => {
      const d = el('div', 'run-stat');
      d.appendChild(el('span', 'v', String(v)));
      d.appendChild(el('span', 'l', l));
      return d;
    };
    stats.append(
      stat(formatPlaytime(Save.profile.totalPlaytime), 'inside'),
      stat(`${stubs}/${TOTAL_STUBS}`, 'stubs'),
      stat(notes, 'recovered'),
    );
    box.appendChild(stats);
  }

  _buildButtons() {
    this.nav.innerHTML = '';
    this._buildRunPanel();
    // Rebuilt in place while the menu is up (Continue changes after a save),
    // so the nav layer has to be told its items moved.
    queueMicrotask(() => this._nav?.refresh());

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
      () => this._openArchive()
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

    // A dialog takes navigation from whatever is underneath it and hands it
    // back on close, with the selection underneath still where it was.
    const nav = MenuNav.push(overlay, { onCancel: () => close() });

    function close() {
      if (overlay._closed) return;
      overlay._closed = true;
      nav.pop();
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 280);
    }
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        Audio.uiBack();
        close();
      }
    });

    return { overlay, close, nav };
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
    this._dialog(
      'Chapter Select',
      'Every built chapter is playable from the start. Replaying one does not erase your run.',
      () => {
        const frag = document.createDocumentFragment();
        const grid = el('div', 'ch-grid');

        for (const ch of CHAPTERS) {
          // Built, not unlocked. Locking the chapter list behind progress
          // meant the one thing a new player could not do was look at what
          // was in the game.
          const built = isChapterBuilt(ch.id);
          const reached = Save.isChapterUnlocked(ch.id);

          const card = el('button', 'ch-card');
          card.type = 'button';
          card.disabled = !built;

          card.appendChild(chapterArt(ch.id, built));

          const body = el('div', 'ch-card-body');
          body.appendChild(el('div', 'ch-card-no', `Chapter ${String(ch.id).padStart(2, '0')}`));
          body.appendChild(el('div', 'ch-card-title', ch.title));
          body.appendChild(el('div', 'ch-card-sub', built ? ch.blurb : 'Not built yet.'));

          const meta = el('div', 'ch-card-meta');
          if (built) {
            meta.appendChild(el('span', null,
              `${ch.estimatedMinutes} min · ${ch.lensName ? ch.lensName : 'finale'}${reached ? '' : ' · new'}`));

            // The stubs, as stubs. Twelve of them change how the game ends,
            // so the count belongs where chapters are chosen and not buried
            // three screens deep in the archive.
            const stubs = el('div', 'ch-stubs');
            const got = Save.profile.foundStubs.filter((x) => x.startsWith(`ch${ch.id}-`)).length;
            for (let i = 0; i < ch.stubs; i++) {
              stubs.appendChild(el('span', `ch-stub${i < got ? ' got' : ''}`));
            }
            meta.appendChild(stubs);
          } else {
            meta.appendChild(el('span', null, 'Coming in a later build'));
          }
          body.appendChild(meta);
          card.appendChild(body);

          if (built) {
            card.addEventListener('click', () => {
              Audio.uiClick();
              this.onChapterSelect(ch.id);
            });
            card.addEventListener('mouseenter', () => Audio.uiHover());
          } else {
            card.addEventListener('click', () => Audio.uiDenied());
          }

          grid.appendChild(card);
        }

        frag.appendChild(grid);
        return frag;
      },
      { wide: true }
    );
  }

  _openArchive() {
    const { close } = this._dialog(
      'Archive',
      'Everything you have recovered from the building',
      () => {
        const frag = document.createDocumentFragment();

        const summary = el('div');
        summary.style.cssText = 'display:flex;gap:36px;margin:4px 0 22px;flex-wrap:wrap;';
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

        // The archive used to be four numbers and a sentence. Everything the
        // player had picked up and read once was, from then on, gone — which
        // for a game whose entire story is told on scraps of paper is the same
        // as not having a story. Every recovered item is re-readable here.
        const section = (heading, ids, get, onOpen) => {
          frag.appendChild(el('div', 'opt-section', heading));
          if (!ids.length) {
            frag.appendChild(el('p', 'arch-empty', 'Nothing yet.'));
            return;
          }
          const list = el('div', 'arch-list');
          for (const id of ids) {
            const item = get(id);
            if (!item) continue;
            const b = el('button', 'arch-item');
            b.type = 'button';
            b.appendChild(el('div', 'k', `Chapter ${item.chapter ?? '?'}`));
            b.appendChild(el('div', 't', item.title ?? id));
            b.addEventListener('click', () => {
              Audio.uiClick();
              close();
              onOpen(item);
            });
            b.addEventListener('mouseenter', () => Audio.uiHover());
            list.appendChild(b);
          }
          frag.appendChild(list);
        };

        const sortByChapter = (ids, get) =>
          [...ids].sort((a, b) => (get(a)?.chapter ?? 9) - (get(b)?.chapter ?? 9));

        section('Notes', sortByChapter(Save.profile.foundNotes, getNote), getNote,
          (n) => this.reader?.showNote(n));
        section('Tapes and reels', sortByChapter(Save.profile.foundTapes, getTape), getTape,
          (t) => this.reader?.showTape(t));

        frag.appendChild(el('div', 'opt-section', 'Ticket stubs'));
        const stubRow = el('div', 'arch-list');
        for (const id of sortByChapter(Save.profile.foundStubs, getStub)) {
          const stub = getStub(id);
          if (!stub) continue;
          const b = el('button', 'arch-item');
          b.type = 'button';
          b.appendChild(el('div', 'k', `Chapter ${stub.chapter} · no. ${stub.index}`));
          b.appendChild(el('div', 't', stub.back));
          b.addEventListener('click', () => {
            Audio.uiClick();
            close();
            this.reader?.showStub(stub, { found: Save.stubCount, total: TOTAL_STUBS });
          });
          b.addEventListener('mouseenter', () => Audio.uiHover());
          stubRow.appendChild(b);
        }
        if (!Save.stubCount) {
          frag.appendChild(el('p', 'arch-empty',
            'Twelve are hidden across the building. Find all of them to change how this ends.'));
        } else {
          frag.appendChild(stubRow);
        }

        if (Save.stubCount >= TOTAL_STUBS) {
          const all = el('p', 'arch-empty');
          all.style.fontStyle = 'italic';
          all.textContent = 'You have all twelve. She left one in every room she was ever alone in.';
          frag.appendChild(all);
        }

        return frag;
      },
      { wide: true }
    );
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
    this._nav = MenuNav.push(this.root);
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this._nav?.pop();
    this._nav = null;
    this.root.classList.add('leaving');
    this.root.classList.remove('visible');
    document.getElementById('static-overlay').classList.remove('on');
    setTimeout(() => {
      this.root.remove();
      this.root.classList.remove('leaving');
    }, 400);
  }
}
