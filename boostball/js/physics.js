// Rigid-body simulation of ball + cars at 120 Hz.
'use strict';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m3 = new THREE.Matrix3(), _m3b = new THREE.Matrix3(), _m3c = new THREE.Matrix3();

function skew(m, v) {
  // m * x == v cross x
  m.set(0, -v.z, v.y,
        v.z, 0, -v.x,
        -v.y, v.x, 0);
  return m;
}

class Ball {
  constructor() {
    this.pos = new THREE.Vector3(0, 0, PHYS.BALL_R + 1.5);
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.rot = new THREE.Quaternion();
    this.prevPos = this.pos.clone();
    this.prevRot = this.rot.clone();
    this.radius = PHYS.BALL_R;
    this.lastTouch = null;
    this.lastTouchTeam = -1;
    this.frozen = false;
    this.restitution = PHYS.BALL_REST;
    this.maxSpeed = PHYS.BALL_MAX_SPEED;
    this.hitEvents = [];
  }
  reset(x = 0, y = 0, z) {
    this.pos.set(x, y, z === undefined ? this.radius + 1.5 : z);
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    this.prevPos.copy(this.pos);
    this.lastTouch = null; this.lastTouchTeam = -1;
  }
}

// Advance a ball state by dt against the arena only (shared by sim + prediction)
function ballArenaStep(b, dt, gravity, events) {
  const R = b.radius;
  b.vel.x += b.vel.x * PHYS.BALL_DRAG * dt;
  b.vel.y += b.vel.y * PHYS.BALL_DRAG * dt;
  b.vel.z += (b.vel.z * PHYS.BALL_DRAG + gravity) * dt;
  const sp = b.vel.length();
  if (sp > b.maxSpeed) b.vel.multiplyScalar(b.maxSpeed / sp);
  b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;

  const cs = queryContacts(b.pos.x, b.pos.y, b.pos.z, R);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const pen = R - c.d;
    if (pen <= 0) continue;
    b.pos.x += c.nx * pen; b.pos.y += c.ny * pen; b.pos.z += c.nz * pen;
    const vn = b.vel.x * c.nx + b.vel.y * c.ny + b.vel.z * c.nz;
    if (vn >= 0) continue;
    // perpendicular / parallel decomposition
    const vpx = c.nx * vn, vpy = c.ny * vn, vpz = c.nz * vn;
    const vax = b.vel.x - vpx, vay = b.vel.y - vpy, vaz = b.vel.z - vpz;
    // spin contribution: R * (n x w)
    const w = b.angVel;
    const sx = vax + R * (c.ny * w.z - c.nz * w.y);
    const sy = vay + R * (c.nz * w.x - c.nx * w.z);
    const sz = vaz + R * (c.nx * w.y - c.ny * w.x);
    const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const resting = Math.abs(vn) < 30;
    const e = resting ? 0 : b.restitution;
    // Coulomb friction: limited by the normal impulse, and never more than a solid sphere
    // needs to start rolling (2/7 of the slip), so glancing bounces keep their speed
    const tangential = Math.min(PHYS.BALL_WORLD_MU * (1 + e) * Math.abs(vn), sLen * 2 / 7);
    const fr = sLen > 1e-4 ? tangential / sLen : 0;
    const dpx = -(1 + e) * vpx, dpy = -(1 + e) * vpy, dpz = -(1 + e) * vpz;
    const dax = -fr * sx, day = -fr * sy, daz = -fr * sz;
    const A = PHYS.BALL_SPIN_A * PHYS.BALL_R; // spin coupling scaled for standard radius
    w.x += A * (day * c.nz - daz * c.ny);
    w.y += A * (daz * c.nx - dax * c.nz);
    w.z += A * (dax * c.ny - day * c.nx);
    b.vel.x += dpx + dax; b.vel.y += dpy + day; b.vel.z += dpz + daz;
    if (events && -vn > 250) events.push({ type: 'bounce', speed: -vn, x: b.pos.x, y: b.pos.y, z: b.pos.z });
    if (b.onSurfaceHit && -vn > 40) b.onSurfaceHit(c);
  }
  const ws = b.angVel.length();
  if (ws > PHYS.BALL_MAX_ANG) b.angVel.multiplyScalar(PHYS.BALL_MAX_ANG / ws);
}

const WHEEL_LAYOUT = (hb) => {
  const fx = hb.ox + hb.l * 0.325, bx = hb.ox - hb.l * 0.40;
  const fy = hb.w * 0.31, by = hb.w * 0.35;
  return [
    { x: fx, y: fy, r: 12.5, front: true },
    { x: fx, y: -fy, r: 12.5, front: true },
    { x: bx, y: by, r: 15, front: false },
    { x: bx, y: -by, r: 15, front: false },
  ];
};
const HUB_Z = 15;

let _carIdCounter = 0;

class Car {
  constructor(opts = {}) {
    this.id = _carIdCounter++;
    this.team = opts.team || 0;
    this.name = opts.name || 'Player';
    this.isBot = !!opts.isBot;
    this.setBody(opts.body || 'octane');
    this.pos = new THREE.Vector3(0, 0, 17);
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.prevPos = this.pos.clone();
    this.prevQuat = this.quat.clone();
    this.fwd = new THREE.Vector3(1, 0, 0);
    this.left = new THREE.Vector3(0, 1, 0);
    this.up = new THREE.Vector3(0, 0, 1);
    this.controls = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false };
    this.boost = PHYS.BOOST_SPAWN;
    this.infiniteBoost = false;
    this.resetState();
    this.stats = { goals: 0, shots: 0, saves: 0, assists: 0, touches: 0, demos: 0, score: 0 };
  }

  setBody(body) {
    this.body = HITBOXES[body] ? body : 'octane';
    this.hb = HITBOXES[this.body];
    this.wheels = WHEEL_LAYOUT(this.hb).map(w => ({
      ...w, contact: false, onBall: false, t: PHYS.SUSP_LEN, nx: 0, ny: 0, nz: 1, spin: 0, k: 1,
    }));
    // balance spring stiffness front/back so the car rests level (like per-axle force scales)
    const xf = this.wheels[0].x, xb = -this.wheels[2].x;
    const kf = 2 * xb / (xf + xb), kb = 2 * xf / (xf + xb);
    for (const w of this.wheels) w.k = w.front ? kf : kb;
    const h = this.hb;
    this.half = new THREE.Vector3(h.l / 2, h.w / 2, h.h / 2);
    this.hbOffset = new THREE.Vector3(h.ox, 0, h.oz);
    // sample points for body vs world
    this.samples = [];
    const hx = h.l / 2, hy = h.w / 2, hz = h.h / 2;
    for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
      if (sx === 0 && sy === 0 && sz === 0) continue;
      this.samples.push(new THREE.Vector3(h.ox + sx * hx, sy * hy, h.oz + sz * hz));
    }
    this.mass = PHYS.CAR_MASS;
    this.invI = new THREE.Vector3(1 / (this.mass * 751), 1 / (this.mass * 1334), 1 / (this.mass * 1836));
  }

  resetState() {
    this.onGround = false;
    this.numWheels = 0; this.numArenaWheels = 0; this.numBallWheels = 0;
    this.isJumping = false; this.jumpTime = 0; this.hasJumped = false;
    this.hasDoubleJumped = false; this.hasFlipped = false; this.isFlipping = false;
    this.flipTime = 0; this.flipX = 0; this.flipY = 0;
    this.airTime = 0; this.airTimeSinceJump = 0;
    this.jumpHeldPrev = false;
    this.boostTime = 0; this.isBoosting = false;
    this.supersonic = false; this.supersonicTime = 0;
    this.demolished = false; this.respawnTimer = 0;
    this.lastBallTick = -10;
    this.autoFlipTime = 0; this.autoFlipDir = 0;
    this.worldContact = false; this.worldNormal = new THREE.Vector3(0, 0, 1);
    this.groundNormal = new THREE.Vector3(0, 0, 1);
    this.events = [];
    this.flipResetReady = false;
  }

  place(x, y, yaw, z = 17) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.quat.setFromAxisAngle(_v1.set(0, 0, 1), yaw);
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
    this.updateBasis();
    const keep = this.stats;
    this.resetState();
    this.stats = keep;
  }

  updateBasis() {
    this.fwd.set(1, 0, 0).applyQuaternion(this.quat);
    this.left.set(0, 1, 0).applyQuaternion(this.quat);
    this.up.set(0, 0, 1).applyQuaternion(this.quat);
  }

  toLocal(v, out) {
    return out.set(v.dot(this.fwd), v.dot(this.left), v.dot(this.up));
  }
  toWorld(v, out) {
    const x = v.x, y = v.y, z = v.z;
    return out.set(
      this.fwd.x * x + this.left.x * y + this.up.x * z,
      this.fwd.y * x + this.left.y * y + this.up.y * z,
      this.fwd.z * x + this.left.z * y + this.up.z * z);
  }
  // world inverse inertia times vector
  invInertia(v, out) {
    this.toLocal(v, out);
    out.set(out.x * this.invI.x, out.y * this.invI.y, out.z * this.invI.z);
    return this.toWorld(out, out);
  }
  invInertiaMatrix(m) {
    // R * diag(invI) * R^T
    const f = this.fwd, l = this.left, u = this.up, I = this.invI;
    const e = m.elements; // column-major
    const g = (i, j) => f.getComponent(i) * I.x * f.getComponent(j) + l.getComponent(i) * I.y * l.getComponent(j) + u.getComponent(i) * I.z * u.getComponent(j);
    m.set(g(0, 0), g(0, 1), g(0, 2), g(1, 0), g(1, 1), g(1, 2), g(2, 0), g(2, 1), g(2, 2));
    return m;
  }
  applyImpulseAt(j, r) {
    this.vel.addScaledVector(j, 1 / this.mass);
    _v4.crossVectors(r, j);
    this.invInertia(_v4, _v4);
    this.angVel.add(_v4);
  }
  pointVel(r, out) {
    return out.crossVectors(this.angVel, r).add(this.vel);
  }
  hitboxCenter(out) {
    return this.toWorld(this.hbOffset, out).add(this.pos);
  }
  get speed() { return this.vel.length(); }
}

class World {
  constructor() {
    this.ball = new Ball();
    this.cars = [];
    this.tick = 0;
    this.time = 0;
    this.gravity = PHYS.GRAVITY;
    this.pads = BOOST_PADS.map(p => ({ x: p[0], y: p[1], big: !!p[2], active: true, timer: 0 }));
    this.events = [];
    this.demolitions = true;
    this.friendlyDemos = false;
    this.boostMode = 'normal'; // normal | unlimited | none | recharge
    this.heatseeker = null;
    this.ballFrozen = false;
    this.carsFrozen = false;
    this.contactsPrev = new Map();
    this.ball.onSurfaceHit = (c) => this.heatseekBounce(c);
  }

  addCar(car) { this.cars.push(car); return car; }

  step(dt) {
    this.tick++;
    this.time += dt;
    const ball = this.ball;
    ball.prevPos.copy(ball.pos); ball.prevRot.copy(ball.rot);
    for (const c of this.cars) { c.prevPos.copy(c.pos); c.prevQuat.copy(c.quat); }

    for (const car of this.cars) {
      if (car.demolished) {
        car.respawnTimer -= dt;
        continue;
      }
      if (this.carsFrozen) { car.vel.set(0, 0, 0); car.angVel.set(0, 0, 0); this.updateWheels(car); continue; }
      this.updateWheels(car);
      this.controlCar(car, dt);
    }

    // integrate cars
    for (const car of this.cars) {
      if (car.demolished || this.carsFrozen) continue;
      const sp = car.vel.length();
      if (sp > PHYS.CAR_MAX_SPEED) car.vel.multiplyScalar(PHYS.CAR_MAX_SPEED / sp);
      const ws = car.angVel.length();
      if (ws > PHYS.CAR_MAX_ANG) car.angVel.multiplyScalar(PHYS.CAR_MAX_ANG / ws);
      car.pos.addScaledVector(car.vel, dt);
      const wl = car.angVel.length();
      if (wl > 1e-8) {
        _q1.setFromAxisAngle(_v1.copy(car.angVel).divideScalar(wl), wl * dt);
        car.quat.premultiply(_q1).normalize();
      }
      car.updateBasis();
      this.carWorldCollide(car);
    }

    // ball
    if (!this.ballFrozen) {
      if (this.heatseeker) this.heatseekStep(dt);
      ballArenaStep(ball, dt, this.gravity, this.events);
      const wl = ball.angVel.length();
      if (wl > 1e-8) {
        _q1.setFromAxisAngle(_v1.copy(ball.angVel).divideScalar(wl), wl * dt);
        ball.rot.premultiply(_q1).normalize();
      }
    }

    const bd = this._bd || (this._bd = { dp: new THREE.Vector3(), dv: new THREE.Vector3(), dw: new THREE.Vector3() });
    bd.dp.set(0, 0, 0); bd.dv.set(0, 0, 0); bd.dw.set(0, 0, 0); bd.pinched = false;
    for (const car of this.cars) {
      if (car.demolished) continue;
      this.carBallCollide(car);
    }
    ball.pos.add(bd.dp); ball.vel.add(bd.dv); ball.angVel.add(bd.dw);
    const bsp = ball.vel.length();
    if (bsp > ball.maxSpeed) ball.vel.multiplyScalar(ball.maxSpeed / bsp);
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i + 1; j < this.cars.length; j++)
        this.carCarCollide(this.cars[i], this.cars[j]);

    this.updatePads(dt);
  }

  // --- wheels / suspension ---------------------------------------------------
  updateWheels(car) {
    const ball = this.ball;
    let n = 0, na = 0, nb = 0;
    car.groundNormal.set(0, 0, 0);
    const dx = -car.up.x, dy = -car.up.y, dz = -car.up.z;
    for (const w of car.wheels) {
      _v1.set(w.x, w.y, HUB_Z);
      car.toWorld(_v1, _v2).add(car.pos); // hub world
      w.hx = _v2.x; w.hy = _v2.y; w.hz = _v2.z;
      let t = rayArena(_v2.x, _v2.y, _v2.z, dx, dy, dz, PHYS.SUSP_LEN);
      let onBall = false;
      let nx = _rayN.x, ny = _rayN.y, nz = _rayN.z;
      // ray vs ball sphere
      const ox = _v2.x - ball.pos.x, oy = _v2.y - ball.pos.y, oz = _v2.z - ball.pos.z;
      const bq = ox * dx + oy * dy + oz * dz;
      const cq = ox * ox + oy * oy + oz * oz - ball.radius * ball.radius;
      const disc = bq * bq - cq;
      if (disc >= 0) {
        let tb = -bq - Math.sqrt(disc);
        if (tb < 0 && cq < 0) tb = 0;
        if (tb >= 0 && tb <= PHYS.SUSP_LEN + 10 && (t < 0 || tb < t)) {
          t = tb; onBall = true;
          const hx = _v2.x + dx * tb - ball.pos.x, hy = _v2.y + dy * tb - ball.pos.y, hz = _v2.z + dz * tb - ball.pos.z;
          const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
          nx = hx / hl; ny = hy / hl; nz = hz / hl;
        }
      }
      if (t >= 0) {
        w.contact = true; w.onBall = onBall; w.t = t; w.nx = nx; w.ny = ny; w.nz = nz;
        n++;
        if (onBall) nb++; else { na++; car.groundNormal.x += nx; car.groundNormal.y += ny; car.groundNormal.z += nz; }
      } else {
        w.contact = false; w.onBall = false; w.t = PHYS.SUSP_LEN;
      }
    }
    if (na > 0) car.groundNormal.normalize(); else car.groundNormal.set(0, 0, 1);
    car.numWheels = n; car.numArenaWheels = na; car.numBallWheels = nb;
    car.onGround = n >= 3;
  }

  controlCar(car, dt) {
    const C = car.controls;
    const ball = this.ball;
    const g = this.gravity;
    const jumpPressed = C.jump && !car.jumpHeldPrev;
    car.jumpHeldPrev = C.jump;

    // gravity
    car.vel.z += g * dt;

    // suspension forces
    for (const w of car.wheels) {
      if (!w.contact) continue;
      const comp = PHYS.SUSP_LEN - w.t;
      _v1.set(w.hx - car.pos.x, w.hy - car.pos.y, w.hz - car.pos.z);
      car.pointVel(_v1, _v2);
      if (w.onBall) {
        _v3.crossVectors(ball.angVel, _v4.set(w.hx - ball.pos.x, w.hy - ball.pos.y, w.hz - ball.pos.z)).add(ball.vel);
        _v2.sub(_v3);
      }
      const vrel = _v2.dot(car.up);
      const damp = vrel < 0 ? PHYS.SUSP_DAMP_COMP : PHYS.SUSP_DAMP_RELAX;
      const cosN = Math.max(0, w.nx * car.up.x + w.ny * car.up.y + w.nz * car.up.z);
      let spring = PHYS.SUSP_K * comp;
      if (comp > 22) spring += PHYS.SUSP_K * 3 * (comp - 22);
      // damping is bounded so a single wheel clipping a surface mid-rotation can't spin the car
      let f = w.k * cosN * clamp(spring - damp * vrel, 0, spring * 2.5 + 60);
      if (f <= 0) continue;
      f *= car.mass * dt; // impulse magnitude
      _v3.copy(car.up).multiplyScalar(f);
      car.applyImpulseAt(_v3, _v1);
      if (w.onBall && !this.ballFrozen) {
        ball.vel.addScaledVector(_v3, -1 / PHYS.BALL_MASS);
        this.registerTouch(car, false);
      }
    }

    // jump state bookkeeping
    if (car.numArenaWheels === 0 && car.numBallWheels >= 3 && !car.isJumping &&
        _v1.subVectors(car.vel, ball.vel).dot(car.up) > -800) this.grantFlipReset(car);
    if (car.onGround && !car.isJumping) {
      car.hasJumped = false; car.hasDoubleJumped = false; car.hasFlipped = false;
      car.airTime = 0; car.airTimeSinceJump = 0;
      if (car.numArenaWheels >= 3) car.flipResetReady = false;
    } else {
      car.airTime += dt;
      if (car.hasJumped && !car.isJumping) car.airTimeSinceJump += dt;
    }

    const arenaGround = car.numArenaWheels >= 3;
    const frac = car.numArenaWheels / 4;

    // --- jump ---
    if (car.isJumping) {
      car.jumpTime += dt;
      const holding = C.jump || car.jumpTime < PHYS.JUMP_MIN_TIME;
      if (holding && car.jumpTime < PHYS.JUMP_MAX_TIME) {
        car.vel.addScaledVector(car.up, PHYS.JUMP_ACCEL * dt);
      } else {
        car.isJumping = false;
      }
    }
    if (jumpPressed) {
      if (car.onGround && !car.isJumping) {
        car.vel.addScaledVector(car.up, PHYS.JUMP_IMPULSE);
        car.isJumping = true; car.jumpTime = 0; car.hasJumped = true; car.airTimeSinceJump = 0;
        car.events.push('jump');
      } else if (!car.onGround && !car.hasDoubleJumped && !car.hasFlipped &&
                 (!car.hasJumped || car.airTimeSinceJump < PHYS.DOUBLE_JUMP_WINDOW)) {
        const mag = Math.abs(C.yaw) + Math.abs(C.pitch) + Math.abs(C.roll);
        if (mag >= (car.dodgeDeadzone || PHYS.DODGE_DEADZONE)) this.startFlip(car);
        else {
          car.vel.addScaledVector(car.up, PHYS.JUMP_IMPULSE);
          car.hasDoubleJumped = true;
          car.events.push('doublejump');
        }
        car.flipResetReady = false;
        car.isJumping = false;
      } else if (car.worldContact && !car.onGround && car.up.dot(car.worldNormal) < 0.7071 && car.autoFlipTime <= 0) {
        // turtle / side auto-flip
        car.vel.addScaledVector(car.worldNormal, PHYS.AUTOFLIP_IMPULSE);
        car.autoFlipTime = PHYS.AUTOFLIP_TIME;
        const side = car.left.dot(car.worldNormal);
        car.autoFlipDir = side >= 0 ? -1 : 1;
      }
    }
    if (car.autoFlipTime > 0) {
      car.autoFlipTime -= dt;
      _v1.copy(car.fwd).multiplyScalar(car.autoFlipDir * 5.5);
      car.angVel.lerp(_v1, Math.min(1, 20 * dt));
    }

    // --- boost ---
    const hasBoost = car.infiniteBoost || this.boostMode === 'unlimited' || car.boost > 0;
    const noBoostMode = this.boostMode === 'none';
    if ((C.boost || (car.isBoosting && car.boostTime < PHYS.BOOST_MIN_TIME)) && hasBoost && !noBoostMode) {
      if (!car.isBoosting) car.boostTime = 0;
      car.isBoosting = true;
      car.boostTime += dt;
      if (!(car.infiniteBoost || this.boostMode === 'unlimited')) car.boost = Math.max(0, car.boost - PHYS.BOOST_USE * dt);
      car.vel.addScaledVector(car.fwd, (arenaGround ? PHYS.BOOST_ACCEL_GROUND : PHYS.BOOST_ACCEL_AIR) * dt);
    } else {
      car.isBoosting = false;
    }
    if (this.boostMode === 'recharge' && !car.isBoosting) car.boost = Math.min(100, car.boost + 10 * dt);

    // --- ground driving ---
    if (car.numArenaWheels > 0) {
      const n = car.groundNormal;
      _v1.copy(car.fwd).addScaledVector(n, -car.fwd.dot(n));
      if (_v1.lengthSq() < 1e-6) _v1.copy(car.fwd);
      _v1.normalize(); // fp
      _v2.crossVectors(_v1, n); // right
      const vf = car.vel.dot(_v1);
      const vr = car.vel.dot(_v2);
      let throttle = C.throttle;
      if (car.isBoosting) throttle = 1;
      let a = 0;
      const absvf = Math.abs(vf);
      if (Math.abs(throttle) > 0.01) {
        if (vf * throttle < 0 && absvf > 1) a = -sign(vf) * Math.min(PHYS.BRAKE, absvf / dt);
        else a = throttle * curve(THROTTLE_CURVE, absvf);
      } else {
        a = -sign(vf) * Math.min(PHYS.COAST, absvf / dt);
      }
      car.vel.addScaledVector(_v1, a * dt * frac);

      // lateral friction
      const lat = C.handbrake ? 3.0 : 26;
      const k = 1 - Math.exp(-lat * frac * dt);
      car.vel.addScaledVector(_v2, -vr * k);

      // steering -> yaw rate about surface normal
      if (arenaGround || car.numArenaWheels >= 2) {
        let curv = curve(STEER_CURVATURE, absvf);
        if (C.handbrake) curv *= 1.55;
        const target = -C.steer * curv * vf;
        const cur = car.angVel.dot(n);
        car.angVel.addScaledVector(n, (target - cur) * Math.min(1, 14 * dt));
      }

      // sticky force
      if (!car.isJumping) {
        let sticky = PHYS.STICKY;
        const fullStick = Math.abs(C.throttle) > 0.01 || absvf > 25;
        if (fullStick) sticky += 1 - Math.abs(car.up.z);
        car.vel.addScaledVector(n, sticky * g * dt * frac);
      }
      if (!car.isJumping && car.numArenaWheels >= 2) {
        // concave arena surfaces never launch a car: drop rebound velocity away from the surface
        const vn = car.vel.dot(n);
        if (vn > 25) car.vel.addScaledVector(n, 25 - vn);
        // follow the surface ahead (ramps / wall transitions): align up with the upcoming normal
        const look = Math.min(160, absvf * 0.07);
        const ahead = _v4.copy(car.pos).addScaledVector(_v1, sign(vf) * look);
        const cs = queryContacts(ahead.x, ahead.y, ahead.z, 260);
        let best = 1e9, tx = n.x, ty = n.y, tz = n.z;
        for (let i = 0; i < cs.length; i++) if (cs[i].d < best) { best = cs[i].d; tx = cs[i].nx; ty = cs[i].ny; tz = cs[i].nz; }
        _v3.set(tx + n.x, ty + n.y, tz + n.z).normalize();
        const ax = car.up.y * _v3.z - car.up.z * _v3.y;
        const ay = car.up.z * _v3.x - car.up.x * _v3.z;
        const az = car.up.x * _v3.y - car.up.y * _v3.x;
        // replace the non-yaw part of angular velocity with a tracking rate
        const wn = car.angVel.dot(car.up);
        const kTrack = 9 * frac + 3;
        _v3.set(ax * kTrack * 2.2, ay * kTrack * 2.2, az * kTrack * 2.2).addScaledVector(car.up, wn);
        car.angVel.lerp(_v3, Math.min(1, kTrack * dt));
      }
      // rest friction to stop creeping
      if (arenaGround && Math.abs(throttle) < 0.01 && !car.isBoosting && absvf < 15 && Math.abs(vr) < 15 && n.z > 0.7) {
        car.vel.addScaledVector(_v1, -vf); car.vel.addScaledVector(_v2, -vr);
      }
    }

    // --- air ---
    if (car.numArenaWheels < 3) {
      // air throttle
      if (car.numArenaWheels === 0 && Math.abs(C.throttle) > 0.01 && !car.isBoosting)
        car.vel.addScaledVector(car.fwd, C.throttle * PHYS.THROTTLE_AIR * dt);
      this.airControl(car, dt);
    }

    // flip timer + z damp
    if (car.isFlipping) {
      car.flipTime += dt;
      if (car.numArenaWheels >= 3 && car.flipTime > 0.02) {
        // landed mid-dodge (wavedash / zap dash): wheels stop the rotation, the dodge speed is kept
        car.isFlipping = false;
        const wn = car.angVel.dot(car.groundNormal);
        car.angVel.copy(car.groundNormal).multiplyScalar(wn);
      } else if (car.flipTime >= PHYS.FLIP_TIME) car.isFlipping = false;
      else if (car.flipTime >= PHYS.FLIP_Z_DAMP_START && (car.vel.z < 0 || car.flipTime < PHYS.FLIP_Z_DAMP_END)) {
        car.vel.z *= Math.pow(1 - PHYS.FLIP_Z_DAMP_120, dt * 120);
      }
    }

    // supersonic
    const spd = car.vel.length();
    if (spd >= PHYS.SUPERSONIC) { car.supersonic = true; car.supersonicTime = 0; }
    else if (car.supersonic) {
      car.supersonicTime += dt;
      if (spd < PHYS.SUPERSONIC_MAINTAIN || car.supersonicTime > 1) car.supersonic = false;
    }

    // wheel spin (visual)
    const vfw = car.vel.dot(car.fwd);
    for (const w of car.wheels) w.spin += (w.contact ? vfw / w.r : (C.throttle * 25)) * dt;
  }

  startFlip(car) {
    const C = car.controls;
    let fx = -C.pitch, fy = C.yaw + C.roll;
    if (Math.abs(fx) < 0.1) fx = 0;
    if (Math.abs(fy) < 0.1) fy = 0;
    const len = Math.hypot(fx, fy);
    if (len < 1e-3) {
      // stall: yaw and air roll cancel out, so the flip is spent without any impulse or spin
      car.hasDoubleJumped = true; car.hasFlipped = true;
      car.events.push('stall');
      return;
    }
    fx /= len; fy /= len;
    car.isFlipping = true; car.hasFlipped = true; car.flipTime = 0; car.flipCancelled = false;
    car.flipX = fx; car.flipY = fy;
    // impulse
    _v1.set(car.fwd.x, car.fwd.y, 0);
    if (_v1.lengthSq() < 1e-6) _v1.set(-car.up.x, -car.up.y, 0);
    _v1.normalize();
    _v2.set(_v1.y, -_v1.x, 0); // right
    const fs = car.vel.dot(_v1);
    const ratio = Math.abs(fs) / PHYS.CAR_MAX_SPEED;
    const backwards = Math.abs(fs) < 100 ? fx < 0 : ((fx >= 0) !== (fs > 0));
    let ix = fx * PHYS.FLIP_IMPULSE, iy = fy * PHYS.FLIP_IMPULSE;
    const maxX = backwards ? PHYS.FLIP_BACK_SCALE : 1;
    ix *= (maxX - 1) * ratio + 1;
    iy *= (PHYS.FLIP_SIDE_SCALE - 1) * ratio + 1;
    if (backwards) ix *= PHYS.FLIP_BACK_X;
    car.vel.addScaledVector(_v1, ix).addScaledVector(_v2, iy);
    // rotation: forward = nose down (+y local), right = roll right (+x local)
    car.toLocal(car.angVel, _v3);
    _v3.x = fy * PHYS.CAR_MAX_ANG; _v3.y = fx * PHYS.CAR_MAX_ANG;
    car.toWorld(_v3, car.angVel);
    car.events.push('flip');
  }

  airControl(car, dt) {
    const C = car.controls;
    const w = car.toLocal(car.angVel, _v3);
    const pitch = C.pitch, yaw = C.yaw, roll = C.roll;
    if (car.isFlipping && car.flipTime < PHYS.FLIP_TIME) {
      // flip torque holds the rotation; pitch held against the flip cancels it
      const cancel = car.flipX !== 0 && pitch !== 0 && sign(pitch) === sign(car.flipX);
      if (cancel) car.flipCancelled = true;
      const pScale = cancel ? 1 - Math.min(Math.abs(pitch), 1) : 1;
      w.y = car.flipX * PHYS.CAR_MAX_ANG * pScale;
      if (car.flipCancelled) {
        // once cancelled, roll/yaw inputs act on the leftover flip rotation
        // (speed flips: cancel the pitch, air roll against the diagonal roll)
        w.x += PHYS.T_ROLL * roll * dt;
        w.z += (-PHYS.T_YAW * yaw + PHYS.D_YAW * (1 - Math.abs(yaw)) * w.z) * dt;
      } else {
        w.x = car.flipY * PHYS.CAR_MAX_ANG;
      }
      car.toWorld(w, car.angVel);
      return;
    }
    w.x += (PHYS.T_ROLL * roll + PHYS.D_ROLL * w.x) * dt;
    w.y += (-PHYS.T_PITCH * pitch + PHYS.D_PITCH * (1 - Math.abs(pitch)) * w.y) * dt;
    w.z += (-PHYS.T_YAW * yaw + PHYS.D_YAW * (1 - Math.abs(yaw)) * w.z) * dt;
    car.toWorld(w, car.angVel);
  }

  // --- car body vs arena ----------------------------------------------------
  carWorldCollide(car) {
    car.hitboxCenter(_v1);
    const near = queryContacts(_v1.x, _v1.y, _v1.z, 90);
    car.worldContact = false;
    if (near.length === 0) return;
    let maxPen = 0, pnx = 0, pny = 0, pnz = 0;
    const bottomZ = car.hb.oz - car.hb.h / 2 + 0.01;
    const riding = car.numArenaWheels >= 2;
    const list = this._bodyContacts || (this._bodyContacts = []);
    let n = 0;
    for (const s of car.samples) {
      car.toWorld(s, _v2);
      const cs = queryContacts(_v2.x + car.pos.x, _v2.y + car.pos.y, _v2.z + car.pos.z, 0);
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (c.d >= 0) continue;
        let e = list[n];
        if (!e) e = list[n] = { r: new THREE.Vector3(), n: new THREE.Vector3(), soft: false };
        e.r.copy(_v2); e.n.set(c.nx, c.ny, c.nz); e.soft = riding && s.z < bottomZ;
        n++;
        if (-c.d > maxPen) { maxPen = -c.d; pnx = c.nx; pny = c.ny; pnz = c.nz; }
      }
    }
    if (n === 0) return;
    car.worldContact = true;
    car.worldNormal.set(pnx, pny, pnz);
    const J = _v3, rn = _v1, pv = _v2;
    const linSum = new THREE.Vector3(), angSum = new THREE.Vector3();
    for (let iter = 0; iter < 4; iter++) {
      linSum.set(0, 0, 0); angSum.set(0, 0, 0);
      let active = 0;
      for (let i = 0; i < n; i++) {
        const c = list[i];
        car.pointVel(c.r, pv);
        const vn = pv.dot(c.n);
        if (vn >= 0) continue;
        active++;
        const e = (vn < -300 && !c.soft && iter === 0) ? 0.15 : 0;
        rn.crossVectors(c.r, c.n); car.invInertia(rn, rn);
        const k = 1 / car.mass + rn.cross(c.r).dot(c.n);
        const jn = -(1 + e) * vn / k;
        J.copy(c.n).multiplyScalar(jn);
        // friction
        pv.addScaledVector(c.n, -vn);
        const vt = pv.length();
        if (vt > 1e-3 && !c.soft) {
          pv.divideScalar(vt);
          rn.crossVectors(c.r, pv); car.invInertia(rn, rn);
          const kt = 1 / car.mass + rn.cross(c.r).dot(pv);
          J.addScaledVector(pv, -Math.min(vt / kt, 0.25 * jn));
        }
        linSum.add(J);
        angSum.add(rn.crossVectors(c.r, J));
      }
      if (!active) break;
      car.vel.addScaledVector(linSum, 1 / (car.mass * active));
      car.invInertia(angSum, angSum);
      car.angVel.addScaledVector(angSum, 1 / active);
    }
    car.pos.x += pnx * maxPen; car.pos.y += pny * maxPen; car.pos.z += pnz * maxPen;
  }

  // --- car vs ball ------------------------------------------------------------
  carBallCollide(car) {
    const ball = this.ball;
    const R = ball.radius;
    car.hitboxCenter(_v1);
    const dx = ball.pos.x - _v1.x, dy = ball.pos.y - _v1.y, dz = ball.pos.z - _v1.z;
    if (dx * dx + dy * dy + dz * dz > (R + 100) * (R + 100)) return;
    // local coordinates
    const lx = dx * car.fwd.x + dy * car.fwd.y + dz * car.fwd.z;
    const ly = dx * car.left.x + dy * car.left.y + dz * car.left.z;
    const lz = dx * car.up.x + dy * car.up.y + dz * car.up.z;
    const h = car.half;
    let cx = clamp(lx, -h.x, h.x), cy = clamp(ly, -h.y, h.y), cz = clamp(lz, -h.z, h.z);
    let ddx = lx - cx, ddy = ly - cy, ddz = lz - cz;
    let dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    let nlx, nly, nlz; // normal from contact to ball center (local)
    if (dist < 1e-4) {
      // center inside box: push out along least penetration axis
      const px = h.x - Math.abs(lx), py = h.y - Math.abs(ly), pz = h.z - Math.abs(lz);
      if (px < py && px < pz) { nlx = sign(lx) || 1; nly = 0; nlz = 0; cx = nlx * h.x; dist = -px; }
      else if (py < pz) { nlx = 0; nly = sign(ly) || 1; nlz = 0; cy = nly * h.y; dist = -py; }
      else { nlx = 0; nly = 0; nlz = sign(lz) || 1; cz = nlz * h.z; dist = -pz; }
    } else {
      if (dist >= R) return;
      nlx = ddx / dist; nly = ddy / dist; nlz = ddz / dist;
    }
    // world contact point & normal (n points from car toward ball)
    const n = _v2.set(0, 0, 0).addScaledVector(car.fwd, nlx).addScaledVector(car.left, nly).addScaledVector(car.up, nlz);
    const p = _v3.copy(_v1).addScaledVector(car.fwd, cx).addScaledVector(car.left, cy).addScaledVector(car.up, cz);
    const pen = R - dist;
    if (!this.ballFrozen) this._bd.dp.addScaledVector(n, pen);
    else car.pos.addScaledVector(n, -pen);

    if (this.ballFrozen) return;
    // physical impulse (RLUtilities-style)
    const Lb = new THREE.Vector3().subVectors(p, ball.pos);
    const Lc = new THREE.Vector3().subVectors(p, car.pos);
    const mb = PHYS.BALL_MASS * (ball.radius / PHYS.BALL_R) ** 3;
    const Ib = 0.4 * mb * ball.radius * ball.radius * (PHYS.CARBALL_SPIN_INERTIA || 1);
    const Sb = skew(new THREE.Matrix3(), Lb), Sc = skew(new THREE.Matrix3(), Lc);
    const invIc = car.invInertiaMatrix(new THREE.Matrix3());
    // K = (1/mb + 1/mc) I - Sb Sb / Ib - Sc invIc Sc
    const K = new THREE.Matrix3();
    const e = K.elements;
    const SbSb = new THREE.Matrix3().multiplyMatrices(Sb, Sb);
    const ScIS = new THREE.Matrix3().multiplyMatrices(Sc, invIc).multiply(Sc);
    const im = 1 / mb + 1 / car.mass;
    for (let i = 0; i < 9; i++) e[i] = -SbSb.elements[i] / Ib - ScIS.elements[i];
    e[0] += im; e[4] += im; e[8] += im;
    const M = new THREE.Matrix3().copy(K).invert();
    const vc = new THREE.Vector3().crossVectors(car.angVel, Lc).add(car.vel);
    const vb = new THREE.Vector3().crossVectors(ball.angVel, Lb).add(ball.vel);
    const dV = vc.sub(vb);
    const J1 = dV.clone().applyMatrix3(M);
    const n1 = n.clone().negate(); // ball center -> contact
    const jperp = Math.min(J1.dot(n1), -1);
    const Jperp = n1.clone().multiplyScalar(jperp);
    const Jpara = J1.clone().sub(Jperp);
    const ratio = Jperp.length() / Math.max(Jpara.length(), 0.001);
    J1.copy(Jperp).addScaledVector(Jpara, Math.min(1, (PHYS.CARBALL_MU || PHYS.BALL_MU) * ratio));

    // Psyonix extra impulse: on a new touch, then at most every other tick while touching
    // (that repeat is what gives flicks their power). Very soft contacts ramp in from zero
    // so a ball can rest on the roof without hopping.
    const fresh = this.tick - car.lastBallTick > 1;
    car.lastBallTick = this.tick;
    const J2 = new THREE.Vector3();
    if (this.tick - (car.lastExtraTick || -10) > 1) {
      const airborne = car.numArenaWheels === 0 && !car.isFlipping;
      let n2;
      if (airborne) {
        // air touches push along the car->ball line, so the ball stays on the nose (air dribbles)
        n2 = new THREE.Vector3().subVectors(ball.pos, car.hitboxCenter(new THREE.Vector3())).normalize();
      } else {
        n2 = new THREE.Vector3().subVectors(ball.pos, car.pos);
        n2.z *= 0.35;
        n2.addScaledVector(car.fwd, -0.35 * n2.dot(car.fwd)).normalize();
      }
      // while dodging, the spinning car hits with its contact-point speed (flicks, flip shots)
      const carV = car.isFlipping ? new THREE.Vector3().crossVectors(car.angVel, Lc).add(car.vel) : car.vel;
      const dv = Math.min(new THREE.Vector3().subVectors(ball.vel, carV).length(), 4600);
      if (dv > 1) {
        const soft = airborne ? clamp(dv / 450, 0.35, 1) : 1;
        J2.copy(n2).multiplyScalar(mb * dv * curve(PHYS.PSY_CURVE || PSYONIX_SCALE, dv) * soft);
        car.lastExtraTick = this.tick;
      }
    }
    this.checkPinch(car, n, p, Lc);
    // flip reset: the ball meeting the underside (wheels / chassis) while airborne gives the flip back
    // flip reset: the ball must sit squarely under the car (wheels-first) and be met softly,
    // not smashed or clipped with an edge
    if (car.numArenaWheels === 0 && !car.isJumping && n.dot(car.up) < -0.9) {
      const closing = new THREE.Vector3().crossVectors(car.angVel, Lc).add(car.vel).sub(ball.vel).dot(n);
      if (closing < 800) this.grantFlipReset(car);
    }
    // ball changes are accumulated and applied after every car is resolved (order independent)
    if (!this._bd.pinched) {
      // overlap is resolved with a little separating speed (like Bullet's penetration recovery),
      // so a pushed ball rolls off the nose instead of gluing to it
      this._bd.dv.addScaledVector(n, Math.min(Math.max(pen - 1, 0) * 18, 160));
      this._bd.dw.add(new THREE.Vector3().crossVectors(Lb, J1).divideScalar(Ib));
      this._bd.dv.addScaledVector(J1, 1 / mb).addScaledVector(J2, 1 / mb);
    }
    // car reaction
    const Jc = J1.clone().negate();
    if (car.numArenaWheels >= 2) {
      // a grounded car is held down by its wheels: the ball can't lever it off the floor
      const lift = Jc.dot(car.up);
      if (lift > 0) Jc.addScaledVector(car.up, -lift);
      car.applyImpulseAt(Jc, Lc.clone().addScaledVector(car.up, -Lc.dot(car.up)));
    } else car.applyImpulseAt(Jc, Lc);
    if (fresh) {
      const hitStrength = J1.add(J2).length() / mb;
      this.events.push({ type: 'hit', car, strength: hitStrength, x: p.x, y: p.y, z: p.z });
    }
    this.registerTouch(car, fresh);
  }

  grantFlipReset(car) {
    if (!(car.hasJumped || car.hasDoubleJumped || car.hasFlipped)) return;
    car.hasJumped = false; car.hasDoubleJumped = false; car.hasFlipped = false;
    car.airTimeSinceJump = 0;
    car.flipResetReady = true;
    car.events.push('flipreset');
  }

  // Ball squeezed between a car and a surface shoots out of the gap (ground/wall/kuxir pinches)
  checkPinch(car, n, p, Lc) {
    const ball = this.ball;
    if (this.time - (car.lastPinch || -9) < 0.3) return;
    const vc = new THREE.Vector3().crossVectors(car.angVel, Lc).add(car.vel);
    const rel = vc.clone().sub(ball.vel);
    const approach = rel.dot(n); // car closing speed along contact normal
    const cs = queryContacts(ball.pos.x, ball.pos.y, ball.pos.z, ball.radius + 6);
    // ball wedged under the car: it squirts out instead of the car riding on it
    if (n.dot(car.up) < -0.55) {
      for (let i = 0; i < cs.length; i++) {
        const na = new THREE.Vector3(cs[i].nx, cs[i].ny, cs[i].nz);
        if (na.dot(car.up) < 0.5) continue;
        const slide = rel.clone().addScaledVector(na, -rel.dot(na));
        const sp = slide.length();
        if (sp < 200) return;
        const dir = slide.divideScalar(sp).addScaledVector(na, 0.2).normalize();
        const speed = Math.min(ball.maxSpeed, sp * 1.6 + 300);
        this._bd.dv.copy(dir.multiplyScalar(speed)).sub(ball.vel);
        this._bd.pinched = true;
        car.lastPinch = this.time;
        this.events.push({ type: 'pinch', car, speed, x: ball.pos.x, y: ball.pos.y, z: ball.pos.z });
        return;
      }
    }
    if (approach < 450) return;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const na = new THREE.Vector3(c.nx, c.ny, c.nz);
      const opp = n.dot(na);
      if (opp > -0.35) continue; // car must push the ball into this surface
      // escape direction: out of the wedge between the car face and the surface
      const dir = new THREE.Vector3().addVectors(n, na);
      if (dir.lengthSq() < 0.04) {
        dir.copy(car.vel).addScaledVector(na, -car.vel.dot(na));
        if (dir.lengthSq() < 1) dir.copy(car.fwd).addScaledVector(na, -car.fwd.dot(na));
      }
      dir.addScaledVector(na, 0.25).normalize();
      const speed = Math.min(ball.maxSpeed, approach * 2.4 + 400);
      this._bd.dv.copy(dir.multiplyScalar(speed)).sub(ball.vel);
      this._bd.pinched = true;
      car.lastPinch = this.time;
      this.events.push({ type: 'pinch', car, speed, x: ball.pos.x, y: ball.pos.y, z: ball.pos.z });
      return;
    }
  }

  registerTouch(car, fresh) {
    const ball = this.ball;
    if (fresh || ball.lastTouch !== car) {
      if (ball.lastTouch !== car || fresh) this.events.push({ type: 'touch', car, fresh });
    }
    ball.lastTouch = car;
    ball.lastTouchTeam = car.team;
    if (this.heatseeker && fresh) {
      this.heatseeker.team = car.team;
      this.heatseeker.speed = Math.min(this.heatseeker.max, this.heatseeker.speed + this.heatseeker.inc);
      this.heatseeker.active = true;
    }
  }

  // Heatseeker: hitting the targeted goal's backboard, crossbar or posts sends the ball
  // back toward the other goal
  heatseekBounce(c) {
    const hs = this.heatseeker, b = this.ball;
    if (!hs || !hs.active || hs.team < 0) return;
    if (this.time - (hs.lastFlip || -9) < 0.3) return;
    const s = hs.team === 0 ? 1 : -1; // sign of the targeted goal
    if (b.pos.y * s < ARENA.L - 450) return;
    // back wall (not the corners) or the goal frame (crossbar/posts), facing back into the field
    const R = b.radius;
    const nearFrame = Math.abs(b.pos.x) < ARENA.GW + R + 20 && b.pos.z < ARENA.GH + R + 20;
    const backWall = c.ny * s < -0.8 && Math.abs(b.pos.x) < 2700;
    if (!backWall && !(nearFrame && c.ny * s < -0.25)) return;
    hs.team = 1 - hs.team;
    hs.speed = Math.min(hs.max, hs.speed + hs.inc);
    hs.lastFlip = this.time;
    this.events.push({ type: 'heatflip', team: hs.team, x: b.pos.x, y: b.pos.y, z: b.pos.z });
  }

  heatseekStep(dt) {
    heatseekApply(this.ball, this.heatseeker, this.gravity, dt);
  }

  // --- car vs car ------------------------------------------------------------
  carCarCollide(a, b) {
    if (a.demolished || b.demolished) return;
    a.hitboxCenter(_v1); b.hitboxCenter(_v2);
    const d = _v3.subVectors(_v2, _v1);
    const dist = d.length();
    const ra = Math.min(a.half.x, 62) * 0.9, rb = Math.min(b.half.x, 62) * 0.9;
    // use ellipsoid-ish radius: depends on direction relative to car forward
    const radA = lerp(a.half.y, a.half.x, Math.abs(d.dot(a.fwd)) / (dist || 1));
    const radB = lerp(b.half.y, b.half.x, Math.abs(d.dot(b.fwd)) / (dist || 1));
    const rsum = Math.min(radA + radB, ra + rb + 20);
    if (dist >= rsum || dist < 1e-3) return;
    const n = d.divideScalar(dist); // a -> b
    const pen = rsum - dist;
    a.pos.addScaledVector(n, -pen / 2); b.pos.addScaledVector(n, pen / 2);
    const rv = _v4.subVectors(b.vel, a.vel).dot(n);
    if (rv < 0) {
      const j = -(1 + 0.3) * rv / 2;
      a.vel.addScaledVector(n, -j); b.vel.addScaledVector(n, j);
    }
    // bump / demo
    const key = a.id < b.id ? a.id * 1000 + b.id : b.id * 1000 + a.id;
    const last = this.contactsPrev.get(key) || -1e9;
    if (this.time - last < 0.25) return;
    this.contactsPrev.set(key, this.time);
    const tryBump = (att, vic, dir) => {
      const along = att.vel.dot(dir);
      const facing = att.fwd.dot(dir);
      if (facing < 0.5 || along < 300) return false;
      if (att.supersonic && this.demolitions && (att.team !== vic.team || this.friendlyDemos)) {
        this.demolish(vic, att);
        return true;
      }
      if (att.team !== vic.team || this.friendlyDemos) {
        const spd = att.vel.length();
        const up = vic.onGround ? curve(BUMP_UP, spd) : 0;
        vic.vel.addScaledVector(dir, curve(BUMP_VEL, spd)).addScaledVector(vic.up, up);
        this.events.push({ type: 'bump', car: vic, by: att });
      }
      return true;
    };
    if (Math.random() < 0.5) { if (!tryBump(a, b, n)) tryBump(b, a, n.clone().negate()); }
    else if (!tryBump(b, a, n.clone().negate())) tryBump(a, b, n);
  }

  demolish(vic, att) {
    vic.demolished = true;
    vic.respawnTimer = PHYS.DEMO_RESPAWN;
    vic.isBoosting = false;
    if (att) att.stats.demos++;
    this.events.push({ type: 'demo', car: vic, by: att, x: vic.pos.x, y: vic.pos.y, z: vic.pos.z });
  }

  updatePads(dt) {
    for (const pad of this.pads) {
      if (!pad.active) {
        pad.timer -= dt;
        if (pad.timer <= 0) pad.active = true;
        continue;
      }
      const rad = pad.big ? 208 : 144;
      for (const car of this.cars) {
        if (car.demolished) continue;
        const dx = car.pos.x - pad.x, dy = car.pos.y - pad.y;
        if (dx * dx + dy * dy < rad * rad && car.pos.z < (pad.big ? 168 : 165) && car.boost < 100) {
          car.boost = pad.big ? 100 : Math.min(100, car.boost + 12);
          pad.active = false; pad.timer = pad.big ? 10 : 4;
          this.events.push({ type: 'pad', car, big: pad.big });
          break;
        }
      }
    }
  }
}

// Heatseeker homing: steer toward the targeted goal and hold at least the current homing speed
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3();
function heatseekApply(b, hs, gravity, dt) {
  if (!hs || !hs.active || hs.team < 0) return;
  const ty = hs.team === 0 ? ARENA.L + 200 : -ARENA.L - 200;
  _h1.set(0 - b.pos.x, ty - b.pos.y, ARENA.GH * 0.45 - b.pos.z).normalize();
  const sp = Math.max(b.vel.length(), 1);
  _h2.copy(b.vel).divideScalar(sp);
  _h2.lerp(_h1, Math.min(1, hs.turn * dt)).normalize();
  const target = Math.max(sp, hs.speed);
  b.vel.copy(_h2).multiplyScalar(lerp(sp, target, Math.min(1, 2 * dt)));
  b.vel.z -= gravity * dt * 0.5; // partly offsets gravity so the homing arc reaches the goal
}

// Ball path prediction (arena only; follows Heatseeker homing when given)
function predictBall(ball, gravity, seconds, dt, out, hs) {
  const b = { pos: ball.pos.clone(), vel: ball.vel.clone(), angVel: ball.angVel.clone(), radius: ball.radius, restitution: ball.restitution, maxSpeed: ball.maxSpeed };
  const n = Math.round(seconds / dt);
  out.length = n;
  for (let i = 0; i < n; i++) {
    if (hs) heatseekApply(b, hs, gravity, dt);
    ballArenaStep(b, dt, gravity, null);
    let s = out[i];
    if (!s) s = out[i] = { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    s.t = (i + 1) * dt; s.x = b.pos.x; s.y = b.pos.y; s.z = b.pos.z;
    s.vx = b.vel.x; s.vy = b.vel.y; s.vz = b.vel.z;
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { World, Car, Ball, predictBall };
