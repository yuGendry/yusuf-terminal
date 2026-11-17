// Generates verified tactics puzzles from engine self-play games.
// usage: node genpuzzles.js <outfile.jsonl> <games> <seed>
const C = require('../engine.js');
const fs = require('fs');
const out = process.argv[2] || 'puzzles.jsonl';
const GAMES = +process.argv[3] || 50;
let s = (+process.argv[4] || 1) >>> 0;
function rng() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
const S = new C.Searcher(20);
const { MATE } = C;
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const VAL = [0, 100, 300, 310, 500, 900, 0];

function search(pos, ms, depth) { return S.search(pos, { time: ms, depth, full: true }); }
function isMate(sc) { return sc > MATE - 200; }
function mat(pos, c) { let v = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = pos.b[sq]; if (pc && (pc >> 3) === c) v += VAL[pc & 7]; } return v; }
function balance(pos, c) { return mat(pos, c) - mat(pos, c ^ 1); }

// does any move other than `best` reach score >= thr ?
function alternative(pos, best, depth, thr) {
  const us = pos.turn;
  for (const m of pos.legal()) {
    if (m === best) continue;
    S.deadline = Date.now() + 4000; S.stopFlag = false; S.nodeLimit = 0;
    pos.make(m);
    let sc;
    if (pos.legal().length === 0) sc = pos.inCheck() ? MATE : 0;
    else sc = -S.negamax(pos, depth - 1, -thr, -thr + 1, 1, true);
    pos.unmake();
    if (S.stopFlag) return true; // be conservative
    if (sc >= thr) return true;
  }
  void us;
  return false;
}

function attacksFrom(pos, sq) { // squares attacked by piece on sq
  const pc = pos.b[sq], t = pc & 7, c = pc >> 3, res = [];
  const add = (x) => { if (!(x & 0x88)) res.push(x); };
  if (t === P) { const f = c === 0 ? 16 : -16; add(sq + f - 1); add(sq + f + 1); }
  else if (t === N) for (const o of [33, 31, 18, 14, -33, -31, -18, -14]) add(sq + o);
  else if (t === K) for (const o of [1, -1, 16, -16, 17, 15, -17, -15]) add(sq + o);
  else {
    const offs = t === B ? [17, 15, -17, -15] : t === R ? [1, -1, 16, -16] : [17, 15, -17, -15, 1, -1, 16, -16];
    for (const d of offs) { let x = sq + d; while (!(x & 0x88)) { res.push(x); if (pos.b[x]) break; x += d; } }
  }
  return res;
}

function classify(startPos, line, solverColor, endsMate) {
  // line: array of moves starting with solver move, alternating
  const th = new Set();
  const pos = startPos.clone();
  const m0 = balance(pos, solverColor);
  let phase = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const t = pos.b[sq] & 7; phase += [0, 0, 1, 1, 2, 4, 0][t] || 0; }
  if (phase <= 8) th.add('endgame'); else if (pos.full <= 12) th.add('opening'); else th.add('middlegame');
  const captured = []; // squares where solver captured
  const forkTargets = [];
  for (let i = 0; i < line.length; i++) {
    const m = line[i]; const solver = i % 2 === 0;
    const from = m & 127, to = (m >> 7) & 127, flag = m >> 17;
    const piece = pos.b[from], victim = pos.b[to];
    if (solver && (flag & C.F_PROMO)) th.add('promotion');
    if (solver && (piece & 7) === P && ((to >> 4) === 6 || (to >> 4) === 1) && !(flag & C.F_PROMO)) th.add('advancedPawn');
    if (solver && victim) captured.push(to);
    if (!solver && (piece & 7) === K && victim && i === 1) th.add('attraction');
    // before-move: discovered attack detection
    let beforeAtt = null;
    if (solver) {
      beforeAtt = new Map();
      for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = pos.b[sq]; if (pc && (pc >> 3) === solverColor && sq !== from && [B, R, Q].includes(pc & 7)) beforeAtt.set(sq, new Set(attacksFrom(pos, sq))); }
    }
    pos.make(m);
    if (solver) {
      const them = solverColor ^ 1;
      const ksq = pos.king[them];
      const checkers = pos.attackers(ksq, solverColor);
      if (checkers.length >= 2) th.add('doubleCheck');
      // fork: moved piece attacks 2+ valuable targets
      const att = attacksFrom(pos, to);
      const mover = pos.b[to] & 7;
      let targets = 0;
      for (const x of att) {
        const pc = pos.b[x]; if (!pc || (pc >> 3) !== them) continue;
        const tt = pc & 7;
        if (tt === K || VAL[tt] > VAL[mover] || (tt !== P && pos.attackers(x, them).length === 0)) { targets++; forkTargets.push(x); }
      }
      if (targets >= 2 && pos.attackers(to, them).length === 0) th.add('fork');
      // discovered attack: another slider now attacks something it did not
      for (const [sq, set] of beforeAtt) {
        if (pos.b[sq] === 0) continue;
        for (const x of attacksFrom(pos, sq)) {
          if (set.has(x)) continue;
          const pc = pos.b[x]; if (pc && (pc >> 3) === them && ((pc & 7) === K || VAL[pc & 7] >= 300)) { th.add('discoveredAttack'); if ((pc & 7) === K && checkers.length === 1 && checkers[0] !== to) th.add('discoveredCheck'); }
        }
      }
      // pin: moved slider pins an enemy piece to king/queen
      if ([B, R, Q].includes(mover)) {
        const offs = mover === B ? [17, 15, -17, -15] : mover === R ? [1, -1, 16, -16] : [17, 15, -17, -15, 1, -1, 16, -16];
        for (const d of offs) {
          let x = to + d, first = -1;
          while (!(x & 0x88)) {
            const pc = pos.b[x];
            if (pc) {
              if (first < 0) { if ((pc >> 3) !== them) break; first = x; }
              else {
                if ((pc >> 3) === them) {
                  const tf = pos.b[first] & 7, tb = pc & 7;
                  if (tb === K || VAL[tb] > VAL[tf]) {
                    if (tf === K) th.add('skewer');
                    else if (tb === K || VAL[tb] > VAL[mover]) th.add('pin');
                  }
                }
                break;
              }
            }
            x += d;
          }
        }
      }
    }
  }
  // sacrifice: after solver's first move and opponent's reply, solver is down material vs start
  if (line.length >= 2) {
    const q = startPos.clone(); q.make(line[0]); q.make(line[1]);
    if (balance(q, solverColor) - m0 <= -200) th.add('sacrifice');
  }
  if (line.length === 1 && !endsMate) {
    const to = (line[0] >> 7) & 127; const v = startPos.b[to];
    if (v && startPos.attackers(to, solverColor ^ 1).length === 0) th.add('hangingPiece');
  }
  if (endsMate) {
    const mp = pos; const ksq = mp.king[solverColor ^ 1];
    const last = line[line.length - 1]; const mt = (last >> 7) & 127; const matingPiece = mp.b[mt] & 7;
    const kr = ksq >> 4, backRank = solverColor === 0 ? 7 : 0;
    const neigh = [1, -1, 16, -16, 17, 15, -17, -15].map(o => ksq + o).filter(x => !(x & 0x88));
    const ownAround = neigh.filter(x => mp.b[x] && (mp.b[x] >> 3) === (solverColor ^ 1)).length;
    if (matingPiece === N && ownAround === neigh.length) th.add('smotheredMate');
    if (kr === backRank && (matingPiece === R || matingPiece === Q) && (mt >> 4) === backRank) {
      const forward = solverColor === 0 ? -16 : 16;
      const blocked = [ksq + forward - 1, ksq + forward, ksq + forward + 1].filter(x => !(x & 0x88)).every(x => mp.b[x] && (mp.b[x] >> 3) === (solverColor ^ 1));
      if (blocked) th.add('backRankMate');
    }
    if (matingPiece === Q && dist(mt, ksq) === 1) th.add('queenMate');
    if (matingPiece === B) th.add('bishopMate');
    if (matingPiece === P) th.add('pawnMate');
    if (matingPiece === R && (mt >> 4) !== backRank) th.add('rookMate');
    if (matingPiece === N && !th.has('smotheredMate')) th.add('knightMate');
  }
  // was a piece from a fork later captured?
  if (th.has('fork') && !captured.some(x => forkTargets.includes(x))) th.delete('fork');
  return [...th];
}
function dist(a, b) { return Math.max(Math.abs((a >> 4) - (b >> 4)), Math.abs((a & 7) - (b & 7))); }

function tryPuzzle(prevFen, prevMoveU) {
  const pre = new C.Position(prevFen);
  const blunder = pre.parseUci(prevMoveU);
  const start = pre.clone(); start.make(blunder);
  const solver = start.turn;
  const first = search(start, 500);
  if (!first.move) return null;
  let sc = first.score;
  const mate = isMate(sc);
  if (!mate && sc < 280) return null;
  const pos = start.clone();
  const line = [];
  const m0 = balance(pos, solver);
  let endsMate = false;
  for (let step = 0; step < 5; step++) {
    const r = step === 0 ? first : search(pos, 350);
    if (!r.move) return null;
    const isLastMate = isMate(r.score) && (MATE - r.score) === 1;
    const thr = isMate(r.score) ? MATE - 200 : Math.max(200, Math.min(r.score - 160, 500));
    if (!isLastMate && alternative(pos, r.move, Math.min(5, Math.max(4, r.depth - 3)), thr)) return null;
    if (isLastMate) {
      // any mate accepted, but keep it
    }
    line.push(r.move);
    pos.make(r.move);
    if (pos.legal().length === 0) { endsMate = pos.inCheck(); if (!endsMate) return null; break; }
    if (!isMate(r.score)) {
      // cashed in? look at opponent best reply
      const reply = search(pos, 200);
      const after = pos.clone(); after.make(reply.move);
      const gain = balance(after, solver) - m0;
      if (gain >= 180 && -reply.score >= 200 && step >= 0) {
        // make sure it isn't a long quiet chase: stop here
        break;
      }
      if (step >= 3) return null;
      line.push(reply.move); pos.make(reply.move);
    } else {
      const reply = search(pos, 200);
      if (!reply.move) return null;
      line.push(reply.move); pos.make(reply.move);
    }
  }
  if (line.length % 2 === 0) return null;
  const themes = classify(start, line, solver, endsMate);
  const solverMoves = (line.length + 1) / 2;
  if (endsMate) themes.push('mateIn' + solverMoves);
  else themes.push(sc > 600 ? 'crushing' : 'advantage');
  if (solverMoves === 1 && !endsMate) themes.push('oneMove'); else if (solverMoves === 2) themes.push('short'); else if (solverMoves >= 3) themes.push('long');
  // difficulty
  const f = line[0], flag = f >> 17;
  const q = start.clone(); const fSan = q.san(f); q.make(f);
  const quiet = !(flag & (C.F_CAP | C.F_PROMO)) && !q.inCheck();
  let rating = endsMate ? 500 + solverMoves * 330 : 750 + (solverMoves - 1) * 260;
  if (quiet) rating += 300;
  if (themes.includes('sacrifice')) rating += 220;
  if (fSan.includes('+')) rating -= 80;
  if (themes.includes('hangingPiece')) rating -= 250;
  // how quickly the engine found it
  let foundAt = 1; { const t = start.clone(); S.search(t, { depth: 5, time: 800, full: true, onIter: (b) => { if (b.move !== f) foundAt = b.depth + 1; } }); }
  rating += Math.min(6, foundAt) * 45;
  rating += Math.round((rng() - 0.5) * 120);
  rating = Math.max(400, Math.min(2500, Math.round(rating / 10) * 10));
  const sanLine = []; const z = start.clone(); for (const m of line) { sanLine.push(z.san(m)); z.make(m); }
  return { fen: prevFen, moves: [prevMoveU, ...line.map(m => start.uci(m))].join(' '), san: sanLine.join(' '), rating, themes };
}

const seen = new Set();
let found = 0;
const fd = fs.openSync(out, 'a');
for (let g = 0; g < GAMES; g++) {
  const pos = new C.Position(C.START_FEN);
  const eloW = 700 + rng() * 1300, eloB = 700 + rng() * 1300;
  const fens = [], movesU = [], evals = [];
  // random-ish opening
  const nOpen = 2 + Math.floor(rng() * 6);
  for (let i = 0; i < 200; i++) {
    const legal = pos.legal();
    if (!legal.length || pos.half >= 100 || pos.isRepetition(2) || pos.insufficient()) break;
    let m;
    if (i < nOpen) {
      const sc = S.scoreRoot(pos, 2, 1000).filter((x, k, a) => x.score > a[0].score - 60);
      m = sc[Math.floor(rng() * sc.length)].move;
    } else {
      m = C.chooseBotMove(pos, S, pos.turn === 0 ? eloW : eloB, rng).move;
    }
    fens.push(pos.fen()); movesU.push(pos.uci(m));
    pos.make(m);
    const a = S.search(pos, { depth: 5, time: 40 });
    evals.push(-a.score); // from the mover's perspective
  }
  // candidates: mover's eval before (pov of mover at previous position) -> after move becomes bad
  for (let i = 8; i < movesU.length; i++) {
    const beforeForMover = i > 0 ? -evals[i - 1] : 0; // eval of position fens[i] for side to move there
    const afterForMover = evals[i];
    if (beforeForMover > -250 && beforeForMover < 400 && afterForMover < beforeForMover - 260 && afterForMover < -200) {
      const key = fens[i].split(' ').slice(0, 4).join(' ');
      if (seen.has(key)) continue; seen.add(key);
      try {
        const pz = tryPuzzle(fens[i], movesU[i]);
        if (pz) { fs.writeSync(fd, JSON.stringify(pz) + '\n'); found++; }
      } catch (e) { console.error(e); }
    }
  }
  if (g % 5 === 0) console.log('game', g, 'puzzles', found);
}
console.log('done', found);
