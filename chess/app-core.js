/* ChessMind core: storage, engines, game model, coach, ratings, PGN, openings index. */
(function () {
'use strict';
const C = window.ChessCore;
const CM = window.CM = {};

// ---------- DOM helpers ----------
CM.$ = (s, el) => (el || document).querySelector(s);
CM.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
CM.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
CM.h = function (html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
CM.sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- storage ----------
const KEY = 'chessmind.v1';
function defaults() {
  return { rating: null, ratingDev: 350, ratingHist: [], ratedGames: 0, puzzleRating: null, puzzleGames: 0, puzzleHist: [], lessons: {}, games: [], mistakes: [],
    themeStats: {}, puzzlesDone: {}, rushBest: 0, placement: null, settings: { sound: true, board: 'green', coords: true, autoQueen: false, showCoach: true } };
}
CM.store = {
  d: null,
  load() { let d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; } this.d = Object.assign(defaults(), d || {}); this.d.settings = Object.assign(defaults().settings, this.d.settings || {}); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { } },
  reset() { this.d = defaults(); this.save(); }
};
CM.store.load();

// ---------- sound ----------
let actx = null;
CM.sound = function (kind) {
  if (!CM.store.d.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    const f = { move: 520, capture: 300, check: 760, good: 880, bad: 180, end: 440 }[kind] || 500;
    o.type = kind === 'bad' ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(f, t);
    if (kind === 'good') o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'good' || kind === 'end' ? 0.25 : 0.09));
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.3);
  } catch (e) { }
};

// ---------- engine wrapper ----------
class Engine {
  constructor() {
    this.pending = new Map(); this.seq = 0; this.local = null;
    try {
      this.w = new Worker('engine.js');
      this.w.onmessage = e => { const r = this.pending.get(e.data.id); if (r) { this.pending.delete(e.data.id); r.res(e.data); } };
      this.w.onerror = () => this.toLocal();
    } catch (e) { this.toLocal(); }
  }
  toLocal() {
    if (this.local) return;
    this.w = null; this.local = new C.Searcher(18);
    const p = Array.from(this.pending.values()); this.pending.clear();
    p.forEach(x => this.runLocal(x.msg, x.res));
  }
  runLocal(msg, res) { setTimeout(() => { let r; try { r = C.handle(msg, this.local); } catch (e) { r = { error: String(e) }; } res(r); }, 15); }
  call(msg) {
    return new Promise(res => {
      const id = ++this.seq; msg = Object.assign({}, msg, { id });
      if (!this.w) { this.runLocal(msg, res); return; }
      this.pending.set(id, { msg, res }); this.w.postMessage(msg);
    });
  }
  bot(fen, moves, elo) { return this.call({ cmd: 'bot', fen, moves, elo }); }
  analyze(fen, moves, time, depth) { return this.call({ cmd: 'analyze', fen, moves, time, depth }); }
}
let _bot = null, _coach = null;
CM.botEngine = () => _bot || (_bot = new Engine());
CM.coachEngine = () => _coach || (_coach = new Engine());

// ---------- game model ----------
class Game {
  constructor(fen) { this.reset(fen || C.START_FEN); }
  reset(fen) { this.pos = new C.Position(fen); this.start = this.pos.fen(); this.hist = []; }
  get turn() { return this.pos.turn ? 'b' : 'w'; }
  fen() { return this.pos.fen(); }
  dests() {
    const d = {};
    for (const m of this.pos.legal()) { const f = C.sqName(m & 127), t = C.sqName((m >> 7) & 127); (d[f] = d[f] || []); if (!d[f].includes(t)) d[f].push(t); }
    return d;
  }
  find(from, to, promo) {
    const pr = promo ? '.pnbrqk'.indexOf(promo) : 0;
    for (const m of this.pos.legal()) {
      if (C.sqName(m & 127) === from && C.sqName((m >> 7) & 127) === to) { const p = (m >> 14) & 7; if (!p || p === (pr || 5)) return m; }
    }
    return 0;
  }
  play(m) {
    if (!m) return null;
    const san = this.pos.san(m), uci = this.pos.uci(m), flag = m >> 17;
    const from = C.sqName(m & 127), to = C.sqName((m >> 7) & 127);
    const piece = this.pos.b[m & 127];
    const fenBefore = this.pos.fen();
    this.pos.make(m);
    const rec = { uci, san, from, to, flag, piece, fen: this.pos.fen(), fenBefore, capture: !!(flag & C.F_CAP), check: san.includes('+') || san.includes('#') };
    if (flag & C.F_CASTLE) { const r = to[1]; rec.rookFrom = (to[0] === 'g' ? 'h' : 'a') + r; rec.rookTo = (to[0] === 'g' ? 'f' : 'd') + r; }
    this.hist.push(rec); return rec;
  }
  playUci(u) { return this.play(this.pos.parseUci(u)); }
  playSan(s) { return this.play(this.pos.parseSan(s)); }
  undo() { if (!this.hist.length) return null; this.pos.unmake(); return this.hist.pop(); }
  moves() { return this.hist.map(x => x.uci); }
  checkSq() { return this.pos.inCheck() ? C.sqName(this.pos.king[this.pos.turn]) : null; }
  status() {
    const legal = this.pos.legal();
    if (!legal.length) return this.pos.inCheck() ? { over: true, winner: this.turn === 'w' ? 'b' : 'w', reason: 'checkmate' } : { over: true, winner: null, reason: 'stalemate' };
    if (this.pos.insufficient()) return { over: true, winner: null, reason: 'insufficient material' };
    if (this.pos.half >= 100) return { over: true, winner: null, reason: '50-move rule' };
    if (this.pos.isRepetition(2)) return { over: true, winner: null, reason: 'threefold repetition' };
    return { over: false };
  }
  pgn(tags) {
    let s = ''; const t = Object.assign({ Event: 'ChessMind game', Site: 'ChessMind', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.') }, tags || {});
    if (this.start !== C.START_FEN) { t.SetUp = '1'; t.FEN = this.start; }
    for (const k in t) s += `[${k} "${t[k]}"]\n`;
    s += '\n';
    const p = new C.Position(this.start); let n = p.full, line = '';
    this.hist.forEach((h, i) => { if (p.turn === 0) line += n + '. '; else if (i === 0) line += n + '... '; line += h.san + ' '; const m = p.parseUci(h.uci); p.make(m); if (p.turn === 0) n++; });
    return s + line + (t.Result || '*');
  }
}
CM.Game = Game;

// ---------- material helpers ----------
const VAL = [0, 1, 3, 3, 5, 9, 0];
const PNAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
CM.PNAME = PNAME;
function balance(pos, color) { let v = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = pos.b[sq]; if (pc && (pc & 7) !== 6) v += ((pc >> 3) === color ? 1 : -1) * VAL[pc & 7]; } return v; }
CM.balance = balance;
CM.materialDiff = function (fen) { // returns {w:[captured by white], b:[...], diff}
  const p = new C.Position(fen); const cnt = { w: [0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0] };
  for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = p.b[sq]; if (pc) cnt[pc & 8 ? 'b' : 'w'][pc & 7]++; }
  const start = [0, 8, 2, 2, 2, 1, 1]; const capW = [], capB = [];
  for (let t = 1; t <= 5; t++) { for (let i = cnt.b[t]; i < start[t]; i++) capW.push(t); for (let i = cnt.w[t]; i < start[t]; i++) capB.push(t); }
  return { w: capW, b: capB, diff: balance(p, 0) };
};

// ---------- evaluation helpers ----------
CM.cpOf = (score) => score > C.MATE - 1000 ? 3000 - (C.MATE - score) * 10 : score < -C.MATE + 1000 ? -3000 + (C.MATE + score) * 10 : score; // mate ~ +/-3000
CM.cpOfClamped = s => Math.max(-2000, Math.min(2000, CM.cpOf(s)));
CM.evalText = (score) => C.scoreToText(score);
CM.winPct = cp => C.winPct(Math.max(-2000, Math.min(2000, cp)));
CM.classify = function (loss, isBest) {
  if (isBest || loss < 1.5) return { k: 'best', name: 'Best', sym: '★' };
  if (loss < 4) return { k: 'excellent', name: 'Excellent', sym: '!' };
  if (loss < 8) return { k: 'good', name: 'Good', sym: '✓' };
  if (loss < 14) return { k: 'inaccuracy', name: 'Inaccuracy', sym: '?!' };
  if (loss < 25) return { k: 'mistake', name: 'Mistake', sym: '?' };
  return { k: 'blunder', name: 'Blunder', sym: '??' };
};
// performance rating from average win% loss per move
CM.eloFromLoss = function (avgLoss) { return Math.round(Math.max(300, Math.min(2600, 2900 * Math.exp(-0.12 * avgLoss)))); };
CM.lossFromElo = function (elo) { return -Math.log(elo / 2900) / 0.12; };

// Explain a move with engine data. a = analysis of position before (side to move = mover), b = analysis after the move.
CM.explain = function (fenBefore, movesBefore, uci, a, b) {
  const pos = C.buildPos(fenBefore, movesBefore);
  const mover = pos.turn;
  const m = pos.parseUci(uci); const san = pos.san(m);
  const sBefore = a.score, sAfter = -b.score;
  const cpB = CM.cpOfClamped(sBefore), cpA = CM.cpOfClamped(sAfter);
  const loss = Math.max(0, CM.winPct(cpB) - CM.winPct(cpA));
  const isBest = a.best === uci;
  const cls = CM.classify(loss, isBest);
  let text = '';
  const mateFor = s => s > C.MATE - 1000 ? Math.ceil((C.MATE - s) / 2) : 0;
  const mateAgainst = s => s < -C.MATE + 1000 ? Math.ceil((C.MATE + s) / 2) : 0;
  // what does the opponent's best reply do?
  const after = pos.clone(); after.make(m);
  let threatText = '';
  if (b.pv && b.pv.length) {
    const q = after.clone(); const b0 = balance(q, mover); let firstCap = null;
    for (let i = 0; i < Math.min(5, b.pv.length); i++) { const mm = q.parseUci(b.pv[i]); if (!mm) break; if (i % 2 === 0 && !firstCap && (mm >> 17) & C.F_CAP) firstCap = { san: q.san(mm), piece: q.b[(mm >> 7) & 127] & 7 || 1 }; q.make(mm); }
    const lost = b0 - balance(q, mover);
    if (lost >= 2 && firstCap) threatText = `It allows <b>${firstCap.san}</b>, and you lose ${lost >= 9 ? 'your queen\'s worth' : lost >= 5 ? 'a rook\'s worth' : lost >= 3 ? 'a piece' : lost + ' pawns'} of material.`;
    else if (lost >= 2) threatText = `After <b>${b.pvSan.slice(0, 3).join(' ')}</b> you lose material.`;
  }
  let bestText = '';
  if (!isBest && a.best && a.bestSan) {
    const q = pos.clone(); const b0 = balance(q, mover);
    for (let i = 0; i < Math.min(5, (a.pv || []).length); i++) { const mm = q.parseUci(a.pv[i]); if (!mm) break; q.make(mm); }
    const gain = balance(q, mover) - b0;
    bestText = `Better was <b>${a.bestSan}</b>` + (mateFor(sBefore) ? `, with a forced mate in ${mateFor(sBefore)}.` : gain >= 2 ? `, winning ${gain >= 9 ? 'the queen' : gain >= 5 ? 'a rook' : gain >= 3 ? 'a piece' : gain + ' pawns'}.` : '.');
  }
  if (cls.k === 'best') {
    text = san.includes('#') ? 'Checkmate! Game over.' : mateFor(sAfter) ? `Best move — mate in ${mateFor(sAfter)} is on the board.` : (pos.b[(m >> 7) & 127] ? 'Best move. Good capture!' : 'Best move.');
  } else if (mateAgainst(sAfter) && !mateAgainst(sBefore)) {
    text = `This allows a forced checkmate: <b>${(b.pvSan || []).slice(0, 5).join(' ')}</b>. ` + bestText;
  } else if (mateFor(sBefore) && !mateFor(sAfter)) {
    text = `You missed a forced mate! ` + bestText;
  } else if (cls.k === 'excellent' || cls.k === 'good') {
    text = cls.name + ' move. ' + (bestText ? bestText.replace('Better was', 'The engine slightly prefers') : '');
  } else {
    text = [threatText, bestText].filter(Boolean).join(' ') || bestText || 'This worsens your position.';
  }
  return { san, cls, loss, text, sBefore, sAfter };
};

// ---------- ratings ----------
CM.expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
CM.updateRating = function (opp, score) {
  const d = CM.store.d; const r = d.rating || 800;
  const k = d.ratedGames < 10 ? 48 : d.ratedGames < 30 ? 32 : 20;
  const nr = Math.round(Math.max(100, r + k * (score - CM.expected(r, opp))));
  d.rating = nr; d.ratedGames++; d.ratingHist.push({ t: Date.now(), r: nr, src: 'game' }); CM.store.save();
  return nr - r;
};
CM.updatePuzzleRating = function (pr, ok, theme) {
  const d = CM.store.d; if (d.puzzleRating == null) d.puzzleRating = d.rating || 1000;
  const r = d.puzzleRating; const k = d.puzzleGames < 20 ? 40 : 18;
  const nr = Math.round(Math.max(100, r + k * ((ok ? 1 : 0) - CM.expected(r, pr))));
  d.puzzleRating = nr; d.puzzleGames++; d.puzzleHist.push({ t: Date.now(), r: nr });
  if (d.puzzleHist.length > 400) d.puzzleHist.shift();
  CM.store.save(); return nr - r;
};
CM.recordTheme = function (themes, ok) {
  const st = CM.store.d.themeStats;
  for (const t of themes || []) { if (/^(oneMove|short|long|middlegame|advantage|crushing)$/.test(t)) continue; st[t] = st[t] || { ok: 0, n: 0 }; st[t].n++; if (ok) st[t].ok++; }
  CM.store.save();
};

// ---------- mistakes deck (spaced repetition) ----------
CM.addMistake = function (fen, best, bestSan, played, note) {
  const d = CM.store.d;
  if (d.mistakes.some(x => x.fen === fen)) return;
  d.mistakes.push({ fen, best, bestSan, played, note: note || '', due: Date.now(), iv: 0, reps: 0, added: Date.now() });
  if (d.mistakes.length > 300) d.mistakes.shift();
  CM.store.save();
};
CM.reviewMistake = function (item, ok) {
  item.reps++;
  item.iv = ok ? Math.max(1, Math.round((item.iv || 0.5) * 2.5)) : 0;
  item.due = Date.now() + (ok ? item.iv * 86400000 : 10 * 60000);
  CM.store.save();
};
CM.dueMistakes = () => CM.store.d.mistakes.filter(x => x.due <= Date.now());

// ---------- PGN ----------
CM.parsePgn = function (txt) {
  const tags = {}; txt.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => { tags[k] = v; return ''; });
  let body = txt.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  let prev; do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);
  body = body.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ');
  const toks = body.split(/\s+/).filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  const g = new Game(tags.FEN || C.START_FEN);
  for (const t of toks) { const r = g.playSan(t.replace(/[!?]+$/, '')); if (!r) return { game: g, tags, error: 'Could not read move "' + t + '" (move ' + (g.hist.length + 1) + ')' }; }
  return { game: g, tags };
};

// ---------- openings index ----------
const CUR = window.CURRICULUM;
CM.openings = CUR.openings.filter(o => !o.classic);
CM.openingById = {}; CUR.openings.forEach(o => CM.openingById[o.id] = o);
CM.lessons = CUR.lessons; CM.lessonById = {}; CUR.lessons.forEach((l, i) => { l.idx = i; CM.lessonById[l.id] = l; });
CM.detectOpening = function (uciMoves) {
  let best = null, bestLen = 0, full = false;
  for (const o of CM.openings) {
    if (o.family === 'Opening Trap') continue;
    let k = 0; while (k < o.uci.length && k < uciMoves.length && o.uci[k] === uciMoves[k]) k++;
    const isFull = k === o.uci.length;
    if (k >= 2 && (k > bestLen || (k === bestLen && isFull && !full))) { best = o; bestLen = k; full = isFull; }
  }
  if (!best) return null;
  return { o: best, len: bestLen, name: bestLen >= Math.min(best.uci.length, 6) ? best.family + ': ' + best.variation : best.family };
};
CM.isBook = function (uciMoves) { // all moves so far appear in some opening line
  return CM.openings.some(o => o.uci.length >= uciMoves.length && uciMoves.every((u, i) => o.uci[i] === u));
};
CM.bookNext = function (uciMoves) {
  const res = {};
  for (const o of CM.openings) {
    if (o.uci.length <= uciMoves.length) continue;
    if (!uciMoves.every((u, i) => o.uci[i] === u)) continue;
    const nx = o.uci[uciMoves.length]; const san = o.san[uciMoves.length];
    (res[nx] = res[nx] || { uci: nx, san, lines: [] }).lines.push(o);
  }
  return Object.values(res).sort((a, b) => b.lines.length - a.lines.length);
};

// auto commentary for an opening move
CM.commentMove = function (pos, m, nextOwnSan) {
  const from = m & 127, to = (m >> 7) & 127, pc = pos.b[from], t = pc & 7, flag = m >> 17;
  const side = pc & 8 ? 'Black' : 'White';
  const san = pos.san(m);
  const sqn = C.sqName(to);
  const parts = [];
  if (flag & C.F_CASTLE) parts.push(`${side} castles ${to > from ? 'kingside' : 'queenside'}: the king is safe and the rook joins the game.`);
  else if (flag & C.F_CAP) { const v = (flag & C.F_EP) ? 1 : pos.b[to] & 7; parts.push(`${side} captures the ${PNAME[v]} on ${sqn}.`); }
  else if (t === 1) {
    if ('de'.includes(sqn[0]) && (sqn[1] === '4' || sqn[1] === '5')) parts.push(`${side} stakes a claim in the center.`);
    else if ('cf'.includes(sqn[0]) && (sqn[1] === '4' || sqn[1] === '5')) parts.push(`${side} hits the center from the side with a flank pawn.`);
    else if ((sqn === 'g3' || sqn === 'b3' || sqn === 'g6' || sqn === 'b6')) parts.push(`${side} prepares to fianchetto the bishop.`);
    else if (sqn === 'h3' || sqn === 'h6' || sqn === 'a3' || sqn === 'a6') parts.push(`A useful prophylactic pawn move, taking a square away from enemy pieces.`);
    else if (sqn === 'c3' || sqn === 'c6') parts.push(`${side} supports a future d-pawn advance.`);
    else parts.push(`${side} advances a pawn to ${sqn}.`);
  } else if (t === 2 || t === 3) {
    const backRank = (pc & 8) ? 7 : 0;
    if ((from >> 4) === backRank) parts.push(`${side} develops the ${PNAME[t]} to ${sqn}.`);
    else parts.push(`The ${PNAME[t]} goes to ${sqn}.`);
  } else if (t === 5) parts.push(`The queen comes to ${sqn}.`);
  else if (t === 4) parts.push(`The rook moves to ${sqn}.`);
  else if (t === 6) parts.push(`The king moves to ${sqn}.`);
  // what does it attack / pin?
  const q = pos.clone(); q.make(m);
  if (q.inCheck()) parts.push('Check!');
  const them = (pc & 8) ? 0 : 1;
  const targets = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const v = q.b[sq]; if (!v || (v >> 3) !== them || (v & 7) === 6) continue;
    const atk = q.attackers(sq, them ^ 1);
    if (atk.includes(to) && ((VAL[v & 7] > VAL[t]) || q.attackers(sq, them).length === 0) && (v & 7) !== 1) targets.push(PNAME[v & 7] + ' on ' + C.sqName(sq));
  }
  if (targets.length && !(flag & C.F_CASTLE)) parts.push('It attacks the ' + targets.join(' and the ') + '.');
  if ([3, 4, 5].includes(t) && !q.inCheck()) {
    const offs = t === 3 ? [17, 15, -17, -15] : t === 4 ? [1, -1, 16, -16] : [17, 15, -17, -15, 1, -1, 16, -16];
    for (const d of offs) {
      let x = to + d, first = -1;
      while (!(x & 0x88)) { const v = q.b[x]; if (v) { if (first < 0) { if ((v >> 3) !== them) break; first = x; } else { if ((v >> 3) === them && ((v & 7) === 6 || (v & 7) === 5) && (q.b[first] & 7) < (v & 7)) parts.push(`It pins the ${PNAME[q.b[first] & 7]} on ${C.sqName(first)} to the ${PNAME[v & 7]}.`); break; } } x += d; }
    }
  }
  if (nextOwnSan) parts.push(`Next ${side} plays ${nextOwnSan}.`);
  return { san, text: parts.join(' ') };
};

// ---------- bots ----------
CM.BOTS = [[250, 'Pebble', '🪨'], [400, 'Sprout', '🌱'], [600, 'Rookie Ray', '🙂'], [800, 'Casual Cass', '😎'], [1000, 'Club Kid', '🧒'], [1200, 'Weekend Warrior', '⚔️'],
  [1400, 'Café Champ', '☕'], [1600, 'Tactician Tia', '🎯'], [1800, 'Expert Ezra', '🧠'], [2000, 'Candidate Kai', '🦅'], [2200, 'Master Mira', '👑'], [2500, 'Engine Max', '🤖']];
CM.botFor = elo => { let b = CM.BOTS[0]; for (const x of CM.BOTS) if (x[0] <= elo + 99) b = x; return { elo, name: b[1], icon: b[2] }; };

// ---------- lessons progress ----------
CM.lessonDone = id => !!CM.store.d.lessons[id];
CM.completeLesson = function (id, stars) {
  const L = CM.store.d.lessons; const prev = L[id];
  L[id] = { stars: Math.max(stars, prev ? prev.stars : 0), t: Date.now() }; CM.store.save();
};
CM.recommended = function (n) {
  const r = CM.store.d.rating || 600; const out = [];
  const order = ['basics', 'mates', 'principles', 'tactics', 'endgames', 'openings', 'strategy', 'workouts'];
  const cand = CM.lessons.filter(l => !CM.lessonDone(l.id) && l.level <= r + 150 && l.level >= Math.min(r - 500, 900) - 400);
  cand.sort((a, b) => {
    const pa = order.indexOf(a.cat), pb = order.indexOf(b.cat);
    const la = Math.floor(a.level / 300), lb = Math.floor(b.level / 300);
    return la - lb || pa - pb || a.idx - b.idx;
  });
  // mix categories
  const seen = {}; for (const l of cand) { if (out.length >= n) break; seen[l.cat] = (seen[l.cat] || 0) + 1; if (seen[l.cat] <= Math.ceil(n / 3)) out.push(l); }
  if (out.length < n) for (const l of cand) { if (out.length >= n) break; if (!out.includes(l)) out.push(l); }
  if (!out.length) return CM.lessons.filter(l => !CM.lessonDone(l.id)).slice(0, n);
  return out;
};
CM.THEME_NAMES = { fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack', discoveredCheck: 'Discovered check', doubleCheck: 'Double check', hangingPiece: 'Hanging piece', sacrifice: 'Sacrifice', attraction: 'Attraction', promotion: 'Promotion', advancedPawn: 'Advanced pawn', backRankMate: 'Back-rank mate', smotheredMate: 'Smothered mate', queenMate: 'Queen mate', rookMate: 'Rook mate', bishopMate: 'Bishop mate', knightMate: 'Knight mate', pawnMate: 'Pawn mate', mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', endgame: 'Endgame', middlegame: 'Middlegame', opening: 'Opening', quietMove: 'Quiet move', long: 'Long combination', short: 'Two-movers', oneMove: 'One-movers', crushing: 'Crushing', advantage: 'Advantage' };
})();
