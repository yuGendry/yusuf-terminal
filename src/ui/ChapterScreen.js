/**
 * ChapterScreen.js — the title page a chapter opens on.
 *
 * It does three jobs at once, which is why it exists rather than a plain
 * loading spinner:
 *
 *  1. It hides the load. Generating a chapter's textures and geometry blocks
 *     the main thread for a second or two; a black screen makes that feel
 *     broken, a title page makes it feel like a chapter break in a book.
 *  2. It sets the chapter up — name, epigraph, what score is about to play.
 *  3. It hands control back deliberately. The player presses a key to begin,
 *     so the game never starts moving before they are looking at it.
 */

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export class ChapterScreen {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'chapter-screen';
    this.visible = false;
    this._ready = false;
    this._resolve = null;
  }

  /**
   * Put the page up. Returns immediately; call `ready()` once the chapter has
   * finished loading and `waitForPlayer()` to block until they press a key.
   */
  show(ch, { scoreTitle = '', stubsFound = 0 } = {}) {
    const num = ROMAN[ch.id] ?? String(ch.id);

    this.el.innerHTML = `
      <div class="cs-frame">
        <div class="cs-rule top"></div>

        <div class="cs-head">
          <div class="cs-chapter">Chapter ${num}</div>
          <h1 class="cs-title">${ch.title}</h1>
          <div class="cs-sub">${ch.subtitle}</div>
        </div>

        <blockquote class="cs-epigraph">
          <p>${ch.epigraph ?? ch.blurb}</p>
          <cite>${ch.epigraphSource ?? 'HOLLOWHART PUPPET WORKS'}</cite>
        </blockquote>

        <div class="cs-facts">
          <div class="cs-fact">
            <span class="k">Score</span>
            <span class="v">${scoreTitle || '—'}</span>
          </div>
          <div class="cs-fact">
            <span class="k">Lens</span>
            <span class="v">${ch.lensName ?? 'None'}</span>
          </div>
          <div class="cs-fact">
            <span class="k">Ticket stubs</span>
            <span class="v">${stubsFound} / ${ch.stubs}</span>
          </div>
          <div class="cs-fact">
            <span class="k">Running time</span>
            <span class="v">≈ ${ch.estimatedMinutes} min</span>
          </div>
        </div>

        <div class="cs-rule bottom"></div>

        <div class="cs-foot">
          <div class="cs-loading"><i></i><span>Setting the stage</span></div>
          <div class="cs-begin">Press any key to begin</div>
        </div>
      </div>`;

    document.getElementById('game-layer').appendChild(this.el);
    void this.el.offsetWidth;
    this.el.classList.add('show');
    this.visible = true;
    this._ready = false;
    this._shownAt = performance.now();
    return this;
  }

  /** Update the loading bar. `p` is 0..1. */
  progress(p) {
    const bar = this.el.querySelector('.cs-loading > i');
    if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
  }

  /** The chapter is loaded; swap the bar for the prompt. */
  ready() {
    if (this._ready) return;
    this._ready = true;
    this.progress(1);
    this.el.classList.add('ready');
  }

  /**
   * Resolve on the first key or click after `ready()`.
   *
   * The minimum dwell exists because a chapter that loads in 200ms would
   * otherwise flash the title page and vanish, which reads as a glitch rather
   * than a chapter break.
   */
  waitForPlayer({ minimumDwell = 2200, auto = false } = {}) {
    this._shownAt ??= performance.now();
    const shownFor = () => performance.now() - this._shownAt;
    const open = () => this._ready && shownFor() >= minimumDwell;

    return new Promise((resolve) => {
      // A key pressed before the page is ready is remembered rather than
      // discarded, so an impatient player does not have to press twice.
      // `auto` counts as a press that has already happened, which is how an
      // unattended run (the headless harness) gets past this page.
      let queued = auto;

      const press = () => { queued = true; tick(); };
      const tick = () => {
        if (!open()) return;
        if (!this.el.classList.contains('armed')) this.el.classList.add('armed');
        if (!queued) return;
        cleanup();
        resolve();
      };
      const cleanup = () => {
        window.removeEventListener('keydown', press);
        window.removeEventListener('pointerdown', press);
        clearInterval(poll);
      };

      const poll = setInterval(tick, 100);
      window.addEventListener('keydown', press);
      window.addEventListener('pointerdown', press);
    });
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.remove('show');
    const el = this.el;
    setTimeout(() => el.remove(), 900);
    this._shownAt = null;
  }
}
