/* ChessMind views */
(function () {
'use strict';
const C = window.ChessCore, CM = window.CM, $ = CM.$, $$ = CM.$$, esc = CM.esc;
const START = C.START_FEN;
const view = () => $('#view');
let cleanup = [];
function onLeave(fn) { cleanup.push(fn); }
function leave() { cleanup.forEach(f => { try { f(); } catch (e) { } }); cleanup = []; }
function toast(msg, ms) { const t = $('#toast'); t.innerHTML = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms || 2600); }
function modal(html, opts) {
  const m = $('#modal'); m.innerHTML = '<div class="modal-card">' + html + '</div>'; m.classList.remove('hidden');
  const close = () => m.classList.add('hidden');
  if (!(opts && opts.sticky)) m.onclick = e => { if (e.target === m) close(); };
  else m.onclick = null;
  $$('[data-close]', m).forEach(b => b.onclick = close);
  return { el: m, close };
}
CM.toast = toast; CM.modal = modal;
function ratingText() { const r = CM.store.d.rating; return r == null ? '—' : String(r); }
function fmtDate(t) { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function stars(n) { return '<span class="stars">' + [1, 2, 3].map(i => i <= n ? '★' : '☆').join('') + '</span>'; }
function levelName(r) { return r < 600 ? 'Beginner' : r < 1000 ? 'Novice' : r < 1400 ? 'Intermediate' : r < 1800 ? 'Advanced' : r < 2100 ? 'Expert' : 'Master'; }
function updateMe() {
  const d = CM.store.d;
  $('#me').innerHTML = d.rating == null ? '<button class="btn sm primary" data-go="placement">Find my level</button>' :
    `<span class="rt" title="Your rating">${d.rating}${d.ratedGames < 5 ? '?' : ''}</span><span class="rl">${levelName(d.rating)}</span>`;
  bindGo($('#me'));
}
function bindGo(root) { $$('[data-go]', root).forEach(b => b.onclick = () => go(b.dataset.go)); }
function go(route) { if (location.hash === '#/' + route) router(); else location.hash = '#/' + route; }
CM.go = go;
function boardTheme(el) { el.dataset.theme = CM.store.d.settings.board; }
function makeBoard(el, opts) { boardTheme(el.closest('.board-wrap') || el); const b = new Board(el, Object.assign({ coords: CM.store.d.settings.coords, autoQueen: CM.store.d.settings.autoQueen }, opts)); window.__board = b; return b; }
function capturedHtml(fen, color) {
  const md = CM.materialDiff(fen); const list = color === 'w' ? md.w : md.b; const img = window.PIECE_IMG;
  const opp = color === 'w' ? 'b' : 'w';
  let s = list.map(t => `<i style="background-image:url(${img[opp + '.pnbrqk'[t]]})"></i>`).join('');
  const diff = color === 'w' ? md.diff : -md.diff; if (diff > 0) s += `<em>+${diff}</em>`;
  return s;
}

// =====================================================================
// HOME
function home() {
  const d = CM.store.d;
  if (d.rating == null) {
    view().innerHTML = `
    <section class="hero">
      <div class="hero-txt">
        <h1>Learn chess the right way.</h1>
        <p class="lead">Start with one game against a coach bot that <b>adapts its strength to you while you play</b>. When the game ends, the level it settled on becomes your starting rating and your personal learning path.</p>
        <ul class="ticks"><li>${CM.lessons.length} lessons: rules, tactics, checkmate patterns, strategy, endgames</li><li>${CM.openings.length - 18} openings + 18 classic traps, with study and drill modes</li><li>${window.PUZZLES.length} verified puzzles, rated trainer and Puzzle Rush</li><li>A coach that explains your mistakes in plain language</li></ul>
        <div class="row"><button class="btn primary lg" data-go="placement">Play the placement match</button><button class="btn ghost lg" data-go="learn">Browse lessons first</button></div>
      </div>
      <div class="hero-board board-wrap"><div class="board" id="heroBoard"></div></div>
    </section>`;
    const b = makeBoard($('#heroBoard'), {}); b.setFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'); b.setArrows(['h5f7r', 'c4f7r']); b.setMarks({ f7: 'r' });
    bindGo(view()); return;
  }
  const rec = CM.recommended(4);
  const due = CM.dueMistakes().length;
  const games = d.games.slice(-4).reverse();
  const doneN = Object.keys(d.lessons).length;
  view().innerHTML = `
  <section class="dash">
    <div class="card big">
      <div class="kpis">
        <div><small>Rating</small><b>${d.rating}</b><span>${levelName(d.rating)}</span></div>
        <div><small>Puzzle rating</small><b>${d.puzzleRating || '—'}</b><span>${d.puzzleGames} solved</span></div>
        <div><small>Lessons done</small><b>${doneN}</b><span>of ${CM.lessons.length}</span></div>
        <div><small>Mistakes to review</small><b>${due}</b><span>${d.mistakes.length} in deck</span></div>
      </div>
      <div class="spark" id="spark"></div>
    </div>
    <h2>Continue learning</h2>
    <div class="grid cards">${rec.map(lessonCard).join('')}</div>
    <h2>Train</h2>
    <div class="grid tiles">
      <button class="tile" data-go="play"><span>♟</span><b>Play a bot</b><small>Rated or with a coach</small></button>
      <button class="tile" data-go="puzzles"><span>🧩</span><b>Rated puzzles</b><small>${window.PUZZLES.length} puzzles</small></button>
      <button class="tile" data-go="puzzles/rush"><span>⚡</span><b>Puzzle Rush</b><small>Best: ${d.rushBest}</small></button>
      <button class="tile" data-go="puzzles/mistakes"><span>🔁</span><b>My mistakes</b><small>${due} due now</small></button>
      <button class="tile" data-go="openings"><span>📖</span><b>Openings</b><small>Study, drill, explore</small></button>
      <button class="tile" data-go="review"><span>🔍</span><b>Analyze a game</b><small>Paste any PGN</small></button>
    </div>
    ${games.length ? `<h2>Recent games</h2><div class="list">${games.map(gameRow).join('')}</div>` : ''}
  </section>`;
  bindGo(view()); bindLessonCards(view()); bindGameRows(view());
  spark($('#spark'), d.ratingHist.map(x => x.r));
}
function spark(el, vals) {
  if (!el) return; if (vals.length < 2) { el.innerHTML = '<p class="muted">Play rated games to see your rating graph.</p>'; return; }
  const W = 600, H = 90, mn = Math.min(...vals) - 20, mx = Math.max(...vals) + 20;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * W, H - (v - mn) / (mx - mn) * H]);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/></svg><div class="spark-l"><span>${vals[0]}</span><span>${vals[vals.length - 1]}</span></div>`;
}
function lessonCard(l) {
  const p = CM.store.d.lessons[l.id];
  const icon = { basics: '♙', principles: '🏁', mates: '#', tactics: '⚔', openings: '📖', strategy: '♜', endgames: '♔', workouts: '🧩' }[l.cat];
  return `<button class="lcard ${p ? 'done' : ''}" data-lesson="${l.id}"><span class="lic">${icon}</span><span class="lt">${esc(l.title)}</span><span class="lm"><span class="lvl">${l.level}</span>${p ? stars(p.stars) : `<span class="muted">${l.steps.length} steps</span>`}</span></button>`;
}
function bindLessonCards(root) { $$('[data-lesson]', root).forEach(b => b.onclick = () => go('lesson/' + b.dataset.lesson)); }
function gameRow(g) {
  const res = g.result === 'win' ? '<span class="res w">Won</span>' : g.result === 'loss' ? '<span class="res l">Lost</span>' : '<span class="res d">Draw</span>';
  return `<button class="grow" data-game="${g.id}">${res}<span>${g.mode === 'placement' ? 'Placement match' : g.mode === 'rated' ? 'Rated' : g.mode === 'import' ? 'Imported' : 'Coach game'} vs ${esc(g.opp || 'bot')}</span><span class="muted">${g.moves.length} plies · ${fmtDate(g.t)}</span>${g.acc != null ? `<span class="acc">${g.acc}%</span>` : ''}</button>`;
}
function bindGameRows(root) { $$('[data-game]', root).forEach(b => b.onclick = () => go('report/' + b.dataset.game)); }

// =====================================================================
// PLACEMENT INTRO
function placementIntro() {
  view().innerHTML = `<section class="narrow card">
    <h1>Placement match</h1>
    <p>You will play one full game against the <b>Adaptive Coach</b>. After every move, the engine measures how accurate your move was and adjusts the bot's strength up or down. When the game ends, the level it settled on is your starting rating — and your lessons start there.</p>
    <p class="muted">Tip: play normally, take your time, and play the game to the end (or press "Finish" after move 15).</p>
    <h3>How much chess have you played?</h3>
    <div class="choices" id="exp">
      <button data-v="500">I just learned the rules</button>
      <button data-v="850" class="on">I play casually sometimes</button>
      <button data-v="1250">I play online regularly</button>
      <button data-v="1650">I play in a club / tournaments</button>
      <button data-v="2000">I'm a strong player</button>
    </div>
    <h3>Your color</h3>
    <div class="choices" id="col"><button data-v="w" class="on">White</button><button data-v="b">Black</button><button data-v="r">Random</button></div>
    <div class="row end"><button class="btn primary lg" id="startPl">Start the game</button></div>
  </section>`;
  let prior = 850, col = 'w';
  $$('#exp button').forEach(b => b.onclick = () => { $$('#exp button').forEach(x => x.classList.remove('on')); b.classList.add('on'); prior = +b.dataset.v; });
  $$('#col button').forEach(b => b.onclick = () => { $$('#col button').forEach(x => x.classList.remove('on')); b.classList.add('on'); col = b.dataset.v; });
  $('#startPl').onclick = () => { const c = col === 'r' ? (Math.random() < .5 ? 'w' : 'b') : col; playView({ mode: 'placement', elo: prior, prior, color: c }); };
}

// =====================================================================
// PLAY SETUP
function playSetup(arg) {
  const d = CM.store.d; let elo = d.rating || 800, col = 'w', mode = 'rated';
  const pre = arg && arg.startsWith('o-') ? CM.openingById[arg] : null;
  if (pre) mode = 'casual';
  view().innerHTML = `<section class="narrow card">
    <h1>Play a bot</h1>
    ${pre ? `<p class="pill">Starting from: <b>${esc(pre.family)}: ${esc(pre.variation)}</b></p>` : ''}
    <h3>Mode</h3>
    <div class="choices" id="mode"><button data-v="rated" class="${mode === 'rated' ? 'on' : ''}">Rated — counts for your rating</button><button data-v="casual" class="${mode === 'casual' ? 'on' : ''}">Coach — hints, takebacks, live feedback</button></div>
    <h3>Opponent strength: <b id="eloV"></b></h3>
    <input type="range" id="elo" min="250" max="2500" step="50" value="${elo}">
    <div class="row sm"><button class="btn sm" id="eqBtn">Match my rating (${d.rating || '—'})</button></div>
    <h3>Your color</h3>
    <div class="choices" id="col"><button data-v="w" class="on">White</button><button data-v="b">Black</button><button data-v="r">Random</button></div>
    <div class="row end"><button class="btn primary lg" id="go">Play</button></div>
  </section>`;
  const show = () => { const b = CM.botFor(elo); $('#eloV').innerHTML = `${b.icon} ${b.name} · ${elo}`; };
  show();
  $('#elo').oninput = e => { elo = +e.target.value; show(); };
  $('#eqBtn').onclick = () => { elo = Math.round((d.rating || 800) / 50) * 50; $('#elo').value = elo; show(); };
  if (pre) { col = pre.side; $$('#col button').forEach(x => x.classList.toggle('on', x.dataset.v === col)); }
  $$('#mode button').forEach(b => b.onclick = () => { $$('#mode button').forEach(x => x.classList.remove('on')); b.classList.add('on'); mode = b.dataset.v; });
  $$('#col button').forEach(b => b.onclick = () => { $$('#col button').forEach(x => x.classList.remove('on')); b.classList.add('on'); col = b.dataset.v; });
  $('#go').onclick = () => playView({ mode, elo, color: col === 'r' ? (Math.random() < .5 ? 'w' : 'b') : col, moves: pre ? pre.uci : null, openingName: pre ? pre.family + ': ' + pre.variation : null });
}

// =====================================================================
// PLAY VIEW
function playView(o) {
  leave();
  const mode = o.mode, user = o.color, botColor = user === 'w' ? 'b' : 'w';
  let botElo = o.elo;
  const g = new CM.Game(o.fen || START);
  if (o.moves) o.moves.forEach(u => g.playUci(u));
  const startPly = g.hist.length;
  const coachOn = mode === 'casual';
  const A = {}; // ply -> analysis promise
  const EX = {}; // ply -> explanation of move made at ply
  let gen = 0, over = false, thinking = false, viewPly = null;
  // placement state
  let lossSum = 0, lossW = 0; const priorW = 3; const prior = o.prior || botElo;
  let est = prior;
  const estHist = [];
  const bot = mode === 'placement' ? { name: 'Adaptive Coach', icon: '🎓' } : CM.botFor(botElo);

  view().innerHTML = `
  <section class="play">
    <div class="board-col">
      <div class="player top"><span class="av">${bot.icon}</span><span class="nm">${esc(bot.name)}</span><span class="pe" id="botElo"></span><span class="cap" id="capTop"></span><span class="think" id="think"></span></div>
      <div class="board-wrap"><div class="evalbar ${coachOn ? '' : 'hidden'}" id="evalbar"><div id="evalfill"></div><span id="evaltxt"></span></div><div class="board" id="bd"></div></div>
      <div class="player bottom"><span class="av">🙂</span><span class="nm">You</span><span class="pe">${mode === 'placement' ? 'placement' : (CM.store.d.rating || '')}</span><span class="cap" id="capBot"></span></div>
    </div>
    <aside class="panel">
      <div class="ptitle"><b>${mode === 'placement' ? 'Placement match' : mode === 'rated' ? 'Rated game' : 'Coach game'}</b><span id="opening" class="muted"></span></div>
      ${mode === 'placement' ? `<div class="meter"><div class="meter-l"><small>Bot is playing at</small><b id="mBot">${botElo}</b></div><div class="meter-l"><small>Your estimated level</small><b id="mEst">${est}</b></div><div class="mbar"><div id="mFill"></div></div><p class="muted sm" id="mNote">The bot adapts after every move you make.</p></div>` : ''}
      <div class="coach ${coachOn ? '' : 'hidden'}" id="coach"><div class="coach-h">🎓 Coach</div><div id="coachTxt" class="muted">Make a move. I'll tell you how good it was.</div></div>
      <div class="moves" id="moves"></div>
      <div class="ctrls">
        <button class="btn sm" id="bFlip" title="Flip board">⇅</button>
        <button class="btn sm" id="bBack" title="Previous">◀</button><button class="btn sm" id="bFwd" title="Next">▶</button>
        ${coachOn ? '<button class="btn sm" id="bHint">💡 Hint</button><button class="btn sm" id="bThreat">⚠ Threat</button><button class="btn sm" id="bUndo">↶ Takeback</button>' : ''}
        ${mode === 'placement' ? '<button class="btn sm" id="bFinish" disabled>Finish</button>' : ''}
        <button class="btn sm danger" id="bResign">Resign</button>
      </div>
      <div id="post" class="post"></div>
    </aside>
  </section>`;
  const board = makeBoard($('#bd'), { onMove: userMove });
  board.setOrientation(user);
  const moves = () => g.moves();
  function analysis(ply) {
    if (!A[ply]) { const mv = moves().slice(0, ply); A[ply] = CM.coachEngine().analyze(g.start, mv, 650); }
    return A[ply];
  }
  function sync(anim) {
    const ply = viewPly == null ? g.hist.length : viewPly;
    const fen = ply === 0 ? g.start : g.hist[ply - 1].fen;
    const last = ply ? g.hist[ply - 1] : null;
    board.setFen(fen, anim && last ? { from: last.from, to: last.to, rookFrom: last.rookFrom, rookTo: last.rookTo } : null);
    board.setLastMove(last ? last.from : null, last ? last.to : null);
    const p = new C.Position(fen); board.setCheck(p.inCheck() ? C.sqName(p.king[p.turn]) : null);
    const live = viewPly == null;
    if (!over && live && g.turn === user && !thinking) board.setMovable(user, g.dests()); else board.disable();
    $('#capTop').innerHTML = capturedHtml(fen, botColor); $('#capBot').innerHTML = capturedHtml(fen, user);
    renderMoves();
    const op = CM.detectOpening(moves().slice(0, ply)); $('#opening').textContent = o.openingName && ply <= startPly ? o.openingName : op ? op.name : '';
    if (coachOn) updateEval(ply);
    $('#botElo').textContent = mode === 'placement' ? '~' + botElo : botElo;
  }
  function updateEval(ply) {
    analysis(ply).then(a => {
      if ((viewPly == null ? g.hist.length : viewPly) !== ply) return;
      const s = a.turn === 0 ? a.score : -a.score; const cp = CM.cpOfClamped(s);
      const pct = CM.winPct(cp);
      $('#evalfill').style.height = (100 - pct) + '%';
      $('#evaltxt').textContent = C.scoreToText(s).replace('+', '');
      $('#evalbar').classList.toggle('flip', user === 'b');
    });
  }
  function renderMoves() {
    const el = $('#moves'); let h = ''; const cur = viewPly == null ? g.hist.length : viewPly;
    const p0 = new C.Position(g.start); let n = p0.full, w = p0.turn === 0;
    g.hist.forEach((m, i) => {
      if (w) h += `<span class="mn">${n}.</span>`; else if (i === 0) h += `<span class="mn">${n}…</span><span></span>`;
      const ex = EX[i]; const cls = ex ? ex.cls.k : '';
      h += `<span class="mv ${i + 1 === cur ? 'cur' : ''} ${cls}" data-i="${i + 1}">${esc(m.san)}${ex && ['inaccuracy', 'mistake', 'blunder', 'best'].includes(cls) && coachOrDone() ? `<sup>${ex.cls.sym}</sup>` : ''}</span>`;
      if (!w) n++; w = !w;
    });
    el.innerHTML = h; el.scrollTop = el.scrollHeight;
    $$('.mv', el).forEach(s => s.onclick = () => { viewPly = +s.dataset.i === g.hist.length ? null : +s.dataset.i; sync(); });
  }
  const coachOrDone = () => coachOn || over;
  async function userMove(from, to, promo) {
    if (over || thinking || g.turn !== user || viewPly != null) return;
    const m = g.find(from, to, promo); if (!m) return;
    const ply = g.hist.length;
    const rec = g.play(m);
    CM.sound(rec.capture ? 'capture' : rec.check ? 'check' : 'move');
    sync(true);
    const myGen = gen;
    // evaluate the move (both positions)
    Promise.all([analysis(ply), analysis(ply + 1)]).then(([a, b]) => {
      if (myGen !== gen) return;
      const ex = CM.explain(g.start, moves().slice(0, ply), rec.uci, a, b);
      const book = CM.isBook(moves().slice(0, ply + 1));
      if (book) { ex.cls = { k: 'book', name: 'Book', sym: '📖' }; ex.text = 'Book move — this is opening theory.'; }
      EX[ply] = ex;
      if (mode === 'placement') placementUpdate(ex, book, a);
      if (coachOn) showCoach(ex);
      renderMoves();
    });
    if (checkEnd()) return;
    botTurn();
  }
  function showCoach(ex) {
    const c = ex.cls;
    $('#coachTxt').innerHTML = `<div class="cls ${c.k}"><b>${esc(ex.san)}</b> — ${c.name} ${c.sym}</div><div>${ex.text}</div>`;
    $('#coachTxt').classList.remove('muted');
    if (['mistake', 'blunder'].includes(c.k)) CM.sound('bad');
  }
  function placementUpdate(ex, book, a) {
    const cpB = Math.abs(CM.cpOfClamped(a.score));
    let w = 1; if (book) w = 0.35; if (cpB > 900) w = 0.3;
    const loss = Math.min(45, ex.loss);
    lossSum += loss * w; lossW += w;
    const priorLoss = CM.lossFromElo(prior);
    const avg = (priorLoss * priorW + lossSum) / (priorW + lossW);
    est = CM.eloFromLoss(avg);
    // bot follows the estimate, moving at most 150 points per move
    const target = est; botElo = Math.round(Math.max(250, Math.min(2500, botElo + Math.max(-150, Math.min(150, target - botElo)))));
    estHist.push(est);
    $('#mBot').textContent = botElo; $('#mEst').textContent = est; $('#botElo').textContent = '~' + botElo;
    $('#mFill').style.width = Math.max(3, Math.min(100, (est - 250) / 22.5)) + '%';
    $('#mNote').textContent = ex.cls.k === 'blunder' ? 'Ouch — that one cost a lot. The bot eases off.' : ex.cls.k === 'best' || ex.cls.k === 'excellent' ? 'Strong move! The bot steps up.' : 'The bot adapts after every move you make.';
    const fin = $('#bFinish'); if (fin) fin.disabled = Object.keys(EX).length < 15;
  }
  async function botTurn() {
    thinking = true; sync(); $('#think').textContent = 'thinking…';
    const myGen = gen; const t0 = Date.now();
    const r = await CM.botEngine().bot(g.start, moves(), botElo);
    const wait = Math.max(0, (botElo < 1200 ? 500 : 350) - (Date.now() - t0)); if (wait) await CM.sleep(wait);
    if (myGen !== gen || over) return;
    thinking = false; $('#think').textContent = '';
    if (!r || !r.move) { checkEnd(); return; }
    const rec = g.playUci(r.move);
    CM.sound(rec.capture ? 'capture' : rec.check ? 'check' : 'move');
    sync(true);
    if (checkEnd()) return;
    analysis(g.hist.length); // prefetch for hints and coach
  }
  function checkEnd() {
    const st = g.status(); if (!st.over) return false;
    finish(st.winner === null ? 'draw' : st.winner === user ? 'win' : 'loss', st.reason); return true;
  }
  async function finish(result, reason) {
    if (over) return; over = true; gen++; thinking = false; sync();
    CM.sound('end');
    const d = CM.store.d;
    const rec = { id: 'g' + Date.now(), t: Date.now(), mode, userColor: user, opp: mode === 'placement' ? 'Adaptive Coach' : bot.name + ' (' + botElo + ')', botElo, result, reason, start: g.start, moves: moves(), sans: g.hist.map(x => x.san), startPly };
    rec.pgn = g.pgn({ White: user === 'w' ? 'You' : rec.opp, Black: user === 'b' ? 'You' : rec.opp, Result: result === 'draw' ? '1/2-1/2' : (result === 'win') === (user === 'w') ? '1-0' : '0-1' });
    let extra = '';
    if (mode === 'placement') {
      const userMoves = Object.keys(EX).length;
      // wait for outstanding analyses to finish to include the last move
      await CM.sleep(50);
      let final = Math.round(est * 0.75 + botElo * 0.25 + (result === 'win' ? 100 : result === 'loss' ? -60 : 0));
      if (result === 'win') final = Math.max(final, botElo + 50);
      final = Math.max(300, Math.min(2400, Math.round(final / 10) * 10));
      d.rating = final; d.placement = { t: Date.now(), rating: final, moves: userMoves, result }; d.ratedGames = 0;
      d.ratingHist.push({ t: Date.now(), r: final, src: 'placement' });
      if (d.puzzleRating == null) d.puzzleRating = final;
      rec.placed = final;
      CM.store.save(); updateMe();
      extra = `<div class="placed"><small>Your starting level</small><b>${final}</b><span>${levelName(final)}</span></div><p>${userMoves < 12 ? 'The game was short, so this is a provisional estimate. It will settle as you play rated games and solve puzzles.' : 'Measured from the accuracy of your ' + userMoves + ' moves and the result.'} Your learning path now starts at this level.</p>`;
    } else if (mode === 'rated') {
      const delta = CM.updateRating(botElo, result === 'win' ? 1 : result === 'draw' ? 0.5 : 0); updateMe();
      extra = `<p class="delta ${delta >= 0 ? 'up' : 'down'}">Rating ${delta >= 0 ? '+' : ''}${delta} → <b>${CM.store.d.rating}</b></p>`;
    }
    d.games.push(rec); if (d.games.length > 40) d.games.shift(); CM.store.save();
    // store explanations collected so far
    rec.ex = {}; for (const k in EX) rec.ex[k] = { k: EX[k].cls.k, loss: Math.round(EX[k].loss * 10) / 10 }; CM.store.save();
    const title = result === 'win' ? 'You won!' : result === 'loss' ? 'You lost' : 'Draw';
    $('#post').innerHTML = `<div class="endbox"><h3>${title}</h3><p class="muted">${esc(reason)}</p>${extra}<div class="row"><button class="btn primary" id="toReport">Game report</button>${mode === 'placement' ? '<button class="btn" data-go="learn">Start learning</button>' : '<button class="btn" id="again">Play again</button>'}</div></div>`;
    $('#toReport').onclick = () => go('report/' + rec.id);
    const ag = $('#again'); if (ag) ag.onclick = () => playView(Object.assign({}, o, { moves: o.moves }));
    bindGo($('#post'));
    modal(`<h2>${title}</h2><p class="muted">${esc(reason)}</p>${extra}<div class="row end"><button class="btn" data-close>Close</button><button class="btn primary" id="mRep">See the game report</button></div>`).el.querySelector('#mRep').onclick = () => { $('#modal').classList.add('hidden'); go('report/' + rec.id); };
  }
  $('#bFlip').onclick = () => board.flip();
  $('#bBack').onclick = () => { const cur = viewPly == null ? g.hist.length : viewPly; if (cur > 0) { viewPly = cur - 1; sync(); } };
  $('#bFwd').onclick = () => { if (viewPly == null) return; viewPly++; if (viewPly >= g.hist.length) viewPly = null; sync(); };
  $('#bResign').onclick = () => { if (over) return; if (confirm('Resign this game?')) finish('loss', 'resignation'); };
  const fin = $('#bFinish'); if (fin) fin.onclick = () => { if (!over) finish('draw', 'placement finished early'); };
  if (coachOn) {
    $('#bHint').onclick = async () => {
      if (over || g.turn !== user) return; const a = await analysis(g.hist.length);
      if (a.best) { board.setArrows([a.best.slice(0, 4) + 'g']); $('#coachTxt').innerHTML = `💡 Consider <b>${esc(a.bestSan)}</b>. ${a.pvSan && a.pvSan.length > 1 ? 'Expected line: ' + esc(a.pvSan.slice(0, 4).join(' ')) : ''}`; }
    };
    $('#bThreat').onclick = async () => {
      if (over) return;
      const p = new C.Position(g.fen()); if (p.inCheck()) { toast('You are in check — deal with it first!'); return; }
      const parts = g.fen().split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
      const a = await CM.coachEngine().analyze(parts.join(' '), [], 450);
      if (!a.best) return;
      const q = new C.Position(parts.join(' ')); const mm = q.parseUci(a.best); const capt = q.b[(mm >> 7) & 127];
      board.setArrows([a.best.slice(0, 4) + 'r']);
      $('#coachTxt').innerHTML = `⚠ If it were your opponent's move, they would play <b>${esc(a.bestSan)}</b>${capt ? ', capturing your ' + CM.PNAME[capt & 7] : ''}. ${Math.abs(a.score) > 150 ? 'That is a real threat!' : 'Nothing serious.'}`;
    };
    $('#bUndo').onclick = () => {
      if (over && !confirm('Undo the last move and continue?')) return;
      gen++; thinking = false; $('#think').textContent = ''; over = false; $('#post').innerHTML = '';
      if (g.hist.length > startPly && g.turn === user) { g.undo(); delete EX[g.hist.length]; }
      if (g.hist.length > startPly && g.turn !== user) { g.undo(); delete EX[g.hist.length]; }
      for (const k in A) if (+k > g.hist.length) delete A[k];
      board.setArrows([]); viewPly = null; sync();
      if (g.turn !== user) botTurn();
    };
  }
  const keys = e => { if (e.key === 'ArrowLeft') $('#bBack').click(); else if (e.key === 'ArrowRight') $('#bFwd').click(); };
  document.addEventListener('keydown', keys); onLeave(() => { document.removeEventListener('keydown', keys); gen++; });
  sync();
  if (g.turn !== user) botTurn(); else analysis(g.hist.length);
}

// =====================================================================
// GAME REPORT
async function reportView(id, imported) {
  leave();
  const rec = imported || CM.store.d.games.find(x => x.id === id);
  if (!rec) { view().innerHTML = '<section class="narrow card"><p>Game not found.</p></section>'; return; }
  const g = new CM.Game(rec.start); rec.moves.forEach(u => g.playUci(u));
  const N = g.hist.length; const user = rec.userColor || 'w';
  view().innerHTML = `
  <section class="play">
    <div class="board-col">
      <div class="board-wrap"><div class="evalbar" id="evalbar"><div id="evalfill"></div><span id="evaltxt"></span></div><div class="board" id="bd"></div></div>
      <div class="graph" id="graph"></div>
    </div>
    <aside class="panel">
      <div class="ptitle"><b>Game report</b><span class="muted">${esc(rec.opp || '')}</span></div>
      <div id="prog" class="prog"><div class="pbar"><div id="pfill"></div></div><span id="ptxt">Analyzing…</span></div>
      <div id="summary"></div>
      <div class="coach" id="coach"><div id="coachTxt" class="muted">Click any move to see what the engine thinks.</div></div>
      <div class="moves" id="moves"></div>
      <div class="ctrls"><button class="btn sm" id="bFlip">⇅</button><button class="btn sm" id="bStart">⏮</button><button class="btn sm" id="bBack">◀</button><button class="btn sm" id="bFwd">▶</button><button class="btn sm" id="bEnd">⏭</button><button class="btn sm" id="bPgn">PGN</button></div>
    </aside>
  </section>`;
  const board = makeBoard($('#bd'), {}); board.setOrientation(user);
  let cur = N; const an = []; let stop = false; onLeave(() => stop = true);
  function show() {
    const fen = cur === 0 ? g.start : g.hist[cur - 1].fen; const last = cur ? g.hist[cur - 1] : null;
    board.setFen(fen); board.setLastMove(last ? last.from : null, last ? last.to : null);
    const p = new C.Position(fen); board.setCheck(p.inCheck() ? C.sqName(p.king[p.turn]) : null);
    const arrows = [];
    if (cur > 0 && an[cur - 1] && an[cur - 1].best && an[cur - 1].best !== last.uci && exs[cur - 1] && !['best', 'book'].includes(exs[cur - 1].cls.k)) arrows.push(an[cur - 1].best.slice(0, 4) + 'g');
    board.setArrows(arrows);
    const a = an[cur]; if (a) { const s = a.turn === 0 ? a.score : -a.score; $('#evalfill').style.height = (100 - CM.winPct(CM.cpOfClamped(s))) + '%'; $('#evaltxt').textContent = C.scoreToText(s).replace('+', ''); }
    $('#evalbar').classList.toggle('flip', board.orient === 'b');
    renderMoves();
    const ex = exs[cur - 1];
    if (ex) {
      const mover = (cur - 1) % 2 === 0 ? (new C.Position(g.start).turn === 0 ? 'w' : 'b') : (new C.Position(g.start).turn === 0 ? 'b' : 'w');
      $('#coachTxt').innerHTML = `<div class="cls ${ex.cls.k}"><b>${esc(ex.san)}</b> — ${ex.cls.name} ${ex.cls.sym}</div><div>${ex.text}</div>` +
        (mover === user && ['mistake', 'blunder'].includes(ex.cls.k) && an[cur - 1] && an[cur - 1].best ? `<button class="btn sm" id="addMis">Add to my mistakes deck</button>` : '');
      $('#coachTxt').classList.remove('muted');
      const am = $('#addMis'); if (am) am.onclick = () => { CM.addMistake(cur - 1 === 0 ? g.start : g.hist[cur - 2].fen, an[cur - 1].best, an[cur - 1].bestSan, ex.san, ex.text); toast('Added. Review it in Puzzles → My mistakes.'); am.remove(); };
    }
    drawGraph();
  }
  const exs = [];
  function renderMoves() {
    const el = $('#moves'); let h = ''; const p0 = new C.Position(g.start); let n = p0.full, w = p0.turn === 0;
    g.hist.forEach((m, i) => {
      if (w) h += `<span class="mn">${n}.</span>`; else if (i === 0) h += `<span class="mn">${n}…</span><span></span>`;
      const ex = exs[i]; const cls = ex ? ex.cls.k : '';
      h += `<span class="mv ${i + 1 === cur ? 'cur' : ''} ${cls}" data-i="${i + 1}">${esc(m.san)}${ex && !['good', 'excellent'].includes(cls) ? `<sup>${ex.cls.sym}</sup>` : ''}</span>`;
      if (!w) n++; w = !w;
    });
    el.innerHTML = h;
    $$('.mv', el).forEach(s => s.onclick = () => { cur = +s.dataset.i; show(); });
    const c = $('.mv.cur', el); if (c) c.scrollIntoView({ block: 'nearest' });
  }
  function drawGraph() {
    const el = $('#graph'); if (an.length < 2) return;
    const W = 600, H = 100; const vals = an.map(a => a ? CM.winPct(CM.cpOfClamped(a.turn === 0 ? a.score : -a.score)) : 50);
    const pts = vals.map((v, i) => [(i / Math.max(1, N)) * W, H - v / 100 * H]);
    const area = `M0,${H} ` + pts.map(p => 'L' + p.join(',')).join(' ') + ` L${pts[pts.length - 1][0]},${H} Z`;
    const cx = cur / Math.max(1, N) * W;
    const dots = exs.map((e, i) => e && ['mistake', 'blunder'].includes(e.cls.k) ? `<circle cx="${pts[i + 1] ? pts[i + 1][0] : 0}" cy="${pts[i + 1] ? pts[i + 1][1] : 0}" r="4" class="gd ${e.cls.k}"/>` : '').join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect width="${W}" height="${H}" class="gbg"/><path d="${area}" class="garea"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="gmid"/><line x1="${cx}" y1="0" x2="${cx}" y2="${H}" class="gcur"/>${dots}</svg>`;
    el.onclick = e => { const r = el.getBoundingClientRect(); cur = Math.round((e.clientX - r.left) / r.width * N); cur = Math.max(0, Math.min(N, cur)); show(); };
  }
  $('#bFlip').onclick = () => { board.flip(); show(); };
  $('#bStart').onclick = () => { cur = 0; show(); }; $('#bEnd').onclick = () => { cur = N; show(); };
  $('#bBack').onclick = () => { if (cur > 0) { cur--; show(); } }; $('#bFwd').onclick = () => { if (cur < N) { cur++; show(); } };
  $('#bPgn').onclick = () => modal(`<h3>PGN</h3><textarea class="pgnbox" readonly>${esc(rec.pgn || g.pgn())}</textarea><div class="row end"><button class="btn" id="cp">Copy</button><button class="btn primary" data-close>Close</button></div>`).el.querySelector('#cp').onclick = () => { try { navigator.clipboard.writeText(rec.pgn || g.pgn()); toast('Copied'); } catch (e) { } };
  const keys = e => { if (e.key === 'ArrowLeft') $('#bBack').click(); else if (e.key === 'ArrowRight') $('#bFwd').click(); };
  document.addEventListener('keydown', keys); onLeave(() => document.removeEventListener('keydown', keys));
  show();
  // analyze every position
  const eng = CM.coachEngine(); const uciAll = g.moves();
  const tm = N > 80 ? 250 : N > 50 ? 350 : 450;
  for (let i = 0; i <= N; i++) {
    if (stop) return;
    an[i] = await eng.analyze(g.start, uciAll.slice(0, i), tm);
    $('#pfill').style.width = (i / N * 100) + '%'; $('#ptxt').textContent = `Analyzing move ${i} of ${N}…`;
    if (i > 0) {
      const ex = CM.explain(g.start, uciAll.slice(0, i - 1), uciAll[i - 1], an[i - 1], an[i]);
      if (CM.isBook(uciAll.slice(0, i))) { ex.cls = { k: 'book', name: 'Book', sym: '📖' }; ex.text = 'Book move — opening theory.'; }
      exs[i - 1] = ex;
    }
    if (i % 4 === 0 || i === N) { renderMoves(); drawGraph(); }
  }
  $('#prog').classList.add('hidden');
  // summary
  const startTurn = new C.Position(g.start).turn === 0 ? 'w' : 'b';
  const side = i => (i % 2 === 0) === (startTurn === 'w') ? 'w' : 'b';
  const sum = { w: { acc: [], loss: [], c: {} }, b: { acc: [], loss: [], c: {} } };
  exs.forEach((ex, i) => {
    const s = sum[side(i)];
    const wb = CM.winPct(CM.cpOfClamped(ex.sBefore)), wa = CM.winPct(CM.cpOfClamped(ex.sAfter));
    s.acc.push(C.moveAccuracy(wb, wa)); s.loss.push(Math.min(45, ex.loss)); s.c[ex.cls.k] = (s.c[ex.cls.k] || 0) + 1;
  });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const row = (k, label) => `<tr><td>${label}</td><td>${sum.w.c[k] || 0}</td><td>${sum.b.c[k] || 0}</td></tr>`;
  const accW = Math.round(avg(sum.w.acc)), accB = Math.round(avg(sum.b.acc));
  const perfU = CM.eloFromLoss(avg(sum[user].loss));
  if (!imported) { rec.acc = user === 'w' ? accW : accB; rec.perf = perfU; CM.store.save(); }
  const myMist = exs.map((e, i) => ({ e, i })).filter(x => side(x.i) === user && ['mistake', 'blunder'].includes(x.e.cls.k));
  $('#summary').innerHTML = `<div class="accs"><div><small>White accuracy</small><b>${accW}%</b></div><div><small>Black accuracy</small><b>${accB}%</b></div><div><small>Your performance</small><b>~${perfU}</b></div></div>
    <table class="ctab"><tr><th></th><th>White</th><th>Black</th></tr>${row('best', '★ Best')}${row('excellent', '! Excellent')}${row('good', '✓ Good')}${row('book', '📖 Book')}${row('inaccuracy', '?! Inaccuracy')}${row('mistake', '? Mistake')}${row('blunder', '?? Blunder')}</table>
    ${myMist.length ? `<div class="keym"><b>Your key mistakes</b>${myMist.slice(0, 6).map(x => `<button class="km" data-i="${x.i + 1}"><span class="cls ${x.e.cls.k}">${x.e.cls.sym}</span> ${Math.floor(x.i / 2) + new C.Position(g.start).full}. ${esc(x.e.san)} — better ${esc(an[x.i].bestSan || '')}</button>`).join('')}<button class="btn sm primary" id="addAll">Add all to my mistakes deck</button></div>` : '<p class="good-note">No mistakes or blunders from you. Excellent!</p>'}`;
  $$('.km').forEach(b => b.onclick = () => { cur = +b.dataset.i; show(); });
  const aa = $('#addAll'); if (aa) aa.onclick = () => { myMist.forEach(x => CM.addMistake(x.i === 0 ? g.start : g.hist[x.i - 1].fen, an[x.i].best, an[x.i].bestSan, x.e.san, x.e.text)); toast(myMist.length + ' positions added to your deck'); aa.remove(); };
  show();
}

// =====================================================================
// LEARN
function learnView(cat) {
  leave();
  const cats = window.CURRICULUM.cats; cat = cat || 'path';
  const d = CM.store.d;
  const count = c => CM.lessons.filter(l => l.cat === c).length, done = c => CM.lessons.filter(l => l.cat === c && d.lessons[l.id]).length;
  view().innerHTML = `<section class="learn">
    <div class="learn-h"><div><h1>Learn</h1><p class="muted">${CM.lessons.length} lessons. ${d.rating ? `Your level: <b>${d.rating}</b> (${levelName(d.rating)}). Lessons marked with a level near yours are the most useful now.` : '<a href="#/placement">Play the placement match</a> to get a personal starting point.'}</p></div>
      <input class="search" id="lsearch" placeholder="Search lessons…"></div>
    <div class="tabs" id="ltabs"><button data-c="path" class="${cat === 'path' ? 'on' : ''}">⭐ My path</button>${cats.map(c => `<button data-c="${c.id}" class="${cat === c.id ? 'on' : ''}">${c.name} <small>${done(c.id)}/${count(c.id)}</small></button>`).join('')}</div>
    <div id="lbody"></div></section>`;
  $$('#ltabs button').forEach(b => b.onclick = () => go('learn/' + b.dataset.c));
  const body = $('#lbody');
  const render = (q) => {
    let list;
    if (q) list = CM.lessons.filter(l => (l.title + ' ' + l.unit).toLowerCase().includes(q.toLowerCase()));
    else if (cat === 'path') {
      const rec = CM.recommended(12);
      const r = d.rating || 600;
      body.innerHTML = `<div class="pathbox"><h2>Recommended for you</h2><p class="muted">Chosen from your level (${r}) across all categories. Complete them in any order.</p><div class="grid cards">${rec.map(lessonCard).join('')}</div>
        <h2>Next steps by category</h2>${cats.map(c => { const n = CM.lessons.filter(l => l.cat === c.id && !d.lessons[l.id] && l.level <= r + 300).slice(0, 4); return n.length ? `<h3>${c.name}</h3><div class="grid cards">${n.map(lessonCard).join('')}</div>` : ''; }).join('')}</div>`;
      bindLessonCards(body); return;
    } else list = CM.lessons.filter(l => l.cat === cat);
    const units = []; const byUnit = {};
    for (const l of list) { if (!byUnit[l.unit]) { byUnit[l.unit] = []; units.push(l.unit); } byUnit[l.unit].push(l); }
    body.innerHTML = units.map(u => `<div class="unit"><h2>${esc(u)} <small class="muted">${byUnit[u].filter(l => d.lessons[l.id]).length}/${byUnit[u].length}</small></h2><div class="grid cards">${byUnit[u].map(lessonCard).join('')}</div></div>`).join('') || '<p class="muted">No lessons found.</p>';
    bindLessonCards(body);
  };
  render('');
  $('#lsearch').oninput = e => render(e.target.value.trim());
}

// =====================================================================
// LESSON PLAYER
function lessonView(id) {
  leave();
  const L = CM.lessonById[id]; if (!L) { view().innerHTML = '<section class="narrow card">Lesson not found.</section>'; return; }
  let si = 0, mistakes = 0, gen = 0;
  view().innerHTML = `<section class="play lesson">
    <div class="board-col"><div class="board-wrap"><div class="board" id="bd"></div></div></div>
    <aside class="panel">
      <div class="ptitle"><a class="back" href="#/learn/${L.cat}">← ${esc(L.unit)}</a><span class="lvl">${L.level}</span></div>
      <h2 class="ltitle">${esc(L.title)}</h2>
      <div class="dots" id="dots"></div>
      <div class="stepbox" id="sbox"></div>
      <div class="fb" id="fb"></div>
      <div class="ctrls" id="sctrl"></div>
    </aside></section>`;
  const board = makeBoard($('#bd'), { onMove: (f, t, p) => handler && handler(f, t, p) });
  let handler = null;
  const sbox = $('#sbox'), fb = $('#fb'), ctrl = $('#sctrl');
  onLeave(() => gen++);
  function dots() { $('#dots').innerHTML = L.steps.map((s, i) => `<i class="${i < si ? 'ok' : i === si ? 'cur' : ''}"></i>`).join(''); }
  function setFb(html, kind) { fb.innerHTML = html; fb.className = 'fb ' + (kind || ''); }
  function controls(btns) { ctrl.innerHTML = ''; for (const [label, fn, cls] of btns) { const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.innerHTML = label; b.onclick = fn; ctrl.appendChild(b); } }
  function next() { si++; if (si >= L.steps.length) return complete(); run(); }
  function complete() {
    const st = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    CM.completeLesson(L.id, st); CM.sound('good');
    dots();
    const sameUnit = CM.lessons.filter(l => l.unit === L.unit && l.cat === L.cat);
    const nx = sameUnit[sameUnit.indexOf(L) + 1] || CM.recommended(1)[0];
    sbox.innerHTML = `<div class="done-box"><div class="big-stars">${stars(st)}</div><h3>Lesson complete!</h3><p class="muted">${mistakes === 0 ? 'Perfect — no mistakes.' : mistakes + ' mistake' + (mistakes > 1 ? 's' : '') + '.'}</p></div>`;
    setFb('');
    controls([['↺ Retry', () => { si = 0; mistakes = 0; run(); }], ['Back to lessons', () => go('learn/' + L.cat)], nx ? ['Next: ' + esc(nx.title) + ' →', () => go('lesson/' + nx.id), 'primary'] : null].filter(Boolean));
  }
  function run() {
    gen++; handler = null; board.opts.onMove = (f, t, p) => handler && handler(f, t, p); board.disable(); board.setArrows([]); board.setMarks({}); board.setLastMove(null); board.setCheck(null); setFb('');
    dots();
    const s = L.steps[si];
    ({ info: stInfo, quiz: stQuiz, move: stMove, puzzle: stPuzzle, collect: stCollect, goal: stGoal, line: stLine }[s.t] || stInfo)(s);
  }
  function orientFor(fen) { const t = fen.split(' ')[1]; board.setOrientation(t === 'b' ? 'b' : 'w'); }
  function marksOf(s) { const m = {}; (s.marks || []).forEach(x => m[x] = 'y'); return m; }
  function stInfo(s) {
    board.setOrientation('w'); board.setFen(s.fen); board.setArrows(s.arrows || []); board.setMarks(marksOf(s));
    sbox.innerHTML = `<p>${s.text}</p>`;
    controls([[si + 1 < L.steps.length ? 'Continue →' : 'Finish', next, 'primary']]);
  }
  function stQuiz(s) {
    board.setOrientation('w'); board.setFen(s.fen); board.setMarks(marksOf(s)); board.setArrows(s.arrows || []);
    sbox.innerHTML = `<p>${s.text}</p><div class="opts">${s.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}</div>`;
    controls([]); let wrong = false;
    $$('.opt', sbox).forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (i === s.answer) { b.classList.add('right'); CM.sound('good'); setFb('✔ Correct! ' + (s.explain || ''), 'ok'); $$('.opt', sbox).forEach(x => x.disabled = true); controls([['Continue →', next, 'primary']]); }
      else { b.classList.add('wrong'); b.disabled = true; CM.sound('bad'); if (!wrong) { mistakes++; wrong = true; } setFb('✘ Not quite. ' + (s.explain && $$('.opt.wrong', sbox).length >= 2 ? s.explain : 'Try again.'), 'bad'); }
    });
  }
  function stMove(s) {
    const g = new CM.Game(s.fen); orientFor(s.fen); board.setFen(s.fen); board.setArrows(s.arrows || []); board.setMarks(marksOf(s));
    sbox.innerHTML = `<p>${s.text}</p>`; let wrong = false;
    board.setMovable(g.turn, g.dests()); board.setCheck(g.checkSq());
    controls([['💡 Hint', () => { const u = s.accept[0]; board.setArrows([u.slice(0, 4) + 'g']); }]]);
    handler = (f, t, p) => {
      const m = g.find(f, t, p); if (!m) return; const uci = g.pos.uci(m);
      const rec = g.play(m); board.setFen(g.fen(), { from: f, to: t, rookFrom: rec.rookFrom, rookTo: rec.rookTo }); board.setLastMove(f, t); board.setCheck(g.checkSq());
      if (s.accept.includes(uci)) { CM.sound('good'); board.disable(); setFb('✔ ' + (rec.san.includes('#') ? 'Checkmate! ' : 'Well done! ') + esc(rec.san), 'ok'); controls([['Continue →', next, 'primary']]); handler = null; }
      else {
        CM.sound('bad'); if (!wrong) { mistakes++; wrong = true; }
        setFb('✘ ' + (s.reject && s.reject[uci] ? s.reject[uci] : 'That is not it. Try again.'), 'bad');
        setTimeout(() => { g.undo(); board.setFen(g.fen()); board.setLastMove(null); board.setCheck(g.checkSq()); board.setMovable(g.turn, g.dests()); }, 700);
      }
    };
  }
  function stPuzzle(s) { runPuzzle(board, s, { sbox, setFb, controls, onDone: (ok, fails) => { if (fails) mistakes += Math.min(2, fails); controls([['Continue →', next, 'primary']]); }, genRef: () => gen }); }
  function stCollect(s) {
    const map = BoardUtil.parseFen(s.fen); let hero = Object.keys(map).find(k => map[k][0] === 'w');
    const type = map[hero][1]; let count = 0;
    board.setOrientation('w'); board.setPieces(Object.assign({}, map));
    sbox.innerHTML = `<p>${s.text}</p><p class="muted">Target: <b>${s.par}</b> moves. Moves used: <b id="cnt">0</b></p>`;
    const dests = () => {
      const out = []; const f0 = hero.charCodeAt(0) - 97, r0 = +hero[1] - 1;
      const D = { r: [[1, 0], [-1, 0], [0, 1], [0, -1]], b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], k: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], n: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]], p: [[0, 1]] }[type];
      const slide = 'rbq'.includes(type);
      for (const [df, dr] of D) { let f = f0 + df, r = r0 + dr; while (f >= 0 && f < 8 && r >= 0 && r < 8) { const sq = 'abcdefgh'[f] + (r + 1); out.push(sq); if (board.pieces[sq] || !slide) break; f += df; r += dr; } }
      return out;
    };
    const arm = () => board.setMovable('w', { [hero]: dests() });
    arm(); controls([['↺ Restart', () => run()]]);
    handler = (f, t) => {
      const pcs = Object.assign({}, board.pieces); const p = pcs[f]; delete pcs[f]; const cap = !!pcs[t]; pcs[t] = p; hero = t; count++;
      board.setPieces(pcs, { from: f, to: t }); board.setLastMove(f, t); $('#cnt').textContent = count; CM.sound(cap ? 'capture' : 'move');
      if (!Object.values(pcs).some(x => x[0] === 'b')) {
        board.disable(); handler = null;
        const perfect = count <= s.par; if (!perfect) mistakes += count <= s.par + 2 ? 1 : 2;
        CM.sound('good'); setFb(perfect ? `✔ Perfect — ${count} moves!` : `✔ Done in ${count} moves (target ${s.par}). Retry for a perfect score.`, 'ok');
        controls([['↺ Retry', () => run()], ['Continue →', next, 'primary']]);
      } else arm();
    };
  }
  function stGoal(s) {
    const g = new CM.Game(s.fen); const user = s.side; board.setOrientation(user); board.setFen(s.fen);
    let userMoves = 0, done = false; const myGen = gen;
    const goalTxt = { mate: 'Deliver checkmate', promote: 'Promote a pawn', win: 'Win the position', draw: 'Hold the draw', survive: 'Survive' }[s.goal];
    sbox.innerHTML = `<p>${s.text}</p><p class="muted">${goalTxt} · moves: <b id="gm">0</b> / ${s.limit}</p><p class="muted sm">You play against the engine at full strength.</p>`;
    const sync = (last) => { board.setFen(g.fen(), last ? { from: last.from, to: last.to, rookFrom: last.rookFrom, rookTo: last.rookTo } : null); board.setLastMove(last ? last.from : null, last ? last.to : null); board.setCheck(g.checkSq()); };
    const fail = (msg) => { done = true; board.disable(); handler = null; CM.sound('bad'); mistakes++; setFb('✘ ' + msg, 'bad'); controls([['↺ Try again', () => run()], ['Skip →', next]]); };
    const win = (msg) => { done = true; board.disable(); handler = null; CM.sound('good'); setFb('✔ ' + msg, 'ok'); controls([['Continue →', next, 'primary']]); };
    const oppTurn = async () => {
      board.disable();
      const a = await CM.coachEngine().analyze(g.start, g.moves(), 500);
      if (myGen !== gen || done) return;
      if (!a.best) return evaluate();
      const rec = g.playUci(a.best); CM.sound(rec.capture ? 'capture' : 'move'); sync(rec);
      evaluate(rec);
    };
    const evaluate = async (rec) => {
      const st = g.status();
      const userTurn = g.turn === user;
      if (st.over) {
        if (st.winner === user) return win(s.goal === 'mate' ? 'Checkmate!' : 'You won!');
        if (st.winner === null) return (s.goal === 'draw' || s.goal === 'survive') ? win('Draw — well defended!') : fail(st.reason === 'stalemate' ? 'Stalemate! The game is a draw. Always leave the king a square.' : 'Draw by ' + st.reason + '.');
        return fail('You were checkmated.');
      }
      const pos = g.pos; const mine = CM.balance(pos, user === 'w' ? 0 : 1);
      if (rec && !userTurn) { // user just moved
        if (s.goal === 'promote' && (rec.flag & C.F_PROMO)) return win('Promoted! ' + rec.san);
        if (s.goal === 'win' && mine >= 8) return win('Decisive advantage — you are winning easily.');
      }
      if (rec && userTurn) { // opponent just moved
        if ((rec.flag & C.F_PROMO) && (s.goal === 'draw' || s.goal === 'survive' || s.goal === 'promote')) return fail('Your opponent promoted a pawn.');
        if (s.goal === 'promote' && mine <= -1 && !pos.material(user === 'w' ? 0 : 1)) return fail('You lost your pawn.');
        if (userMoves >= s.limit) { if (s.goal === 'draw' || s.goal === 'survive') return win('You held for ' + s.limit + ' moves!'); return fail('Out of moves (' + s.limit + '). Try a faster plan.'); }
      }
      if (userTurn) { board.setMovable(user, g.dests()); } else oppTurn();
    };
    handler = (f, t, p) => {
      if (done || g.turn !== user) return; const m = g.find(f, t, p); if (!m) return;
      const rec = g.play(m); userMoves++; $('#gm').textContent = userMoves; CM.sound(rec.capture ? 'capture' : rec.check ? 'check' : 'move'); sync(rec);
      board.setArrows([]);
      evaluate(rec);
    };
    controls([['↺ Restart', () => run()], ['💡 Hint', async () => { if (g.turn !== user || done) return; const a = await CM.coachEngine().analyze(g.start, g.moves(), 600); if (a.best) board.setArrows([a.best.slice(0, 4) + 'g']); }], ['Skip →', next]]);
    sync(null);
    if (g.turn === user) board.setMovable(user, g.dests()); else oppTurn();
  }
  function stLine(s) {
    const o = CM.openingById[s.opening]; const userSide = o.side;
    if (s.mode === 'study') return openingStudy(board, o, { sbox, setFb, controls, next, onLeaveGen: () => gen });
    return openingDrill(board, o, { sbox, setFb, controls, onDone: (fails) => { mistakes += Math.min(3, fails); controls([['↺ Drill again', () => run()], ['Continue →', next, 'primary']]); }, genRef: () => gen });
    void userSide;
  }
  run();
}

// shared: puzzle runner
function runPuzzle(board, s, ui) {
  const g = new CM.Game(s.fen); const user = g.turn; const myGen = ui.genRef();
  board.setOrientation(user); board.setFen(s.fen); board.setCheck(g.checkSq());
  if (s.last) board.setLastMove(s.last.slice(0, 2), s.last.slice(2, 4)); else board.setLastMove(null);
  let idx = 0, fails = 0, solved = false, hintLvl = 0, engineMode = false;
  ui.sbox.innerHTML = `<p><b>${user === 'w' ? '⚪ White' : '⚫ Black'} to move.</b> ${s.text || ''}</p>${s.rating ? `<p class="muted sm">Puzzle rating ${s.rating}</p>` : ''}`;
  const finish = (ok, msg) => { solved = true; board.disable(); CM.sound(ok ? 'good' : 'bad'); ui.setFb(msg, ok ? 'ok' : 'bad'); ui.onDone(ok, fails); };
  const arm = () => { if (!solved) board.setMovable(user, g.dests()); };
  const reply = async () => {
    board.disable(); await CM.sleep(380); if (myGen !== ui.genRef()) return;
    let u = engineMode ? null : s.line[idx];
    if (!u) { const a = await CM.coachEngine().analyze(g.start, g.moves(), 500); if (myGen !== ui.genRef()) return; u = a.best; }
    const rec = g.playUci(u); idx++;
    board.setFen(g.fen(), { from: rec.from, to: rec.to, rookFrom: rec.rookFrom, rookTo: rec.rookTo }); board.setLastMove(rec.from, rec.to); board.setCheck(g.checkSq()); CM.sound(rec.capture ? 'capture' : 'move');
    arm();
  };
  const hint = () => {
    if (solved) return; const u = engineMode ? null : s.line[idx]; if (!u) return;
    hintLvl++; if (hintLvl === 1) board.setMarks({ [u.slice(0, 2)]: 'g' }); else board.setArrows([u.slice(0, 4) + 'g']);
    if (hintLvl === 1) fails = Math.max(fails, 1);
  };
  const showSol = async () => {
    if (solved) return; fails = Math.max(fails, 2); board.disable();
    while (idx < s.line.length && !engineMode) { const rec = g.playUci(s.line[idx]); idx++; board.setFen(g.fen(), { from: rec.from, to: rec.to }); board.setLastMove(rec.from, rec.to); board.setCheck(g.checkSq()); await CM.sleep(650); if (myGen !== ui.genRef()) return; }
    finish(false, 'Solution: ' + esc(sanLine(s.fen, s.line)));
  };
  ui.controls([['💡 Hint', hint], ['Show solution', showSol]]);
  board._onMoveOverride = null;
  const prevHandler = board.opts.onMove;
  board.opts.onMove = async (f, t, p) => {
    if (solved || g.turn !== user || myGen !== ui.genRef()) return;
    const m = g.find(f, t, p); if (!m) return;
    const uci = g.pos.uci(m);
    const rec = g.play(m);
    board.setFen(g.fen(), { from: f, to: t, rookFrom: rec.rookFrom, rookTo: rec.rookTo }); board.setLastMove(f, t); board.setCheck(g.checkSq()); board.setMarks({}); board.setArrows([]);
    const st = g.status();
    const expected = engineMode ? null : s.line[idx];
    if (st.over && st.winner === user) { CM.sound('capture'); return finish(true, fails ? '✔ Checkmate! Solved (with help).' : '✔ Checkmate! Puzzle solved.'); }
    if (uci === expected) {
      idx++; CM.sound(rec.capture ? 'capture' : 'move');
      if (idx >= s.line.length) return finish(true, fails ? '✔ Solved (with help).' : '✔ Excellent — puzzle solved!');
      ui.setFb('✔ Good move! Keep going…', 'ok');
      return reply();
    }
    // deviation: let the engine judge alternatives
    board.disable(); ui.setFb('<span class="muted">Checking your move…</span>');
    const a = await CM.coachEngine().analyze(g.start, g.moves(), 600);
    if (myGen !== ui.genRef()) return;
    const sc = -a.score;
    const isMateLine = s.mate || (sc > C.MATE - 1000);
    let ok = false;
    if (s.mate) { const left = s.mate - Math.floor(idx / 2) - 1; ok = sc > C.MATE - 1000 && Math.ceil((C.MATE - sc) / 2) <= left + 1; }
    else ok = sc >= 350 || (sc > C.MATE - 1000);
    void isMateLine;
    if (ok) {
      if (s.mate) { engineMode = true; ui.setFb('✔ That works too! Keep going…', 'ok'); idx++; return reply(); }
      return finish(true, '✔ That works too — winning!' + (fails ? ' (with help)' : ''));
    }
    fails++; CM.sound('bad'); ui.setFb('✘ Not the best move. ' + (a.bestSan ? `Your opponent answers <b>${esc(a.bestSan)}</b>. ` : '') + 'Try again.', 'bad');
    setTimeout(() => { if (myGen !== ui.genRef() || solved) return; g.undo(); board.setFen(g.fen()); board.setCheck(g.checkSq()); board.setLastMove(null); arm(); ui.setFb(''); }, 900);
  };
  ui.restore = () => { board.opts.onMove = prevHandler; };
  arm();
}
function sanLine(fen, line) { const p = new C.Position(fen); const out = []; for (const u of line) { const m = p.parseUci(u); if (!m) break; out.push(p.san(m)); p.make(m); } return out.join(' '); }

// shared: opening study and drill
function openingStudy(board, o, ui) {
  let i = 0; const myGen = ui.onLeaveGen();
  board.setOrientation(o.side);
  const pos = () => { const p = new C.Position(START); for (let k = 0; k < i; k++) p.make(p.parseUci(o.uci[k])); return p; };
  const render = (anim) => {
    if (myGen !== ui.onLeaveGen()) return;
    const p = pos(); board.setFen(p.fen(), anim && i ? { from: o.uci[i - 1].slice(0, 2), to: o.uci[i - 1].slice(2, 4) } : null);
    board.setLastMove(i ? o.uci[i - 1].slice(0, 2) : null, i ? o.uci[i - 1].slice(2, 4) : null); board.setCheck(p.inCheck() ? C.sqName(p.king[p.turn]) : null);
    let comment = '';
    if (i > 0) {
      const q = new C.Position(START); for (let k = 0; k < i - 1; k++) q.make(q.parseUci(o.uci[k]));
      const m = q.parseUci(o.uci[i - 1]); const auto = CM.commentMove(q, m, o.san[i + 1]);
      const mv = Math.floor((i - 1) / 2) + 1 + ((i - 1) % 2 ? '… ' : '. ');
      comment = `<div class="cm"><b>${mv}${esc(o.san[i - 1])}</b> ${o.comments[i] ? '<span class="hc">' + esc(o.comments[i]) + '</span> ' : ''}<span class="muted">${esc(auto.text)}</span></div>`;
    } else comment = `<div class="cm muted">Starting position. Press ▶ or use the arrow keys to step through the line.</div>`;
    const line = o.san.map((s, k) => `${k % 2 === 0 ? `<span class="mn">${k / 2 + 1}.</span>` : ''}<span class="mv ${k === i - 1 ? 'cur' : ''}" data-k="${k + 1}">${esc(s)}</span>`).join('');
    const end = i === o.uci.length;
    ui.sbox.innerHTML = `<p class="pill">${o.classic ? esc(o.variation) : esc(o.eco) + ' · You learn this as <b>' + (o.side === 'w' ? 'White' : 'Black') + '</b>'}</p><p>${esc(o.summary)}</p>
      <div class="oline">${line}</div>${comment}
      ${end ? `<div class="ideas"><b>Key ideas</b><ul>${o.ideas.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>` : ''}`;
    $$('.oline .mv', ui.sbox).forEach(s => s.onclick = () => { i = +s.dataset.k; render(); });
    ui.controls([['⏮', () => { i = 0; render(); }], ['◀', () => { if (i > 0) { i--; render(); } }], ['▶', () => { if (i < o.uci.length) { i++; render(true); CM.sound('move'); } }], end ? [o.classic ? 'Guess the moves →' : 'Practice it →', ui.next, 'primary'] : [o.classic ? 'Skip to guess-the-move →' : 'Skip to practice →', ui.next]]);
  };
  const keys = e => { if (myGen !== ui.onLeaveGen()) { document.removeEventListener('keydown', keys); return; } if (e.key === 'ArrowRight' && i < o.uci.length) { i++; render(true); } else if (e.key === 'ArrowLeft' && i > 0) { i--; render(); } };
  document.addEventListener('keydown', keys); onLeave(() => document.removeEventListener('keydown', keys));
  render();
}
function openingDrill(board, o, ui) {
  const g = new CM.Game(START); const myGen = ui.genRef(); let fails = 0, tries = 0;
  board.setOrientation(o.side); board.setFen(START); board.setLastMove(null);
  ui.sbox.innerHTML = o.classic ? `<p><b>Guess the move:</b> you are <b>${o.side === 'w' ? 'White' : 'Black'}</b> in ${esc(o.variation)}. Try to find each move the master played. After two wrong tries the move is shown.</p><p class="muted" id="dprog"></p>`
    : `<p><b>Drill:</b> play the <b>${o.side === 'w' ? 'White' : 'Black'}</b> moves of the ${esc(o.family)} (${esc(o.variation)}) from memory. The opponent's moves are played automatically.</p><p class="muted" id="dprog"></p>`;
  const prog = () => { const el = $('#dprog'); if (el) el.textContent = `Move ${Math.min(g.hist.length + 1, o.uci.length)} of ${o.uci.length}`; };
  const step = async () => {
    if (myGen !== ui.genRef()) return;
    prog();
    if (g.hist.length >= o.uci.length) { board.disable(); CM.sound('good'); ui.setFb(fails ? `✔ Line complete with ${fails} slip${fails > 1 ? 's' : ''}. Drill again to make it stick.` : '✔ Perfect! You know this line.', 'ok'); return ui.onDone(fails); }
    if (g.turn !== o.side) { await CM.sleep(450); if (myGen !== ui.genRef()) return; const rec = g.playUci(o.uci[g.hist.length]); board.setFen(g.fen(), { from: rec.from, to: rec.to, rookFrom: rec.rookFrom, rookTo: rec.rookTo }); board.setLastMove(rec.from, rec.to); board.setCheck(g.checkSq()); CM.sound('move'); return step(); }
    tries = 0; board.setMovable(o.side, g.dests());
  };
  board.opts.onMove = (f, t, p) => {
    if (myGen !== ui.genRef() || g.turn !== o.side) return;
    const m = g.find(f, t, p); if (!m) return; const uci = g.pos.uci(m); const exp = o.uci[g.hist.length];
    if (uci === exp) { const rec = g.play(m); board.setFen(g.fen(), { from: f, to: t, rookFrom: rec.rookFrom, rookTo: rec.rookTo }); board.setLastMove(f, t); board.setCheck(g.checkSq()); board.setArrows([]); board.setMarks({}); CM.sound('move'); ui.setFb(''); board.disable(); step(); }
    else {
      tries++; if (tries === 1) fails++; CM.sound('bad');
      const san = g.pos.san(m);
      if (tries >= 2) { board.setArrows([exp.slice(0, 4) + 'g']); ui.setFb(`✘ ${esc(san)} is not the line. The book move is shown.`, 'bad'); }
      else { board.setMarks({ [exp.slice(0, 2)]: 'g' }); ui.setFb(`✘ ${esc(san)} is playable maybe, but not this line. Hint: move the highlighted piece.`, 'bad'); }
      board.setFen(g.fen()); board.setMovable(o.side, g.dests());
    }
  };
  ui.controls([['↺ Restart', () => { g.reset(START); fails = 0; board.setFen(START); board.setArrows([]); board.setMarks({}); ui.setFb(''); step(); }]]);
  step();
}

// =====================================================================
// OPENINGS
function openingsView(arg) {
  leave();
  const all = CM.openings;
  let filter = 'all', q = '', sel = arg && CM.openingById[arg] ? CM.openingById[arg] : null;
  view().innerHTML = `<section class="openings">
    <div class="olist"><h1>Openings</h1><input class="search" id="oq" placeholder="Search: Sicilian, Ruy Lopez, B90…">
      <div class="chips" id="ochips">${[['all', 'All'], ['e4', '1.e4'], ['d4', '1.d4'], ['flank', 'Flank'], ['w', 'As White'], ['b', 'As Black'], ['traps', 'Traps'], ['explore', '🔭 Explorer']].map(([k, n]) => `<button data-f="${k}" class="${k === 'all' ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="oitems" class="oitems"></div></div>
    <div class="odetail" id="odetail"></div></section>`;
  const items = $('#oitems');
  const renderList = () => {
    if (filter === 'explore') { items.innerHTML = '<p class="muted">Play moves on the board — the explorer shows every book continuation and which openings it leads to.</p>'; explorer(); return; }
    let L = all.filter(o => {
      if (filter === 'traps') return o.family === 'Opening Trap';
      if (o.family === 'Opening Trap' && filter !== 'all') return false;
      if (filter === 'e4') return o.uci[0] === 'e2e4'; if (filter === 'd4') return o.uci[0] === 'd2d4';
      if (filter === 'flank') return !['e2e4', 'd2d4'].includes(o.uci[0]);
      if (filter === 'w' || filter === 'b') return o.side === filter;
      return true;
    });
    if (q) L = L.filter(o => (o.family + ' ' + o.variation + ' ' + o.eco + ' ' + o.san.join(' ')).toLowerCase().includes(q.toLowerCase()));
    const fams = {}; L.forEach(o => (fams[o.family] = fams[o.family] || []).push(o));
    items.innerHTML = Object.keys(fams).map(f => `<div class="ofam"><h4>${esc(f)}</h4>${fams[f].map(o => `<button class="oitem ${sel === o ? 'on' : ''} ${CM.lessonDone(o.id) ? 'done' : ''}" data-o="${o.id}"><span>${esc(o.variation)}</span><small>${esc(o.eco)} · ${o.side === 'w' ? 'W' : 'B'}${CM.lessonDone(o.id) ? ' ✓' : ''}</small></button>`).join('')}</div>`).join('') || '<p class="muted">Nothing found.</p>';
    $$('.oitem', items).forEach(b => b.onclick = () => { sel = CM.openingById[b.dataset.o]; renderList(); detail(); });
  };
  const detail = () => {
    const el = $('#odetail');
    if (!sel) { el.innerHTML = `<div class="card"><h2>${all.length} lines to master</h2><p>Every line comes with a short explanation, key ideas, move-by-move commentary and a <b>drill mode</b> where you play it from memory. Pick one on the left, or open the Explorer to browse the opening tree.</p><p class="muted">Tip: as a beginner, pick one opening for White (e.g. the Italian Game or London System), one defense against 1.e4 and one against 1.d4.</p></div>`; return; }
    el.innerHTML = `<div class="play inner"><div class="board-col"><div class="board-wrap"><div class="board" id="obd"></div></div></div>
      <aside class="panel"><div class="ptitle"><b>${esc(sel.family)}</b><span class="muted">${esc(sel.variation)}</span></div>
      <div class="tabs sm" id="otabs"><button data-m="study" class="on">Study</button><button data-m="drill">Drill</button></div>
      <div class="stepbox" id="osbox"></div><div class="fb" id="ofb"></div><div class="ctrls" id="octrl"></div>
      <div class="row"><button class="btn sm" id="oPlay">♟ Play it vs a bot</button><button class="btn sm" id="oLesson">Open as lesson</button></div></aside></div>`;
    const b = makeBoard($('#obd'), {}); let og = 0; onLeave(() => og++);
    const ui = {
      sbox: $('#osbox'), setFb: (h, k) => { const f = $('#ofb'); f.innerHTML = h; f.className = 'fb ' + (k || ''); },
      controls: (btns) => { const c = $('#octrl'); c.innerHTML = ''; for (const [l, fn, cls] of btns) { const x = document.createElement('button'); x.className = 'btn ' + (cls || ''); x.innerHTML = l; x.onclick = fn; c.appendChild(x); } },
      next: () => mode('drill'), onLeaveGen: () => og, genRef: () => og, onDone: (fails) => { if (!fails) CM.completeLesson(sel.id, 3); ui.controls([['↺ Drill again', () => mode('drill')]]); }
    };
    const mode = m => { og++; ui.setFb(''); b.setArrows([]); b.setMarks({}); $$('#otabs button').forEach(x => x.classList.toggle('on', x.dataset.m === m)); if (m === 'study') openingStudy(b, sel, ui); else openingDrill(b, sel, ui); };
    $$('#otabs button').forEach(x => x.onclick = () => mode(x.dataset.m));
    $('#oPlay').onclick = () => go('play/' + sel.id);
    $('#oLesson').onclick = () => go('lesson/' + sel.id);
    mode('study');
  };
  const explorer = () => {
    const el = $('#odetail');
    el.innerHTML = `<div class="play inner"><div class="board-col"><div class="board-wrap"><div class="board" id="xbd"></div></div></div>
      <aside class="panel"><div class="ptitle"><b>Opening Explorer</b><span class="muted" id="xname"></span></div><div class="oline" id="xline"></div><div id="xnext" class="xnext"></div>
      <div class="ctrls"><button class="btn sm" id="xBack">◀ Undo</button><button class="btn sm" id="xReset">Reset</button><button class="btn sm" id="xFlip">⇅</button></div></aside></div>`;
    const g = new CM.Game(START);
    const b = makeBoard($('#xbd'), { onMove: (f, t, p) => { const m = g.find(f, t, p); if (!m) return; const r = g.play(m); CM.sound('move'); upd(r); } });
    const upd = (r) => {
      b.setFen(g.fen(), r ? { from: r.from, to: r.to, rookFrom: r.rookFrom, rookTo: r.rookTo } : null); b.setLastMove(r ? r.from : null, r ? r.to : null); b.setCheck(g.checkSq()); b.setMovable(g.turn, g.dests());
      const det = CM.detectOpening(g.moves()); $('#xname').textContent = det ? det.name : g.hist.length ? 'Out of book' : 'Starting position';
      $('#xline').innerHTML = g.hist.map((h, k) => `${k % 2 === 0 ? `<span class="mn">${k / 2 + 1}.</span>` : ''}<span class="mv">${esc(h.san)}</span>`).join('') || '<span class="muted">Play a move…</span>';
      const nx = CM.bookNext(g.moves());
      b.setArrows(nx.slice(0, 4).map((x, i) => x.uci.slice(0, 4) + (i === 0 ? 'g' : 'b')));
      $('#xnext').innerHTML = nx.length ? `<b>Book moves</b>` + nx.map(x => `<div class="xn"><button class="btn sm" data-u="${x.uci}">${esc(x.san)}</button><span>${x.lines.slice(0, 3).map(o => `<a href="#/openings/${o.id}">${esc(o.family)}: ${esc(o.variation)}</a>`).join(', ')}${x.lines.length > 3 ? ` +${x.lines.length - 3} more` : ''}</span></div>`).join('') :
        `<p class="muted">No more book moves in the library.${det && det.len === det.o.uci.length ? ` You reached the end of <a href="#/openings/${det.o.id}">${esc(det.o.family)}: ${esc(det.o.variation)}</a>.` : ''}</p>`;
      $$('#xnext [data-u]').forEach(x => x.onclick = () => { const r2 = g.playUci(x.dataset.u); CM.sound('move'); upd(r2); });
    };
    $('#xBack').onclick = () => { g.undo(); upd(g.hist[g.hist.length - 1]); };
    $('#xReset').onclick = () => { g.reset(START); upd(); };
    $('#xFlip').onclick = () => b.flip();
    upd();
  };
  $('#oq').oninput = e => { q = e.target.value.trim(); if (filter === 'explore') filter = 'all'; renderList(); };
  $$('#ochips button').forEach(b => b.onclick = () => { $$('#ochips button').forEach(x => x.classList.remove('on')); b.classList.add('on'); filter = b.dataset.f; renderList(); if (filter !== 'explore') detail(); });
  renderList(); detail();
}

// =====================================================================
// PUZZLES
const PZ = () => window.PUZZLES.map((p, i) => ({ i, fen: p[0], line: p[1].split(' '), rating: p[2], themes: p[3].split(','), last: p[4] || null }));
let PZC = null;
function puzzles() { return PZC || (PZC = PZ()); }
function puzzlesView(mode) {
  leave(); mode = mode || 'rated';
  const d = CM.store.d; if (d.puzzleRating == null) d.puzzleRating = d.rating || 1000;
  const themes = {}; puzzles().forEach(p => p.themes.forEach(t => themes[t] = (themes[t] || 0) + 1));
  view().innerHTML = `<section class="play">
    <div class="board-col"><div class="board-wrap"><div class="board" id="bd"></div></div></div>
    <aside class="panel">
      <div class="tabs sm" id="ptabs">${[['rated', '🧩 Rated'], ['themes', '🏷 Themes'], ['rush', '⚡ Rush'], ['mistakes', '🔁 My mistakes']].map(([k, n]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="phead"></div><div class="stepbox" id="sbox"></div><div class="fb" id="fb"></div><div class="ctrls" id="ctrl"></div><div id="pfoot"></div>
    </aside></section>`;
  $$('#ptabs button').forEach(b => b.onclick = () => go('puzzles/' + b.dataset.m));
  const board = makeBoard($('#bd'), {});
  let gen = 0; onLeave(() => gen++);
  const ui = {
    sbox: $('#sbox'), setFb: (h, k) => { const f = $('#fb'); f.innerHTML = h; f.className = 'fb ' + (k || ''); },
    controls: btns => { const c = $('#ctrl'); c.innerHTML = ''; for (const [l, fn, cls] of btns) { const x = document.createElement('button'); x.className = 'btn ' + (cls || ''); x.innerHTML = l; x.onclick = fn; c.appendChild(x); } },
    genRef: () => gen
  };
  const step = p => ({ fen: p.fen, line: p.line, last: p.last, rating: p.rating, mate: (p.themes.find(t => t.startsWith('mateIn')) || '').slice(6) | 0 || undefined, text: '' });
  const pick = (target, theme) => {
    const done = d.puzzlesDone; let c = puzzles().filter(p => !done[p.i] && (!theme || p.themes.includes(theme)));
    if (!c.length) c = puzzles().filter(p => !theme || p.themes.includes(theme));
    c.sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
    return c[Math.floor(Math.random() * Math.min(12, c.length))];
  };
  if (mode === 'rated' || mode === 'themes') {
    let theme = null;
    const head = () => { $('#phead').innerHTML = `<div class="prating"><small>Puzzle rating</small><b>${d.puzzleRating}</b>${mode === 'themes' ? `<select id="thSel"><option value="">Choose a theme…</option>${Object.keys(themes).filter(t => themes[t] >= 3).sort((a, b) => (CM.THEME_NAMES[a] || a).localeCompare(CM.THEME_NAMES[b] || b)).map(t => `<option value="${t}" ${theme === t ? 'selected' : ''}>${CM.THEME_NAMES[t] || t} (${themes[t]})</option>`).join('')}</select>` : ''}</div>`; const s = $('#thSel'); if (s) s.onchange = () => { theme = s.value || null; next(); }; };
    const next = () => {
      gen++; head(); ui.setFb(''); board.setArrows([]); board.setMarks({});
      const p = pick(d.puzzleRating, theme); if (!p) return;
      let counted = false;
      runPuzzle(board, step(p), Object.assign({}, ui, {
        onDone: (ok, fails) => {
          if (!counted) { counted = true; const res = ok && !fails; const delta = CM.updatePuzzleRating(p.rating, res, p.themes); CM.recordTheme(p.themes, res); d.puzzlesDone[p.i] = Date.now(); CM.store.save(); head();
            $('#pfoot').innerHTML = `<p class="muted sm">Puzzle ${p.rating} · ${p.themes.map(t => CM.THEME_NAMES[t] || t).join(', ')} · rating ${delta >= 0 ? '+' : ''}${delta}</p>`; }
          ui.controls([['Next puzzle →', next, 'primary']]);
        }
      }));
    };
    next();
  } else if (mode === 'rush') {
    let score = 0, strikes = 0, tEnd = 0, running = false, timer = null, level = 600;
    const head = () => { $('#phead').innerHTML = `<div class="rush"><div><small>Score</small><b>${score}</b></div><div><small>Time</small><b id="rt">${running ? Math.max(0, Math.ceil((tEnd - Date.now()) / 1000)) : 180}</b></div><div><small>Strikes</small><b>${'✘'.repeat(strikes)}${'·'.repeat(3 - strikes)}</b></div><div><small>Best</small><b>${d.rushBest}</b></div></div>`; };
    const end = () => { running = false; clearInterval(timer); gen++; board.disable(); if (score > d.rushBest) { d.rushBest = score; CM.store.save(); } head(); ui.sbox.innerHTML = `<div class="done-box"><h3>Rush over!</h3><p>You solved <b>${score}</b> puzzles.</p></div>`; ui.setFb(''); ui.controls([['Play again', start, 'primary']]); };
    const nextP = () => {
      gen++; if (!running) return; head(); board.setArrows([]); board.setMarks({});
      const p = pick(level); const myGen = gen;
      runPuzzle(board, step(p), Object.assign({}, ui, {
        controls: () => ui.controls([['Skip (strike)', () => { strikes++; if (strikes >= 3) end(); else nextP(); }]]),
        onDone: (ok, fails) => { if (myGen !== gen) return; if (ok && !fails) { score++; level += 60; } else { strikes++; } d.puzzlesDone[p.i] = Date.now(); head(); if (strikes >= 3) return end(); setTimeout(() => { if (myGen === gen) nextP(); }, ok ? 300 : 900); }
      }));
    };
    const start = () => { score = 0; strikes = 0; level = Math.max(400, (d.puzzleRating || 1000) - 500); running = true; tEnd = Date.now() + 180000; clearInterval(timer); timer = setInterval(() => { if (!running) return; const el = $('#rt'); if (el) el.textContent = Math.max(0, Math.ceil((tEnd - Date.now()) / 1000)); if (Date.now() >= tEnd) end(); }, 250); onLeave(() => clearInterval(timer)); nextP(); };
    head(); board.setFen(START); ui.sbox.innerHTML = '<p><b>Puzzle Rush:</b> solve as many puzzles as you can in 3 minutes. They get harder as you go. Three mistakes and you\'re out!</p>';
    ui.controls([['Start ⚡', start, 'primary']]);
  } else if (mode === 'mistakes') {
    const nextM = () => {
      gen++; ui.setFb(''); board.setArrows([]); board.setMarks({});
      const due = CM.dueMistakes();
      $('#phead').innerHTML = `<p class="muted">${due.length} due now · ${d.mistakes.length} in your deck. Positions come from your own games: find the move you missed. Correct answers come back later (spaced repetition).</p>`;
      if (!due.length) { board.setFen(START); ui.sbox.innerHTML = d.mistakes.length ? '<div class="done-box"><h3>All caught up!</h3><p>Come back later for the next review.</p></div>' : '<div class="done-box"><h3>Your deck is empty</h3><p>After a game, open the game report and add your mistakes here.</p></div>'; ui.controls([['Play a game', () => go('play'), 'primary']]); return; }
      const it = due[0]; const g = new CM.Game(it.fen); const user = g.turn; const myGen = gen;
      board.setOrientation(user); board.setFen(it.fen); board.setCheck(g.checkSq()); board.setMovable(user, g.dests());
      ui.sbox.innerHTML = `<p><b>${user === 'w' ? 'White' : 'Black'} to move.</b> In your game you played <b>${esc(it.played)}</b>. Find a better move.</p>`;
      let fails = 0;
      board.opts.onMove = async (f, t, p) => {
        if (myGen !== gen) return; const m = g.find(f, t, p); if (!m) return; const uci = g.pos.uci(m); const rec = g.play(m);
        board.setFen(g.fen(), { from: f, to: t }); board.setLastMove(f, t); board.disable();
        let ok = uci === it.best;
        if (!ok) { ui.setFb('<span class="muted">Checking…</span>'); const [a, b] = await Promise.all([CM.coachEngine().analyze(it.fen, [], 600), CM.coachEngine().analyze(it.fen, [uci], 600)]); if (myGen !== gen) return; const ex = CM.explain(it.fen, [], uci, a, b); ok = ex.loss < 4; }
        if (ok) { CM.sound('good'); CM.reviewMistake(it, fails === 0); ui.setFb(`✔ Correct! ${uci === it.best ? '' : 'The engine\'s first choice was ' + esc(it.bestSan) + '.'}`, 'ok'); ui.controls([['Next →', nextM, 'primary']]); }
        else { fails++; CM.sound('bad'); ui.setFb('✘ Not good enough. Try again.', 'bad'); setTimeout(() => { if (myGen !== gen) return; g.undo(); board.setFen(g.fen()); board.setLastMove(null); board.setMovable(user, g.dests()); }, 800); }
      };
      ui.controls([['Show answer', () => { board.setArrows([it.best.slice(0, 4) + 'g']); CM.reviewMistake(it, false); ui.setFb('The best move was <b>' + esc(it.bestSan) + '</b>. ' + (it.note || ''), 'bad'); ui.controls([['Next →', nextM, 'primary']]); }], ['Remove from deck', () => { d.mistakes.splice(d.mistakes.indexOf(it), 1); CM.store.save(); nextM(); }]]);
    };
    nextM();
  }
}

// =====================================================================
// REVIEW
function reviewView() {
  leave();
  const d = CM.store.d;
  view().innerHTML = `<section class="narrow"><div class="card"><h1>Analyze a game</h1><p class="muted">Paste a PGN from any site (chess.com, lichess, a book). The engine reviews every move and the coach explains your mistakes.</p>
    <textarea class="pgnbox" id="pgn" placeholder='[Event "..."]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 ...'></textarea>
    <div class="row"><label>I played: <select id="pc"><option value="w">White</option><option value="b">Black</option></select></label><button class="btn primary" id="anl">Analyze</button></div><p class="fb bad hidden" id="perr"></p></div>
    <h2>Your games</h2><div class="list">${d.games.slice().reverse().map(gameRow).join('') || '<p class="muted">No games yet.</p>'}</div></section>`;
  bindGameRows(view());
  $('#anl').onclick = () => {
    const r = CM.parsePgn($('#pgn').value);
    if (r.error || !r.game.hist.length) { const e = $('#perr'); e.textContent = r.error || 'No moves found.'; e.classList.remove('hidden'); return; }
    const res = r.tags.Result; const pc = $('#pc').value;
    const result = res === '1/2-1/2' ? 'draw' : res === '1-0' ? (pc === 'w' ? 'win' : 'loss') : res === '0-1' ? (pc === 'b' ? 'win' : 'loss') : 'draw';
    const rec = { id: 'g' + Date.now(), t: Date.now(), mode: 'import', userColor: pc, opp: (pc === 'w' ? r.tags.Black : r.tags.White) || 'opponent', result, reason: 'imported', start: r.game.start, moves: r.game.moves(), pgn: $('#pgn').value };
    d.games.push(rec); if (d.games.length > 40) d.games.shift(); CM.store.save();
    go('report/' + rec.id);
  };
}

// =====================================================================
// STATS
function statsView() {
  leave();
  const d = CM.store.d;
  const cats = window.CURRICULUM.cats;
  const g = d.games.filter(x => x.mode !== 'import');
  const W = g.filter(x => x.result === 'win').length, Lo = g.filter(x => x.result === 'loss').length, D = g.length - W - Lo;
  const accs = g.filter(x => x.acc != null).map(x => x.acc); const avgAcc = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
  const th = Object.entries(d.themeStats).filter(([, v]) => v.n >= 3).map(([k, v]) => ({ k, pct: Math.round(v.ok / v.n * 100), n: v.n })).sort((a, b) => a.pct - b.pct);
  view().innerHTML = `<section class="narrow">
    <div class="card"><h1>Your progress</h1>
      <div class="kpis"><div><small>Rating</small><b>${d.rating || '—'}</b><span>${d.rating ? levelName(d.rating) : ''}</span></div><div><small>Puzzle rating</small><b>${d.puzzleRating || '—'}</b><span>${d.puzzleGames} attempts</span></div><div><small>Games</small><b>${g.length}</b><span>${W}W ${D}D ${Lo}L</span></div><div><small>Avg accuracy</small><b>${avgAcc != null ? avgAcc + '%' : '—'}</b><span>from game reports</span></div></div>
      <h3>Rating</h3><div class="spark" id="sp1"></div><h3>Puzzle rating</h3><div class="spark" id="sp2"></div></div>
    <div class="card"><h2>Lessons</h2>${cats.map(c => { const all = CM.lessons.filter(l => l.cat === c.id), dn = all.filter(l => d.lessons[l.id]).length; return `<div class="bar"><span>${c.name}</span><div class="bt"><div style="width:${all.length ? dn / all.length * 100 : 0}%"></div></div><span>${dn}/${all.length}</span></div>`; }).join('')}</div>
    <div class="card"><h2>Tactical strengths & weaknesses</h2>${th.length ? th.map(t => `<div class="bar"><span>${CM.THEME_NAMES[t.k] || t.k}</span><div class="bt ${t.pct < 50 ? 'weak' : ''}"><div style="width:${t.pct}%"></div></div><span>${t.pct}% (${t.n})</span></div>`).join('') + (th[0] && th[0].pct < 60 ? `<p>Your weakest theme is <b>${CM.THEME_NAMES[th[0].k] || th[0].k}</b>. <a href="#/puzzles/themes">Practice it in Themes</a>.</p>` : '') : '<p class="muted">Solve rated puzzles to see which tactics you find hardest.</p>'}</div>
    <div class="card"><h2>Settings</h2>
      <label class="set"><input type="checkbox" id="sSound" ${d.settings.sound ? 'checked' : ''}> Sound effects</label>
      <label class="set"><input type="checkbox" id="sCoords" ${d.settings.coords ? 'checked' : ''}> Board coordinates</label>
      <label class="set"><input type="checkbox" id="sQueen" ${d.settings.autoQueen ? 'checked' : ''}> Always promote to queen</label>
      <label class="set">Board colors <select id="sBoard">${['green', 'brown', 'blue', 'gray'].map(x => `<option ${d.settings.board === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <div class="row"><button class="btn" id="redo">Redo the placement match</button><button class="btn" id="exp">Export progress</button><button class="btn danger" id="rst">Reset all progress</button></div></div></section>`;
  spark($('#sp1'), d.ratingHist.map(x => x.r)); spark($('#sp2'), d.puzzleHist.map(x => x.r));
  const sv = () => CM.store.save();
  $('#sSound').onchange = e => { d.settings.sound = e.target.checked; sv(); };
  $('#sCoords').onchange = e => { d.settings.coords = e.target.checked; sv(); };
  $('#sQueen').onchange = e => { d.settings.autoQueen = e.target.checked; sv(); };
  $('#sBoard').onchange = e => { d.settings.board = e.target.value; sv(); };
  $('#redo').onclick = () => go('placement');
  $('#exp').onclick = () => modal(`<h3>Your progress data</h3><p class="muted">Saved in this browser only. Copy it to keep a backup.</p><textarea class="pgnbox" readonly>${esc(JSON.stringify(d))}</textarea><div class="row end"><button class="btn primary" data-close>Close</button></div>`);
  $('#rst').onclick = () => { if (confirm('Delete your rating, lessons and games?')) { CM.store.reset(); updateMe(); go(''); } };
}

// =====================================================================
// ROUTER
function router() {
  leave(); $('#modal').classList.add('hidden');
  const h = location.hash.replace(/^#\/?/, ''); const [r, a] = [h.split('/')[0], h.split('/').slice(1).join('/')];
  $$('nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go.split('/')[0] === (r || '')));
  window.scrollTo(0, 0);
  if (r === 'placement') placementIntro();
  else if (r === 'play') playSetup(a);
  else if (r === 'report') reportView(a);
  else if (r === 'learn') learnView(a);
  else if (r === 'lesson') lessonView(a);
  else if (r === 'openings') openingsView(a);
  else if (r === 'puzzles') puzzlesView(a);
  else if (r === 'review') reviewView();
  else if (r === 'stats') statsView();
  else home();
}
window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', () => { bindGo(document.querySelector('header')); updateMe(); router(); });
})();
