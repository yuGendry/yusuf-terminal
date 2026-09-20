/**
 * Reader.js — the full-screen views for notes, ticket stubs and VHS tapes.
 *
 * Opening one pauses the game. Notes and stubs are paper; tapes play as an
 * animated slideshow with period-correct tracking noise, driven from the frame
 * timings in StoryContent.
 */

import { Audio } from '../audio/AudioEngine.js';
import { Settings } from '../core/Settings.js';
import { el } from './Widgets.js';
import { clamp } from '../util/MathUtil.js';

export class Reader {
  constructor() {
    this.open = false;
    this.onClose = null;
    this._raf = 0;
    this._build();
  }

  _build() {
    const overlay = el('div', 'sw-overlay');
    overlay.id = 'reader-overlay';

    const stage = el('div');
    stage.id = 'reader-stage';
    overlay.appendChild(stage);

    const hint = el('div', 'foot-hint');
    hint.id = 'reader-hint';
    hint.textContent = 'Escape to put it back';
    overlay.appendChild(hint);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.close();
    });

    this.root = overlay;
    this.stage = stage;
    this.hint = hint;
  }

  _show(buildContent, { hintText = 'Escape to put it back' } = {}) {
    this.stage.innerHTML = '';
    this.stage.appendChild(buildContent());
    this.hint.textContent = hintText;

    if (!this.open) {
      this.open = true;
      document.getElementById('ui-layer').appendChild(this.root);
      void this.root.offsetWidth;
      this.root.classList.add('visible');

      this._esc = (e) => {
        if (e.code === 'Escape' || e.code === 'KeyE') this.close();
      };
      window.addEventListener('keydown', this._esc);
    }
  }

  // --------------------------------------------------------------------------
  // Notes
  // --------------------------------------------------------------------------

  showNote(note) {
    Audio.paperPickup?.();
    this._show(() => {
      const page = el('div', 'reader-page');

      const title = el('div', 'reader-title', note.title);
      page.appendChild(title);
      page.appendChild(el('div', 'reader-rule'));

      const body = el('div', 'reader-body');
      // Preserve the author's line breaks; the shape of a note is part of it.
      for (const para of note.body.split('\n\n')) {
        const p = el('p');
        p.textContent = para;
        body.appendChild(p);
      }
      page.appendChild(body);
      return page;
    });
  }

  // --------------------------------------------------------------------------
  // Ticket stubs
  // --------------------------------------------------------------------------

  showStub(stub, { found, total }) {
    Audio.paperPickup?.();
    this._show(() => {
      const wrap = el('div', 'reader-stub-wrap');

      const ticket = el('div', 'reader-stub');
      ticket.innerHTML = `
        <div class="stub-head">
          <span class="stub-org">HOLLOWHART PUPPET WORKS</span>
          <span class="stub-no">No. ${String(stub.index).padStart(3, '0')}</span>
        </div>
        <div class="stub-main">THE GRAND PREMIERE</div>
        <div class="stub-sub">ADMIT ONE &nbsp;·&nbsp; ROW —— &nbsp;·&nbsp; SEAT ——</div>
        <div class="stub-perf">ONE NIGHT ONLY</div>`;
      wrap.appendChild(ticket);

      const back = el('div', 'reader-stub-back');
      back.appendChild(el('span', 'stub-hand', stub.back));
      back.appendChild(el('span', 'stub-sign', '— W.'));
      wrap.appendChild(back);

      const count = el('div', 'reader-stub-count', `${found} of ${total} recovered`);
      wrap.appendChild(count);

      return wrap;
    }, { hintText: 'Escape to pocket it' });
  }

  // --------------------------------------------------------------------------
  // VHS tapes
  // --------------------------------------------------------------------------

  showTape(tape, { onEnded = null } = {}) {
    this._show(() => {
      const tv = el('div', 'reader-tv');

      const screen = el('div', 'tv-screen');
      const content = el('div', 'tv-content');
      screen.appendChild(content);

      // Period furniture: rolling tracking bar, scanlines, and the timecode
      // burn-in that consumer decks stamped into the corner.
      screen.appendChild(el('div', 'tv-scanlines'));
      const tracking = el('div', 'tv-tracking');
      screen.appendChild(tracking);
      const stamp = el('div', 'tv-stamp');
      stamp.textContent = 'PLAY  ▶';
      screen.appendChild(stamp);
      const timecode = el('div', 'tv-timecode');
      screen.appendChild(timecode);

      tv.appendChild(screen);

      const caption = el('div', 'tv-caption');
      tv.appendChild(caption);

      this._startTape(tape, { content, caption, tracking, timecode, stamp, onEnded });
      return tv;
    }, { hintText: 'Escape to stop the tape' });
  }

  _startTape(tape, refs) {
    const start = performance.now();
    let lastFrame = -1;

    Audio.tapeStart?.();

    const tick = () => {
      if (!this.open) return;
      const t = (performance.now() - start) / 1000;

      // Which frame are we on?
      let idx = 0;
      for (let i = 0; i < tape.frames.length; i++) {
        if (t >= tape.frames[i].t) idx = i;
      }

      if (idx !== lastFrame) {
        lastFrame = idx;
        const f = tape.frames[idx];

        refs.content.className = `tv-content kind-${f.kind}`;
        refs.content.innerHTML = '';

        if (f.text) {
          const lines = f.text.split('\n');
          for (const line of lines) {
            refs.content.appendChild(el('div', 'tv-line', line));
          }
        }
        if (f.sub) refs.content.appendChild(el('div', 'tv-sub', f.sub));

        refs.caption.textContent = Settings.get('subtitles') ? (f.caption ?? '') : '';

        // A glitch frame gets a hard burst of noise and a camera-ish jolt.
        if (f.kind === 'glitch') {
          Audio.tapeGlitch?.();
          refs.tracking.classList.add('hard');
          setTimeout(() => refs.tracking.classList.remove('hard'), 900);
        } else {
          Audio.tapeCut?.();
        }
      }

      // Timecode burn-in, counting in frames like a real deck.
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = String(Math.floor(t % 60)).padStart(2, '0');
      const ff = String(Math.floor((t % 1) * 25)).padStart(2, '0');
      refs.timecode.textContent = `00:${mm}:${ss}:${ff}`;

      if (t >= tape.duration) {
        refs.stamp.textContent = 'STOP  ■';
        refs.content.className = 'tv-content kind-end';
        refs.content.innerHTML = '';
        refs.caption.textContent = '';
        Audio.tapeEnd?.();
        refs.onEnded?.();
        return;
      }

      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  // --------------------------------------------------------------------------

  close() {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._esc);
    this.root.classList.remove('visible');
    Audio.uiBack?.();
    setTimeout(() => {
      this.root.remove();
      this.stage.innerHTML = '';
    }, 280);
    this.onClose?.();
  }
}
