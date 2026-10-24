// Menus: main, play, training, garage, settings (incl. rebinding), pause, results.
// Fully navigable with mouse, keyboard and gamepad.
'use strict';

const SETTINGS_SCHEMA = {
  controls: [
    ['deadzone', 'Controller Deadzone', 0, 0.5, 0.01],
    ['dodgeDeadzone', 'Dodge Deadzone', 0.1, 0.9, 0.05],
    ['deadzoneShape', 'Deadzone Shape', ['circle', 'cross']],
    ['steerSens', 'Steering Sensitivity', 1, 2, 0.05],
    ['aerialSens', 'Aerial Sensitivity', 1, 2, 0.05],
    ['invertPitch', 'Invert Air Pitch', 'bool'],
    ['vibration', 'Controller Vibration', 'bool'],
    ['kbSeparatePitch', 'Keyboard: W/S never pitch', 'bool'],
  ],
  camera: [
    ['fov', 'Field of View', 60, 110, 1],
    ['distance', 'Distance', 100, 400, 10],
    ['height', 'Height', 40, 200, 10],
    ['angle', 'Angle', -15, 0, 1],
    ['stiffness', 'Stiffness', 0, 1, 0.05],
    ['swivel', 'Swivel Speed', 1, 10, 0.5],
    ['transition', 'Transition Speed', 1, 2, 0.1],
    ['ballCamDefault', 'Ball Cam On By Default', 'bool'],
    ['ballCamMode', 'Ball Cam Button', ['toggle', 'hold']],
    ['shake', 'Camera Shake', 'bool'],
  ],
  video: [
    ['quality', 'Quality', ['low', 'medium', 'high']],
    ['shadows', 'Shadows', 'bool'],
    ['renderScale', 'Render Scale', 0.5, 1, 0.05],
    ['particles', 'Particles', 'bool'],
    ['nameplates', 'Bot Nameplates', 'bool'],
    ['showFps', 'Show FPS', 'bool'],
  ],
  audio: [
    ['master', 'Master Volume', 0, 1, 0.05],
    ['sfx', 'Effects Volume', 0, 1, 0.05],
    ['engine', 'Engine & Boost', 0, 1, 0.05],
  ],
};
const MATCH_SCHEMA = [
  ['botLevel', 'Bot Difficulty', ['rookie', 'pro', 'allstar'], { rookie: 'Rookie', pro: 'Pro', allstar: 'All-Star' }],
  ['matchLength', 'Match Length', [120, 300, 600], { 120: '2 Minutes', 300: '5 Minutes', 600: '10 Minutes' }],
  ['demos', 'Demolitions', 'bool'],
  ['gravity', 'Gravity', ['default', 'low', 'high', 'super'], { default: 'Default', low: 'Low', high: 'High', super: 'Super High' }],
  ['ballSize', 'Ball Size', ['default', 'small', 'large', 'huge'], { default: 'Default', small: 'Small', large: 'Large', huge: 'Gigantic' }],
  ['ballSpeed', 'Ball Max Speed', ['default', 'slow', 'fast', 'super'], { default: 'Default', slow: 'Slow', fast: 'Fast', super: 'Super Fast' }],
  ['bounce', 'Ball Bounciness', ['default', 'low', 'high', 'super'], { default: 'Default', low: 'Low', high: 'High', super: 'Super High' }],
  ['boost', 'Boost Amount', ['default', 'unlimited', 'recharge', 'none'], { default: 'Default', unlimited: 'Unlimited', recharge: 'Recharge', none: 'No Boost' }],
  ['gameSpeed', 'Game Speed', ['default', 'slow', 'slowmo'], { default: 'Default', slow: 'Slow', slowmo: 'Slo-mo' }],
  ['freeplayBoost', 'Unlimited Boost in Free Play', 'bool'],
];

class UI {
  constructor(game, input, sfx, settings, loadout, renderer, save) {
    this.game = game; this.input = input; this.sfx = sfx; this.settings = settings; this.loadout = loadout; this.r = renderer;
    this.save = save;
    this.screen = 'main';
    this.stack = [];
    this.navRepeat = 0; this.navDir = null;
    this.garageTab = 'body';
    this.settingsTab = 'controls';
    this.garagePreviewBoost = false;
    game.ui = this;
    this.el = (id) => document.getElementById(id);
    this.garageParticles = new Particles(renderer.garage.scene, 1200);
    this.garageParticles.mat.uniforms.scale.value = window.innerHeight * 0.9;
    this.bind();
    this.buildPlay();
    this.buildGarage();
    this.buildSettings();
    this.buildHelp();
    this.show('main');
    input.onPadChange = (pad) => {
      const s = this.el('padStatus');
      s.textContent = pad ? '🎮 ' + pad.id.replace(/\(.*?\)/g, '').trim().slice(0, 40) : 'No controller detected — press any button';
      s.classList.toggle('on', !!pad);
    };
  }

  bind() {
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { this.sfx.init(); this.sfx.click(); this.go(b.dataset.go); }));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { this.sfx.click(); this.back(); }));
    document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => {
      this.sfx.init(); this.sfx.click();
      const [mode, arg] = b.dataset.start.split(':');
      const opts = {};
      if (mode === 'exhibition' || mode === 'heatseeker') opts.size = +arg;
      if (mode === 'training') opts.pack = arg;
      if (mode === 'kickoff') opts.opponent = arg !== 'solo';
      this.startGame(mode, opts);
    }));
    this.el('btnResume').addEventListener('click', () => this.togglePause(false));
    this.el('btnRestart').addEventListener('click', () => { this.togglePause(false); this.startGame(this.game.mode, this.game.opts); });
    this.el('btnPauseSettings').addEventListener('click', () => { this.go('settings'); });
    this.el('btnQuit').addEventListener('click', () => this.quitToMenu());
    this.el('btnRematch').addEventListener('click', () => this.startGame(this.game.mode, this.game.opts));
    this.el('btnResultsMenu').addEventListener('click', () => this.quitToMenu());
    document.addEventListener('click', () => this.sfx.init(), { once: true });
    window.addEventListener('keydown', (e) => {
      if (this.input.capture) return;
      if (!this.menuActive()) return;
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (map[e.code] && !(document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text')) { e.preventDefault(); this.nav(map[e.code]); }
      else if (e.code === 'Escape' || e.code === 'Backspace' && !(document.activeElement && document.activeElement.tagName === 'INPUT')) {
        // the pause screen itself is toggled by the game's pause binding
        if (this.screen !== 'pause' && this.screen !== 'main' && this.screen !== 'results') {
          this.back();
          this.input.pressedEdges.delete(e.code);
        }
      } else if (e.code === 'Enter' && document.activeElement && document.activeElement.click && document.activeElement !== document.body) {
        if (document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); document.activeElement.click(); }
      }
    });
    // garage drag
    const canvas = document.getElementById('game');
    let lastX = 0;
    canvas.addEventListener('pointerdown', (e) => { if (this.screen === 'garage') { this.r.garage.dragging = true; lastX = e.clientX; } });
    window.addEventListener('pointermove', (e) => { if (this.r.garage.dragging) { this.r.garage.angle += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
    window.addEventListener('pointerup', () => { this.r.garage.dragging = false; });
    canvas.addEventListener('wheel', (e) => { if (this.screen === 'garage') this.r.garage.zoom = clamp(this.r.garage.zoom + e.deltaY * 0.001, 0.6, 1.6); }, { passive: true });
  }

  menuActive() { return this.screen !== null; }

  show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
    this.screen = name;
    document.getElementById('menus').classList.toggle('hidden', !name);
    document.body.classList.toggle('in-garage', name === 'garage');
    document.body.classList.toggle('in-menu', !!name && !this.game.player);
    if (name === 'garage') this.refreshGarage();
    if (name === 'settings') this.renderSettingsTab();
    setTimeout(() => this.focusFirst(), 0);
  }
  go(name) { this.stack.push(this.screen); this.show(name); }
  back() {
    const prev = this.stack.pop();
    if (this.screen === 'settings') this.save();
    if (this.screen === 'garage') { this.save(); }
    this.show(prev || (this.game.player ? 'pause' : 'main'));
  }
  focusFirst() {
    const scr = document.querySelector('.screen.active');
    if (!scr) return;
    const el = scr.querySelector('[data-autofocus]') || this.focusables()[0];
    if (el && this.input.lastDevice === 'pad') el.focus();
  }
  focusables() {
    const scr = document.querySelector('.screen.active');
    if (!scr) return [];
    return Array.from(scr.querySelectorAll('button, input, .stepper, [tabindex="0"]')).filter(e => e.offsetParent !== null && !e.disabled);
  }

  nav(dir) {
    const list = this.focusables();
    if (!list.length) return;
    let cur = document.activeElement;
    if (!list.includes(cur)) { list[0].focus(); return; }
    // adjust value controls horizontally
    if (dir === 'left' || dir === 'right') {
      const d = dir === 'left' ? -1 : 1;
      if (cur.classList.contains('stepper')) { cur._step(d); this.sfx.click(); return; }
      if (cur.type === 'range') { const st = +cur.step || 1; cur.value = clamp(+cur.value + st * d, +cur.min, +cur.max); cur.dispatchEvent(new Event('input')); return; }
    }
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = 1e9;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      let primary, ortho;
      if (dir === 'up') { primary = -dy; ortho = Math.abs(dx); }
      else if (dir === 'down') { primary = dy; ortho = Math.abs(dx); }
      else if (dir === 'left') { primary = -dx; ortho = Math.abs(dy); }
      else { primary = dx; ortho = Math.abs(dy); }
      if (primary <= 2) continue;
      const score = primary + ortho * 2.5;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); this.sfx.click(); }
  }

  // called every frame by main loop (after input.poll)
  update(dt) {
    const inp = this.input;
    if (inp.capture) return;
    if (!this.screen) return;
    const B = (i) => inp.padButtons[i] > 0.5 && !(inp.padPrev[i] > 0.5);
    const ax = inp.padAxes[0], ay = inp.padAxes[1];
    let dir = null;
    if (inp.padButtons[12] > 0.5 || ay < -0.6) dir = 'up';
    else if (inp.padButtons[13] > 0.5 || ay > 0.6) dir = 'down';
    else if (inp.padButtons[14] > 0.5 || ax < -0.6) dir = 'left';
    else if (inp.padButtons[15] > 0.5 || ax > 0.6) dir = 'right';
    if (dir) {
      if (dir !== this.navDir) { this.navDir = dir; this.navRepeat = 0.38; this.nav(dir); }
      else { this.navRepeat -= dt; if (this.navRepeat <= 0) { this.navRepeat = 0.11; this.nav(dir); } }
    } else this.navDir = null;
    if (B(0)) {
      this.sfx.init();
      const a = document.activeElement;
      if (a && a !== document.body && this.focusables().includes(a)) a.click();
      else this.focusables()[0] && this.focusables()[0].focus();
    }
    if (B(1)) {
      if (this.screen === 'pause') this.togglePause(false);
      else if (this.screen !== 'main' && this.screen !== 'results') { this.sfx.click(); this.back(); }
    }
    // tabs with bumpers
    if (B(4) || B(5)) {
      const d = B(5) ? 1 : -1;
      const tabs = document.querySelector('.screen.active .tabs');
      if (tabs) {
        const btns = Array.from(tabs.querySelectorAll('button'));
        const i = btns.findIndex(b => b.classList.contains('active'));
        const n = btns[(i + d + btns.length) % btns.length];
        n.click();
      }
    }
    if (this.screen === 'garage') {
      const rx = inp.padAxes[2];
      if (Math.abs(rx) > 0.2) { this.r.garage.angle += rx * dt * 3; }
    }
  }

  startGame(mode, opts) {
    this.stack = [];
    this.show(null);
    document.getElementById('menus').classList.add('hidden');
    document.body.classList.remove('in-menu');
    this.game.paused = false;
    this.game.start(mode, opts || {});
    const cv = document.getElementById('game');
    cv.focus && cv.focus();
  }
  quitToMenu() {
    this.game.paused = false;
    this.game.menuWorld();
    this.el('results').classList.add('hidden');
    this.el('scoreboard').classList.add('hidden');
    this.stack = [];
    document.body.dataset.mode = '';
    this.show('main');
  }
  togglePause(force) {
    const g = this.game;
    if (!g.player || g.state === 'ended') return;
    const want = force === undefined ? !g.paused : force;
    g.paused = want;
    if (want) { this.stack = []; this.show('pause'); }
    else { this.save(); this.show(null); document.getElementById('menus').classList.add('hidden'); document.getElementById('game').focus(); }
  }

  showResults(won) {
    const g = this.game;
    const el = this.el('results');
    const rows = [];
    let mvp = null;
    for (const c of g.world.cars) if ((c.team === (g.score[0] > g.score[1] ? 0 : 1)) && (!mvp || c.stats.score > mvp.stats.score)) mvp = c;
    for (const team of [0, 1]) {
      for (const c of g.world.cars.filter(c => c.team === team).sort((a, b) => b.stats.score - a.stats.score)) {
        rows.push(`<tr class="${team ? 'orange' : 'blue'} ${c === g.player ? 'me' : ''}"><td>${c === mvp ? '★ ' : ''}${c.name}</td><td>${c.stats.score}</td><td>${c.stats.goals}</td><td>${c.stats.assists}</td><td>${c.stats.saves}</td><td>${c.stats.shots}</td></tr>`);
      }
    }
    this.el('resultsTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
    this.el('resultsTitle').className = won ? 'good' : 'bad';
    this.el('resultsScore').innerHTML = `<span class="blue">${g.score[0]}</span> – <span class="orange">${g.score[1]}</span>`;
    this.el('resultsRows').innerHTML = `<tr class="th"><td>Player</td><td>Score</td><td>Goals</td><td>Assists</td><td>Saves</td><td>Shots</td></tr>` + rows.join('');
    this.el('centerMsg').className = '';
    this.el('subMsg').className = '';
    this.show('results');
  }

  // ---------------------------------------------------------------- play screen
  stepper(label, values, get, set, names) {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('label'); lab.textContent = label;
    const st = document.createElement('div');
    st.className = 'stepper'; st.tabIndex = 0;
    const left = document.createElement('span'); left.className = 'arr'; left.textContent = '‹';
    const val = document.createElement('span'); val.className = 'val';
    const right = document.createElement('span'); right.className = 'arr'; right.textContent = '›';
    st.append(left, val, right);
    const render = () => {
      const v = get();
      val.textContent = values === 'bool' ? (v ? 'On' : 'Off') : (names && names[v] !== undefined ? names[v] : String(v).replace(/^\w/, c => c.toUpperCase()));
    };
    st._step = (d) => {
      if (values === 'bool') set(!get());
      else { const i = values.indexOf(get()); set(values[(i + d + values.length) % values.length]); }
      render();
    };
    left.addEventListener('click', (e) => { e.stopPropagation(); st._step(-1); this.sfx.click(); });
    right.addEventListener('click', (e) => { e.stopPropagation(); st._step(1); this.sfx.click(); });
    st.addEventListener('click', () => { st._step(1); this.sfx.click(); });
    render();
    row.append(lab, st);
    return row;
  }
  slider(label, min, max, step, get, set) {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('label'); lab.textContent = label;
    const wrap = document.createElement('div'); wrap.className = 'slider';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
    const out = document.createElement('span'); out.className = 'sv';
    const fmt = (v) => (step < 1 ? (+v).toFixed(step < 0.1 ? 2 : 1) : String(v));
    out.textContent = fmt(get());
    inp.addEventListener('input', () => { set(+inp.value); out.textContent = fmt(inp.value); });
    wrap.append(inp, out);
    row.append(lab, wrap);
    return row;
  }

  buildPlay() {
    const box = this.el('matchSettings');
    const G = this.settings.gameplay;
    for (const [key, label, vals, names] of MATCH_SCHEMA) {
      box.appendChild(this.stepper(label, vals, () => G[key], (v) => { G[key] = v; this.save(); }, names));
    }
  }

  // ---------------------------------------------------------------- settings
  buildSettings() {
    const tabs = this.el('settingsTabs');
    for (const t of ['controls', 'bindings', 'camera', 'video', 'audio']) {
      const b = document.createElement('button');
      b.textContent = t[0].toUpperCase() + t.slice(1);
      b.dataset.tab = t;
      b.addEventListener('click', () => { this.settingsTab = t; this.renderSettingsTab(); this.sfx.click(); });
      tabs.appendChild(b);
    }
  }
  renderSettingsTab() {
    const t = this.settingsTab;
    this.el('settingsTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    const body = this.el('settingsBody');
    body.innerHTML = '';
    if (t === 'bindings') return this.renderBindings(body);
    const group = this.settings[t];
    for (const def of SETTINGS_SCHEMA[t]) {
      const [key, label, a, b, c] = def;
      const set = (v) => { group[key] = v; this.onSettingChanged(t, key); };
      if (a === 'bool' || Array.isArray(a)) body.appendChild(this.stepper(label, a, () => group[key], set));
      else body.appendChild(this.slider(label, a, b, c, () => group[key], set));
    }
    if (t === 'camera') {
      const p = document.createElement('div'); p.className = 'note';
      p.textContent = 'Defaults mirror common pro camera settings: FOV 110 · Distance 270 · Height 100 · Angle -4 · Stiffness 0.45.';
      body.appendChild(p);
    }
    if (t === 'controls') {
      const s = document.createElement('div'); s.className = 'note'; s.id = 'padStatus';
      const pad = this.input.pad;
      s.textContent = pad ? '🎮 ' + pad.id.replace(/\(.*?\)/g, '').trim().slice(0, 40) : 'No controller detected — press any button on your controller';
      body.appendChild(s);
    }
  }
  onSettingChanged(group, key) {
    if (group === 'video') this.r.applyVideo();
    if (group === 'audio') this.sfx.applyVolume();
    if (group === 'controls' && key === 'dodgeDeadzone' && this.game.player) this.game.player.dodgeDeadzone = this.settings.controls.dodgeDeadzone;
    if (group === 'video' && key === 'nameplates') for (const [car, v] of this.r.carViews) v.showName = car.isBot && this.settings.video.nameplates;
  }
  renderBindings(body) {
    const B = this.settings.bindings;
    const table = document.createElement('div');
    table.className = 'bindings';
    const head = document.createElement('div'); head.className = 'brow head';
    head.innerHTML = '<span>Action</span><span>Keyboard / Mouse</span><span>Controller</span>';
    table.appendChild(head);
    for (const a of ACTIONS) {
      const row = document.createElement('div'); row.className = 'brow';
      const name = document.createElement('span'); name.textContent = a.label;
      const kb = document.createElement('button'); kb.className = 'bind-btn';
      const pad = document.createElement('button'); pad.className = 'bind-btn';
      const renderBtns = () => {
        kb.textContent = (B.keys[a.id] || []).map(keyName).join(' / ') || '—';
        pad.textContent = (B.pad[a.id] || []).map(i => PAD_NAMES[i] || 'Btn ' + i).join(' / ') || '—';
      };
      renderBtns();
      kb.addEventListener('click', () => {
        kb.textContent = 'Press a key… (Esc clears)';
        this.input.capture = (ev) => {
          if (ev.type === 'key') {
            if (ev.code === 'Escape') B.keys[a.id] = [];
            else {
              const prev = B.keys[a.id] || [];
              B.keys[a.id] = [ev.code].concat(prev.filter(k => k !== ev.code && k.startsWith('Mouse') !== ev.code.startsWith('Mouse'))).slice(0, 2);
            }
          }
          renderBtns(); this.save();
        };
      });
      pad.addEventListener('click', () => {
        pad.textContent = 'Press a controller button…';
        setTimeout(() => {
          this.input.capture = (ev) => {
            if (ev.type === 'pad') B.pad[a.id] = [ev.index];
            else if (ev.code === 'Escape') B.pad[a.id] = [];
            renderBtns(); this.save();
          };
        }, 250);
      });
      row.append(name, kb, pad);
      table.appendChild(row);
    }
    body.appendChild(table);
    const reset = document.createElement('button');
    reset.className = 'btn small';
    reset.textContent = 'Reset bindings to defaults';
    reset.addEventListener('click', () => {
      B.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
      B.pad = JSON.parse(JSON.stringify(DEFAULT_PAD));
      this.save(); this.renderSettingsTab();
    });
    body.appendChild(reset);
    const n = document.createElement('div'); n.className = 'note';
    n.textContent = 'Steering, pitch and throttle also read the left stick and triggers. Air roll left/right are directional air rolls.';
    body.appendChild(n);
  }

  // ---------------------------------------------------------------- garage
  buildGarage() {
    const tabs = this.el('garageTabs');
    const T = [['body', 'Body'], ['paint', 'Paint'], ['accent', 'Decal'], ['wheels', 'Wheels'], ['boost', 'Boost'], ['topper', 'Topper'], ['antenna', 'Antenna'], ['player', 'Player']];
    for (const [id, name] of T) {
      const b = document.createElement('button');
      b.textContent = name; b.dataset.tab = id;
      b.addEventListener('click', () => { this.garageTab = id; this.refreshGarage(); this.sfx.click(); });
      tabs.appendChild(b);
    }
  }
  refreshGarage() {
    const lo = this.loadout;
    this.el('garageTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === this.garageTab));
    const body = this.el('garageBody');
    body.innerHTML = '';
    const apply = () => { this.r.garage.setCar(lo); this.save(); this.refreshGarage(); };
    const cards = (items, cur, onPick, desc) => {
      const g = document.createElement('div'); g.className = 'cards';
      for (const it of items) {
        const c = document.createElement('button');
        c.className = 'card' + (it === cur ? ' sel' : '');
        c.innerHTML = `<b>${desc ? desc(it).title : it}</b>${desc ? `<small>${desc(it).sub}</small>` : ''}`;
        c.addEventListener('click', () => { onPick(it); apply(); this.sfx.click(); });
        g.appendChild(c);
      }
      body.appendChild(g);
    };
    const swatches = (cur, onPick) => {
      const g = document.createElement('div'); g.className = 'swatches';
      for (const col of PAINTS.concat(['#ffffff'])) {
        const s = document.createElement('button');
        s.className = 'swatch' + (col.toLowerCase() === String(cur).toLowerCase() ? ' sel' : '');
        s.style.background = col;
        s.title = col;
        s.addEventListener('click', () => { onPick(col); apply(); this.sfx.click(); });
        g.appendChild(s);
      }
      const custom = document.createElement('input');
      custom.type = 'color'; custom.value = cur; custom.className = 'swatch custom'; custom.title = 'Custom color';
      custom.addEventListener('change', () => { onPick(custom.value); apply(); });
      g.appendChild(custom);
      body.appendChild(g);
    };
    const h = (t) => { const e = document.createElement('h4'); e.textContent = t; body.appendChild(e); };
    this.garagePreviewBoost = this.garageTab === 'boost';
    switch (this.garageTab) {
      case 'body':
        cards(Object.keys(HITBOXES), lo.body, (b) => lo.body = b, (b) => {
          const hb = HITBOXES[b];
          return { title: hb.name, sub: `${hb.l.toFixed(1)} × ${hb.w.toFixed(1)} × ${hb.h.toFixed(1)} uu` };
        });
        break;
      case 'paint': h('Primary color (Free Play & Training — matches use team colors)'); swatches(lo.primary, (c) => lo.primary = c); break;
      case 'accent': h('Decal / accent color'); swatches(lo.accent, (c) => lo.accent = c); break;
      case 'wheels':
        h('Style'); cards(WHEEL_STYLES, lo.wheel, (w) => lo.wheel = w);
        h('Rim color'); swatches(lo.wheelColor, (c) => lo.wheelColor = c);
        break;
      case 'boost':
        h('Trail'); cards(BOOST_STYLES, lo.boostStyle, (s) => lo.boostStyle = s);
        h('Color'); swatches(lo.boostColor, (c) => lo.boostColor = c);
        break;
      case 'topper': cards(TOPPERS, lo.topper, (t) => lo.topper = t); break;
      case 'antenna': cards(ANTENNAS, lo.antenna, (t) => lo.antenna = t); break;
      case 'player': {
        h('Player name');
        const inp = document.createElement('input');
        inp.type = 'text'; inp.maxLength = 16; inp.value = lo.name; inp.className = 'textin';
        inp.addEventListener('input', () => { lo.name = inp.value || 'You'; this.save(); });
        body.appendChild(inp);
        break;
      }
    }
    const hb = HITBOXES[lo.body];
    this.el('garageInfo').innerHTML = `<b>${hb.name}</b> hitbox · L ${hb.l.toFixed(2)} · W ${hb.w.toFixed(2)} · H ${hb.h.toFixed(2)} · offset ${hb.ox.toFixed(2)}, ${hb.oz.toFixed(2)}`;
    if (!this.r.garage.model || this.r.garage.cfgKey !== JSON.stringify(lo)) {
      this.r.garage.setCar(lo);
      this.r.garage.cfgKey = JSON.stringify(lo);
    }
  }
  updateGarage(dt) {
    const g = this.r.garage;
    g.update(dt, window.innerWidth / window.innerHeight, this.garagePreviewBoost);
    const m = g.model;
    if (m && this.garagePreviewBoost) {
      g.scene.updateMatrixWorld();
      const ex = m.exhaustLocal.clone().applyMatrix4(m.group.matrixWorld);
      const back = new THREE.Vector3(-1, 0, 0).transformDirection(m.group.matrixWorld);
      const col = new THREE.Color(this.loadout.boostColor);
      for (let k = 0; k < 2; k++) {
        const sp = 260 + Math.random() * 180;
        const j = () => (Math.random() - 0.5) * 30;
        if (this.loadout.boostStyle === 'Sparkle') this.garageParticles.emit(ex.x, ex.y, ex.z, back.x * sp + j(), back.y * sp + j(), back.z * sp + j(), 1, 1, 1, 7, 0.6, { drag: 2, grav: -120, grow: 0.6 });
        else if (this.loadout.boostStyle === 'Plasma') this.garageParticles.emit(ex.x, ex.y, ex.z, back.x * sp * 0.4, back.y * sp * 0.4, back.z * sp * 0.4, col.r, col.g, col.b, 24, 0.5, { drag: 3, grow: 0.4 });
        else this.garageParticles.emit(ex.x, ex.y, ex.z, back.x * sp + j(), back.y * sp + j(), back.z * sp + j(), lerp(col.r, 1, 0.3), lerp(col.g, 0.9, 0.2), col.b, 20, 0.35, { drag: 3, grow: 2 });
      }
    }
    this.garageParticles.update(dt);
    this.r.render(g.scene, g.camera);
  }

  buildHelp() {
    const kb = this.el('helpBody');
    kb.innerHTML = `
      <div class="helpcols">
        <div><h4>Keyboard & Mouse</h4>
          <p><b>W / S</b> throttle · reverse (also pitch in air)</p>
          <p><b>A / D</b> steer · yaw</p>
          <p><b>Space</b> or <b>Right Mouse</b> jump / double jump / dodge</p>
          <p><b>Shift</b> or <b>Left Mouse</b> boost</p>
          <p><b>C</b> powerslide · free air roll</p>
          <p><b>Q / E</b> air roll left / right</p>
          <p><b>↑ / ↓</b> pitch only</p>
          <p><b>F</b> ball cam · <b>Tab</b> scoreboard · <b>Esc</b> pause</p>
        </div>
        <div><h4>Controller</h4>
          <p><b>RT / LT</b> throttle · reverse</p>
          <p><b>Left stick</b> steer · pitch · yaw</p>
          <p><b>A</b> jump · <b>B</b> boost · <b>X</b> powerslide / air roll</p>
          <p><b>LB / RB</b> air roll left / right</p>
          <p><b>Y</b> ball cam · <b>Start</b> pause · <b>Back</b> reset shot</p>
          <p>Every action can be rebound in Settings → Bindings.</p>
        </div>
        <div><h4>Free Play tools</h4>
          <p><b>R</b> reset ball · <b>T</b> lob to me · <b>G</b> air-dribble pop</p>
          <p><b>Y</b> wall shot · <b>B</b> freeze ball · <b>U</b> toggle ∞ boost</p>
          <p><b>Backspace</b> reset car · <b>H</b> hide help</p>
          <p>D-pad: ↑ pop · ↓ lob · ← wall · → reset car</p>
        </div>
        <div><h4>Mechanics</h4>
          <p><b>Dodge</b>: jump, then jump again with a direction within 1.25 s.</p>
          <p><b>Flip cancel / half flip</b>: back-flip, then hold forward to cancel and air roll.</p>
          <p><b>Wall & ceiling</b>: drive up the curved ramps; landing on the ceiling with 3+ wheels restores your flip.</p>
          <p><b>Flip reset</b>: touch the ball with all wheels — your flip comes back (watch the FLIP indicator).</p>
          <p><b>Air dribble</b>: push the ball upward with the nose while boosting.</p>
        </div>
      </div>`;
  }
}
