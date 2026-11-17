// Extract mate-in-N puzzles from fast bot games. usage: node genmates.js out.jsonl games seed
const C = require('../engine.js'); const fs = require('fs');
const out = process.argv[2], GAMES = +process.argv[3] || 100; let s = (+process.argv[4] || 3) >>> 0;
function rng() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
const S = new C.Searcher(19); const MATE = C.MATE; const fd = fs.openSync(out, 'a'); const seen = new Set(); let found = 0;
function mateLine(pos) { // returns line of moves to mate, solver's moves unique (except last)
  const line = []; const p = pos.clone();
  for (let k = 0; k < 8; k++) {
    const r = S.search(p, { time: 300, full: true });
    if (!r.move || r.score < MATE - 200) return null;
    const n = Math.ceil((MATE - r.score) / 2);
    if (k % 2 === 0 && n > 1) { // check uniqueness for non-final solver moves
      for (const m of p.legal()) { if (m === r.move) continue; p.make(m); S.deadline = Date.now() + 3000; S.stopFlag = false;
        const sc = p.legal().length === 0 ? (p.inCheck() ? MATE : 0) : -S.negamax(p, Math.min(2 * n + 1, 9), -INF2, -(MATE - 200) + 1, 1, true); p.unmake();
        if (sc >= MATE - 200 && Math.ceil((MATE - sc) / 2) <= n + 0) return null; }
    }
    line.push(r.move); p.make(r.move);
    if (p.legal().length === 0) return p.inCheck() ? line : null;
    if (k % 2 === 1) continue;
    const rep = S.search(p, { time: 150, full: true }); if (!rep.move) return null; line.push(rep.move); p.make(rep.move); k++;
  }
  return null;
}
const INF2 = 32000;
for (let g = 0; g < GAMES; g++) {
  const pos = new C.Position(C.START_FEN); const eW = 600 + rng() * 1200, eB = 600 + rng() * 1200;
  const nOpen = 2 + Math.floor(rng() * 6); let lastFound = -99;
  for (let i = 0; i < 220; i++) {
    const legal = pos.legal(); if (!legal.length || pos.half >= 100 || pos.isRepetition(2) || pos.insufficient()) break;
    let m;
    if (i < nOpen) { const sc = S.scoreRoot(pos, 2, 1000).filter((x, k, a) => x.score > a[0].score - 60); m = sc[Math.floor(rng() * sc.length)].move; }
    else {
      if (i > 16) { const q = S.search(pos, { depth: 5, time: 40, full: true });
        if (i > 50 && q.score > 260 && q.score < 650 && !pos.inCheck() && i % 9 === 0) { let ph2 = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } ph2 += [0, 0, 1, 1, 2, 4, 0][pos.b[sq] & 7] || 0; } if (ph2 <= 10 && ph2 >= 2) fs.appendFileSync(out.replace('.jsonl', '-end.jsonl'), JSON.stringify({ fen: pos.fen(), score: q.score, phase: ph2 }) + '\n'); }
        if (q.score > MATE - 200) { const n = Math.ceil((MATE - q.score) / 2);
          const key = pos.fen().split(' ').slice(0, 4).join(' ');
          if (n <= 4 && i - lastFound > 7 && !seen.has(key)) { seen.add(key); const line = mateLine(pos);
            if (line) { const z = pos.clone(), san = []; for (const mm of line) { san.push(z.san(mm)); z.make(mm); }
              const nn = (line.length + 1) / 2; let ph = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } ph += [0, 0, 1, 1, 2, 4, 0][pos.b[sq] & 7] || 0; }
              const f = line[0], q2 = pos.clone(); const first = q2.san(f); const quiet = !first.includes('x') && !first.includes('+') && !first.includes('#');
              let rating = 450 + (nn - 1) * 380 + (quiet ? 260 : 0) + (first.includes('+') || first.includes('#') ? -40 : 0) + Math.round((rng() - 0.5) * 140);
              rating = Math.max(350, Math.min(2400, Math.round(rating / 10) * 10));
              const themes = ['mateIn' + nn, ph <= 8 ? 'endgame' : 'middlegame']; if (quiet) themes.push('quietMove');
              fs.writeSync(fd, JSON.stringify({ fen: pos.fen(), line: (() => { const t = pos.clone(), u = []; for (const mm of line) { u.push(t.uci(mm)); t.make(mm); } return u.join(' '); })(), san: san.join(' '), rating, themes }) + '\n'); found++; lastFound = i; } } } }
      m = C.chooseBotMove(pos, S, pos.turn === 0 ? eW : eB, rng).move;
    }
    pos.make(m);
  }
  if (g % 10 === 0) console.log('game', g, 'mates', found);
}
console.log('done', found);
