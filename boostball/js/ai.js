// Bots: ball-prediction based intercepts, rotation, shots, aerials, kickoffs, recovery.
'use strict';

const BOT_LEVELS = {
  rookie:  { name: 'Rookie',   throttle: 0.82, boost: false, boostMin: 99, aerial: false, jumpShots: false, react: 0.45, speedEst: 1050, flip: true },
  pro:     { name: 'Pro',      throttle: 1.0,  boost: true,  boostMin: 0,  aerial: true,  aerialMax: 900, jumpShots: true, react: 0.18, speedEst: 1350, flip: true },
  allstar: { name: 'All-Star', throttle: 1.0,  boost: true,  boostMin: 0,  aerial: true,  aerialMax: 1900, jumpShots: true, react: 0.06, speedEst: 1550, flip: true },
};

const BOT_NAMES = ['Viper', 'Rex', 'Jester', 'Bandit', 'Sundown', 'Hound', 'Casper', 'Maverick', 'Fury', 'Shepard', 'Junker', 'Squall', 'Tusk', 'Gerwin', 'Sabretooth', 'Raja', 'Caveman', 'Imp', 'Myrtle', 'Poncho'];

const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3(), _aq = new THREE.Quaternion(), _am = new THREE.Matrix4();

class Bot {
  constructor(car, level) {
    this.car = car;
    this.level = BOT_LEVELS[level] || BOT_LEVELS.pro;
    this.seq = null; this.seqT = 0; this.seqI = 0;
    this.aerial = null;
    this.reactT = 0;
    this.target = new THREE.Vector3();
    this.lastTurtle = 0;
    this.jumpToggle = false;
  }

  clear() {
    const C = this.car.controls;
    C.throttle = 0; C.steer = 0; C.pitch = 0; C.yaw = 0; C.roll = 0; C.jump = false; C.boost = false; C.handbrake = false;
  }

  local(v) {
    const c = this.car;
    _a1.subVectors(v, c.pos);
    return { x: _a1.dot(c.fwd), y: _a1.dot(c.left), z: _a1.dot(c.up) };
  }

  driveTo(target, speedScale = 1, allowBoost = true) {
    const c = this.car, C = c.controls, L = this.level;
    const l = this.local(target);
    const ang = Math.atan2(l.y, l.x);
    const dist = Math.hypot(l.x, l.y);
    C.steer = clamp(-ang * 3.2, -1, 1);
    C.throttle = L.throttle * speedScale;
    const spd = c.vel.dot(c.fwd);
    if (Math.abs(ang) > 1.9 && spd > 400 && dist > 300) C.handbrake = true;
    if (Math.abs(ang) > 2.6 && dist < 500 && spd < 300) { C.throttle = -1; C.steer = -C.steer; }
    if (allowBoost && L.boost && Math.abs(ang) < 0.3 && c.numArenaWheels >= 3 && spd < 2250 && speedScale >= 1 && c.boost > L.boostMin) C.boost = true;
    return { ang, dist };
  }

  // PD orientation controller in the air
  orient(fwdT, upT) {
    const c = this.car, C = c.controls;
    const f = _a1.copy(fwdT).normalize();
    const l = _a2.crossVectors(upT, f);
    if (l.lengthSq() < 1e-6) l.copy(c.left);
    l.normalize();
    const u = _a3.crossVectors(f, l).normalize();
    _am.makeBasis(f, l, u);
    _aq.setFromRotationMatrix(_am);
    const qe = _aq.multiply(c.quat.clone().invert());
    if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
    const s = Math.sqrt(1 - Math.min(1, qe.w * qe.w));
    const angle = 2 * Math.acos(Math.min(1, qe.w));
    const ax = s > 1e-4 ? new THREE.Vector3(qe.x / s, qe.y / s, qe.z / s) : new THREE.Vector3();
    const e = c.toLocal(ax.multiplyScalar(angle), new THREE.Vector3());
    const w = c.toLocal(c.angVel, new THREE.Vector3());
    const kp = 5.5, kd = 0.9;
    const dx = (e.x * kp - w.x) * kd, dy = (e.y * kp - w.y) * kd, dz = (e.z * kp - w.z) * kd;
    C.roll = clamp(dx, -1, 1);
    C.pitch = clamp(-dy * 1.6, -1, 1);
    C.yaw = clamp(-dz * 1.6, -1, 1);
    return angle;
  }

  startSeq(steps) { this.seq = steps; this.seqT = 0; this.seqI = 0; }
  runSeq(dt) {
    const C = this.car.controls;
    if (!this.seq) return false;
    const st = this.seq[this.seqI];
    if (!st) { this.seq = null; return false; }
    C.jump = !!st.jump;
    if (st.pitch !== undefined) C.pitch = st.pitch;
    if (st.yaw !== undefined) C.yaw = st.yaw;
    if (st.roll !== undefined) C.roll = st.roll;
    if (st.boost) C.boost = true;
    if (st.throttle !== undefined) C.throttle = st.throttle;
    this.seqT += dt;
    if (this.seqT >= st.t) { this.seqT = 0; this.seqI++; }
    if (this.seqI >= this.seq.length) this.seq = null;
    return true;
  }
  dodge(dirX, dirY, boost) {
    // jump, short hold, release, flip
    this.startSeq([
      { t: 0.07, jump: true, pitch: 0, yaw: 0, boost },
      { t: 0.05, jump: false, pitch: 0, yaw: 0, boost },
      { t: 0.06, jump: true, pitch: -dirX, yaw: dirY },
      { t: 0.55, jump: false, pitch: -dirX * 0.2, yaw: 0 },
    ]);
  }

  update(game, dt) {
    const c = this.car;
    if (c.demolished) { this.clear(); return; }
    const C = c.controls;
    const w = game.world, ball = w.ball, L = this.level;
    const keepSeq = this.seq;
    this.clear();
    if (game.state === 'countdown') return;
    const dirY = c.team === 0 ? 1 : -1;
    const oppGoal = new THREE.Vector3(0, dirY * (ARENA.L + 200), 0);
    const ownGoal = new THREE.Vector3(0, -dirY * (ARENA.L - 100), 0);

    // turtle / stuck
    if (c.worldContact && c.numArenaWheels < 2 && c.up.dot(c.worldNormal) < 0.5) {
      this.jumpToggle = !this.jumpToggle;
      C.jump = this.jumpToggle;
      C.throttle = 1;
      return;
    }

    if (keepSeq) {
      this.seq = keepSeq;
      if (this.aerial) this.aerialControl(game, dt);
      else if (c.numArenaWheels < 3 && this.seqI >= 3) this.recover();
      this.runSeq(dt);
      if (!this.seq && !this.aerial) { /* finished */ }
      return;
    }
    if (this.aerial) { this.aerialControl(game, dt); return; }

    const pred = game.ballPred;
    const isKickoff = game.kickoffPending && ball.lastTouch === null && Math.hypot(ball.pos.x, ball.pos.y) < 50;
    if (isKickoff) return this.kickoff(game);

    // air: recover
    if (c.numArenaWheels < 3 && !c.onGround) {
      this.recover();
      C.throttle = 1;
      return;
    }

    // on a wall with nothing to do there: drive back down toward the play
    if (c.numArenaWheels >= 3 && c.up.z < 0.55 && !(ball.pos.z > 300 && c.pos.distanceTo(ball.pos) < 900)) {
      const down = new THREE.Vector3(0, 0, -1).addScaledVector(c.up, c.up.z).normalize();
      const toBall = new THREE.Vector3().subVectors(ball.pos, c.pos);
      toBall.addScaledVector(c.up, -toBall.dot(c.up)).normalize();
      const tgt = c.pos.clone().addScaledVector(down, 700).addScaledVector(toBall, 300);
      this.driveTo(tgt, 1, false);
      return;
    }

    // stuck pushing against something: dodge out of it
    if (c.numArenaWheels >= 3 && c.vel.length() < 150 && c.controls) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 1.1) {
        this.stuckT = 0;
        const lb = this.local(ball.pos);
        this.dodge(1, clamp(-Math.atan2(lb.y, lb.x), -1, 1), false);
        return;
      }
    } else this.stuckT = 0;

    const role = game.roleOf(c);
    // pick an intercept slice
    let slice = null;
    const spd = c.vel.length();
    const maxZ = L.aerial ? (L.aerialMax || 900) : (L.jumpShots ? 330 : 170);
    for (let i = 3; i < pred.length; i += 3) {
      const s = pred[i];
      if (s.z > maxZ) continue;
      const dx = s.x - c.pos.x, dy = s.y - c.pos.y;
      const dist = Math.max(0, Math.hypot(dx, dy) - 120);
      const l = this.local(_a3.set(s.x, s.y, s.z));
      const ang = Math.abs(Math.atan2(l.y, l.x));
      const vAvg = Math.max(500, (spd + L.speedEst + (c.boost > 20 && L.boost ? 500 : 0)) / 2);
      const tNeed = dist / vAvg + ang * 0.35 + (s.z > 200 ? 0.35 + s.z / 1500 : 0) + L.react;
      if (tNeed <= s.t) { slice = s; break; }
    }
    if (!slice) slice = pred[pred.length - 1] || { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z, t: 0 };
    const sp = new THREE.Vector3(slice.x, slice.y, slice.z);

    if (role === 'defend' || role === 'support') {
      // stay goal-side of the ball
      const back = role === 'defend' ? 0.75 : 0.45;
      const tgt = new THREE.Vector3().lerpVectors(ball.pos, ownGoal, back);
      tgt.x *= 0.6; tgt.z = 0;
      const toBall = Math.hypot(ball.pos.x - c.pos.x, ball.pos.y - c.pos.y);
      const ballDanger = (ball.pos.y * dirY < -ARENA.L * 0.45) && toBall < 1600;
      if (!ballDanger) {
        const d = this.local(tgt);
        const dist = Math.hypot(d.x, d.y);
        const r = this.driveTo(tgt, dist < 600 ? clamp(dist / 900, 0, 1) : 1, dist > 2000);
        if (dist < 250) {
          // face the ball while waiting
          const lb = this.local(ball.pos);
          C.steer = clamp(-Math.atan2(lb.y, lb.x) * 2, -1, 1);
          C.throttle = Math.abs(Math.atan2(lb.y, lb.x)) > 0.6 ? 0.4 : 0;
        }
        this.collectBoost(game, r);
        return;
      }
    }

    // attacking: approach the ball from behind relative to the opponent goal
    const toGoal = new THREE.Vector3(oppGoal.x - sp.x, oppGoal.y - sp.y, 0).normalize();
    // clear the ball away from own goal if it's deep in our half
    if (sp.y * dirY < -ARENA.L * 0.55) {
      toGoal.set(sp.x >= 0 ? 0.6 : -0.6, dirY, 0).normalize();
    }
    const carToBall = new THREE.Vector3(sp.x - c.pos.x, sp.y - c.pos.y, 0);
    const ahead = carToBall.dot(toGoal) < -100; // car is on the wrong side
    let aim;
    if (ahead) {
      // circle around: go to a point behind the ball, offset sideways
      const side = (c.pos.x - sp.x) >= 0 ? 1 : -1;
      aim = new THREE.Vector3(sp.x - toGoal.x * 900 + side * 500, sp.y - toGoal.y * 900, 0);
      aim.x = clamp(aim.x, -3600, 3600);
      aim.y = clamp(aim.y, -4900, 4900);
    } else {
      const off = 110 + Math.min(500, carToBall.length() * 0.35);
      aim = new THREE.Vector3(sp.x - toGoal.x * off, sp.y - toGoal.y * off, 0);
    }
    const r = this.driveTo(aim, 1, true);
    if (!ahead && slice.t < 1.2 && Math.abs(r.ang) < 0.4 && c.boost > 0 && L.boost && c.numArenaWheels >= 3) C.boost = true;

    // shots
    const bl = this.local(ball.pos);
    const bDist = Math.hypot(bl.x, bl.y);
    const bAng = Math.atan2(bl.y, bl.x);
    const closing = c.vel.dot(c.fwd);
    if (!ahead && c.numArenaWheels >= 3) {
      if (L.flip && ball.pos.z < 190 && bDist < 260 + closing * 0.12 && Math.abs(bAng) < 0.45 && closing > 300) {
        this.dodge(1, clamp(-bAng * 2, -1, 1), true);
        return;
      }
      if (L.jumpShots && ball.pos.z > 220 && ball.pos.z < 520 && bDist < 280 && Math.abs(bAng) < 0.5) {
        const dbl = ball.pos.z > 360;
        this.startSeq(dbl ? [
          { t: 0.2, jump: true }, { t: 0.04, jump: false }, { t: 0.06, jump: true }, { t: 0.6, jump: false },
        ] : [{ t: 0.2, jump: true }, { t: 0.08, jump: false }, { t: 0.05, jump: true, pitch: -1 }, { t: 0.5, jump: false }]);
        return;
      }
      // aerial
      if (L.aerial && slice.z > 450 && slice.z < (L.aerialMax || 900) && slice.t > 0.7 && slice.t < 3.2 && c.boost > 25 && Math.abs(r.ang) < 0.35) {
        const hd = Math.hypot(slice.x - c.pos.x, slice.y - c.pos.y);
        if (hd / slice.t < 1400) {
          this.aerial = { target: sp.clone(), t0: game.world.time, T: slice.t };
          this.startSeq([{ t: 0.2, jump: true }, { t: 0.03, jump: false }, { t: 0.05, jump: true }, { t: 2.8, jump: false }]);
          return;
        }
      }
    }
  }

  collectBoost(game, r) {
    const c = this.car;
    if (c.boost > 40 || !this.level.boost) return;
    let best = null, bd = 1e9;
    for (const p of game.world.pads) {
      if (!p.active || !p.big) continue;
      const d = Math.hypot(p.x - c.pos.x, p.y - c.pos.y);
      // only pads on our side
      const dirY = c.team === 0 ? 1 : -1;
      if (p.y * dirY > 500) continue;
      if (d < bd) { bd = d; best = p; }
    }
    if (best && bd < 2500) this.driveTo(new THREE.Vector3(best.x, best.y, 0), 1, false);
  }

  recover() {
    const c = this.car;
    const v = new THREE.Vector3(c.vel.x, c.vel.y, 0);
    if (v.lengthSq() < 100) v.set(c.fwd.x, c.fwd.y, 0);
    if (v.lengthSq() < 1e-3) v.set(1, 0, 0);
    // land on whatever is below: approximate with arena normal near the car
    const cs = queryContacts(c.pos.x, c.pos.y, c.pos.z, 900);
    const up = new THREE.Vector3(0, 0, 1);
    let best = 1e9;
    for (const k of cs) if (k.d < best) { best = k.d; up.set(k.nx, k.ny, k.nz); }
    if (best > 700) up.set(0, 0, 1);
    v.addScaledVector(up, -v.dot(up));
    if (v.lengthSq() < 1e-3) v.copy(c.fwd);
    this.orient(v, up);
  }

  aerialControl(game, dt) {
    const c = this.car, C = c.controls, a = this.aerial, ball = game.world.ball;
    const elapsed = game.world.time - a.t0;
    const T = Math.max(0.05, a.T - elapsed);
    // update target from current prediction
    const pred = game.ballPred;
    const idx = Math.min(pred.length - 1, Math.max(0, Math.round(T * 60) - 1));
    if (pred[idx]) a.target.set(pred[idx].x, pred[idx].y, pred[idx].z);
    const dirY = c.team === 0 ? 1 : -1;
    const toGoal = new THREE.Vector3(-a.target.x, dirY * ARENA.L - a.target.y, 0).normalize();
    const tgt = a.target.clone().addScaledVector(toGoal, -60);
    const dp = tgt.sub(c.pos).addScaledVector(c.vel, -T);
    const acc = dp.multiplyScalar(2 / (T * T));
    acc.z -= game.world.gravity;
    const need = acc.length();
    const dir = acc.clone().normalize();
    if (elapsed > 0.22) {
      const angle = this.orient(dir, new THREE.Vector3(0, 0, 1));
      C.boost = angle < 0.45 && need > 250 && c.boost > 0;
    } else {
      C.pitch = 0; C.yaw = 0; C.roll = 0;
    }
    C.throttle = 1;
    const touched = ball.lastTouch === c && game.world.tick - c.lastBallTick < 10;
    if (elapsed > a.T + 0.4 || touched || (c.numArenaWheels >= 3 && elapsed > 0.5)) {
      this.aerial = null; this.seq = null;
    }
  }

  kickoff(game) {
    const c = this.car, C = c.controls;
    const ball = game.world.ball;
    const d = Math.hypot(ball.pos.x - c.pos.x, ball.pos.y - c.pos.y);
    if (!game.isKickoffTaker(c)) {
      // non-takers grab corner boost or hang back
      const dirY = c.team === 0 ? 1 : -1;
      this.driveTo(new THREE.Vector3(0, -dirY * 3800, 0), 0.9, false);
      return;
    }
    if (this.koSeed === undefined || game.world.time < this.koTime) this.koSeed = Math.random();
    this.koTime = game.world.time;
    const tgt = ball.pos.clone();
    // slight (randomised) offset so the hit goes toward the opponent side
    tgt.y -= (c.team === 0 ? 1 : -1) * 40;
    tgt.x += (this.koSeed - 0.5) * 70;
    this.driveTo(tgt, 1, true);
    C.boost = this.level.boost || d < 2000;
    if (d < 640 + this.koSeed * 160 && c.numArenaWheels >= 3 && c.vel.length() > 1100) {
      const l = this.local(ball.pos);
      this.dodge(1, clamp(-Math.atan2(l.y, l.x) * 2.5, -1, 1), true);
    }
  }
}
