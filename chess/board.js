/* Interactive chessboard: click or drag to move, arrows, highlights, promotion picker, animation. */
(function () {
'use strict';
const FILES = 'abcdefgh';
function sqToIdx(s) { return (s.charCodeAt(0) - 97) + (s.charCodeAt(1) - 49) * 8; }
function idxToSq(i) { return FILES[i & 7] + ((i >> 3) + 1); }
function parseFen(fen) {
  const map = {}; const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { const c = ch === ch.toUpperCase() ? 'w' : 'b'; map[FILES[f] + (8 - i)] = c + ch.toLowerCase(); f++; } } });
  return map;
}

class Board {
  constructor(el, opts) {
    this.el = el; this.opts = opts || {};
    this.orient = 'w'; this.pieces = {}; this.sel = null; this.dests = null; this.movable = null;
    this.lastMove = null; this.check = null; this.marks = {}; this.arrows = []; this.userArrows = [];
    this.coords = this.opts.coords !== false;
    el.classList.add('cb');
    el.innerHTML = '<div class="cb-sq"></div><div class="cb-pc"></div><svg class="cb-svg" viewBox="0 0 8 8"></svg><div class="cb-promo hidden"></div>';
    this.sqLayer = el.querySelector('.cb-sq'); this.pcLayer = el.querySelector('.cb-pc'); this.svg = el.querySelector('.cb-svg'); this.promoEl = el.querySelector('.cb-promo');
    this.sqEls = [];
    for (let i = 0; i < 64; i++) { const d = document.createElement('div'); d.className = 'sq'; this.sqLayer.appendChild(d); this.sqEls.push(d); }
    Board.n = (Board.n || 0) + 1;
    this.svg.innerHTML = '<defs>' + ['g', 'r', 'b', 'y'].map(c => `<marker id="ah-${Board.n}-${c}" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" style="fill:var(--arrow-${c})"/></marker>`).join('') + '</defs><g class="arr"></g>';
    this.markerId = 'ah-' + Board.n;
    this.layoutSquares();
    this.bindEvents();
  }
  setOrientation(c) { this.orient = c; this.layoutSquares(); this.renderPieces(); this.renderHighlights(); this.renderArrows(); }
  flip() { this.setOrientation(this.orient === 'w' ? 'b' : 'w'); }
  xy(sq) { const i = sqToIdx(sq), f = i & 7, r = i >> 3; return this.orient === 'w' ? [f, 7 - r] : [7 - f, r]; }
  sqAt(x, y) { const f = this.orient === 'w' ? x : 7 - x, r = this.orient === 'w' ? 7 - y : y; if (f < 0 || f > 7 || r < 0 || r > 7) return null; return FILES[f] + (r + 1); }
  layoutSquares() {
    for (let i = 0; i < 64; i++) {
      const sq = idxToSq(i), [x, y] = this.xy(sq), d = this.sqEls[i];
      d.style.left = (x * 12.5) + '%'; d.style.top = (y * 12.5) + '%';
      d.className = 'sq ' + (((i & 7) + (i >> 3)) % 2 ? 'l' : 'd');
      d.dataset.sq = sq;
      let c = '';
      if (this.coords) {
        if (y === 7) c += '<span class="cf">' + sq[0] + '</span>';
        if (x === 0) c += '<span class="cr">' + sq[1] + '</span>';
      }
      d.innerHTML = c;
    }
  }
  setFen(fen, anim) { this.setPieces(parseFen(fen), anim); }
  setPieces(map, anim) {
    const old = this.pieces; this.pieces = map;
    this.renderPieces(anim && old ? anim : null);
  }
  renderPieces(anim) {
    const L = this.pcLayer; L.innerHTML = '';
    const img = window.PIECE_IMG || {};
    for (const sq in this.pieces) {
      const p = this.pieces[sq]; const [x, y] = this.xy(sq);
      const d = document.createElement('div'); d.className = 'pc'; d.dataset.sq = sq;
      d.style.left = (x * 12.5) + '%'; d.style.top = (y * 12.5) + '%';
      if (img[p]) d.style.backgroundImage = 'url(' + img[p] + ')'; else d.textContent = p;
      if (this.dragFrom === sq) d.classList.add('ghost');
      if (anim && anim.to === sq && anim.from) {
        const [fx, fy] = this.xy(anim.from);
        d.style.transform = `translate(${(fx - x) * 100}%, ${(fy - y) * 100}%)`;
        d.style.transition = 'none';
        requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transition = 'transform .18s ease-out'; d.style.transform = ''; }));
      }
      if (anim && anim.rookTo === sq && anim.rookFrom) {
        const [fx, fy] = this.xy(anim.rookFrom);
        d.style.transform = `translate(${(fx - x) * 100}%, ${(fy - y) * 100}%)`; d.style.transition = 'none';
        requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transition = 'transform .18s ease-out'; d.style.transform = ''; }));
      }
      L.appendChild(d);
    }
  }
  // highlights
  setLastMove(from, to) { this.lastMove = from ? [from, to] : null; this.renderHighlights(); }
  setCheck(sq) { this.check = sq; this.renderHighlights(); }
  setMarks(m) { this.marks = m || {}; this.renderHighlights(); }
  setArrows(a) { this.arrows = a || []; this.renderArrows(); }
  clearUser() { this.userArrows = []; this.userMarks = {}; this.renderArrows(); this.renderHighlights(); }
  renderHighlights() {
    for (let i = 0; i < 64; i++) {
      const d = this.sqEls[i], sq = d.dataset.sq;
      d.classList.remove('last', 'sel', 'dest', 'cap', 'chk', 'mk-g', 'mk-r', 'mk-y', 'mk-b', 'hov');
      if (this.lastMove && (this.lastMove[0] === sq || this.lastMove[1] === sq)) d.classList.add('last');
      if (this.sel === sq) d.classList.add('sel');
      if (this.check === sq) d.classList.add('chk');
      const mk = (this.userMarks && this.userMarks[sq]) || this.marks[sq]; if (mk) d.classList.add('mk-' + mk);
      if (this.sel && this.dests && this.dests[this.sel] && this.dests[this.sel].includes(sq)) d.classList.add(this.pieces[sq] ? 'cap' : 'dest');
    }
  }
  renderArrows() {
    const g = this.svg.querySelector('.arr'); let h = '';
    const all = this.arrows.concat(this.userArrows);
    for (const a of all) {
      const from = a.slice(0, 2), to = a.slice(2, 4), color = a.length > 4 ? a.slice(4) : 'g';
      const [x1, y1] = this.xy(from), [x2, y2] = this.xy(to);
      const cx1 = x1 + .5, cy1 = y1 + .5, cx2 = x2 + .5, cy2 = y2 + .5;
      const dx = cx2 - cx1, dy = cy2 - cy1, len = Math.hypot(dx, dy); if (!len) continue;
      const ex = cx2 - dx / len * 0.32, ey = cy2 - dy / len * 0.32;
      const c = 'grby'.includes(color) ? color : 'g';
      h += `<line x1="${cx1}" y1="${cy1}" x2="${ex}" y2="${ey}" style="stroke:var(--arrow-${c})" stroke-width="0.16" stroke-linecap="round" marker-end="url(#${this.markerId}-${c})" opacity="0.85"/>`;
    }
    g.innerHTML = h;
  }
  // interaction
  setMovable(color, dests) { this.movable = color; this.dests = dests || {}; if (this.sel && (!this.dests[this.sel])) this.sel = null; this.renderHighlights(); }
  disable() { this.movable = null; this.sel = null; this.renderHighlights(); }
  eventSq(e) {
    const r = this.el.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * 8), y = Math.floor((e.clientY - r.top) / r.height * 8);
    return this.sqAt(x, y);
  }
  canMoveFrom(sq) { const p = this.pieces[sq]; return this.movable && p && p[0] === this.movable && this.dests && this.dests[sq] && this.dests[sq].length; }
  bindEvents() {
    const el = this.el;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      if (!this.promoEl.classList.contains('hidden')) return;
      const sq = this.eventSq(e); if (!sq) return;
      if (e.button === 2) { this.rightFrom = sq; return; }
      if (e.button !== 0) return;
      if (this.userArrows.length || (this.userMarks && Object.keys(this.userMarks).length)) this.clearUser();
      if (this.sel && this.sel !== sq && this.dests[this.sel] && this.dests[this.sel].includes(sq)) { const f = this.sel; this.sel = null; this.tryMove(f, sq); return; }
      if (this.canMoveFrom(sq)) {
        e.preventDefault();
        this.sel = sq; this.renderHighlights();
        this.dragStart = { sq, x: e.clientX, y: e.clientY, moved: false };
        el.setPointerCapture && el.setPointerCapture(e.pointerId);
      } else { this.sel = null; this.renderHighlights(); }
    });
    el.addEventListener('pointermove', e => {
      const d = this.dragStart; if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      if (!d.moved) {
        d.moved = true; this.dragFrom = d.sq;
        const p = this.pieces[d.sq]; const fl = document.createElement('div'); fl.className = 'pc drag';
        fl.style.backgroundImage = 'url(' + (window.PIECE_IMG || {})[p] + ')';
        const w = this.el.getBoundingClientRect().width / 8; fl.style.width = fl.style.height = w + 'px';
        document.body.appendChild(fl); this.floatEl = fl;
        const src = this.pcLayer.querySelector(`[data-sq="${d.sq}"]`); if (src) src.classList.add('ghost');
      }
      const w = this.el.getBoundingClientRect().width / 8;
      this.floatEl.style.left = (e.clientX - w / 2) + 'px'; this.floatEl.style.top = (e.clientY - w / 2) + 'px';
      const sq = this.eventSq(e);
      this.sqEls.forEach(s => s.classList.toggle('hov', s.dataset.sq === sq && this.dests[d.sq] && this.dests[d.sq].includes(sq)));
    });
    const end = e => {
      if (e.button === 2 && this.rightFrom) {
        const to = this.eventSq(e), from = this.rightFrom; this.rightFrom = null;
        if (!to) return;
        const col = e.shiftKey ? 'r' : e.altKey ? 'b' : e.ctrlKey ? 'y' : 'g';
        if (to === from) { this.userMarks = this.userMarks || {}; if (this.userMarks[to]) delete this.userMarks[to]; else this.userMarks[to] = col === 'g' ? 'r' : col; this.renderHighlights(); }
        else { const a = from + to + col; const i = this.userArrows.findIndex(x => x.slice(0, 4) === from + to); if (i >= 0) this.userArrows.splice(i, 1); else this.userArrows.push(a); this.renderArrows(); }
        return;
      }
      const d = this.dragStart; this.dragStart = null; if (!d) return;
      if (this.floatEl) { this.floatEl.remove(); this.floatEl = null; }
      const wasDrag = d.moved; this.dragFrom = null;
      this.sqEls.forEach(s => s.classList.remove('hov'));
      const src = this.pcLayer.querySelector('.ghost'); if (src) src.classList.remove('ghost');
      if (!wasDrag) return; // click-select handled on pointerdown
      const sq = this.eventSq(e);
      if (sq && sq !== d.sq && this.dests[d.sq] && this.dests[d.sq].includes(sq)) { this.sel = null; this.tryMove(d.sq, sq, true); }
      else { this.renderHighlights(); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { this.dragStart = null; if (this.floatEl) { this.floatEl.remove(); this.floatEl = null; } this.dragFrom = null; this.renderPieces(); });
  }
  tryMove(from, to, dragged) {
    const p = this.pieces[from];
    const isPromo = p && p[1] === 'p' && (to[1] === '8' || to[1] === '1');
    const finish = promo => {
      if (this.opts.onMove) this.opts.onMove(from, to, promo, dragged);
    };
    if (isPromo && !this.opts.autoQueen) this.askPromo(to, p[0], finish);
    else finish(isPromo ? 'q' : '');
  }
  askPromo(to, color, cb) {
    const el = this.promoEl; el.innerHTML = ''; el.classList.remove('hidden');
    const [x] = this.xy(to);
    const box = document.createElement('div'); box.className = 'promo-box'; box.style.left = (x * 12.5) + '%';
    const top = (this.orient === 'w') === (color === 'w');
    box.style.top = top ? '0' : '50%';
    for (const t of ['q', 'n', 'r', 'b']) {
      const b = document.createElement('div'); b.className = 'pc promo-pc'; b.style.backgroundImage = 'url(' + (window.PIECE_IMG || {})[color + t] + ')';
      b.onclick = ev => { ev.stopPropagation(); el.classList.add('hidden'); cb(t); };
      box.appendChild(b);
    }
    el.appendChild(box);
    el.onclick = () => { el.classList.add('hidden'); this.renderPieces(); };
  }
}
window.Board = Board; window.BoardUtil = { parseFen, sqToIdx, idxToSq };
})();
