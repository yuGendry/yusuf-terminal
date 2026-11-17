// Builds ../lessons.js and ../puzzles.js from the hand-written curriculum, openings and generated puzzles.
// usage: node build-lessons.js puzzles1.jsonl [puzzles2.jsonl ...]
const C = require('../engine.js');
const fs = require('fs');
const path = require('path');
global.window = {};
require('../openings.js');
const { lessons: SRC } = require('./lessons-src.js');
const S = new C.Searcher(20);
const MATE = C.MATE;
const VALS = [0, 100, 300, 310, 500, 900, 0];
const warn = [];
function W(...a) { warn.push(a.join(' ')); }

// ---------- puzzle pool ----------
let pool = [];
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o.line) { // mate format: fen is the solver position
        pool.push({ fen: o.fen, moves: o.line, rating: o.rating, themes: o.themes, pre: false });
      } else {
        // tactic format: fen before opponent's move, moves[0] is the opponent's move
        pool.push({ fen: o.fen, moves: o.moves, rating: o.rating, themes: o.themes, pre: true });
      }
    } catch (e) { }
  }
}
// dedupe by position
{ const seen = new Set(); pool = pool.filter(p => { const k = p.fen.split(' ').slice(0, 4).join(' ') + p.moves.split(' ')[0]; if (seen.has(k)) return false; seen.add(k); return true; }); }
// normalize: solver fen + line, and keep the opponent's last move for display
pool = pool.map((p, i) => {
  const mv = p.moves.split(' ');
  let fen = p.fen, last = null;
  if (p.pre) { const pos = new C.Position(p.fen); const m = pos.parseUci(mv[0]); last = mv[0]; pos.make(m); fen = pos.fen(); mv.shift(); }
  const pos = new C.Position(fen);
  const t = new Set(p.themes);
  // mate-in-1 has many solutions sometimes; mark
  return { id: 'p' + (i + 1), fen, line: mv, last, rating: p.rating, themes: [...t], side: pos.turn ? 'b' : 'w' };
});
console.log('puzzle pool', pool.length);

// ---------- helpers ----------
function load(fen) { try { return new C.Position(fen); } catch (e) { return null; } }
function sanToUci(pos, san) { const m = pos.parseSan(san); return m ? pos.uci(m) : null; }
function balance(pos, c) { let v = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = pos.b[sq]; if (pc) v += ((pc >> 3) === c ? 1 : -1) * VALS[pc & 7]; } return v; }
function mateMoves(pos) { const out = []; for (const m of pos.legal()) { pos.make(m); if (pos.inCheck() && pos.legal().length === 0) out.push(m); pos.unmake(); } return out; }

function buildMate(step, lid) {
  const pos = load(step.fen); if (!pos) { W(lid, 'bad mate fen', step.fen); return null; }
  const r = S.search(pos, { time: 3000, full: true });
  if (r.score < MATE - 200) { W(lid, 'NOT A MATE', step.fen, C.scoreToText(r.score)); return null; }
  const n = Math.ceil((MATE - r.score) / 2);
  if (n !== step.mate) { W(lid, 'mate length differs', step.mate, '->', n, step.fen); }
  // build line by repeated search
  const line = []; const p = pos.clone();
  for (let k = 0; k < 2 * n - 1; k++) { const q = S.search(p, { time: 800, full: true }); if (!q.move) break; line.push(p.uci(q.move)); p.make(q.move); }
  const text = step.text && !/checkmate in \d+\.$/.test(step.text) ? step.text : ((pos.turn ? 'Black' : 'White') + ' to move: checkmate in ' + n + '.');
  return { t: 'puzzle', fen: step.fen, line, mate: n, text };
}
function buildTactic(step, lid) {
  const pos = load(step.fen); if (!pos) { W(lid, 'bad tactic fen', step.fen); return null; }
  const solver = pos.turn;
  const r = S.search(pos, { time: 2500, full: true });
  const first = pos.parseSan(step.first);
  if (!first) { W(lid, 'illegal first', step.first, step.fen); return null; }
  if (r.move !== first) {
    // accept if close
    pos.make(first); const r2 = S.search(pos, { time: 1500, full: true }); pos.unmake();
    if (-r2.score < r.score - 60) W(lid, 'tactic first move not best', step.first, 'engine:', pos.san(r.move), C.scoreToText(r.score), 'vs', C.scoreToText(-r2.score));
  }
  const m0 = balance(pos, solver);
  const line = [pos.uci(first)]; const p = pos.clone(); p.make(first);
  for (let k = 0; k < 3; k++) {
    if (!p.legal().length) break;
    const rep = S.search(p, { time: 700, full: true });
    const a = p.clone(); a.make(rep.move);
    if (balance(a, solver) - m0 >= 180) break;
    line.push(p.uci(rep.move)); p.make(rep.move);
    const nx = S.search(p, { time: 700, full: true }); if (!nx.move) break;
    line.push(p.uci(nx.move)); p.make(nx.move);
  }
  if (line.length % 2 === 0) line.pop();
  return { t: 'puzzle', fen: step.fen, line, text: step.text };
}
function buildMove(step, lid) {
  const pos = load(step.fen); if (!pos) { W(lid, 'bad move fen', step.fen); return null; }
  let acc;
  if (step.accept === 'mate') acc = mateMoves(pos).map(m => pos.uci(m));
  else acc = step.accept.map(s => { const u = sanToUci(pos, s); if (!u) W(lid, 'illegal accept', s, step.fen); return u; }).filter(Boolean);
  if (!acc.length) { W(lid, 'no accepted moves', step.fen); return null; }
  const out = { t: 'move', fen: step.fen, text: step.text, accept: acc };
  if (step.reject) { out.reject = {}; for (const k in step.reject) { const u = sanToUci(pos, k); if (u) out.reject[u] = step.reject[k]; else W(lid, 'bad reject', k); } }
  if (step.arrows) out.arrows = step.arrows; if (step.marks) out.marks = step.marks;
  return out;
}
function buildGoal(step, lid) {
  const pos = load(step.fen); if (!pos) { W(lid, 'bad goal fen', step.fen); return null; }
  const side = step.side || (pos.turn ? 'b' : 'w');
  if (!step.nocheck) {
    const r = S.search(pos, { time: 2500, full: true });
    const forUser = (pos.turn === (side === 'w' ? 0 : 1)) ? r.score : -r.score;
    if (['mate', 'promote', 'win'].includes(step.goal) && forUser < 250) W(lid, 'goal maybe not winning', step.goal, C.scoreToText(forUser), step.fen);
    if (['draw'].includes(step.goal) && Math.abs(forUser) > 300) W(lid, 'draw goal eval', C.scoreToText(forUser), step.fen);
  }
  return { t: 'goal', fen: step.fen, text: step.text, goal: step.goal, limit: step.limit, side };
}
function parsePlacement(fen) {
  const rows = fen.split(' ')[0].split('/'); const pcs = [];
  rows.forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { pcs.push({ ch, sq: f + (7 - i) * 8 }); f++; } } });
  return pcs;
}
function buildCollect(step, lid) {
  const pcs = parsePlacement(step.fen);
  const hero = pcs.filter(p => p.ch === p.ch.toUpperCase());
  const targets = pcs.filter(p => p.ch !== p.ch.toUpperCase());
  if (hero.length !== 1) { W(lid, 'collect needs one white piece'); return null; }
  const type = hero[0].ch.toLowerCase();
  const tIdx = new Map(targets.map((t, i) => [t.sq, i]));
  const full = (1 << targets.length) - 1;
  const dirs = { r: [[1, 0], [-1, 0], [0, 1], [0, -1]], b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], k: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], n: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]], p: [[0, 1]] };
  const slide = type === 'r' || type === 'b' || type === 'q';
  const start = hero[0].sq;
  const seen = new Map(); const q = [[start, full, 0]]; seen.set(start + ',' + full, 0);
  while (q.length) {
    const [sq, mask, d] = q.shift();
    if (mask === 0) return { t: 'collect', fen: step.fen, text: step.text, par: d };
    const f0 = sq % 8, r0 = sq >> 3;
    for (const [df, dr] of dirs[type]) {
      let f = f0 + df, r = r0 + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const s2 = r * 8 + f; let m2 = mask;
        const ti = tIdx.get(s2);
        const occupied = ti !== undefined && (mask & (1 << ti));
        if (occupied) m2 = mask & ~(1 << ti);
        const key = s2 + ',' + m2;
        if (!seen.has(key)) { seen.set(key, d + 1); q.push([s2, m2, d + 1]); }
        if (occupied || !slide) break;
        f += df; r += dr;
      }
    }
  }
  W(lid, 'collect unsolvable'); return null;
}

// ---------- themed puzzle sets ----------
const used = new Set();
function pickPuzzles(theme, n, level) {
  let cands = pool.filter(p => !used.has(p.id) && p.themes.includes(theme));
  if (cands.length < n) cands = cands.concat(pool.filter(p => !used.has(p.id) && !cands.includes(p) && (theme.startsWith('mate') ? p.themes.some(t => t.startsWith('mate')) : !p.themes.some(t => t.startsWith('mate')))));
  cands.sort((a, b) => Math.abs(a.rating - level) - Math.abs(b.rating - level));
  const pick = cands.slice(0, n).sort((a, b) => a.rating - b.rating);
  pick.forEach(p => used.add(p.id));
  return pick;
}
function pzStep(p, text) {
  const isMate = p.themes.find(t => t.startsWith('mateIn'));
  const n = isMate ? +isMate.slice(6) : 0;
  const who = p.side === 'w' ? 'White' : 'Black';
  return { t: 'puzzle', fen: p.fen, line: p.line, last: p.last, mate: n || undefined, rating: p.rating, pid: p.id,
    text: text || (n ? `${who} to move: checkmate in ${n}.` : `${who} to move: find the winning move.`) };
}

// ---------- process hand lessons ----------
const out = [];
for (const les of SRC) {
  const steps = [];
  for (const st of les.steps) {
    let r = null;
    if (st.t === 'info' || st.t === 'quiz') r = Object.assign({}, st);
    else if (st.t === 'move') r = buildMove(st, les.id);
    else if (st.t === 'puzzle') r = st.mate ? buildMate(st, les.id) : buildTactic(st, les.id);
    else if (st.t === 'goal') r = buildGoal(st, les.id);
    else if (st.t === 'collect') r = buildCollect(st, les.id);
    else if (st.t === 'set') { const ps = pickPuzzles(st.theme, st.n, les.level + 100); if (ps.length < st.n) W(les.id, 'theme short', st.theme, ps.length); ps.forEach((p, i) => steps.push(pzStep(p, i === 0 ? st.text + ' ' + (p.themes.some(t => t.startsWith('mate')) ? '' : '') : null))); continue; }
    if (r) steps.push(r);
  }
  if (!steps.length) { W(les.id, 'EMPTY LESSON'); continue; }
  out.push({ id: les.id, cat: les.cat, unit: les.unit, title: les.title, level: les.level, steps });
}

// ---------- openings ----------
const famLevel = { 'Opening Trap': 450, 'Italian Game': 700, 'London System': 700, 'Scotch Game': 800, 'Four Knights Game': 750, 'Colle System': 800, 'Stonewall Attack': 800, 'Queen\'s Gambit Declined': 1100, 'Ruy Lopez': 1200, 'Sicilian Defense': 1300, 'French Defense': 1100, 'Caro-Kann Defense': 1100, 'Slav Defense': 1200, 'Semi-Slav Defense': 1600, 'King\'s Indian Defense': 1400, 'Grünfeld Defense': 1700, 'Nimzo-Indian Defense': 1500, 'Queen\'s Indian Defense': 1500, 'Catalan Opening': 1600, 'English Opening': 1400, 'King\'s Gambit': 1000, 'Two Knights Defense': 900, 'Petrov Defense': 1000, 'Scandinavian Defense': 800, 'Pirc Defense': 1200, 'Alekhine Defense': 1300, 'Dutch Defense': 1300, 'Benoni Defense': 1600, 'Benko Gambit': 1600 };
const famUnit = (fam, moves) => {
  if (fam === 'Opening Trap') return 'Opening Traps';
  if (moves.startsWith('e4 e5')) return 'Open Games (1.e4 e5)';
  if (moves.startsWith('e4 c5')) return 'Sicilian Defense';
  if (moves.startsWith('e4 e6')) return 'French Defense';
  if (moves.startsWith('e4 c6')) return 'Caro-Kann Defense';
  if (moves.startsWith('e4')) return 'Other 1.e4 Defenses';
  if (moves.startsWith('d4 d5') || moves.startsWith('d4 Nf6 Nc3 d5')) return 'Closed Games (1.d4 d5)';
  if (moves.startsWith('d4')) return 'Indian & Other 1.d4 Defenses';
  return 'Flank Openings';
};
const OPEN = [];
window.OPENINGS_RAW.forEach((o, i) => {
  const [eco, fam, variation, side, moves, summary, ideas, comments] = o;
  const pos = new C.Position(C.START_FEN); const uci = [], san = [];
  for (const s of moves.split(/\s+/)) { const m = pos.parseSan(s); if (!m) { W('opening', fam, variation, 'bad', s); break; } san.push(pos.san(m)); uci.push(pos.uci(m)); pos.make(m); }
  const level = Math.round(((famLevel[fam] || 1200) + Math.min(400, uci.length * 12)) / 50) * 50;
  const id = 'o-' + (i + 1);
  OPEN.push({ id, eco, family: fam, variation, side, uci, san, summary, ideas, comments: comments || {}, endFen: pos.fen() });
  out.push({ id, cat: 'openings', unit: famUnit(fam, moves), title: fam + ': ' + variation, level, opening: id,
    steps: [{ t: 'line', mode: 'study', opening: id }, { t: 'line', mode: 'drill', opening: id }] });
});

// ---------- classic games ----------
const CLASSICS = require('./classics.js');
CLASSICS.forEach((c, i) => {
  const [wn, bn, year, side, moves, summary, ideas] = c;
  const pos = new C.Position(C.START_FEN); const uci = [], san = []; let bad = false;
  for (const s of moves.split(/\s+/)) { const m = pos.parseSan(s); if (!m) { W('classic', wn, bn, 'bad move', s, 'at', san.length + 1); bad = true; break; } san.push(pos.san(m)); uci.push(pos.uci(m)); pos.make(m); }
  if (bad) return;
  const id = 'c-' + (i + 1);
  OPEN.push({ id, eco: String(year), family: 'Classic Game', variation: wn + ' vs ' + bn + ', ' + year, side, uci, san, summary, ideas, comments: {}, endFen: pos.fen(), classic: true });
  out.push({ id, cat: 'strategy', unit: 'Learn from the Classics', title: wn + ' vs ' + bn + ' (' + year + ')', level: 1000 + i * 120, opening: id,
    steps: [{ t: 'line', mode: 'study', opening: id }, { t: 'line', mode: 'drill', opening: id }] });
});

// ---------- opening recognition quizzes ----------
{
  const byUnit = {};
  OPEN.filter(o => !o.classic && o.family !== 'Opening Trap').forEach(o => { const u = famUnit(o.family, o.san.join(' ')); (byUnit[u] = byUnit[u] || []).push(o); });
  const allNames = OPEN.filter(o => !o.classic && o.family !== 'Opening Trap');
  let qn = 0;
  for (const u of Object.keys(byUnit)) {
    const list = byUnit[u];
    for (let i = 0; i < list.length; i += 5) {
      const chunk = list.slice(i, i + 5); if (chunk.length < 3) continue;
      const steps = chunk.map((o, k) => {
        const plies = Math.min(o.uci.length, 6 + (k % 3) * 2);
        const p = new C.Position(C.START_FEN); for (let j = 0; j < plies; j++) p.make(p.parseUci(o.uci[j]));
        const name = x => x.family + ': ' + x.variation;
        const pool2 = list.filter(x => x !== o && name(x) !== name(o) && x.uci.slice(0, plies).join() !== o.uci.slice(0, plies).join());
        const pool3 = pool2.length >= 3 ? pool2 : pool2.concat(allNames.filter(x => x !== o && !pool2.includes(x)));
        const opts = [o]; let s2 = (i * 7 + k * 13 + 3) % 97;
        while (opts.length < 4 && pool3.length) { s2 = (s2 * 31 + 17) % 1009; const c = pool3[s2 % pool3.length]; if (!opts.includes(c)) opts.push(c); else pool3.splice(pool3.indexOf(c), 1); }
        const order = opts.map((x, j) => ({ x, r: (j * 37 + k * 11 + i) % 5 })).sort((a, b) => a.r - b.r).map(z => z.x);
        return { t: 'quiz', fen: p.fen(), text: 'Which opening is this? Moves: <b>' + o.san.slice(0, plies).map((s, j) => (j % 2 === 0 ? (j / 2 + 1) + '. ' : '') + s).join(' ') + '</b>', options: order.map(name), answer: order.indexOf(o), explain: name(o) + ' — ' + o.summary };
      });
      qn++;
      const lvl = Math.round(chunk.reduce((a, o) => a + (famLevel[o.family] || 1200), 0) / chunk.length / 50) * 50;
      out.push({ id: 'oq-' + qn, cat: 'openings', unit: 'Name That Opening', title: 'Name That Opening: ' + u + (list.length > 5 ? ' ' + (i / 5 + 1) : ''), level: lvl, steps });
    }
  }
}

// ---------- convert-the-win endgames from real games ----------
{
  const ends = [];
  for (const f of process.argv.slice(2)) { const g = f.replace('.jsonl', '-end.jsonl'); if (!fs.existsSync(g)) continue; for (const line of fs.readFileSync(g, 'utf8').split('\n')) { if (!line.trim()) continue; try { ends.push(JSON.parse(line)); } catch (e) { } } }
  const seenE = new Set(); const good = [];
  for (const e of ends) {
    const k = e.fen.split(' ').slice(0, 2).join(' '); if (seenE.has(k)) continue; seenE.add(k);
    const pos = load(e.fen); if (!pos || pos.inCheck()) continue;
    const r = S.search(pos, { time: 700, full: true });
    if (r.score < 280 || r.score > 900) continue;
    good.push({ fen: e.fen, score: r.score, phase: e.phase });
  }
  good.sort((a, b) => a.phase - b.phase || b.score - a.score);
  let en = 0;
  for (let i = 0; i + 3 <= good.length; i += 3) {
    const g3 = good.slice(i, i + 3); en++;
    out.push({ id: 'ec-' + en, cat: 'endgames', unit: 'Convert the Win (from real games)', title: 'Convert the Win ' + en, level: 1300 + Math.min(700, Math.round(i / 3) * 15),
      steps: [{ t: 'info', fen: g3[0].fen, text: 'These endgames come from real games where one side was clearly better (about +3 pawns). Your job: convert the advantage against the engine defending at full strength. Push passed pawns, activate your king, trade pieces and avoid counterplay.' }]
        .concat(g3.map(x => ({ t: 'goal', fen: x.fen, text: 'You are better here (engine: ' + C.scoreToText(x.score) + '). Win: promote, or reach a decisive material advantage.', goal: 'win', limit: 50, side: new C.Position(x.fen).turn ? 'b' : 'w' }))) });
  }
  console.log('endgame conversions', en, 'from', good.length);
}

// ---------- workouts from remaining puzzles ----------
const remainingT = pool.filter(p => !used.has(p.id) && !p.themes.some(t => t.startsWith('mate'))).sort((a, b) => a.rating - b.rating);
const remainingM = pool.filter(p => !used.has(p.id) && p.themes.some(t => t.startsWith('mate')));
const SET = 5;
// reserve ~25% of puzzles for the free puzzle trainer only (still included in pool)
let wN = 0;
for (let i = 0; i + SET <= remainingT.length * 0.85; i += SET) {
  const ps = remainingT.slice(i, i + SET); ps.forEach(p => used.add(p.id));
  const avg = Math.round(ps.reduce((a, p) => a + p.rating, 0) / ps.length / 50) * 50;
  out.push({ id: 'w-t' + (++wN), cat: 'workouts', unit: 'Tactics Workouts', title: 'Tactics Workout ' + wN, level: avg, steps: ps.map(p => pzStep(p)) });
}
for (const n of [1, 2, 3, 4]) {
  const ms = remainingM.filter(p => p.themes.includes('mateIn' + n)).sort((a, b) => a.rating - b.rating);
  let k = 0;
  for (let i = 0; i + SET <= ms.length * 0.85; i += SET) {
    const ps = ms.slice(i, i + SET); ps.forEach(p => used.add(p.id));
    const avg = Math.round(ps.reduce((a, p) => a + p.rating, 0) / ps.length / 50) * 50;
    out.push({ id: `w-m${n}-${++k}`, cat: 'workouts', unit: `Mate in ${n} Practice`, title: `Mate in ${n} — Set ${k}`, level: avg, steps: ps.map(p => pzStep(p)) });
  }
}

// ---------- write ----------
const CAT_ORDER = ['basics', 'principles', 'mates', 'tactics', 'openings', 'strategy', 'endgames', 'workouts'];
const CAT_NAMES = { basics: 'Rules & Basics', principles: 'Opening Principles', mates: 'Checkmate Patterns', tactics: 'Tactics', openings: 'Openings', strategy: 'Strategy', endgames: 'Endgames', workouts: 'Practice Workouts' };
out.sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat));
const dir = path.join(__dirname, '..');
fs.writeFileSync(path.join(dir, 'lessons.js'), '/* generated by tools/build-lessons.js */\nwindow.CURRICULUM=' + JSON.stringify({ cats: CAT_ORDER.map(c => ({ id: c, name: CAT_NAMES[c] })), lessons: out, openings: OPEN }) + ';\n');
const pz = pool.map(p => [p.fen, p.line.join(' '), p.rating, p.themes.join(','), p.last || '']);
fs.writeFileSync(path.join(dir, 'puzzles.js'), '/* generated by tools/build-lessons.js: puzzles extracted from engine games and verified */\nwindow.PUZZLES=' + JSON.stringify(pz) + ';\n');
const byCat = {}; out.forEach(l => byCat[l.cat] = (byCat[l.cat] || 0) + 1);
console.log('lessons', out.length, byCat);
console.log('warnings:\n' + warn.join('\n'));
