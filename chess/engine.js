/* ChessMind engine: rules, move generation, evaluation and alpha-beta search.
   Runs in the browser main thread, in a Web Worker, and in Node (for tools/tests). */
(function (root) {
'use strict';

const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8, F_PROMO = 16;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const K_OFF = [1, -1, 16, -16, 17, 15, -17, -15];
const B_OFF = [17, 15, -17, -15];
const R_OFF = [1, -1, 16, -16];
const MATE = 30000, INF = 32000, MAXPLY = 96;
const VAL = [0, 100, 320, 330, 500, 950, 20000];

// ---------- zobrist ----------
let seed = 0x2545F491;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
const ZP1 = new Int32Array(16 * 128), ZP2 = new Int32Array(16 * 128);
for (let i = 0; i < ZP1.length; i++) { ZP1[i] = rnd(); ZP2[i] = rnd(); }
const ZC1 = new Int32Array(16), ZC2 = new Int32Array(16);
for (let i = 0; i < 16; i++) { ZC1[i] = rnd(); ZC2[i] = rnd(); }
const ZE1 = new Int32Array(128), ZE2 = new Int32Array(128);
for (let i = 0; i < 128; i++) { ZE1[i] = rnd(); ZE2[i] = rnd(); }
const ZS1 = rnd(), ZS2 = rnd();

const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0] = 13; CASTLE_MASK[4] = 12; CASTLE_MASK[7] = 14;
CASTLE_MASK[0x70] = 7; CASTLE_MASK[0x74] = 3; CASTLE_MASK[0x77] = 11;

function sqName(sq) { return 'abcdefgh'[sq & 7] + ((sq >> 4) + 1); }
function sqParse(s) { return (s.charCodeAt(0) - 97) + (s.charCodeAt(1) - 49) * 16; }
function mkMove(from, to, promo, flag) { return from | (to << 7) | (promo << 14) | (flag << 17); }

// ---------- piece-square tables (rank 8 first, from white's view) ----------
const T = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  pe:[0,0,0,0,0,0,0,0, 90,90,90,90,90,90,90,90, 50,50,50,50,50,50,50,50, 30,30,30,30,30,30,30,30, 15,15,15,15,15,15,15,15, 5,5,5,5,5,5,5,5, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  ke:[-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
};
const MGV = [0, 90, 320, 330, 490, 940, 0];
const EGV = [0, 120, 300, 320, 530, 960, 0];
const PH = [0, 0, 1, 1, 2, 4, 0];
const PST_MG = [], PST_EG = [];
(function () {
  const mgT = [null, T.p, T.n, T.b, T.r, T.q, T.k];
  const egT = [null, T.pe, T.n, T.b, T.r, T.q, T.ke];
  for (let pc = 0; pc < 16; pc++) { PST_MG[pc] = new Int16Array(128); PST_EG[pc] = new Int16Array(128); }
  for (let t = 1; t <= 6; t++) for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const r = sq >> 4, f = sq & 7;
    const wi = (7 - r) * 8 + f, bi = r * 8 + f;
    PST_MG[t][sq] = MGV[t] + mgT[t][wi]; PST_EG[t][sq] = EGV[t] + egT[t][wi];
    PST_MG[t | 8][sq] = MGV[t] + mgT[t][bi]; PST_EG[t | 8][sq] = EGV[t] + egT[t][bi];
  }
})();
const PASS_MG = [0, 5, 10, 15, 25, 45, 70, 0];
const PASS_EG = [0, 10, 20, 35, 60, 95, 140, 0];
const CMD = new Int8Array(128);
for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) continue; const r = sq >> 4, f = sq & 7; CMD[sq] = Math.max(3 - r, r - 4) + Math.max(3 - f, f - 4); }
function dist(a, b) { return Math.max(Math.abs((a >> 4) - (b >> 4)), Math.abs((a & 7) - (b & 7))); }

// ---------- Position ----------
const STK = 2048;
class Position {
  constructor(fen) {
    this.b = new Int8Array(128);
    this.uMove = new Int32Array(STK); this.uCap = new Int8Array(STK); this.uCastle = new Int8Array(STK);
    this.uEp = new Int16Array(STK); this.uHalf = new Int16Array(STK); this.uH1 = new Int32Array(STK); this.uH2 = new Int32Array(STK);
    this.hist1 = new Int32Array(STK + 1); this.hist2 = new Int32Array(STK + 1);
    this.king = [0, 0];
    this.load(fen || START_FEN);
  }
  load(fen) {
    const parts = fen.trim().split(/\s+/);
    const b = this.b; b.fill(0);
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Bad FEN');
    let wk = 0, bk = 0;
    for (let i = 0; i < 8; i++) {
      let f = 0; const r = 7 - i;
      for (const ch of rows[i]) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const lower = ch.toLowerCase(); const t = '.pnbrqk'.indexOf(lower);
        if (t < 1 || f > 7) throw new Error('Bad FEN');
        const pc = t | (ch === lower ? 8 : 0); const sq = r * 16 + f;
        b[sq] = pc; if (t === K) { if (pc & 8) { this.king[1] = sq; bk++; } else { this.king[0] = sq; wk++; } }
        f++;
      }
    }
    if (wk !== 1 || bk !== 1) throw new Error('FEN needs one king per side');
    this.turn = parts[1] === 'b' ? 1 : 0;
    this.castle = 0; const c = parts[2] || '-';
    if (c.includes('K') && b[4] === K && b[7] === R) this.castle |= 1;
    if (c.includes('Q') && b[4] === K && b[0] === R) this.castle |= 2;
    if (c.includes('k') && b[0x74] === (K | 8) && b[0x77] === (R | 8)) this.castle |= 4;
    if (c.includes('q') && b[0x74] === (K | 8) && b[0x70] === (R | 8)) this.castle |= 8;
    this.ep = (parts[3] && parts[3] !== '-') ? sqParse(parts[3]) : -1;
    if (this.ep >= 0 && !this.epCapturable(this.ep)) this.ep = -1;
    this.half = parseInt(parts[4] || '0', 10) || 0;
    this.full = parseInt(parts[5] || '1', 10) || 1;
    this.ply = 0;
    this.computeHash();
    this.hist1[0] = this.h1; this.hist2[0] = this.h2;
    this.startFen = this.fen();
  }
  epCapturable(ep) {
    const us = this.turn, pawn = P | (us << 3);
    const from = us === 0 ? ep - 16 : ep + 16;
    const a = from - 1, c = from + 1;
    return (!(a & 0x88) && this.b[a] === pawn) || (!(c & 0x88) && this.b[c] === pawn);
  }
  computeHash() {
    let h1 = 0, h2 = 0;
    for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = this.b[sq]; if (pc) { h1 ^= ZP1[pc * 128 + sq]; h2 ^= ZP2[pc * 128 + sq]; } }
    h1 ^= ZC1[this.castle]; h2 ^= ZC2[this.castle];
    if (this.ep >= 0) { h1 ^= ZE1[this.ep]; h2 ^= ZE2[this.ep]; }
    if (this.turn) { h1 ^= ZS1; h2 ^= ZS2; }
    this.h1 = h1; this.h2 = h2;
  }
  fen() {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const pc = this.b[r * 16 + f];
        if (!pc) { e++; continue; }
        if (e) { s += e; e = 0; }
        const ch = '.pnbrqk'[pc & 7]; s += pc & 8 ? ch : ch.toUpperCase();
      }
      if (e) s += e;
      if (r) s += '/';
    }
    let c = '';
    if (this.castle & 1) c += 'K'; if (this.castle & 2) c += 'Q'; if (this.castle & 4) c += 'k'; if (this.castle & 8) c += 'q';
    return s + ' ' + (this.turn ? 'b' : 'w') + ' ' + (c || '-') + ' ' + (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
  }
  clone() { const p = new Position(this.fen()); return p; }

  attacked(sq, by) {
    const b = this.b;
    if (by === 0) {
      if (!((sq - 15) & 0x88) && b[sq - 15] === P) return true;
      if (!((sq - 17) & 0x88) && b[sq - 17] === P) return true;
    } else {
      if (!((sq + 15) & 0x88) && b[sq + 15] === (P | 8)) return true;
      if (!((sq + 17) & 0x88) && b[sq + 17] === (P | 8)) return true;
    }
    const c = by << 3, kn = N | c, kg = K | c, bi = B | c, rk = R | c, qn = Q | c;
    for (let i = 0; i < 8; i++) { const t = sq + N_OFF[i]; if (!(t & 0x88) && b[t] === kn) return true; }
    for (let i = 0; i < 8; i++) { const t = sq + K_OFF[i]; if (!(t & 0x88) && b[t] === kg) return true; }
    for (let i = 0; i < 4; i++) {
      const d = B_OFF[i]; let t = sq + d;
      while (!(t & 0x88)) { const pc = b[t]; if (pc) { if (pc === bi || pc === qn) return true; break; } t += d; }
    }
    for (let i = 0; i < 4; i++) {
      const d = R_OFF[i]; let t = sq + d;
      while (!(t & 0x88)) { const pc = b[t]; if (pc) { if (pc === rk || pc === qn) return true; break; } t += d; }
    }
    return false;
  }
  // list of squares of pieces of colour `by` attacking sq
  attackers(sq, by) {
    const b = this.b, out = [];
    const c = by << 3;
    const ps = by === 0 ? [sq - 15, sq - 17] : [sq + 15, sq + 17];
    for (const t of ps) if (!(t & 0x88) && b[t] === (P | c)) out.push(t);
    for (const o of N_OFF) { const t = sq + o; if (!(t & 0x88) && b[t] === (N | c)) out.push(t); }
    for (const o of K_OFF) { const t = sq + o; if (!(t & 0x88) && b[t] === (K | c)) out.push(t); }
    for (const d of B_OFF) { let t = sq + d; while (!(t & 0x88)) { const pc = b[t]; if (pc) { if (pc === (B | c) || pc === (Q | c)) out.push(t); break; } t += d; } }
    for (const d of R_OFF) { let t = sq + d; while (!(t & 0x88)) { const pc = b[t]; if (pc) { if (pc === (R | c) || pc === (Q | c)) out.push(t); break; } t += d; } }
    return out;
  }
  inCheck() { return this.attacked(this.king[this.turn], this.turn ^ 1); }

  gen(out, caps) {
    const b = this.b, us = this.turn, them = us ^ 1;
    let n = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq];
      if (!pc || (pc >> 3) !== us) continue;
      const t = pc & 7;
      if (t === P) {
        const fwd = us === 0 ? 16 : -16, rank = sq >> 4;
        const promoRank = us === 0 ? 6 : 1, startRank = us === 0 ? 1 : 6;
        const to = sq + fwd;
        if (!b[to]) {
          if (rank === promoRank) {
            out[n++] = mkMove(sq, to, Q, F_PROMO);
            if (!caps) { out[n++] = mkMove(sq, to, N, F_PROMO); out[n++] = mkMove(sq, to, R, F_PROMO); out[n++] = mkMove(sq, to, B, F_PROMO); }
          } else if (!caps) {
            out[n++] = mkMove(sq, to, 0, 0);
            if (rank === startRank && !b[to + fwd]) out[n++] = mkMove(sq, to + fwd, 0, F_DOUBLE);
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          const c = to + k; if (c & 0x88) continue;
          const tp = b[c];
          if (tp && (tp >> 3) === them) {
            if (rank === promoRank) {
              out[n++] = mkMove(sq, c, Q, F_PROMO | F_CAP);
              if (!caps) { out[n++] = mkMove(sq, c, N, F_PROMO | F_CAP); out[n++] = mkMove(sq, c, R, F_PROMO | F_CAP); out[n++] = mkMove(sq, c, B, F_PROMO | F_CAP); }
            } else out[n++] = mkMove(sq, c, 0, F_CAP);
          } else if (c === this.ep) out[n++] = mkMove(sq, c, 0, F_CAP | F_EP);
        }
      } else if (t === N || t === K) {
        const offs = t === N ? N_OFF : K_OFF;
        for (let i = 0; i < 8; i++) {
          const to = sq + offs[i]; if (to & 0x88) continue;
          const tp = b[to];
          if (!tp) { if (!caps) out[n++] = mkMove(sq, to, 0, 0); }
          else if ((tp >> 3) === them) out[n++] = mkMove(sq, to, 0, F_CAP);
        }
        if (t === K && !caps) {
          if (us === 0 && sq === 4) {
            if ((this.castle & 1) && !b[5] && !b[6] && b[7] === R && !this.attacked(4, 1) && !this.attacked(5, 1) && !this.attacked(6, 1)) out[n++] = mkMove(4, 6, 0, F_CASTLE);
            if ((this.castle & 2) && !b[3] && !b[2] && !b[1] && b[0] === R && !this.attacked(4, 1) && !this.attacked(3, 1) && !this.attacked(2, 1)) out[n++] = mkMove(4, 2, 0, F_CASTLE);
          } else if (us === 1 && sq === 0x74) {
            if ((this.castle & 4) && !b[0x75] && !b[0x76] && b[0x77] === (R | 8) && !this.attacked(0x74, 0) && !this.attacked(0x75, 0) && !this.attacked(0x76, 0)) out[n++] = mkMove(0x74, 0x76, 0, F_CASTLE);
            if ((this.castle & 8) && !b[0x73] && !b[0x72] && !b[0x71] && b[0x70] === (R | 8) && !this.attacked(0x74, 0) && !this.attacked(0x73, 0) && !this.attacked(0x72, 0)) out[n++] = mkMove(0x74, 0x72, 0, F_CASTLE);
          }
        }
      } else {
        const offs = t === B ? B_OFF : t === R ? R_OFF : K_OFF;
        for (let i = 0; i < offs.length; i++) {
          const d = offs[i]; let to = sq + d;
          while (!(to & 0x88)) {
            const tp = b[to];
            if (!tp) { if (!caps) out[n++] = mkMove(sq, to, 0, 0); }
            else { if ((tp >> 3) === them) out[n++] = mkMove(sq, to, 0, F_CAP); break; }
            to += d;
          }
        }
      }
    }
    return n;
  }

  make(m) {
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
    const b = this.b, pc = b[from], us = this.turn, them = us ^ 1, u = this.ply;
    let cap = b[to];
    this.uMove[u] = m; this.uCastle[u] = this.castle; this.uEp[u] = this.ep; this.uHalf[u] = this.half; this.uH1[u] = this.h1; this.uH2[u] = this.h2;
    let h1 = this.h1, h2 = this.h2;
    if (this.ep >= 0) { h1 ^= ZE1[this.ep]; h2 ^= ZE2[this.ep]; }
    h1 ^= ZC1[this.castle]; h2 ^= ZC2[this.castle];
    h1 ^= ZP1[pc * 128 + from]; h2 ^= ZP2[pc * 128 + from];
    b[from] = 0;
    if (flag & F_EP) {
      const cs = to + (us === 0 ? -16 : 16); cap = b[cs]; b[cs] = 0;
      h1 ^= ZP1[cap * 128 + cs]; h2 ^= ZP2[cap * 128 + cs];
    } else if (cap) { h1 ^= ZP1[cap * 128 + to]; h2 ^= ZP2[cap * 128 + to]; }
    this.uCap[u] = cap;
    const np = promo ? (promo | (us << 3)) : pc;
    b[to] = np; h1 ^= ZP1[np * 128 + to]; h2 ^= ZP2[np * 128 + to];
    if ((pc & 7) === K) {
      this.king[us] = to;
      if (flag & F_CASTLE) {
        let rf, rt; if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        const rk = b[rf]; b[rf] = 0; b[rt] = rk;
        h1 ^= ZP1[rk * 128 + rf] ^ ZP1[rk * 128 + rt]; h2 ^= ZP2[rk * 128 + rf] ^ ZP2[rk * 128 + rt];
      }
    }
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    h1 ^= ZC1[this.castle]; h2 ^= ZC2[this.castle];
    this.ep = -1;
    if (flag & F_DOUBLE) {
      const e = (from + to) >> 1, ep = P | (them << 3);
      if ((!((to - 1) & 0x88) && b[to - 1] === ep) || (!((to + 1) & 0x88) && b[to + 1] === ep)) { this.ep = e; h1 ^= ZE1[e]; h2 ^= ZE2[e]; }
    }
    this.half = ((pc & 7) === P || cap) ? 0 : this.half + 1;
    if (us === 1) this.full++;
    this.turn = them; h1 ^= ZS1; h2 ^= ZS2;
    this.h1 = h1; this.h2 = h2;
    this.ply = u + 1; this.hist1[this.ply] = h1; this.hist2[this.ply] = h2;
  }
  unmake() {
    const u = --this.ply, m = this.uMove[u];
    const us = this.turn ^ 1; this.turn = us;
    this.castle = this.uCastle[u]; this.ep = this.uEp[u]; this.half = this.uHalf[u]; this.h1 = this.uH1[u]; this.h2 = this.uH2[u];
    if (us === 1) this.full--;
    if (m === 0) return; // null move
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
    const b = this.b;
    const pc = promo ? (P | (us << 3)) : b[to];
    b[from] = pc;
    if (flag & F_EP) { b[to] = 0; b[to + (us === 0 ? -16 : 16)] = this.uCap[u]; }
    else b[to] = this.uCap[u];
    if ((pc & 7) === K) {
      this.king[us] = from;
      if (flag & F_CASTLE) {
        let rf, rt; if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        b[rf] = b[rt]; b[rt] = 0;
      }
    }
  }
  makeNull() {
    const u = this.ply;
    this.uMove[u] = 0; this.uCastle[u] = this.castle; this.uEp[u] = this.ep; this.uHalf[u] = this.half; this.uH1[u] = this.h1; this.uH2[u] = this.h2;
    if (this.ep >= 0) { this.h1 ^= ZE1[this.ep]; this.h2 ^= ZE2[this.ep]; }
    this.ep = -1; this.half++;
    if (this.turn === 1) this.full++;
    this.turn ^= 1; this.h1 ^= ZS1; this.h2 ^= ZS2;
    this.ply = u + 1; this.hist1[this.ply] = this.h1; this.hist2[this.ply] = this.h2;
  }
  legal() {
    const buf = new Int32Array(256), n = this.gen(buf, false), out = [];
    const us = this.turn;
    for (let i = 0; i < n; i++) { this.make(buf[i]); if (!this.attacked(this.king[us], us ^ 1)) out.push(buf[i]); this.unmake(); }
    return out;
  }
  isRepetition(count) { // number of earlier occurrences needed (1 = any repeat)
    let c = 0; const lim = Math.max(0, this.ply - this.half);
    for (let i = this.ply - 2; i >= lim; i -= 2) if (this.hist1[i] === this.h1 && this.hist2[i] === this.h2) { if (++c >= count) return true; }
    return false;
  }
  insufficient() {
    let minors = 0, bishopsColor = -1, sameColorBishops = true;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const t = this.b[sq] & 7;
      if (!t || t === K) continue;
      if (t === P || t === R || t === Q) return false;
      minors++;
      if (t === B) { const c = ((sq >> 4) + (sq & 7)) & 1; if (bishopsColor < 0) bishopsColor = c; else if (c !== bishopsColor) sameColorBishops = false; }
      else sameColorBishops = false;
    }
    if (minors <= 1) return true;
    return sameColorBishops && minors > 0; // only bishops, all on one colour
  }

  // ---------- notation ----------
  san(m, legalList) {
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
    const pc = this.b[from], t = pc & 7;
    let s;
    if (flag & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
    else {
      s = '';
      if (t === P) {
        if (flag & F_CAP) s = 'abcdefgh'[from & 7] + 'x';
        s += sqName(to);
        if (promo) s += '=' + 'PNBRQK'[promo - 1];
      } else {
        s = 'PNBRQK'[t - 1];
        const list = legalList || this.legal();
        let amb = false, sameFile = false, sameRank = false;
        for (const o of list) {
          if (o === m) continue;
          const of = o & 127;
          if (((o >> 7) & 127) === to && this.b[of] === pc) { amb = true; if ((of & 7) === (from & 7)) sameFile = true; if ((of >> 4) === (from >> 4)) sameRank = true; }
        }
        if (amb) { if (!sameFile) s += 'abcdefgh'[from & 7]; else if (!sameRank) s += (from >> 4) + 1; else s += sqName(from); }
        if (flag & F_CAP) s += 'x';
        s += sqName(to);
      }
    }
    this.make(m);
    if (this.inCheck()) s += this.legal().length ? '+' : '#';
    this.unmake();
    return s;
  }
  uci(m) { const p = (m >> 14) & 7; return sqName(m & 127) + sqName((m >> 7) & 127) + (p ? '.pnbrqk'[p] : ''); }
  parseUci(str) {
    if (!str || str.length < 4) return 0;
    const from = sqParse(str.slice(0, 2)), to = sqParse(str.slice(2, 4));
    const pr = str.length > 4 ? '.pnbrqk'.indexOf(str[4].toLowerCase()) : 0;
    for (const m of this.legal()) if ((m & 127) === from && ((m >> 7) & 127) === to && (((m >> 14) & 7) === pr || (!pr && ((m >> 14) & 7) === Q))) return m;
    return 0;
  }
  parseSan(str) {
    const clean = s => s.replace(/[+#!?]/g, '').replace(/0/g, 'O').replace('=', '');
    const target = clean(str.trim());
    const list = this.legal();
    for (const m of list) if (clean(this.san(m, list)) === target) return m;
    // tolerate e.g. "exd5" vs "exd5 e.p." or promotions without '='
    return 0;
  }
  moveInfo(m) {
    return { from: sqName(m & 127), to: sqName((m >> 7) & 127), promo: (m >> 14) & 7 ? '.pnbrqk'[(m >> 14) & 7] : null, flag: m >> 17, piece: this.b[m & 127] };
  }
  pieceAt(sqStr) { const pc = this.b[sqParse(sqStr)]; return pc ? { type: '.pnbrqk'[pc & 7], color: pc & 8 ? 'b' : 'w' } : null; }
  material(color) { let s = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = this.b[sq]; if (pc && (pc >> 3) === color && (pc & 7) !== K) s += VAL[pc & 7]; } return s; }

  // ---------- evaluation (score from side to move) ----------
  evaluate() {
    const b = this.b;
    let mg0 = 0, mg1 = 0, eg0 = 0, eg1 = 0, phase = 0;
    const pf0 = [0, 0, 0, 0, 0, 0, 0, 0], pf1 = [0, 0, 0, 0, 0, 0, 0, 0];
    const wMin = [9, 9, 9, 9, 9, 9, 9, 9], bMax = [-1, -1, -1, -1, -1, -1, -1, -1];
    const wMax = [-1, -1, -1, -1, -1, -1, -1, -1], bMin = [9, 9, 9, 9, 9, 9, 9, 9];
    let bish0 = 0, bish1 = 0, npm0 = 0, npm1 = 0, pawns0 = 0, pawns1 = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq]; if (!pc) continue;
      const t = pc & 7;
      phase += PH[t];
      if (pc & 8) {
        mg1 += PST_MG[pc][sq]; eg1 += PST_EG[pc][sq];
        if (t === P) { const f = sq & 7, r = sq >> 4; pf1[f]++; pawns1++; if (r > bMax[f]) bMax[f] = r; if (r < bMin[f]) bMin[f] = r; }
        else if (t !== K) { npm1 += MGV[t]; if (t === B) bish1++; }
      } else {
        mg0 += PST_MG[pc][sq]; eg0 += PST_EG[pc][sq];
        if (t === P) { const f = sq & 7, r = sq >> 4; pf0[f]++; pawns0++; if (r < wMin[f]) wMin[f] = r; if (r > wMax[f]) wMax[f] = r; }
        else if (t !== K) { npm0 += MGV[t]; if (t === B) bish0++; }
      }
    }
    if (bish0 >= 2) { mg0 += 30; eg0 += 45; }
    if (bish1 >= 2) { mg1 += 30; eg1 += 45; }
    // second pass: pawns, rooks, mobility
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq]; if (!pc) continue;
      const t = pc & 7, f = sq & 7, r = sq >> 4, black = pc & 8;
      if (t === P) {
        if (!black) {
          if (pf0[f] > 1) { mg0 -= 8; eg0 -= 18; }
          if ((f === 0 || !pf0[f - 1]) && (f === 7 || !pf0[f + 1])) { mg0 -= 10; eg0 -= 14; }
          let passed = true;
          for (let ff = f - 1; ff <= f + 1; ff++) { if (ff < 0 || ff > 7) continue; if (bMax[ff] > r) { passed = false; break; } }
          if (passed && wMax[f] === r) {
            mg0 += PASS_MG[r]; eg0 += PASS_EG[r];
            if (!b[sq + 16]) eg0 += PASS_EG[r] >> 2;
            eg0 += (dist(this.king[1], sq + 16) - dist(this.king[0], sq + 16)) * 5 * (r > 3 ? 2 : 1);
          }
        } else {
          if (pf1[f] > 1) { mg1 -= 8; eg1 -= 18; }
          if ((f === 0 || !pf1[f - 1]) && (f === 7 || !pf1[f + 1])) { mg1 -= 10; eg1 -= 14; }
          let passed = true;
          for (let ff = f - 1; ff <= f + 1; ff++) { if (ff < 0 || ff > 7) continue; if (wMin[ff] < r) { passed = false; break; } }
          if (passed && bMin[f] === r) {
            const rr = 7 - r;
            mg1 += PASS_MG[rr]; eg1 += PASS_EG[rr];
            if (!b[sq - 16]) eg1 += PASS_EG[rr] >> 2;
            eg1 += (dist(this.king[0], sq - 16) - dist(this.king[1], sq - 16)) * 5 * (rr > 3 ? 2 : 1);
          }
        }
      } else if (t === N || t === B || t === R || t === Q) {
        const us = black ? 1 : 0;
        let mob = 0;
        if (t === N) { for (let i = 0; i < 8; i++) { const to = sq + N_OFF[i]; if (!(to & 0x88) && (!b[to] || (b[to] >> 3) !== us)) mob++; } }
        else {
          const offs = t === B ? B_OFF : t === R ? R_OFF : K_OFF;
          for (let i = 0; i < offs.length; i++) { const d = offs[i]; let to = sq + d; while (!(to & 0x88)) { const tp = b[to]; if (!tp) mob++; else { if ((tp >> 3) !== us) mob++; break; } to += d; } }
        }
        let m1, e1;
        if (t === N) { m1 = (mob - 4) * 4; e1 = (mob - 4) * 4; }
        else if (t === B) { m1 = (mob - 6) * 4; e1 = (mob - 6) * 5; }
        else if (t === R) { m1 = (mob - 7) * 2; e1 = (mob - 7) * 4; }
        else { m1 = (mob - 13); e1 = (mob - 13) * 2; }
        if (t === R) {
          const own = us ? pf1[f] : pf0[f], opp = us ? pf0[f] : pf1[f];
          if (!own) { if (!opp) { m1 += 25; e1 += 12; } else { m1 += 12; e1 += 6; } }
          if ((!us && r === 6) || (us && r === 1)) { m1 += 10; e1 += 20; }
        }
        if (us) { mg1 += m1; eg1 += e1; } else { mg0 += m1; eg0 += e1; }
      }
    }
    // king shelter (middlegame)
    for (let c = 0; c < 2; c++) {
      const ks = this.king[c], kf = ks & 7, kr = ks >> 4;
      let sh = 0;
      const dir = c === 0 ? 16 : -16, own = P | (c << 3);
      if ((c === 0 && kr <= 1) || (c === 1 && kr >= 6)) {
        for (let ff = kf - 1; ff <= kf + 1; ff++) {
          if (ff < 0 || ff > 7) continue;
          const s1 = ks - kf + ff + dir, s2 = s1 + dir;
          if (b[s1] === own) sh += 12; else if (!(s2 & 0x88) && b[s2] === own) sh += 6; else sh -= 10;
          const pfOwn = c ? pf1 : pf0; if (!pfOwn[ff]) sh -= 10;
        }
      } else sh -= 25;
      if (c) mg1 += sh; else mg0 += sh;
    }
    if (phase > 24) phase = 24;
    let mgS = mg0 - mg1, egS = eg0 - eg1;
    // mop-up for won endings without pawns on the losing side
    const total = npm0 + npm1;
    if (phase <= 8) {
      const w = (npm0 + pawns0 * 100) - (npm1 + pawns1 * 100);
      if (Math.abs(w) >= 300 && (w > 0 ? npm1 + pawns1 === 0 || (pawns1 === 0 && npm0 - npm1 >= 400) : npm0 + pawns0 === 0 || (pawns0 === 0 && npm1 - npm0 >= 400))) {
        const win = w > 0 ? 0 : 1, lk = this.king[win ^ 1], wk = this.king[win];
        let bonus = CMD[lk] * 25 + (14 - (Math.abs((lk >> 4) - (wk >> 4)) + Math.abs((lk & 7) - (wk & 7)))) * 10;
        egS += win === 0 ? bonus : -bonus;
      }
    }
    let score = ((mgS * phase) + (egS * (24 - phase))) / 24 | 0;
    // draw-ish scaling: no pawns and small advantage
    if (score > 0 && pawns0 === 0 && npm0 - npm1 < 400) score = npm0 <= 330 ? 0 : score >> 3;
    else if (score < 0 && pawns1 === 0 && npm1 - npm0 < 400) score = npm1 <= 330 ? 0 : score >> 3;
    void total;
    score = this.turn === 0 ? score : -score;
    return score + 12;
  }
}

// ---------- Search ----------
class Searcher {
  constructor(ttBits) {
    const size = 1 << (ttBits || 20);
    this.ttMask = size - 1;
    this.ttKey = new Int32Array(size); this.ttMove = new Int32Array(size); this.ttScore = new Int16Array(size);
    this.ttDepth = new Int8Array(size); this.ttFlag = new Int8Array(size);
    this.killers = new Int32Array(MAXPLY * 2);
    this.history = new Int32Array(16 * 128);
    this.moveBuf = []; this.scoreBuf = [];
    for (let i = 0; i < MAXPLY + 8; i++) { this.moveBuf.push(new Int32Array(256)); this.scoreBuf.push(new Int32Array(256)); }
    this.pvTable = []; for (let i = 0; i < MAXPLY + 8; i++) this.pvTable.push(new Int32Array(MAXPLY + 8));
    this.pvLen = new Int32Array(MAXPLY + 8);
  }
  clear() { this.ttKey.fill(0); this.ttMove.fill(0); this.ttDepth.fill(0); this.ttFlag.fill(0); this.history.fill(0); }
  ttProbe(pos) { const i = pos.h1 & this.ttMask; return this.ttKey[i] === pos.h2 && this.ttFlag[i] ? i : -1; }
  ttStore(pos, depth, flag, score, move, ply) {
    const i = pos.h1 & this.ttMask;
    if (this.ttKey[i] === pos.h2 && this.ttDepth[i] > depth && this.ttFlag[i] === 3 && flag !== 3) return;
    if (score > MATE - 1000) score += ply; else if (score < -MATE + 1000) score -= ply;
    this.ttKey[i] = pos.h2; this.ttDepth[i] = depth; this.ttFlag[i] = flag; this.ttScore[i] = score; this.ttMove[i] = move;
  }
  timeUp() {
    if (this.stopFlag) return true;
    if ((this.nodes & 1023) === 0) {
      if (Date.now() > this.deadline || (this.nodeLimit && this.nodes > this.nodeLimit)) this.stopFlag = true;
    }
    return this.stopFlag;
  }
  orderMoves(pos, moves, scores, n, ttMove, ply) {
    const b = pos.b;
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      if (m === ttMove) { scores[i] = 2000000; continue; }
      const flag = m >> 17, to = (m >> 7) & 127, from = m & 127;
      if (flag & F_CAP) { const victim = (flag & F_EP) ? P : (b[to] & 7); scores[i] = 1000000 + VAL[victim] * 10 - (b[from] & 7); }
      else if (flag & F_PROMO) scores[i] = 900000 + ((m >> 14) & 7);
      else if (m === this.killers[ply * 2]) scores[i] = 800000;
      else if (m === this.killers[ply * 2 + 1]) scores[i] = 700000;
      else scores[i] = this.history[b[from] * 128 + to];
    }
  }
  pick(moves, scores, n, i) {
    let best = i;
    for (let j = i + 1; j < n; j++) if (scores[j] > scores[best]) best = j;
    if (best !== i) { let t = moves[i]; moves[i] = moves[best]; moves[best] = t; t = scores[i]; scores[i] = scores[best]; scores[best] = t; }
    return moves[i];
  }
  qsearch(pos, alpha, beta, ply) {
    this.nodes++;
    if (this.timeUp()) return 0;
    if (ply > this.selDepth) this.selDepth = ply;
    const inCheck = pos.inCheck();
    if (ply >= MAXPLY) return pos.evaluate();
    let stand = -INF;
    if (!inCheck) {
      stand = pos.evaluate();
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
    }
    const moves = this.moveBuf[ply], scores = this.scoreBuf[ply];
    const n = pos.gen(moves, !inCheck);
    this.orderMoves(pos, moves, scores, n, 0, ply);
    const us = pos.turn;
    let legal = 0, best = stand;
    for (let i = 0; i < n; i++) {
      const m = this.pick(moves, scores, n, i);
      if (!inCheck) {
        const flag = m >> 17;
        const victim = (flag & F_EP) ? P : (pos.b[(m >> 7) & 127] & 7);
        if (!(flag & F_PROMO) && stand + VAL[victim] + 200 < alpha) continue;
      }
      pos.make(m);
      if (pos.attacked(pos.king[us], us ^ 1)) { pos.unmake(); continue; }
      legal++;
      const sc = -this.qsearch(pos, -beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stopFlag) return 0;
      if (sc > best) { best = sc; if (sc > alpha) { alpha = sc; if (sc >= beta) return sc; } }
    }
    if (inCheck && legal === 0) return -MATE + ply;
    return best;
  }
  negamax(pos, depth, alpha, beta, ply, doNull) {
    this.pvLen[ply] = ply;
    if (ply > 0) {
      if (pos.half >= 100 || pos.isRepetition(1) || pos.insufficient()) return 0;
      // mate distance pruning
      const ma = -MATE + ply, mb = MATE - ply - 1;
      if (ma > alpha) alpha = ma; if (mb < beta) beta = mb; if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.qsearch(pos, alpha, beta, ply);
    this.nodes++;
    if (this.timeUp()) return 0;
    if (ply >= MAXPLY) return pos.evaluate();
    const pvNode = beta - alpha > 1;
    let ttMove = 0;
    const ti = this.ttProbe(pos);
    if (ti >= 0) {
      ttMove = this.ttMove[ti];
      if (ply > 0 && this.ttDepth[ti] >= depth && !pvNode) {
        let s = this.ttScore[ti];
        if (s > MATE - 1000) s -= ply; else if (s < -MATE + 1000) s += ply;
        const fl = this.ttFlag[ti];
        if (fl === 3 || (fl === 2 && s >= beta) || (fl === 1 && s <= alpha)) return s;
      }
    }
    const us = pos.turn;
    if (!inCheck && !pvNode && ply > 0) {
      const ev = pos.evaluate();
      if (depth <= 3 && ev - 110 * depth >= beta && Math.abs(beta) < MATE - 1000) return ev;
      if (doNull && depth >= 3 && ev >= beta && this.hasPieces(pos, us)) {
        const Rr = depth >= 6 ? 3 : 2;
        pos.makeNull();
        const s = -this.negamax(pos, depth - 1 - Rr, -beta, -beta + 1, ply + 1, false);
        pos.unmake();
        if (this.stopFlag) return 0;
        if (s >= beta) return s > MATE - 1000 ? beta : s;
      }
    }
    const moves = this.moveBuf[ply], scores = this.scoreBuf[ply];
    const n = pos.gen(moves, false);
    this.orderMoves(pos, moves, scores, n, ttMove, ply);
    let legal = 0, best = -INF, bestMove = 0; const a0 = alpha;
    for (let i = 0; i < n; i++) {
      const m = this.pick(moves, scores, n, i);
      pos.make(m);
      if (pos.attacked(pos.king[us], us ^ 1)) { pos.unmake(); continue; }
      legal++;
      this.pvLen[ply + 1] = ply + 1;
      const flag = m >> 17, quiet = !(flag & (F_CAP | F_PROMO));
      let sc;
      if (legal === 1) sc = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let red = 0;
        if (depth >= 3 && legal > 3 && quiet && !inCheck && !pos.inCheck()) {
          red = 1 + (legal > 8 ? 1 : 0) + (depth > 6 ? 1 : 0);
          if (pvNode) red--;
          if (red > depth - 2) red = depth - 2; if (red < 0) red = 0;
        }
        sc = -this.negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && red) sc = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && sc < beta) sc = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stopFlag) return 0;
      if (sc > best) {
        best = sc; bestMove = m;
        if (sc > alpha) {
          alpha = sc;
          const pv = this.pvTable[ply], child = this.pvTable[ply + 1];
          pv[ply] = m; for (let j = ply + 1; j < this.pvLen[ply + 1]; j++) pv[j] = child[j];
          this.pvLen[ply] = Math.max(this.pvLen[ply + 1], ply + 1);
          if (sc >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
              const hi = pos.b[m & 127] * 128 + ((m >> 7) & 127);
              this.history[hi] += depth * depth; if (this.history[hi] > 600000) for (let k = 0; k < this.history.length; k++) this.history[k] >>= 1;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;
    this.ttStore(pos, depth, best >= beta ? 2 : best > a0 ? 3 : 1, best, bestMove, ply);
    return best;
  }
  hasPieces(pos, c) {
    for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const pc = pos.b[sq]; if (pc && (pc >> 3) === c) { const t = pc & 7; if (t !== P && t !== K) return true; } }
    return false;
  }
  // Iterative deepening. Returns {move, score, depth, pv, nodes}
  search(pos, opt) {
    opt = opt || {};
    const maxDepth = opt.depth || 64, ms = opt.time || 1000;
    this.deadline = Date.now() + ms; this.nodeLimit = opt.nodes || 0; this.stopFlag = false; this.nodes = 0;
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;
    const root = pos.legal();
    if (!root.length) return { move: 0, score: pos.inCheck() ? -MATE : 0, depth: 0, pv: [], nodes: 0 };
    let best = { move: root[0], score: 0, depth: 0, pv: [root[0]] };
    let prev = 0;
    for (let d = 1; d <= maxDepth; d++) {
      this.selDepth = 0;
      let alpha = -INF, beta = INF, delta = 40, sc;
      if (d >= 4) { alpha = prev - delta; beta = prev + delta; }
      while (true) {
        sc = this.negamax(pos, d, alpha, beta, 0, true);
        if (this.stopFlag) break;
        if (sc <= alpha) { alpha = Math.max(-INF, alpha - delta * 3); delta *= 3; }
        else if (sc >= beta) { beta = Math.min(INF, beta + delta * 3); delta *= 3; }
        else break;
        if (delta > 1500) { alpha = -INF; beta = INF; }
      }
      if (this.stopFlag && d > 1) break;
      const pv = Array.from(this.pvTable[0].slice(0, this.pvLen[0]));
      if (pv.length && pv[0]) best = { move: pv[0], score: sc, depth: d, pv };
      prev = sc;
      if (opt.onIter) opt.onIter(best);
      if (Math.abs(sc) > MATE - 200 && d > 4 && (MATE - Math.abs(sc)) < d) break;
      if (Date.now() > this.deadline - ms * 0.45 && !opt.depth) break; // not enough time for next iteration
      if (root.length === 1 && d >= 3 && !opt.full) break;
    }
    best.nodes = this.nodes;
    return best;
  }
  // score every root move with a fixed-depth search (used for human-like weakened play)
  scoreRoot(pos, depth, ms) {
    this.deadline = Date.now() + (ms || 3000); this.nodeLimit = 0; this.stopFlag = false; this.nodes = 0;
    const root = pos.legal(), us = pos.turn, out = [];
    for (const m of root) {
      pos.make(m);
      let sc;
      if (depth <= 1) sc = -this.qsearch(pos, -INF, INF, 1);
      else sc = -this.negamax(pos, depth - 1, -INF, INF, 1, true);
      pos.unmake();
      if (this.stopFlag) sc = -this.quickEval(pos, m);
      out.push({ move: m, score: sc });
    }
    void us;
    out.sort((a, b) => b.score - a.score);
    return out;
  }
  quickEval(pos, m) { pos.make(m); const e = pos.evaluate(); pos.unmake(); return e; }
}

// ---------- bot strength model ----------
function botParams(elo) {
  elo = Math.max(250, Math.min(2600, elo));
  const tbl = [
    [250, 1, 320, 0.40], [400, 1, 260, 0.30], [600, 1, 190, 0.22], [800, 2, 140, 0.15], [1000, 2, 100, 0.10],
    [1200, 3, 70, 0.065], [1400, 3, 45, 0.04], [1600, 4, 28, 0.025], [1800, 5, 16, 0.012], [2000, 6, 8, 0.005],
    [2200, 8, 3, 0.0], [2600, 20, 0, 0.0]
  ];
  let i = 0; while (i < tbl.length - 2 && tbl[i + 1][0] <= elo) i++;
  const a = tbl[i], c = tbl[i + 1], t = Math.min(1, Math.max(0, (elo - a[0]) / (c[0] - a[0])));
  const lerp = (x, y) => x + (y - x) * t;
  return { depth: Math.round(lerp(a[1], c[1])), temp: lerp(a[2], c[2]), blunder: lerp(a[3], c[3]), time: elo >= 2100 ? 1500 + (elo - 2100) * 4 : 600 };
}
function chooseBotMove(pos, searcher, elo, rng) {
  rng = rng || Math.random;
  const p = botParams(elo);
  if (elo >= 2150) {
    const r = searcher.search(pos, { time: p.time });
    return { move: r.move, score: r.score, depth: r.depth };
  }
  const scored = searcher.scoreRoot(pos, p.depth, 4000);
  if (!scored.length) return { move: 0, score: 0 };
  const bestScore = scored[0].score;
  // never miss a forced mate in 1 above 900, always take mate for strong bots
  if (bestScore > MATE - 10 && elo >= 900) return { move: scored[0].move, score: bestScore };
  if (rng() < p.blunder && scored.length > 1) {
    // a "human" blunder: a plausible-looking move that loses something
    const pool = scored.filter(s => s.score > -MATE + 1000);
    const pick = pool[Math.floor(rng() * pool.length)] || scored[scored.length - 1];
    return { move: pick.move, score: pick.score, blunder: true };
  }
  const temp = Math.max(1, p.temp);
  let total = 0; const w = scored.map(s => { const v = Math.exp(Math.max(-30, (s.score - bestScore) / temp)); total += v; return v; });
  let x = rng() * total;
  for (let i = 0; i < scored.length; i++) { x -= w[i]; if (x <= 0) return { move: scored[i].move, score: scored[i].score }; }
  return { move: scored[0].move, score: bestScore };
}

// ---------- helpers for analysis ----------
function winPct(cp) { return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1); }
function moveAccuracy(winBefore, winAfter) { const d = Math.max(0, winBefore - winAfter); return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * d) - 3.1669)); }
function eloFromAcpl(acpl) { return Math.round(Math.max(250, Math.min(2500, 3000 * Math.exp(-0.0105 * acpl)))); }
function scoreToText(sc) {
  if (sc > MATE - 1000) return '#' + Math.ceil((MATE - sc) / 2);
  if (sc < -MATE + 1000) return '#-' + Math.ceil((MATE + sc) / 2);
  return (sc >= 0 ? '+' : '') + (sc / 100).toFixed(2);
}

const api = { Position, Searcher, START_FEN, MATE, INF, VAL, sqName, sqParse, botParams, chooseBotMove, winPct, moveAccuracy, eloFromAcpl, scoreToText, F_CAP, F_EP, F_CASTLE, F_DOUBLE, F_PROMO };

// ---------- request handler (worker and main-thread fallback) ----------
function buildPos(fen, moves) { const p = new Position(fen); for (const u of moves || []) { const m = p.parseUci(u); if (!m) break; p.make(m); } return p; }
function handle(d, S) {
  if (d.cmd === 'bot') {
    const p = buildPos(d.fen, d.moves);
    const r = chooseBotMove(p, S, d.elo);
    return { id: d.id, move: r.move ? p.uci(r.move) : null, san: r.move ? p.san(r.move) : null, score: r.score };
  }
  if (d.cmd === 'analyze') {
    const p = buildPos(d.fen, d.moves);
    const legal = p.legal();
    if (!legal.length) return { id: d.id, best: null, score: p.inCheck() ? -MATE : 0, depth: 0, pv: [], pvSan: [], turn: p.turn, over: true };
    const r = S.search(p, { time: d.time || 800, depth: d.depth });
    const pvU = [], pvS = []; const q = buildPos(d.fen, d.moves);
    for (const m of r.pv) { const mm = q.parseUci(q.uci(m)); if (!mm) break; pvS.push(q.san(mm)); pvU.push(q.uci(mm)); q.make(mm); }
    return { id: d.id, best: r.move ? p.uci(r.move) : null, bestSan: r.move ? p.san(r.move) : null, score: r.score, depth: r.depth, pv: pvU, pvSan: pvS, turn: p.turn };
  }
  if (d.cmd === 'clear') { S.clear(); return { id: d.id }; }
  return { id: d.id, error: 'unknown command' };
}
api.handle = handle; api.buildPos = buildPos;
const isWorker = typeof self !== 'undefined' && typeof importScripts === 'function' && typeof document === 'undefined';
if (isWorker) {
  const S = new Searcher(20);
  self.onmessage = function (e) {
    try { self.postMessage(handle(e.data, S)); }
    catch (err) { self.postMessage({ id: e.data.id, error: String(err && err.stack || err) }); }
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ChessCore = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
