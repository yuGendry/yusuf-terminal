// Bots: ball-prediction based intercepts, rotation, shots, aerials, kickoffs, recovery.
'use strict';

const BOT_LEVELS = {
  rookie:  { name: 'Rookie',   aimNoise: 1100, throttle: 0.82, boost: false, boostMin: 99, aerial: false, jumpShots: false, react: 0.45, speedEst: 1050, flip: true },
  pro:     { name: 'Pro',      aimNoise: 350, throttle: 1.0,  boost: true,  boostMin: 0,  aerial: true,  aerialMax: 900, jumpShots: true, react: 0.18, speedEst: 1350, flip: true },
  allstar: { name: 'All-Star', aimNoise: 0, throttle: 1.0,  boost: true,  boostMin: 0,  aerial: true,  aerialMax: 1900, jumpShots: true, react: 0.06, speedEst: 1550, flip: true },
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
    const prevThrottle = C.throttle;
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

    // stuck (nose in a wall/corner, pinned on the ball): back out, then jump if that fails
    if (this.unstickT > 0) {
      this.unstickT -= dt;
      C.throttle = -1; C.steer = this.unstickSteer;
      return;
    }
    if (c.numArenaWheels >= 2 && c.vel.length() < 120 && Math.abs(prevThrottle) > 0.5 && !isKickoff) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 0.9) {
        this.stuckT = 0;
        this.stuckCount = (this.stuckCount || 0) + 1;
        if (this.stuckCount % 2 === 1) { this.unstickT = 0.7; this.unstickSteer = Math.random() < 0.5 ? -1 : 1; }
        else { const lb = this.local(ball.pos); this.dodge(1, clamp(-Math.atan2(lb.y, lb.x), -1, 1), false); }
        return;
      }
    } else { this.stuckT = 0; if (c.vel.length() > 500) this.stuckCount = 0; }

    // on a wall with nothing to do there: drive back down toward the play
    if (c.numArenaWheels >= 3 && c.up.z < 0.55 && !(ball.pos.z > 300 && c.pos.distanceTo(ball.pos) < 900)) {
      const down = new THREE.Vector3(0, 0, -1).addScaledVector(c.up, c.up.z).normalize();
      const toBall = new THREE.Vector3().subVectors(ball.pos, c.pos);
      toBall.addScaledVector(c.up, -toBall.dot(c.up)).normalize();
      const tgt = c.pos.clone().addScaledVector(down, 700).addScaledVector(toBall, 300);
      this.driveTo(tgt, 1, false);
      return;
    }

    if (!this.aimT || game.world.time > this.aimT) { this.aimT = game.world.time + 2.5; this.aimOffset = (Math.random() - 0.5) * 2 * (L.aimNoise || 0); }
    const role = game.roleOf(c);
    const ownDanger = this.ownGoalThreat(game);
    if ((role === 'attack' || ownDanger) && this.attack(game, dt, dirY, ownDanger)) return;
    this.position(game, role, dirY, ownGoal);
  }

  // Where to put the ball: a point inside the opponent goal, or away from our own goal when clearing
  shotTarget(bx, by, dirY, clearing) {
    if (clearing) return new THREE.Vector3(bx >= 0 ? 3800 : -3800, by + dirY * 2500, 0);
    // tight angle from the corner: cross it into the middle in front of goal instead
    const depth = ARENA.L - by * dirY;
    if (Math.abs(bx) > 1900 && depth < 1700) return new THREE.Vector3(0, dirY * (ARENA.L - 700), 0);
    return new THREE.Vector3(clamp(bx * 0.3, -600, 600), dirY * (ARENA.L + 400), 0);
  }

  // Rough time for this car to reach P arriving along heading H
  timeTo(P, H) {
    const c = this.car, L = this.level;
    const dx = P.x - c.pos.x, dy = P.y - c.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return 0;
    const fx = c.fwd.x, fy = c.fwd.y, fl = Math.hypot(fx, fy) || 1;
    const a1 = Math.acos(clamp((fx * dx + fy * dy) / (fl * d), -1, 1));
    const a2 = Math.acos(clamp((H.x * dx + H.y * dy) / d, -1, 1));
    const v0 = Math.max(0, c.vel.dot(c.fwd));
    const boosting = L.boost && c.boost > 15;
    const vmax = boosting ? 2250 : 1410, acc = boosting ? 1500 : 650;
    const tAcc = Math.max(0, (vmax - v0) / acc);
    const dAcc = v0 * tAcc + 0.5 * acc * tAcc * tAcc;
    const tStraight = d <= dAcc ? (-v0 + Math.sqrt(v0 * v0 + 2 * acc * d)) / acc : tAcc + (d - dAcc) / vmax;
    return tStraight + a1 * 0.42 + a2 * 0.3 + L.react * 0.5;
  }

  ownGoalThreat(game) {
    const c = this.car, dirY = c.team === 0 ? 1 : -1;
    for (let i = 0; i < game.ballPred.length; i += 6) {
      const s = game.ballPred[i];
      if (s.y * dirY < -(ARENA.L + 60) && Math.abs(s.x) < ARENA.GW + 150) return s.t;
    }
    return 0;
  }

  attack(game, dt, dirY, danger) {
    const c = this.car, C = c.controls, L = this.level, ball = game.world.ball;
    const pred = game.ballPred;
    const R = ball.radius;
    const maxZ = L.jumpShots ? 320 : 150;
    let pick = null;
    for (let i = 2; i < pred.length; i += 2) {
      const s = pred[i];
      if (s.z > maxZ) continue;
      if (Math.abs(s.x) > 3900 || Math.abs(s.y) > ARENA.L + 50) continue;
      const clearing = s.y * dirY < -ARENA.L * 0.55 || !!danger;
      const tgt = this.shotTarget(s.x, s.y, dirY, clearing);
      tgt.x += this.aimOffset || 0;
      const H = new THREE.Vector3(tgt.x - s.x, tgt.y - s.y, 0).normalize();
      const P = new THREE.Vector3(s.x - H.x * (R + 70), s.y - H.y * (R + 70), 0);
      const t = this.timeTo(P, H);
      if (t <= s.t) { pick = { s, H, P, t, clearing }; break; }
    }
    if (!pick) {
      // nothing reachable soon: chase the ball's landing point if it's on our side, else defend
      if (danger) {
        const s = pred[Math.min(pred.length - 1, 90)];
        this.driveTo(new THREE.Vector3(s.x, s.y, 0), 1, true);
        return true;
      }
      return false;
    }
    const { s, H, P } = pick;
    const toP = new THREE.Vector3(P.x - c.pos.x, P.y - c.pos.y, 0);
    const dist = toP.length();
    // wrong side of the ball: rotate around it instead of pushing it toward our own net
    const ahead = new THREE.Vector3(c.pos.x - s.x, c.pos.y - s.y, 0).dot(H);
    if (ahead > -60 && dist < 2200) {
      const side = (new THREE.Vector3(-H.y, H.x, 0).dot(new THREE.Vector3(c.pos.x - s.x, c.pos.y - s.y, 0)) >= 0) ? 1 : -1;
      const wp = new THREE.Vector3(s.x - H.x * 900 - H.y * side * 700, s.y - H.y * 900 + H.x * side * 700, 0);
      wp.x = clamp(wp.x, -3700, 3700); wp.y = clamp(wp.y, -4900, 4900);
      this.driveTo(wp, 1, true);
      return true;
    }
    // curve in: aim at a point behind P along the shot line, converging as we get close
    const lead = clamp(dist * 0.42, 0, 1000);
    const aim = new THREE.Vector3(P.x - H.x * lead, P.y - H.y * lead, 0);
    aim.x = clamp(aim.x, -3900, 3900); aim.y = clamp(aim.y, -5000, 5000);
    const r = this.driveTo(aim, 1, false);
    // speed control: arrive when the ball does
    const tLeft = Math.max(0.05, s.t);
    const want = dist / tLeft;
    const vf = c.vel.dot(c.fwd);
    if (vf > want + 250 && dist > 300 && tLeft > 0.4) { C.throttle = vf > want + 600 ? -0.6 : 0; C.boost = false; }
    else if (want > vf + 150 && Math.abs(r.ang) < 0.35 && L.boost && c.boost > 0 && c.numArenaWheels >= 3 && vf < 2250) C.boost = true;

    // finishing moves
    if (c.numArenaWheels >= 3) {
      const bl = this.local(ball.pos);
      const bDist = Math.hypot(bl.x, bl.y);
      const bAng = Math.atan2(bl.y, bl.x);
      if (L.flip && ball.pos.z < 180 && bDist < 140 + Math.max(0, vf) * 0.22 && bDist > 120 && Math.abs(bAng) < 0.5 && vf > 400) {
        this.dodge(1, clamp(-bAng * 2.2, -1, 1), true);
        return true;
      }
      if (L.jumpShots && s.z > 170 && s.t < 0.55 && s.t > 0.2 && dist < 400 + vf * s.t) {
        const dbl = s.z > 260;
        this.startSeq(dbl ? [{ t: 0.18, jump: true }, { t: 0.04, jump: false }, { t: 0.05, jump: true }, { t: 0.6, jump: false }]
          : [{ t: 0.2, jump: true }, { t: 0.06, jump: false }, { t: 0.05, jump: true, pitch: -1 }, { t: 0.5, jump: false }]);
        return true;
      }
      // aerial for high balls on the way
      if (L.aerial && this.tryAerial(game, dirY)) return true;
    }
    return true;
  }

  tryAerial(game, dirY) {
    const c = this.car, L = this.level, pred = game.ballPred;
    if (c.boost < 30) return false;
    for (let i = 30; i < pred.length; i += 4) {
      const s = pred[i];
      if (s.z < 450 || s.z > (L.aerialMax || 900)) continue;
      const hd = Math.hypot(s.x - c.pos.x, s.y - c.pos.y);
      const l = this.local(new THREE.Vector3(s.x, s.y, s.z));
      if (Math.abs(Math.atan2(l.y, l.x)) > 0.35) continue;
      // average acceleration needed must be within what boost can give
      const need = 2 * Math.hypot(hd - c.vel.length() * s.t * 0.9, s.z - 17 - 300 * s.t) / (s.t * s.t);
      if (need < 900 && s.t > 0.8 && s.t < 2.8) {
        this.aerial = { target: new THREE.Vector3(s.x, s.y, s.z), t0: game.world.time, T: s.t };
        this.startSeq([{ t: 0.2, jump: true }, { t: 0.03, jump: false }, { t: 0.05, jump: true }, { t: 2.8, jump: false }]);
        return true;
      }
    }
    return false;
  }

  // Off-ball positioning: defenders sit between ball and net, support stays a bit back, grabs boost
  position(game, role, dirY, ownGoal) {
    const c = this.car, C = c.controls, ball = game.world.ball;
    let tgt;
    if (role === 'defend') {
      tgt = new THREE.Vector3(clamp(ball.pos.x * 0.35, -700, 700), -dirY * (ARENA.L - 350), 0);
    } else {
      tgt = new THREE.Vector3(ball.pos.x * 0.5, ball.pos.y - dirY * 2400, 0);
      tgt.y = clamp(tgt.y, -(ARENA.L - 400), ARENA.L - 400);
    }
    const d = this.local(tgt);
    const dist = Math.hypot(d.x, d.y);
    const r = this.driveTo(tgt, dist < 700 ? clamp(dist / 900, 0.15, 1) : 1, dist > 2200);
    if (dist < 300) {
      const lb = this.local(ball.pos);
      const ang = Math.atan2(lb.y, lb.x);
      C.steer = clamp(-ang * 2, -1, 1);
      C.throttle = Math.abs(ang) > 0.5 ? 0.5 : 0;
    } else if (c.boost < 50) this.collectBoost(game, r);
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
