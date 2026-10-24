// Game modes, match flow, camera, HUD.
'use strict';

const DEFAULT_SETTINGS = {
  camera: { fov: 110, distance: 270, height: 100, angle: -4, stiffness: 0.45, swivel: 5, transition: 1.2, ballCamDefault: true, ballCamMode: 'toggle', shake: true },
  controls: { deadzone: 0.08, dodgeDeadzone: 0.5, steerSens: 1.0, aerialSens: 1.0, deadzoneShape: 'circle', invertPitch: false, vibration: true, kbSeparatePitch: false },
  video: { quality: 'high', shadows: true, renderScale: 1, particles: true, showFps: false, nameplates: true },
  audio: { master: 0.7, sfx: 0.9, engine: 0.6 },
  bindings: { keys: DEFAULT_KEYS, pad: DEFAULT_PAD },
  gameplay: { matchLength: 300, botLevel: 'pro', gravity: 'default', ballSize: 'default', ballSpeed: 'default', bounce: 'default', boost: 'default', gameSpeed: 'default', demos: true, freeplayBoost: true, showPrediction: false },
};
const DEFAULT_LOADOUT = { name: 'You', body: 'octane', primary: '#1e6bff', accent: '#ffffff', wheel: 'Classic', wheelColor: '#c9ced8', boostColor: '#ff9a2a', boostStyle: 'Flame', topper: 'None', antenna: 'None' };

const MUTATORS = {
  gravity: { default: -650, low: -325, high: -1137.5, super: -3250 },
  ballSize: { default: 91.25, small: 60, large: 140, huge: 220 },
  ballSpeed: { default: 6000, slow: 2600, fast: 9000, super: 14000 },
  bounce: { default: 0.6, low: 0.3, high: 0.85, super: 1.0 },
  gameSpeed: { default: 1, slow: 0.7, slowmo: 0.5 },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (base && typeof base[k] === 'object' && base[k] && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

// --------------------------------------------------------------- camera
class CameraRig {
  constructor(renderer, settings) {
    this.r = renderer; this.settings = settings;
    this.focus = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 1, 0);
    this.elev = 0;
    this.look = new THREE.Vector3(0, 1, 0);
    this.shake = 0;
    this.ballBlend = 1;
    this.init = false;
  }
  snap() { this.init = false; }
  update(dt, carPos, car, ballPos, ballCam) {
    const S = this.settings.camera;
    const cam = this.r.camera;
    if (!this.init) {
      this.focus.copy(carPos);
      this.dir.set(car.fwd.x, car.fwd.y, 0).normalize();
      this.init = true;
    }
    const kFollow = 1 - Math.exp(-dt * (12 + 60 * S.stiffness));
    this.focus.lerp(carPos, kFollow);
    // lag in position grows with speed (lower stiffness = more pull-back)
    this.ballBlend += ((ballCam ? 1 : 0) - this.ballBlend) * Math.min(1, dt * 4 * S.transition);
    const toBall = _c1.subVectors(ballPos, this.focus);
    const hb = Math.hypot(toBall.x, toBall.y);
    const ballDir = _c2.set(toBall.x, toBall.y, 0);
    if (hb > 1) ballDir.divideScalar(hb); else ballDir.copy(this.dir);
    // car direction: forward on ground, velocity in air
    const carDir = _c3.set(car.fwd.x, car.fwd.y, 0);
    if (car.numArenaWheels < 3 || Math.abs(car.up.z) < 0.5) {
      const vh = Math.hypot(car.vel.x, car.vel.y);
      if (vh > 300) carDir.set(car.vel.x / vh, car.vel.y / vh, 0);
      else if (carDir.lengthSq() < 0.01) carDir.copy(this.dir);
    }
    if (carDir.lengthSq() < 1e-4) carDir.copy(this.dir);
    carDir.normalize();
    const target = _c4.copy(carDir).lerp(ballDir, this.ballBlend);
    if (target.lengthSq() < 1e-4) target.copy(this.dir);
    target.normalize();
    const rate = ballCam ? 14 : 7 + S.swivel;
    this.dir.lerp(target, Math.min(1, dt * rate)).normalize();
    // elevation for ball cam
    const elT = this.ballBlend * clamp(Math.atan2(ballPos.z - this.focus.z, Math.max(hb, 1)), -0.25, 0.9);
    this.elev += (elT - this.elev) * Math.min(1, dt * 8);
    const ce = Math.cos(this.elev * 0.55), se = Math.sin(this.elev * 0.55);
    const pos = _c5.copy(this.focus).addScaledVector(this.dir, -S.distance * ce);
    pos.z += S.height - S.distance * se;
    // keep inside arena
    const cs = queryContacts(pos.x, pos.y, pos.z, 40);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const pen = 40 - c.d;
      pos.x += c.nx * pen; pos.y += c.ny * pen; pos.z += c.nz * pen;
    }
    if (pos.z < 25) pos.z = 25;
    if (this.shake > 0 && S.shake) {
      pos.x += (Math.random() - 0.5) * this.shake; pos.y += (Math.random() - 0.5) * this.shake; pos.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 6);
      if (this.shake < 0.5) this.shake = 0;
    }
    cam.position.copy(pos);
    // look direction
    const carLook = _c6.copy(this.dir);
    const ballLook = _c1.subVectors(ballPos, pos).normalize();
    const look = carLook.lerp(ballLook, this.ballBlend).normalize();
    const pitch = S.angle * Math.PI / 180;
    // apply pitch offset around the horizontal right axis
    const h = Math.hypot(look.x, look.y) || 1;
    const curEl = Math.atan2(look.z, h);
    const newEl = clamp(curEl + pitch, -1.45, 1.45);
    look.set(look.x / h * Math.cos(newEl), look.y / h * Math.cos(newEl), Math.sin(newEl));
    cam.lookAt(pos.x + look.x * 1000, pos.y + look.y * 1000, pos.z + look.z * 1000);
    if (this.r.hfov !== S.fov) this.r.setFov(S.fov);
  }
  orbit(t) {
    const cam = this.r.camera;
    const a = t * 0.06;
    cam.position.set(Math.cos(a) * 3300, Math.sin(a) * 4300, 1100 + Math.sin(t * 0.1) * 250);
    cam.lookAt(0, 0, 200);
    if (this.r.hfov !== 100) this.r.setFov(100);
  }
}
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3(), _c4 = new THREE.Vector3(), _c5 = new THREE.Vector3(), _c6 = new THREE.Vector3();

// --------------------------------------------------------------- training packs
function trainingShots(pack, seed) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + (b - a) * rnd();
  const shots = [];
  for (let i = 0; i < 10; i++) {
    let s;
    if (pack === 'striker') {
      const bx = R(-2600, 2600), by = R(500, 3200);
      const cx = R(-2400, 2400), cy = R(-3200, -1400);
      s = { ball: [bx, by, R(93, 350)], ballVel: [R(-500, 500), R(-900, 300), R(0, 500)], car: [cx, cy, Math.atan2(by - cy, bx - cx)], goalTeam: 0 };
    } else if (pack === 'aerial') {
      const bx = R(-1700, 1700), by = R(1600, 3800);
      const cx = R(-1500, 1500), cy = R(-1200, 600);
      s = { ball: [bx, by, R(750, 1550)], ballVel: [R(-200, 200), R(-200, 300), R(100, 450)], car: [cx, cy, Math.atan2(by - cy, bx - cx)], goalTeam: 0 };
    } else if (pack === 'goalie') {
      const bx = R(-2500, 2500), by = R(-1500, 800), bz = R(93, 400);
      const tx = R(-780, 780), tz = R(120, 560), ty = -ARENA.L - 100;
      const T = R(1.3, 2.2);
      const g = PHYS.GRAVITY;
      s = {
        ball: [bx, by, bz],
        ballVel: [(tx - bx) / T, (ty - by) / T, (tz - bz - 0.5 * g * T * T) / T],
        car: [R(-300, 300), -ARENA.L + 120, Math.PI / 2], goalTeam: 1, save: true,
      };
    } else { // dribble
      const cx = R(-2000, 2000), cy = R(-3500, -1500);
      s = { car: [cx, cy, Math.PI / 2 + R(-0.3, 0.3)], dribble: true, goalTeam: 0 };
    }
    shots.push(s);
  }
  return shots;
}

// --------------------------------------------------------------- game
class Game {
  constructor(renderer, input, sfx, settings, loadout) {
    this.r = renderer; this.input = input; this.sfx = sfx;
    this.settings = settings; this.loadout = loadout;
    this.cam = new CameraRig(renderer, settings);
    this.world = null;
    this.state = 'menu';
    this.mode = null;
    this.acc = 0;
    this.bots = [];
    this.player = null;
    this.ballPred = [];
    this.score = [0, 0];
    this.time = 0;
    this.overtime = false;
    this.timeMenu = 0;
    this.toastT = 0;
    this.hud = {};
    for (const id of ['hud', 'scoreBlue', 'scoreOrange', 'clock', 'boostNum', 'boostRing', 'speedo', 'centerMsg', 'subMsg', 'toast', 'trainInfo', 'freeplayHelp', 'fps', 'camInd', 'scoreboard', 'scoreRows', 'results', 'flipInd', 'modeLabel', 'ballSpeed'])
      this.hud[id] = document.getElementById(id);
    this.fpsAcc = 0; this.fpsN = 0;
    this.menuWorld();
    this.touchLog = [];
    this.predGoal = -1;
    this.paused = false;
  }

  // An idle world used behind the menus
  menuWorld() {
    this.world = new World();
    this.r.clearCars();
    this.world.ball.reset(0, 0, PHYS.BALL_R + 300);
    this.world.ball.vel.set(400, 300, 900);
    this.state = 'menu';
    this.mode = null;
    this.player = null; this.bots = [];
    this.hud.hud.classList.add('hidden');
    this.r.ballMesh.visible = true;
    this.r.particles.clear();
  }

  applyMutators(world) {
    const G = this.settings.gameplay;
    world.gravity = MUTATORS.gravity[G.gravity] || -650;
    world.ball.radius = MUTATORS.ballSize[G.ballSize] || PHYS.BALL_R;
    world.ball.maxSpeed = MUTATORS.ballSpeed[G.ballSpeed] || 6000;
    world.ball.restitution = MUTATORS.bounce[G.bounce] === undefined ? 0.6 : MUTATORS.bounce[G.bounce];
    world.boostMode = G.boost === 'default' ? 'normal' : G.boost;
    world.demolitions = G.demos;
    this.timeScale = MUTATORS.gameSpeed[G.gameSpeed] || 1;
  }

  makeCar(team, isBot, name, cfg) {
    const car = new Car({ team, isBot, name, body: cfg.body });
    car.dodgeDeadzone = isBot ? PHYS.DODGE_DEADZONE : this.settings.controls.dodgeDeadzone;
    this.world.addCar(car);
    const tc = TEAM_COLORS[team];
    const view = this.r.addCar(car, { ...cfg, primary: (this.mode === 'freeplay' || this.mode === 'training') && !isBot ? cfg.primary : '#' + new THREE.Color(tc.main).getHexString() });
    view.showName = isBot && this.settings.video.nameplates;
    if (isBot) this.bots.push(new Bot(car, this.settings.gameplay.botLevel));
    return car;
  }

  randomBotCfg(team) {
    const bodies = Object.keys(HITBOXES);
    const r = (a) => a[(Math.random() * a.length) | 0];
    return { body: r(bodies), accent: r(PAINTS), wheel: r(WHEEL_STYLES), wheelColor: r(['#c9ced8', '#222', '#ffd21f', '#e33', '#19b35a']), boostColor: team === 0 ? '#4aa3ff' : '#ff8a2a', boostStyle: 'Flame', topper: Math.random() < 0.25 ? r(TOPPERS) : 'None', antenna: Math.random() < 0.3 ? r(ANTENNAS) : 'None' };
  }

  start(mode, opts = {}) {
    this.mode = mode; this.opts = opts;
    this.world = new World();
    this.r.clearCars();
    this.r.particles.clear();
    this.bots = [];
    this.applyMutators(this.world);
    this.score = [0, 0];
    this.overtime = false;
    this.time = this.settings.gameplay.matchLength;
    this.touchLog = [];
    this.kickoffPending = false;
    this.hud.hud.classList.remove('hidden');
    this.hud.results.classList.add('hidden');
    this.hud.trainInfo.classList.add('hidden');
    this.hud.freeplayHelp.classList.add('hidden');
    document.body.dataset.mode = mode;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const lo = this.loadout;
    this.player = this.makeCar(0, false, lo.name || 'You', lo);
    this.cam.snap();
    this.input.ballCamOn = this.settings.camera.ballCamDefault;
    if (mode === 'exhibition' || mode === 'heatseeker') {
      const size = opts.size || 1;
      for (let i = 1; i < size; i++) this.makeCar(0, true, names.pop(), this.randomBotCfg(0));
      for (let i = 0; i < size; i++) this.makeCar(1, true, names.pop(), this.randomBotCfg(1));
      if (mode === 'heatseeker') this.world.heatseeker = { team: -1, speed: 1900, inc: 110, max: 4200, turn: 2.6, active: false };
      this.hud.modeLabel.textContent = (mode === 'heatseeker' ? 'Heatseeker ' : '') + `${size}v${size} · ${BOT_LEVELS[this.settings.gameplay.botLevel].name} bots`;
      this.kickoff();
    } else if (mode === 'freeplay') {
      this.player.infiniteBoost = this.settings.gameplay.freeplayBoost;
      this.hud.modeLabel.textContent = 'Free Play';
      this.hud.freeplayHelp.classList.remove('hidden');
      this.world.ball.reset(0, 0);
      this.player.place(0, -2500, Math.PI / 2);
      this.state = 'play';
      this.freeplayGoals = 0;
    } else if (mode === 'kickoff') {
      if (opts.opponent !== false) this.makeCar(1, true, names.pop(), this.randomBotCfg(1));
      this.hud.modeLabel.textContent = 'Kickoff Practice';
      this.kickoffWins = [0, 0];
      this.kickoff(true);
    } else if (mode === 'training') {
      this.pack = opts.pack || 'striker';
      this.seed = opts.seed || ((Math.random() * 1e9) | 0);
      this.shots = trainingShots(this.pack, this.seed);
      this.shotIdx = 0;
      this.shotResults = new Array(this.shots.length).fill(null);
      this.hud.trainInfo.classList.remove('hidden');
      this.hud.modeLabel.textContent = 'Training · ' + ({ striker: 'Striker', aerial: 'Aerial', goalie: 'Goalie', dribble: 'Air Dribble' })[this.pack];
      this.loadShot();
    }
    this.updateScoreHud();
  }

  // ------------------------------------------------------------ kickoff / goals
  kickoff(practice) {
    const w = this.world;
    w.ball.reset(0, 0);
    if (this.world.heatseeker) { const hs = this.world.heatseeker; hs.team = -1; hs.active = false; hs.speed = 1900; }
    for (const p of w.pads) { p.active = true; p.timer = 0; }
    const teams = [[], []];
    for (const c of w.cars) teams[c.team].push(c);
    const pick = (n) => {
      const spots = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
      // prefer diagonal/offset spots for small teams
      if (n === 1) return [spots[0]];
      return spots.slice(0, n);
    };
    const spots = pick(Math.max(teams[0].length, teams[1].length));
    for (let t = 0; t < 2; t++) {
      teams[t].forEach((car, i) => {
        const s = KICKOFF_SPAWNS[spots[i]];
        const m = t === 0 ? 1 : -1;
        car.place(s.x * m, s.y * m, s.yaw + (t === 0 ? 0 : Math.PI));
        car.boost = PHYS.BOOST_SPAWN;
        car.demolished = false;
      });
    }
    this.world.carsFrozen = true;
    this.state = 'countdown';
    this.countdown = practice ? 2.0 : 3.0;
    this.lastBeep = 4;
    this.kickoffPending = true;
    this.kickoffTimer = 0;
    this.cam.snap();
    this.r.ballMesh.visible = true;
    this.touchLog = [];
  }

  isKickoffTaker(car) {
    let best = null, bd = 1e9;
    for (const c of this.world.cars) {
      if (c.team !== car.team || c.demolished) continue;
      const d = Math.hypot(c.pos.x, c.pos.y) + (c.pos.x > 0 ? 1 : 0);
      if (d < bd - 2) { bd = d; best = c; }
    }
    return best === car;
  }

  roleOf(car) {
    if (this._rolesTick !== this.world.tick) { this._roles = this.computeRoles(); this._rolesTick = this.world.tick; }
    return this._roles.get(car) || 'attack';
  }
  computeRoles() {
    const roles = new Map();
    const ball = this.world.ball;
    for (let t = 0; t < 2; t++) {
      const cars = this.world.cars.filter(c => c.team === t && !c.demolished);
      const dirY = t === 0 ? 1 : -1;
      const scored = cars.map(c => {
        const d = c.pos.distanceTo(ball.pos);
        const behind = (ball.pos.y - c.pos.y) * dirY > 0 ? 0 : 900;
        const toB = new THREE.Vector3().subVectors(ball.pos, c.pos).normalize();
        const facing = (1 - c.fwd.dot(toB)) * 300;
        return { c, s: d + behind + facing };
      }).sort((a, b) => a.s - b.s);
      scored.forEach((e, i) => roles.set(e.c, i === 0 ? 'attack' : i === 1 ? (cars.length === 2 ? 'defend' : 'support') : 'defend'));
    }
    return roles;
  }

  goalScored(team, scorerCar) {
    // team = scoring team
    this.score[team]++;
    const b = this.world.ball;
    const kmh = Math.round(b.vel.length() * 0.036);
    this.r.goalExplosion(b.pos.x, b.pos.y, b.pos.z, team);
    this.sfx.goal();
    this.input.rumble(1, 1, 500);
    this.cam.shake = 60;
    this.r.ballMesh.visible = false;
    this.world.ballFrozen = true;
    b.vel.set(0, 0, 0);
    let name = 'Own goal';
    if (scorerCar && scorerCar.team === team) {
      scorerCar.stats.goals++; scorerCar.stats.score += 100;
      name = scorerCar.name;
      // assist
      const prev = this.touchLog.slice().reverse().find(t => t.car !== scorerCar && t.car.team === team && this.world.time - t.time < 6);
      if (prev) { prev.car.stats.assists++; prev.car.stats.score += 50; }
    }
    this.showCenter(team === 0 ? 'BLUE SCORES!' : 'ORANGE SCORES!', name + ' · ' + kmh + ' km/h', team === 0 ? 'blue' : 'orange');
    this.state = 'goal';
    this.goalTimer = 3.2;
    this.updateScoreHud();
  }

  showCenter(text, sub, cls) {
    const m = this.hud.centerMsg;
    m.textContent = text;
    m.className = 'show ' + (cls || '');
    this.hud.subMsg.textContent = sub || '';
    this.hud.subMsg.className = sub ? 'show' : '';
    this.centerT = 2.6;
  }
  toast(text, cls) {
    const t = this.hud.toast;
    t.textContent = text; t.className = 'show ' + (cls || '');
    this.toastT = 1.4;
  }

  // ------------------------------------------------------------ training
  loadShot() {
    const s = this.shots[this.shotIdx];
    const w = this.world;
    w.ballFrozen = false;
    this.r.ballMesh.visible = true;
    const car = this.player;
    car.place(s.car[0], s.car[1], s.car[2]);
    car.boost = 100;
    car.infiniteBoost = false;
    if (s.dribble) {
      const f = car.fwd;
      w.ball.reset(car.pos.x + f.x * 260, car.pos.y + f.y * 260, 160);
      this.shotBallVel = new THREE.Vector3(f.x * 150, f.y * 150, 700);
    } else {
      w.ball.reset(s.ball[0], s.ball[1], s.ball[2]);
      this.shotBallVel = new THREE.Vector3(...s.ballVel);
    }
    for (const p of w.pads) { p.active = true; p.timer = 0; }
    this.state = 'armed';
    w.carsFrozen = true; w.ballFrozen = true;
    this.shotTimer = 0;
    this.cam.snap();
    this.updateTrainHud();
  }
  updateTrainHud() {
    const done = this.shotResults.filter(x => x === true).length;
    const dots = this.shotResults.map((r, i) => `<span class="dot ${r === true ? 'ok' : r === false ? 'bad' : ''} ${i === this.shotIdx ? 'cur' : ''}"></span>`).join('');
    const s = this.shots[this.shotIdx];
    this.hud.trainInfo.innerHTML = `<div class="ti-title">Shot ${this.shotIdx + 1} / ${this.shots.length} <span>${done} completed</span></div><div class="ti-dots">${dots}</div>
      <div class="ti-hint">${this.state === 'armed' ? 'Press any drive input to start' : s.save ? 'Save it! Keep the ball out' : 'Score!'} · <b>${this.bindLabel('resetBall')}</b> reset · <b>←/→</b> prev/next</div>`;
  }
  bindLabel(action) {
    const dev = this.input.lastDevice;
    if (dev === 'pad') { const b = this.settings.bindings.pad[action]; return b && b.length ? PAD_NAMES[b[0]] || ('Btn ' + b[0]) : '—'; }
    const k = this.settings.bindings.keys[action]; return k && k.length ? keyName(k[0]) : '—';
  }
  shotResult(ok) {
    if (this.state === 'result') return;
    this.shotResults[this.shotIdx] = ok;
    this.state = 'result';
    this.resultTimer = 1.6;
    this.showCenter(ok ? (this.shots[this.shotIdx].save ? 'SAVED!' : 'GOAL!') : 'MISSED', '', ok ? 'good' : 'bad');
    this.updateTrainHud();
  }

  // ------------------------------------------------------------ main frame
  frame(dt) {
    const input = this.input;
    if (this.state === 'menu' || !this.player) {
      this.menuTick(dt);
      return;
    }
    if (input.pressed('pause') && this.state !== 'ended' && (!this.ui.screen || this.ui.screen === 'pause')) { this.ui.togglePause(); }
    if (this.paused) { this.r.render(); return; }

    // camera toggle
    if (this.settings.camera.ballCamMode === 'hold') input.ballCamOn = this.settings.camera.ballCamDefault !== input.down('ballCam');
    else if (input.pressed('ballCam')) input.ballCamOn = !input.ballCamOn;
    this.hud.scoreboard.classList.toggle('hidden', !input.down('scoreboard') || this.mode === 'freeplay' || this.mode === 'training');
    if (input.down('scoreboard')) this.renderScoreboard();

    // player controls
    const pc = this.player;
    input.carControls(pc);
    this.modeInput(input);

    // bots
    const tickDt = PHYS.TICK;
    this.acc += Math.min(dt, 0.1) * (this.timeScale || 1);
    let ticks = 0;
    while (this.acc >= tickDt && ticks < 10) {
      this.acc -= tickDt; ticks++;
      if (ticks % 2 === 1 || ticks === 1) this.updatePrediction();
      for (const b of this.bots) b.update(this, tickDt);
      this.preTick(tickDt);
      this.world.step(tickDt);
      this.postTick(tickDt);
    }
    if (ticks === 0) this.updatePrediction();
    const alpha = this.acc / tickDt;
    this.processEvents();
    this.updateTimers(dt);

    // render sync
    const w = this.world;
    for (const c of w.cars) this.r.syncCar(c, alpha, dt, this.r.camera.position);
    this.r.syncBall(w.ball, alpha, { heat: w.heatseeker && w.heatseeker.active ? w.heatseeker.team : -1 });
    this.r.syncPads(w);
    this.r.updateEffects(dt);
    const pv = this.r.carViews.get(pc);
    const carPos = pv ? pv.model.group.position : pc.pos;
    if (!pc.demolished) this.cam.update(dt, carPos, pc, this.r.ballMesh.position, input.ballCamOn);
    else this.cam.update(dt, this.cam.focus, pc, this.r.ballMesh.position, true);
    this.updateHud(dt);
    this.sfx.setEngine(pc.vel.length(), pc.isBoosting, !pc.demolished && this.state !== 'goal', pc.onGround);
    this.r.render();
  }

  menuTick(dt) {
    this.timeMenu += dt;
    const w = this.world;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= PHYS.TICK) {
      this.acc -= PHYS.TICK;
      w.step(PHYS.TICK);
      if (w.ball.pos.z < 200 && w.ball.vel.length() < 600) w.ball.vel.set((Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 2000, 1200 + Math.random() * 600);
    }
    this.r.syncBall(w.ball, this.acc / PHYS.TICK);
    this.r.syncPads(w);
    this.r.updateEffects(dt);
    w.events.length = 0;
    if (this.ui && this.ui.screen === 'garage') {
      this.ui.updateGarage(dt);
    } else {
      this.cam.orbit(this.timeMenu);
      this.r.render();
    }
  }

  modeInput(input) {
    const w = this.world, pc = this.player;
    if (this.mode === 'freeplay') {
      const dp = (i) => input.padButtons[i] > 0.5 && !(input.padPrev[i] > 0.5);
      if (dp(12)) input.pressedEdges.add('KeyG');
      if (dp(13)) input.pressedEdges.add('KeyT');
      if (dp(14)) input.pressedEdges.add('KeyY');
      if (dp(15)) input.pressedEdges.add('Backspace');
      if (input.pressed('resetBall')) { w.ball.reset(0, 0); w.ballFrozen = false; this.r.ballMesh.visible = true; this.toast('Ball reset'); }
      if (input.pressedEdges.has('KeyT')) {
        // lob toward the player
        const f = new THREE.Vector3(pc.fwd.x, pc.fwd.y, 0).normalize();
        const p = pc.pos.clone().addScaledVector(f, 1800);
        p.x = clamp(p.x, -3700, 3700); p.y = clamp(p.y, -4700, 4700); p.z = 200;
        const target = pc.pos.clone().addScaledVector(f, 450).addScaledVector(pc.vel, 1.4);
        const T = 1.4;
        w.ball.reset(p.x, p.y, p.z);
        w.ball.vel.set((target.x - p.x) / T, (target.y - p.y) / T, (300 - p.z - 0.5 * w.gravity * T * T) / T);
        w.ballFrozen = false; this.r.ballMesh.visible = true;
        this.toast('Incoming lob');
      }
      if (input.pressedEdges.has('KeyG')) {
        // air dribble setup: pop the ball off the nose
        const f = pc.fwd;
        w.ball.reset(pc.pos.x + f.x * 230, pc.pos.y + f.y * 230, Math.max(pc.pos.z + 150, 160));
        w.ball.vel.set(pc.vel.x + f.x * 100, pc.vel.y + f.y * 100, 650);
        w.ballFrozen = false; this.r.ballMesh.visible = true;
        this.toast('Air dribble setup');
      }
      if (input.pressedEdges.has('KeyY')) {
        // wall setup: roll the ball up the nearest side wall
        const sx = pc.pos.x >= 0 ? 1 : -1;
        w.ball.reset(sx * 2800, pc.pos.y + 600, 93);
        w.ball.vel.set(sx * 1700, 300, 0);
        w.ballFrozen = false; this.r.ballMesh.visible = true;
        this.toast('Wall shot setup');
      }
      if (input.pressedEdges.has('Backspace')) { pc.place(0, -2500, Math.PI / 2); this.cam.snap(); }
      if (input.pressedEdges.has('KeyH')) this.hud.freeplayHelp.classList.toggle('hidden');
      if (input.pressedEdges.has('KeyU')) { pc.infiniteBoost = !pc.infiniteBoost; this.toast(pc.infiniteBoost ? 'Unlimited boost ON' : 'Unlimited boost OFF'); }
      if (input.pressedEdges.has('KeyB')) { w.ballFrozen = !w.ballFrozen; this.toast(w.ballFrozen ? 'Ball frozen' : 'Ball unfrozen'); }
    } else if (this.mode === 'training') {
      const prev = input.pressedEdges.has('ArrowLeft') || (input.padButtons[14] > 0.5 && !(input.padPrev[14] > 0.5));
      const next = input.pressedEdges.has('ArrowRight') || (input.padButtons[15] > 0.5 && !(input.padPrev[15] > 0.5));
      if (prev) { this.shotIdx = (this.shotIdx + this.shots.length - 1) % this.shots.length; this.loadShot(); }
      else if (next) { this.shotIdx = (this.shotIdx + 1) % this.shots.length; this.loadShot(); }
      else if (input.pressed('resetBall')) this.loadShot();
      if (this.state === 'armed') {
        const C = pc.controls;
        if (Math.abs(C.throttle) > 0.1 || C.boost || C.jump || Math.abs(C.steer) > 0.3) {
          this.state = 'play'; w.carsFrozen = false; w.ballFrozen = false;
          w.ball.vel.copy(this.shotBallVel);
          this.updateTrainHud();
        }
      }
    }
  }

  updatePrediction() {
    const b = this.world.ball;
    if (this.world.ballFrozen) {
      for (let i = 0; i < 180; i++) {
        let s = this.ballPred[i]; if (!s) s = this.ballPred[i] = { t: 0 };
        s.t = (i + 1) / 60; s.x = b.pos.x; s.y = b.pos.y; s.z = b.pos.z; s.vx = 0; s.vy = 0; s.vz = 0;
      }
      this.ballPred.length = 180;
      return;
    }
    predictBall(b, this.world.gravity, 3, 1 / 60, this.ballPred);
  }

  predictedGoal() {
    for (const s of this.ballPred) {
      if (s.y > ARENA.L + this.world.ball.radius) return 0; // into orange net => blue goal
      if (s.y < -ARENA.L - this.world.ball.radius) return 1;
    }
    return -1;
  }

  preTick(dt) {}

  postTick(dt) {
    const w = this.world, b = w.ball;
    // respawn demolished cars
    for (const c of w.cars) {
      if (c.demolished && c.respawnTimer <= 0) {
        const spots = RESPAWN_SPOTS;
        const s = spots[(Math.random() * spots.length) | 0];
        const m = c.team === 0 ? 1 : -1;
        c.place(s.x * m, s.y * m, s.yaw + (c.team === 0 ? 0 : Math.PI));
        c.boost = PHYS.BOOST_SPAWN;
        c.demolished = false;
        if (c === this.player) this.cam.snap();
      }
    }
    if (this.state === 'play' && !w.ballFrozen) {
      const R = b.radius;
      let team = -1;
      if (b.pos.y > ARENA.L + R) team = 0;
      else if (b.pos.y < -ARENA.L - R) team = 1;
      if (team >= 0) {
        this.lastBallSpeed = b.vel.length();
        if (this.mode === 'freeplay') {
          this.freeplayGoals++;
          this.r.goalExplosion(b.pos.x, b.pos.y, b.pos.z, team);
          this.sfx.goal(); this.cam.shake = 40;
          this.showCenter('GOAL!', Math.round(this.lastBallSpeed * 0.036) + ' km/h', team === 0 ? 'blue' : 'orange');
          w.ballFrozen = true; this.r.ballMesh.visible = false;
          this.respawnBallT = 1.5;
        } else if (this.mode === 'training') {
          const s = this.shots[this.shotIdx];
          this.r.goalExplosion(b.pos.x, b.pos.y, b.pos.z, team);
          this.sfx.goal();
          w.ballFrozen = true; this.r.ballMesh.visible = false;
          this.shotResult(!s.save && team === 0);
        } else {
          this.goalScored(team, b.lastTouch);
        }
      }
    }
  }

  processEvents() {
    const w = this.world, pc = this.player;
    for (const e of w.events) {
      if (e.type === 'hit') {
        if (e.strength > 150) this.r.hitSparks(e.x, e.y, e.z, e.strength);
        this.sfx.hit(e.strength);
        if (e.car === pc) this.input.rumble(Math.min(1, e.strength / 3000), 0.4, 90);
        if (this.state === 'play' && e.car) {
          // shot / save detection
          const before = this.predGoal;
          predictBall(w.ball, w.gravity, 3.5, 1 / 60, this.ballPred);
          const after = this.predictedGoal();
          const car = e.car;
          car.stats.touches++; car.stats.score += 2;
          if (after === car.team && before !== car.team) { car.stats.shots++; car.stats.score += 20; if (car === pc && this.mode !== 'training') this.toast('Shot on goal'); }
          if (before >= 0 && before !== car.team && after !== before) { car.stats.saves++; car.stats.score += 50; if (car === pc) this.toast('SAVE!', 'good'); else if (this.mode !== 'freeplay') this.toast(car.name + ' saved it'); }
          this.touchLog.push({ car, time: w.time });
          if (this.touchLog.length > 20) this.touchLog.shift();
        }
        if (this.kickoffPending && this.state === 'play') this.kickoffPending = false;
      } else if (e.type === 'bounce') {
        this.sfx.bounce(e.speed);
      } else if (e.type === 'pad') {
        if (e.car === pc) this.sfx.pad(e.big);
      } else if (e.type === 'demo') {
        this.r.demoExplosion(e.x, e.y, e.z);
        this.sfx.demo();
        if (e.by === pc) this.toast('DEMOLITION!', 'good');
        if (e.car === pc) { this.toast('Demolished by ' + (e.by ? e.by.name : '?'), 'bad'); this.input.rumble(1, 1, 400); }
      } else if (e.type === 'bump') {
        if (e.car === pc || e.by === pc) this.input.rumble(0.6, 0.6, 120);
      }
    }
    w.events.length = 0;
    this.predGoal = this.predictedGoal();
    for (const c of w.cars) {
      for (const ev of c.events) {
        if (c !== pc) continue;
        if (ev === 'jump') this.sfx.jump();
        else if (ev === 'flip' || ev === 'doublejump') this.sfx.flip();
        else if (ev === 'flipreset') { this.toast('FLIP RESET', 'good'); this.sfx.flipReset(); this.input.rumble(0.3, 0.8, 120); }
      }
      c.events.length = 0;
    }
  }

  updateTimers(dt) {
    const w = this.world;
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) { this.hud.centerMsg.className = ''; this.hud.subMsg.className = ''; } }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.hud.toast.className = ''; }
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastBeep && n > 0) { this.lastBeep = n; this.sfx.beep(false); this.showCenter(String(n), '', 'count'); this.centerT = 0.9; }
      if (this.countdown <= 0) {
        this.state = 'play';
        w.carsFrozen = false; w.ballFrozen = false;
        this.sfx.beep(true);
        this.showCenter('GO!', '', 'count go'); this.centerT = 0.6;
        if (w.heatseeker) {
          const team = Math.random() < 0.5 ? 0 : 1;
          w.heatseeker.team = team; w.heatseeker.active = true;
          w.ball.vel.set((Math.random() - 0.5) * 300, (team === 0 ? 1 : -1) * 1200, 500);
        }
        this.kickoffTimer = 0;
      }
    } else if (this.state === 'goal') {
      this.goalTimer -= dt;
      if (this.goalTimer <= 0) {
        w.ballFrozen = false;
        if (this.overtime || (this.time <= 0 && this.score[0] !== this.score[1])) this.endMatch();
        else this.kickoff(this.mode === 'kickoff');
      }
    } else if (this.state === 'play') {
      if (this.mode === 'exhibition' || this.mode === 'heatseeker') {
        if (!this.kickoffPending || w.ball.lastTouch) {
          if (this.overtime) this.time += dt;
          else this.time -= dt;
        }
        if (!this.overtime && this.time <= 0) {
          this.time = 0;
          if (w.ball.pos.z < w.ball.radius + 15) {
            if (this.score[0] === this.score[1]) {
              this.overtime = true; this.time = 0;
              this.showCenter('OVERTIME', 'Next goal wins', 'count');
              this.kickoff();
            } else this.endMatch();
          }
        }
      } else if (this.mode === 'kickoff') {
        this.kickoffTimer += dt;
        if (this.kickoffTimer > 4.5) {
          const side = w.ball.pos.y > 300 ? 0 : w.ball.pos.y < -300 ? 1 : -1;
          if (side >= 0) this.kickoffWins[side]++;
          this.showCenter(side === 0 ? 'KICKOFF WON' : side === 1 ? 'KICKOFF LOST' : 'NEUTRAL', `${this.kickoffWins[0]} - ${this.kickoffWins[1]}`, side === 0 ? 'good' : side === 1 ? 'bad' : '');
          this.kickoff(true);
        }
      } else if (this.mode === 'training') {
        this.shotTimer += dt;
        const s = this.shots[this.shotIdx];
        const limit = s.save ? 6 : 9;
        if (this.shotTimer > limit) this.shotResult(!!s.save);
      }
    } else if (this.state === 'result') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        if (this.shotResults[this.shotIdx] && this.shotIdx < this.shots.length - 1) this.shotIdx++;
        this.loadShot();
      }
    }
    if (this.mode === 'freeplay' && this.respawnBallT > 0) {
      this.respawnBallT -= dt;
      if (this.respawnBallT <= 0) { w.ball.reset(0, 0); w.ballFrozen = false; this.r.ballMesh.visible = true; }
    }
    if (this.mode === 'kickoff' && this.state === 'goal') { /* handled in goal */ }
  }

  endMatch() {
    this.state = 'ended';
    this.world.carsFrozen = true;
    const win = this.score[0] > this.score[1] ? 0 : 1;
    const youWon = win === this.player.team;
    this.showCenter(youWon ? 'VICTORY' : 'DEFEAT', `${this.score[0]} - ${this.score[1]}`, youWon ? 'good' : 'bad');
    this.centerT = 999;
    this.sfx.goal();
    setTimeout(() => { if (this.state === 'ended') this.ui.showResults(youWon); }, 1800);
  }

  // ------------------------------------------------------------ HUD
  updateScoreHud() {
    this.hud.scoreBlue.textContent = this.score[0];
    this.hud.scoreOrange.textContent = this.score[1];
  }
  updateHud(dt) {
    const pc = this.player;
    const boost = pc.infiniteBoost || this.world.boostMode === 'unlimited' ? 100 : pc.boost;
    this.hud.boostNum.textContent = pc.infiniteBoost || this.world.boostMode === 'unlimited' ? '∞' : Math.floor(boost);
    const circ = 2 * Math.PI * 52;
    this.hud.boostRing.style.strokeDashoffset = String(circ * (1 - boost / 100) * 0.75 + circ * 0.25);
    const spd = pc.vel.length();
    this.hud.speedo.textContent = Math.round(spd * 0.036) + ' km/h' + (pc.supersonic ? ' ⚡' : '');
    this.hud.ballSpeed.textContent = 'Ball ' + Math.round(this.world.ball.vel.length() * 0.036) + ' km/h';
    const t = Math.max(0, this.time);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    if (this.mode === 'exhibition' || this.mode === 'heatseeker') this.hud.clock.textContent = (this.overtime ? '+' : '') + mm + ':' + String(ss).padStart(2, '0');
    else if (this.mode === 'freeplay') this.hud.clock.textContent = '∞';
    else if (this.mode === 'kickoff') this.hud.clock.textContent = 'KO';
    else this.hud.clock.textContent = (this.shotIdx + 1) + '/' + this.shots.length;
    if (this.mode === 'freeplay') { this.hud.scoreBlue.textContent = this.freeplayGoals; this.hud.scoreOrange.textContent = '–'; }
    if (this.mode === 'kickoff') { this.hud.scoreBlue.textContent = this.kickoffWins[0]; this.hud.scoreOrange.textContent = this.kickoffWins[1]; }
    this.hud.camInd.textContent = this.input.ballCamOn ? 'BALL CAM' : 'CAR CAM';
    this.hud.camInd.classList.toggle('on', this.input.ballCamOn);
    // flip availability indicator
    const flipAvail = !pc.onGround && !pc.hasDoubleJumped && !pc.hasFlipped && (!pc.hasJumped || pc.airTimeSinceJump < PHYS.DOUBLE_JUMP_WINDOW);
    this.hud.flipInd.className = flipAvail ? (pc.flipResetReady ? 'reset' : 'on') : '';
    this.hud.flipInd.textContent = pc.flipResetReady && flipAvail ? 'FLIP (RESET)' : flipAvail ? 'FLIP' : '';
    // fps
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.hud.fps.textContent = Math.round(this.fpsN / this.fpsAcc) + ' fps';
      this.fpsAcc = 0; this.fpsN = 0;
    }
    this.hud.fps.classList.toggle('hidden', !this.settings.video.showFps);
  }

  renderScoreboard() {
    const rows = [];
    for (const team of [0, 1]) {
      const cars = this.world.cars.filter(c => c.team === team).sort((a, b) => b.stats.score - a.stats.score);
      rows.push(`<tr class="th ${team ? 'orange' : 'blue'}"><td>${team ? 'ORANGE' : 'BLUE'} · ${this.score[team]}</td><td>Score</td><td>Goals</td><td>Assists</td><td>Saves</td><td>Shots</td><td>Demos</td></tr>`);
      for (const c of cars) rows.push(`<tr class="${c === this.player ? 'me' : ''}"><td>${c.name}${c.isBot ? ' <i>BOT</i>' : ''}</td><td>${c.stats.score}</td><td>${c.stats.goals}</td><td>${c.stats.assists}</td><td>${c.stats.saves}</td><td>${c.stats.shots}</td><td>${c.stats.demos}</td></tr>`);
    }
    this.hud.scoreRows.innerHTML = rows.join('');
  }
}
