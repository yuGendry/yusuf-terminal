// Mechanics academy: each lesson sets up a scenario, a scripted bot demonstrates it,
// then the player tries the same setup. Demos are plain generator scripts that set
// car.controls every physics tick, so they run identically in the game and headless.
'use strict';

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------- script helpers
function* wait(ctx, secs, each) {
  const end = ctx.t + secs;
  while (ctx.t < end) { if (each && each() === false) return; yield; }
}
function* until(ctx, cond, maxSecs, each) {
  const end = ctx.t + (maxSecs || 10);
  while (!cond() && ctx.t < end) { if (each) each(); yield; }
}
// lesson tuning knob (the demo planner tries a few values per car body)
function tv(ctx, key, def) { const T = ctx.tune; return T && T[key] !== undefined ? T[key] : def; }
function holdControls(ctx, c) { Object.assign(ctx.car.controls, c); }
function clearControls(ctx) {
  const C = ctx.car.controls;
  C.throttle = 0; C.steer = 0; C.pitch = 0; C.yaw = 0; C.roll = 0; C.jump = false; C.boost = false; C.handbrake = false;
}
// orient nose along fwd with roof toward up (air)
function aim(ctx, fwd, up) { return ctx.bot.orient(_t1.copy(fwd).normalize(), _t2.copy(up || V3(0, 0, 1))); }
function recoverLanding(ctx) { ctx.bot.recover(); }
function carToBall(ctx) { return ctx.ball.pos.clone().sub(ctx.car.pos); }
function airborne(ctx) { return ctx.car.numArenaWheels === 0; }
function onGround(ctx) { return ctx.car.numArenaWheels >= 3; }
function hitboxTop(ctx) { const c = ctx.car; return c.hitboxCenter(V3()).addScaledVector(c.up, c.half.z); }
function placeBallOnRoof(ctx) {
  const c = ctx.car;
  const top = c.hitboxCenter(V3()).addScaledVector(c.up, c.half.z + ctx.ball.radius + 0.5);
  ctx.ball.reset(top.x, top.y, top.z);
  ctx.ball.vel.copy(c.vel);
}
// keep a ball balanced on the roof: throttle to keep it centered over the hitbox
function balanceDribble(ctx, cruise, target = 8) {
  const c = ctx.car, C = c.controls;
  const r = ctx.ball.pos.clone().sub(c.hitboxCenter(V3()));
  const fwdOff = r.dot(c.fwd), sideOff = r.dot(c.left);
  const vf = c.vel.dot(c.fwd);
  const ev = ctx.ball.vel.dot(c.fwd) - vf; // ball sliding forward (+) or back (-) on the roof
  C.throttle = clamp(0.4 + (fwdOff - target) / 20 + ev / 40 + (cruise - vf) / 900, 0, 1);
  C.steer = clamp(-sideOff / 30, -1, 1);
  C.boost = false;
}

// Air dribble: hold the car just under/behind the ball (toward the goal) with the nose
// on the ball, boosting only as much as needed. goalY = +-ARENA.L.
function airDribble(ctx, goalY, opts = {}) {
  const c = ctx.car, b = ctx.ball, C = c.controls;
  const toGoal = V3(-b.pos.x, goalY - b.pos.y, 0).normalize();
  // push mostly upward while low, then lean toward the goal once there's height to work with
  const dGoal = Math.hypot(b.pos.x, goalY - b.pos.y);
  let lift = opts.lift !== undefined ? opts.lift : clamp(2.4 - Math.max(0, b.vel.z) / 900, 0.25, 2.4);
  // near the ceiling: get above/behind it and push it down toward the goal
  if (b.pos.z > 1450) lift = b.vel.z > 0 ? -0.6 : Math.min(lift, 0.1);
  if (dGoal < 2000) lift = Math.min(lift, b.pos.z > 700 ? 0.25 : 0.8);
  const D = V3(toGoal.x, toGoal.y, lift).normalize(); // push direction
  const P = b.pos.clone().addScaledVector(D, -(b.radius + 60));
  const err = P.sub(c.pos);
  const relV = b.vel.clone().sub(c.vel);
  const acc = err.multiplyScalar(opts.kp || 8).addScaledVector(relV, opts.kd || 4);
  acc.z -= ctx.w.gravity;
  const need = acc.length();
  const dir = acc.clone().normalize();
  // nose between the thrust direction and the ball so touches land on the nose
  const toBall = b.pos.clone().sub(c.pos).normalize();
  const fwd = dir.clone().lerp(toBall, need < 600 ? 0.6 : 0.25).normalize();
  const ang = aim(ctx, fwd, V3(0, 0, 1).addScaledVector(fwd, -fwd.z).lengthSq() > 0.01 ? V3(0, 0, 1) : c.up);
  C.boost = need > 700 && c.fwd.dot(dir) > 0.8;
  C.throttle = need > 200 && c.fwd.dot(dir) > 0.5 ? 1 : 0;
  return ang;
}
function* jumpOff(ctx, hold = 0.2, double = true) {
  const C = ctx.car.controls;
  yield* wait(ctx, hold, () => { clearControls(ctx); C.jump = true; });
  if (double) {
    yield* wait(ctx, 0.03, () => { clearControls(ctx); });
    yield* wait(ctx, 0.04, () => { clearControls(ctx); C.jump = true; });
  }
}

// PD-fly the car so it holds position P relative to the moving ball (matches its velocity).
function holdRelative(ctx, P, opts = {}) {
  const c = ctx.car, b = ctx.ball, C = c.controls;
  const err = P.clone().sub(c.pos);
  const relV = b.vel.clone().sub(c.vel);
  const acc = err.multiplyScalar(opts.kp || 5).addScaledVector(relV, opts.kd || 3.2);
  const need = acc.length();
  if (need < 1) return { need, err: 0 };
  const dir = acc.clone().normalize();
  aim(ctx, dir, opts.up || V3(0, 0, 1));
  C.boost = need > (opts.minAcc || 250) && c.fwd.dot(dir) > 0.82;
  return { need, err: P.distanceTo(c.pos), relV: relV.length() };
}

// Flip reset the usual way: fly at the ball with a steady closing speed, then
// just before contact stop boosting and turn the wheels to face it, so it meets
// the underside of the car softly.
function* getReset(ctx, maxT, opts = {}) {
  const c = ctx.car, b = ctx.ball, C = c.controls;
  const start = ctx.resets;
  const closeV = opts.closeV || 520, lead = opts.lead || 1.0;
  let turning = false;
  ctx.data.rs = 0;
  yield* until(ctx, () => ctx.resets > start, maxT || 3, () => {
    clearControls(ctx);
    const d = b.pos.clone().sub(c.hitboxCenter(V3())), dist = d.length(); d.normalize();
    const v = c.vel.clone().sub(b.vel), closing = v.dot(d);
    const gap = dist - b.radius - c.half.z;
    if (!turning && closing > 60 && (gap < closing * lead || gap < 25)) turning = true;
    if (turning && (gap > 420 || closing < 20)) turning = false;
    ctx.data.rs = turning ? 1 : 0;
    // a wheel is on the ball: let go of the stick so the suspension rocks the rest onto it
    if (tv(ctx, 'limp', 1) && c.numBallWheels > 0 && c.up.dot(d) < -0.7) { ctx.data.rs = 2; return; }
    if (turning) {
      // wheels toward the ball; the nose points where we need a sideways nudge so the
      // ball lands in the middle of the underside, and short boosts make the nudge
      const hc = c.hitboxCenter(V3());
      const p = b.pos.clone().sub(hc), dn = p.clone().normalize();
      const tc = Math.max(gap / Math.max(closing, 100), 0.12);
      const off = p.clone().addScaledVector(c.up, -p.dot(c.up));
      const vl = v.clone().negate(); vl.addScaledVector(c.up, -vl.dot(c.up));
      const miss = off.addScaledVector(vl, tc);
      const aLat = miss.multiplyScalar(2 / (tc * tc));
      const al = aLat.length();
      const f = al > 1 ? aLat.clone().normalize() : c.fwd.clone().addScaledVector(dn, -c.fwd.dot(dn)).normalize();
      f.addScaledVector(dn, -f.dot(dn)).normalize();
      aim(ctx, f, dn.clone().negate());
      C.boost = al > 200 && c.up.dot(dn) < -0.8 && c.fwd.dot(aLat.normalize()) > 0.7;
      return;
    }
    // aim the relative velocity straight at the ball at closeV
    // (slower when already close, so there's still time to turn the wheels in)
    const vT = Math.min(closeV, Math.max(gap, 0) / (lead * tv(ctx, 'lf', 0.8)) + tv(ctx, 'va', 60));
    const a = d.clone().multiplyScalar(vT).sub(v).multiplyScalar(3);
    const need = a.length();
    const dir = need > 1 ? a.clone().normalize() : d;
    aim(ctx, dir, c.up);
    C.boost = need > 150 && c.fwd.dot(dir) > 0.85;
  });
}

// Ball resting on the nose (air dribble): pitch back so the underside rotates onto it
function* rollUnder(ctx, maxT) {
  const c = ctx.car, b = ctx.ball;
  const start = ctx.resets;
  yield* until(ctx, () => ctx.resets > start, maxT, () => {
    clearControls(ctx);
    const dn = b.pos.clone().sub(c.hitboxCenter(V3())).normalize();
    const f = c.up.clone().addScaledVector(dn, -c.up.dot(dn)).normalize();
    // keep boosting through the first part of the turn: that's the closing speed that
    // brings the wheels onto the ball
    const closing = c.vel.clone().sub(b.vel).dot(dn);
    c.controls.boost = c.fwd.dot(dn) > 0.35 && closing < 150;
    aim(ctx, f, dn.negate());
  });
}

// Wheels on (or just off) the ball: dodge toward where the ball sits under the car, so the
// spinning body sweeps through it (front flip if it's ahead of center, back flip if behind)
function* flipToward(ctx) {
  const c = ctx.car, b = ctx.ball;
  const off = b.pos.clone().sub(c.hitboxCenter(V3()));
  let fx = off.dot(c.fwd), fy = -off.dot(c.left);
  const n = Math.hypot(fx, fy) || 1;
  fx /= n; fy /= n;
  if (Math.abs(fx) < 0.35 && Math.abs(fy) < 0.35) { fx = 1; fy = 0; }
  yield* wait(ctx, 0.05, () => { clearControls(ctx); Object.assign(c.controls, { jump: true, pitch: -fx, yaw: fy }); });
}

// Point the nose at the ball, boost in, and dodge into it when close
function* flipInto(ctx, maxT) {
  const c = ctx.car, b = ctx.ball, C = c.controls;
  let flipped = false;
  yield* until(ctx, () => flipped, maxT || 2, () => {
    clearControls(ctx);
    const hc = c.hitboxCenter(V3());
    const d = b.pos.clone().sub(hc), dist = d.length(), dn = d.clone().divideScalar(dist);
    const v = c.vel.clone().sub(b.vel), closing = v.dot(dn);
    const latV = v.clone().addScaledVector(dn, -closing).length();
    // first line the relative velocity up straight at the ball, then point the nose and dodge
    if (latV > 90 || closing < 250) {
      const a = dn.clone().multiplyScalar(tv(ctx, 'fv', 550)).sub(v).multiplyScalar(3);
      const dir = a.clone().normalize();
      aim(ctx, dir, c.up.z > -0.3 ? V3(0, 0, 1) : c.up);
      C.boost = a.length() > 150 && c.fwd.dot(dir) > 0.85;
      return;
    }
    const to = b.pos.clone().addScaledVector(b.vel.clone().sub(c.vel), 0.08).sub(hc).normalize();
    aim(ctx, to, c.up.z > -0.3 ? V3(0, 0, 1) : c.up);
    const tHit = (dist - b.radius - c.half.x) / Math.max(closing, 1);
    if (tHit < tv(ctx, 'ft', 0.18) && c.fwd.dot(to) > 0.85) { C.jump = true; C.pitch = -1; C.yaw = 0; flipped = true; }
  });
  yield* wait(ctx, 0.06, () => { clearControls(ctx); C.jump = true; C.pitch = -1; });
  yield* wait(ctx, 0.6, () => { clearControls(ctx); });
}

// ------------------------------------------------------------- lessons
const TUTORIALS = [
  {
    id: 'airroll', title: 'Air Roll Landing', level: 'Beginner',
    limit: 5, air: true,
    blurb: 'Land on your wheels from any angle so you keep your speed.',
    steps: ['You start upside down in the air.', 'Hold Air Roll (X / L2 / C) and steer the stick to roll level.', 'Pitch the nose level with the ground.', 'Land on all four wheels.'],
    setup(ctx) {
      ctx.car.place(0, -2500, Math.PI / 2, 700);
      ctx.car.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(ctx.car.fwd.clone(), 2.6));
      ctx.car.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 0.5));
      ctx.car.updateBasis();
      ctx.car.vel.set(0, 600, 300);
      ctx.car.hasJumped = true; ctx.car.hasDoubleJumped = true;
      ctx.ball.reset(0, 2000);
    },
    *demo(ctx) {
      ctx.step(1);
      yield* until(ctx, () => onGround(ctx), 4, () => { clearControls(ctx); recoverLanding(ctx); if (ctx.car.up.z < 0.8) ctx.step(1); else ctx.step(2); });
      ctx.step(3);
      yield* wait(ctx, 0.6, () => { clearControls(ctx); ctx.car.controls.throttle = 1; });
    },
    success(ctx) { return ctx.landedClean ? 'Clean landing!' : null; },
  },
  {
    id: 'wavedash', title: 'Wavedash', level: 'Beginner',
    limit: 5,
    blurb: 'Dodge just as you land to gain a burst of speed without boost.',
    steps: ['Tap jump for a small hop.', 'Tilt the nose up a little (pull back) while falling.', 'Right before your wheels touch, dodge forward (stick forward + jump).', 'The landing cancels the flip and keeps the extra speed.'],
    setup(ctx) {
      ctx.car.place(0, -3500, Math.PI / 2);
      ctx.car.vel.set(0, 1000, 0);
      ctx.car.boost = 0;
      ctx.ball.reset(0, 2500);
      ctx.data.startSpeed = 1000;
    },
    *demo(ctx) {
      const c = ctx.car, C = c.controls;
      yield* wait(ctx, 0.3, () => { clearControls(ctx); C.throttle = 1; });
      ctx.step(0);
      yield* wait(ctx, 0.06, () => { clearControls(ctx); C.throttle = 1; C.jump = true; });
      ctx.step(1);
      yield* until(ctx, () => c.vel.z < 0 && c.pos.z < 32, 1.2, () => { clearControls(ctx); C.throttle = 1; C.pitch = c.fwd.z < 0.14 ? 0.3 : 0; });
      ctx.step(2);
      yield* wait(ctx, 0.04, () => { clearControls(ctx); C.throttle = 1; C.jump = true; C.pitch = -1; });
      ctx.step(3);
      yield* wait(ctx, 0.8, () => { clearControls(ctx); C.throttle = 1; C.pitch = -1; });
    },
    success(ctx) {
      const c = ctx.car;
      if (ctx.data.dashed && onGround(ctx) && Math.hypot(c.vel.x, c.vel.y) > ctx.data.preDash + 300) return 'Wavedash! +' + Math.round(Math.hypot(c.vel.x, c.vel.y) - ctx.data.preDash) + ' uu/s';
      return null;
    },
  },
  {
    id: 'halfflip', title: 'Half Flip', level: 'Intermediate',
    limit: 5,
    blurb: 'Turn around in under a second: backflip, cancel, air roll upright.',
    steps: ['Reverse toward where you want to go.', 'Jump, then backflip (stick back + jump).', 'Right away push the stick forward to cancel the flip.', 'Air roll to land upright, then drive off.'],
    setup(ctx) {
      ctx.car.place(0, -2000, -Math.PI / 2);
      ctx.car.boost = 0;
      ctx.ball.reset(0, 1500);
    },
    *demo(ctx) {
      const c = ctx.car, C = c.controls;
      ctx.step(0);
      yield* wait(ctx, 0.45, () => { clearControls(ctx); C.throttle = -1; });
      ctx.step(1);
      yield* wait(ctx, 0.07, () => { clearControls(ctx); C.throttle = -1; C.jump = true; });
      yield* wait(ctx, 0.05, () => { clearControls(ctx); C.throttle = -1; });
      yield* wait(ctx, 0.04, () => { clearControls(ctx); C.throttle = -1; C.jump = true; C.pitch = 1; });
      // let the backflip carry the car over the top until it faces the other way upside down
      yield* until(ctx, () => c.fwd.y > 0.55, 0.8, () => { clearControls(ctx); C.throttle = -1; });
      ctx.step(2);
      // cancel (stick forward) and air roll back onto the wheels
      yield* until(ctx, () => onGround(ctx), 1.6, () => {
        clearControls(ctx); C.throttle = 1;
        C.pitch = -1;
        if (c.up.z < 0.9) { ctx.step(3); C.roll = c.left.z > 0 ? -1 : 1; }
      });
      ctx.step(3);
      yield* wait(ctx, 0.8, () => { clearControls(ctx); C.throttle = 1; });
    },
    success(ctx) {
      const c = ctx.car;
      if (ctx.t < 2.2 && onGround(ctx) && c.fwd.y > 0.85 && c.vel.y > 500 && c.up.z > 0.9) return 'Half flip in ' + ctx.t.toFixed(2) + 's';
      return null;
    },
  },
  {
    id: 'speedflip', title: 'Speed Flip', level: 'Intermediate',
    limit: 5,
    blurb: 'The fastest kickoff: diagonal dodge, cancel it, air roll flat.',
    steps: ['Hold boost and throttle from a standstill.', 'Jump, then dodge diagonally forward-left (stick up-left).', 'Immediately hold the stick back to cancel the flip...', '...and air roll right to stay flat. Land at supersonic.'],
    setup(ctx) {
      ctx.car.place(0, -4000, Math.PI / 2);
      ctx.car.infiniteBoost = true;
      ctx.ball.reset(0, 0);
    },
    *demo(ctx) {
      const c = ctx.car, C = c.controls;
      ctx.step(0);
      yield* wait(ctx, 0.45, () => { clearControls(ctx); C.throttle = 1; C.boost = true; });
      ctx.step(1);
      yield* wait(ctx, 0.05, () => { clearControls(ctx); C.throttle = 1; C.boost = true; C.jump = true; });
      yield* wait(ctx, 0.05, () => { clearControls(ctx); C.throttle = 1; C.boost = true; });
      yield* wait(ctx, 0.05, () => { clearControls(ctx); C.throttle = 1; C.boost = true; C.jump = true; C.pitch = -1; C.yaw = -1; });
      ctx.step(2);
      yield* wait(ctx, 0.15, () => { clearControls(ctx); C.throttle = 1; C.boost = true; C.pitch = 1; C.roll = 1; });
      ctx.step(3);
      yield* until(ctx, () => onGround(ctx), 1, () => { clearControls(ctx); C.throttle = 1; C.boost = true; C.pitch = 1; C.roll = clamp(-c.left.z * 4, -1, 1); });
      yield* wait(ctx, 0.6, () => { clearControls(ctx); C.throttle = 1; C.boost = true; });
    },
    success(ctx) {
      const c = ctx.car;
      if (c.speed >= PHYS.SUPERSONIC && ctx.t < 1.6 && c.up.z > 0.8) return 'Supersonic in ' + ctx.t.toFixed(2) + 's';
      return null;
    },
    fail(ctx) { return ctx.t > 1.6 ? 'Too slow — aim for supersonic before 1.6 s' : null; },
  },
  {
    id: 'flick', title: 'Hood Dribble & 45° Flick', level: 'Intermediate',
    limit: 7,
    blurb: 'Carry the ball on your roof, then flick it with a diagonal dodge.',
    steps: ['Ball is on your roof: ease the throttle to keep it centered.', 'Speed up a little to move it forward on the roof, slow down to bring it back.', 'Hold jump (~0.2 s) so the car rises with the ball...', '...then dodge forward / diagonally (stick up-right + jump) to flick it.'],
    setup(ctx) {
      ctx.car.place(-600, -3600, Math.PI / 2);
      ctx.car.vel.set(0, 650, 0);
      placeBallOnRoof(ctx);
    },
    *demo(ctx) {
      const c = ctx.car, C = c.controls;
      ctx.step(0);
      yield* wait(ctx, 1.0, () => balanceDribble(ctx, 850, tv(ctx, 'bt', 8)));
      ctx.step(1);
      yield* wait(ctx, 0.8, () => balanceDribble(ctx, 950, tv(ctx, 'bt', 8)));
      ctx.step(2);
      yield* wait(ctx, tv(ctx, 'jh', 0.2), () => { clearControls(ctx); C.jump = true; });
      yield* wait(ctx, 0.008, () => { clearControls(ctx); });
      ctx.step(3);
      yield* wait(ctx, 0.05, () => { clearControls(ctx); C.jump = true; C.pitch = -1; C.yaw = 0.5; });
      yield* wait(ctx, 0.5, () => { clearControls(ctx); });
      yield* wait(ctx, 1.0, () => { clearControls(ctx); recoverLanding(ctx); });
    },
    knobs: { bt: [8, 0, 16, -6, 24], jh: [0.2, 0.15, 0.25] },
    success(ctx) {
      const b = ctx.ball;
      if (ctx.flips > 0 && b.vel.length() > 1150 && b.vel.y > 700) return 'Flick! ' + Math.round(b.vel.length() * 0.036) + ' km/h';
      return null;
    },
    fail(ctx) { return ctx.t > 5 && ctx.ball.pos.z < 100 && ctx.flips === 0 ? 'The ball fell off — keep it centered over the roof' : null; },
  },
  {
    id: 'musty', title: 'Musty Flick', level: 'Advanced',
    limit: 7,
    blurb: 'Pop the ball off your hood with a backflip so the nose whips it forward.',
    steps: ['Dribble the ball on your roof.', 'Jump while pulling the stick back so the nose starts to lift.', 'Almost straight away, backflip (stick back + jump).', 'The nose swings up through the ball and launches it forward.'],
    setup(ctx) {
      ctx.car.place(600, -3600, Math.PI / 2);
      ctx.car.vel.set(0, 650, 0);
      placeBallOnRoof(ctx);
    },
    *demo(ctx) {
      const c = ctx.car, C = c.controls;
      ctx.step(0);
      yield* wait(ctx, 1.4, () => balanceDribble(ctx, 900, tv(ctx, 'bt', 8)));
      ctx.step(1);
      yield* wait(ctx, tv(ctx, 'jh', 0.1), () => { clearControls(ctx); C.jump = true; });
      yield* wait(ctx, 0.033, () => { clearControls(ctx); C.pitch = 1; });
      ctx.step(2);
      yield* wait(ctx, 0.05, () => { clearControls(ctx); C.jump = true; C.pitch = 1; });
      ctx.step(3);
      yield* wait(ctx, 1.4, () => { clearControls(ctx); if (ctx.t > 1.9) recoverLanding(ctx); else C.pitch = 1; });
    },
    knobs: { bt: [8, 0, 16, -6, 24], jh: [0.1, 0.07, 0.13, 0.16] },
    success(ctx) {
      const b = ctx.ball;
      if (ctx.flips > 0 && b.vel.length() > 1300 && b.vel.y > 1000) return 'Musty! ' + Math.round(b.vel.length() * 0.036) + ' km/h';
      return null;
    },
  },
  {
    id: 'airdribble', title: 'Air Dribble', level: 'Advanced',
    limit: 10, air: true,
    blurb: 'Pop the ball off your roof and carry it through the air on your nose.',
    steps: ['Dribble the ball on your roof.', 'Hold jump to pop the ball up, then double jump.', 'Point the nose at the bottom of the ball and feather boost.', 'Keep it on the nose and steer it toward the goal.'],
    setup(ctx) {
      ctx.car.place(0, -3000, Math.PI / 2);
      ctx.car.vel.set(0, 600, 0);
      ctx.car.infiniteBoost = true;
      placeBallOnRoof(ctx);
    },
    *demo(ctx) {
      const c = ctx.car, C = c.controls;
      ctx.step(0);
      yield* wait(ctx, 0.8, () => balanceDribble(ctx, 700));
      ctx.step(1);
      yield* jumpOff(ctx, 0.2, true);
      ctx.step(2);
      yield* until(ctx, () => ctx.ball.pos.y > ARENA.L || (onGround(ctx) && ctx.t > 2), 7, () => {
        clearControls(ctx);
        if (ctx.airTouches > 1) ctx.step(3);
        airDribble(ctx, ARENA.L);
      });
    },
    success(ctx) {
      if (ctx.ball.pos.y > ARENA.L + ctx.ball.radius && ctx.airTouches >= 3) return 'Air dribble goal! (' + ctx.airTouches + ' touches)';
      if (ctx.airTouches >= 8) return ctx.airTouches + ' air touches — air dribble!';
      return null;
    },
  },
  {
    id: 'walldribble', title: 'Wall Air Dribble', level: 'Advanced',
    limit: 10, air: true,
    blurb: 'Push the ball up the side wall, jump off with it on your nose and carry it to goal.',
    steps: ['Follow the ball as it rolls up the side wall.', 'Stay right under it and push it up the wall with your nose.', 'Jump off the wall (and double jump) with the ball on the nose.', 'Feather boost to keep it on the nose and fly it at the goal.'],
    setup(ctx) {
      ctx.car.place(2300, -2700, 0.15);
      ctx.car.vel.set(tv(ctx, 'cv', 950), 140, 0);
      ctx.car.infiniteBoost = true;
      ctx.ball.reset(2850, -2620, 93);
      ctx.ball.vel.set(tv(ctx, 'bv', 1250), 220, 0);
    },
    *demo(ctx) {
      const c = ctx.car, C = c.controls, b = ctx.ball;
      ctx.step(0);
      // follow it up the wall and nudge it with the nose so it comes off the wall
      const offWall = () => ARENA.W - Math.abs(b.pos.x) - b.radius;
      yield* until(ctx, () => c.up.x < -0.8 && c.pos.distanceTo(b.pos) < 300 && (offWall() > 45 || b.vel.z < 450), 4, () => {
        clearControls(ctx);
        const tgt = b.pos.clone(); tgt.z -= tv(ctx, 'wz', 30);
        ctx.bot.driveTo(tgt, 1, false);
        C.boost = c.numArenaWheels >= 3 && c.up.z > 0.7 && c.pos.distanceTo(b.pos) > 260;
        if (c.up.x < -0.6) { ctx.step(1); C.throttle = c.pos.distanceTo(b.pos) > tv(ctx, 'wd', 230) ? 1 : 0.3; }
      });
      ctx.step(2);
      ctx.data.leftWall = true;
      yield* jumpOff(ctx, tv(ctx, 'jh', 0.1), true);
      ctx.step(3);
      yield* until(ctx, () => b.pos.y > ARENA.L || (onGround(ctx) && ctx.t > 3), 7, () => { clearControls(ctx); airDribble(ctx, ARENA.L); });
    },
    knobs: { wd: [230, 200, 260, 290], jh: [0.1, 0.05, 0.15, 0.2], cv: [950, 800, 1100, 1250], wz: [30, 0, 60], bv: [1250, 1100, 1400] },
    success(ctx) {
      if (ctx.ball.pos.y > ARENA.L + ctx.ball.radius && ctx.airTouches >= 2) return 'Wall air dribble goal! (' + ctx.airTouches + ' touches)';
      if (ctx.airTouches >= 5 && ctx.car.pos.z > 300) return ctx.airTouches + ' air touches off the wall!';
      return null;
    },
  },
  {
    id: 'flipreset', title: 'Flip Reset', level: 'Expert',
    limit: 7, air: true,
    blurb: 'Touch the ball with all four wheels in the air to get your flip back, then use it.',
    steps: ['Your jumps are already used — there is no flip left.', 'Boost straight at the ball at a steady, medium speed.', 'Just before you reach it, stop boosting and turn your wheels to face it — a soft four-wheel touch lights FLIP (RESET).', 'Point the nose at the ball and dodge into it.'],
    setup(ctx) {
      const c = ctx.car;
      c.place(0, -1650, Math.PI / 2, tv(ctx, 'cz', 400));
      c.vel.set(0, 600, 1400);
      c.hasJumped = true; c.hasDoubleJumped = true;
      c.infiniteBoost = true;
      ctx.ball.reset(0, -1000, 600);
      ctx.ball.vel.set(0, 200, 1250);
    },
    *demo(ctx) {
      const c = ctx.car;
      ctx.step(0);
      yield* wait(ctx, 0.3, () => { clearControls(ctx); });
      ctx.step(1);
      yield* getReset(ctx, 3.5);
      ctx.step(2);
      yield* wait(ctx, 0.25, () => { clearControls(ctx); aim(ctx, ctx.ball.pos.clone().sub(c.pos), V3(0, 0, 1)); });
      ctx.step(3);
      yield* flipInto(ctx, 2);
      yield* wait(ctx, 1.5, () => { clearControls(ctx); recoverLanding(ctx); });
    },
    knobs: { lf: [0.8, 0.4, 0.5, 0.6, 0.35], va: [60, 100, 200], limp: [1, 0], cz: [400, 380, 420] },
    success(ctx) { return ctx.resets >= 1 && ctx.data.resetHit ? 'Flip reset + flip hit!' : null; },
  },
  {
    id: 'dribblereset', title: 'Air Dribble → Flip Reset', level: 'Expert',
    limit: 12, air: true,
    blurb: 'Keep the ball up with air dribble touches, then set your wheels on it for a reset and flip it.',
    steps: ['Dribble, pop the ball and double jump after it.', 'Keep it up with soft nose touches so it never drops.', 'With the ball on your nose, pull back so your wheels roll under it — soft four-wheel touch = reset.', 'Reset lit — point at the ball and dodge it toward goal.'],
    setup(ctx) { lessonById('airdribble').setup(ctx); },
    *demo(ctx) {
      const c = ctx.car, b = ctx.ball;
      ctx.step(0);
      yield* wait(ctx, 0.8, () => balanceDribble(ctx, 700));
      yield* jumpOff(ctx, 0.2, true);
      ctx.step(1);
      yield* until(ctx, () => ctx.airTouches >= tv(ctx, 'at', 3) && b.pos.z > tv(ctx, 'az', 700), 4, () => { clearControls(ctx); airDribble(ctx, ARENA.L); });
      // the ball is resting on the nose: pull back so the wheels roll under it
      ctx.step(2);
      yield* rollUnder(ctx, 1.2);
      if (!ctx.resets) yield* getReset(ctx, 2, { closeV: 400 });
      ctx.step(3);
      yield* wait(ctx, 0.2, () => { clearControls(ctx); aim(ctx, b.pos.clone().sub(c.pos), V3(0, 0, 1)); });
      yield* flipInto(ctx, 2);
      yield* wait(ctx, 1.5, () => { clearControls(ctx); recoverLanding(ctx); });
    },
    knobs: { lf: [0.8, 0.4, 0.5, 0.6, 0.35], va: [60, 100, 200], limp: [1, 0], at: [3, 2, 4, 5], az: [700, 900] },
    success(ctx) { return ctx.airTouches >= 2 && ctx.resets >= 1 && ctx.data.resetHit ? 'Air dribble into a flip reset!' : null; },
  },
  {
    id: 'doublereset', title: 'Double Flip Reset', level: 'Expert',
    limit: 9, air: true,
    blurb: 'Two resets in one aerial, then finish with the flip.',
    steps: ['Your jumps are used — fly at the ball.', 'Turn your wheels into it for the first reset.', 'Stall to spend it without leaving the ball: air roll left + steer right + jump.', 'Get your wheels on it again for reset #2, then dodge into the ball.'],
    setup(ctx) {
      const c = ctx.car;
      c.place(0, -1650, Math.PI / 2, tv(ctx, 'cz', 400));
      c.vel.set(0, 600, 1400);
      c.hasJumped = true; c.hasDoubleJumped = true;
      c.infiniteBoost = true;
      ctx.ball.reset(0, -1000, 600);
      ctx.ball.vel.set(0, 200, 1250);
    },
    *demo(ctx) {
      const c = ctx.car;
      ctx.step(0);
      yield* wait(ctx, 0.3, () => { clearControls(ctx); });
      ctx.step(1);
      yield* getReset(ctx, 3.5);
      // spend the reset's jump to pop off the ball, then come back down onto it
      ctx.step(2);
      // stall: air roll left + yaw right + jump spends the reset without leaving the ball
      yield* until(ctx, () => !ctx.car.onGround, 0.4, () => { clearControls(ctx); });
      yield* wait(ctx, tv(ctx, 'sw', 0.02), () => { clearControls(ctx); });
      yield* wait(ctx, 1 / 120, () => { clearControls(ctx); Object.assign(ctx.car.controls, { jump: true, yaw: 1, roll: -1 }); });
      yield* wait(ctx, 0.05, () => { clearControls(ctx); });
      yield* getReset(ctx, 3, { closeV: tv(ctx, 'cv2', 520) });
      ctx.step(3);
      // wheels are on the ball: a front flip right away swings the nose down through it
      yield* until(ctx, () => !ctx.car.onGround, 0.4, () => { clearControls(ctx); });
      yield* wait(ctx, tv(ctx, 'fw2', 0.06), () => { clearControls(ctx); });
      yield* flipToward(ctx);
      yield* wait(ctx, 0.5, () => { clearControls(ctx); });
      yield* wait(ctx, 1.5, () => { clearControls(ctx); recoverLanding(ctx); });
    },
    knobs: { lf: [0.8, 0.5, 0.4], limp: [1, 0], cv2: [520, 400, 650], fw2: [0.06, 0.02, 0.12], sw: [0.02, 0.08], cz: [400, 380, 420] },
    success(ctx) { return ctx.data.airResets >= 2 && ctx.data.resetHit ? 'Double reset!' : null; },
  },
];

function lessonById(id) { return TUTORIALS.find(l => l.id === id); }

// ------------------------------------------------------------- demo planner
// Physics is deterministic, so before a demo plays we dry-run it on a scratch world with
// the player's car body and pick the first knob setting that lands the move. The real
// demo then replays exactly that run.
const _demoPlans = {};
// precomputed by tools/plan-demos.js (a dry run still verifies them at runtime)
// DEMO_PLANS_BEGIN
const DEMO_PLANS = {"flick":{"octane":{"bt":8,"jh":0.2},"dominus":{"bt":16,"jh":0.2},"plank":{"bt":16,"jh":0.2},"breakout":{"bt":8,"jh":0.2},"hybrid":{"bt":8,"jh":0.2},"merc":{"bt":8,"jh":0.2}},"musty":{"octane":{"bt":8,"jh":0.1},"dominus":{"bt":16,"jh":0.1},"plank":{"bt":24,"jh":0.1},"breakout":{"bt":24,"jh":0.1},"hybrid":{"bt":16,"jh":0.1},"merc":{"bt":8,"jh":0.1}},"walldribble":{"octane":{"wd":230,"jh":0.1,"cv":950,"wz":30,"bv":1250},"dominus":{"wd":200,"jh":0.1,"cv":950,"wz":30,"bv":1250},"plank":{"wd":200,"jh":0.05,"cv":950,"wz":30,"bv":1250},"merc":{"wd":260,"jh":0.2,"cv":800,"wz":0,"bv":1250}},"flipreset":{"octane":{"lf":0.8,"va":60,"limp":1,"cz":400},"dominus":{"lf":0.8,"va":60,"limp":1,"cz":400},"plank":{"lf":0.8,"va":60,"limp":1,"cz":400},"breakout":{"lf":0.8,"va":60,"limp":1,"cz":400},"hybrid":{"lf":0.8,"va":60,"limp":1,"cz":400},"merc":{"lf":0.8,"va":60,"limp":1,"cz":400}},"dribblereset":{"octane":{"lf":0.8,"va":60,"limp":1,"at":3,"az":700},"dominus":{"lf":0.8,"va":60,"limp":1,"at":3,"az":700},"plank":{"lf":0.8,"va":60,"limp":1,"at":3,"az":700},"breakout":{"lf":0.8,"va":60,"limp":1,"at":3,"az":700},"hybrid":{"lf":0.8,"va":60,"limp":0,"at":3,"az":700},"merc":{"lf":0.8,"va":60,"limp":1,"at":2,"az":700}},"doublereset":{"octane":{"lf":0.5,"limp":0,"cv2":520,"fw2":0.06,"sw":0.02,"cz":400},"dominus":{"lf":0.4,"limp":0,"cv2":400,"fw2":0.06,"sw":0.02,"cz":400},"plank":{"lf":0.5,"limp":1,"cv2":520,"fw2":0.06,"sw":0.02,"cz":400},"breakout":{"lf":0.8,"limp":1,"cv2":520,"fw2":0.06,"sw":0.02,"cz":380},"hybrid":{"lf":0.8,"limp":1,"cv2":520,"fw2":0.06,"sw":0.02,"cz":400},"merc":{"lf":0.4,"limp":0,"cv2":520,"fw2":0.06,"sw":0.02,"cz":400}}};
// DEMO_PLANS_END
function dryRunDemo(lesson, car, tune) {
  const w = new World();
  const c = w.addCar(new Car({ body: car.body, team: car.team }));
  c.dodgeDeadzone = car.dodgeDeadzone;
  const run = new TutorialRun(w, c, lesson);
  run.start('demo', tune);
  for (let i = 0; i < 120 * 14 && !run.result && !run.finished; i++) {
    run.pre(PHYS.TICK);
    w.step(PHYS.TICK);
    run.post(PHYS.TICK, w.events, c.events);
    w.events.length = 0; c.events.length = 0;
  }
  return !!(run.result && run.result.ok);
}
function planDemo(lesson, car) {
  const key = lesson.id + ':' + car.body + ':' + car.dodgeDeadzone;
  if (key in _demoPlans) return _demoPlans[key];
  let combos = [{}];
  for (const [k, vals] of Object.entries(lesson.knobs || {})) {
    const next = [];
    for (const v of vals) for (const cmb of combos) next.push({ ...cmb, [k]: v });
    combos = next;
  }
  let pick = combos[0];
  const known = (DEMO_PLANS[lesson.id] || {})[car.body];
  if (known) combos.unshift(known);
  const t0 = Date.now();
  for (const tune of combos) {
    if (dryRunDemo(lesson, car, tune)) { pick = tune; break; }
    if (Date.now() - t0 > 1500) break; // never stall the game for long
  }
  return (_demoPlans[key] = pick);
}

// ------------------------------------------------------------- runner
class TutorialRun {
  constructor(world, car, lesson) {
    this.w = world; this.car = car; this.lesson = lesson;
    this.bot = new Bot(car, 'allstar');
    this.mode = 'demo';
    this.result = null;
  }
  start(mode, tune) {
    this.mode = mode;
    const w = this.w;
    w.ballFrozen = false;
    for (const p of w.pads) { p.active = true; p.timer = 0; }
    const ctx = this.ctx = {
      w, car: this.car, ball: w.ball, bot: this.bot, t: 0, data: {}, stepIdx: 0,
      tune: tune !== undefined ? tune : planDemo(this.lesson, this.car),
      touches: 0, airTouches: 0, resets: 0, flips: 0, landedClean: false,
      step: (i) => { ctx.stepIdx = i; },
    };
    this.car.infiniteBoost = false;
    this.car.boost = 100;
    this.lesson.setup(ctx);
    this.car.prevPos.copy(this.car.pos); this.car.prevQuat.copy(this.car.quat);
    this.script = mode === 'demo' ? this.lesson.demo(ctx) : null;
    this.result = null; this.finished = false;
    this.wasAir = airborne(ctx); this.airT = 0;
  }
  // before physics: run the demo script (it owns the controls in demo mode)
  pre(dt) {
    const ctx = this.ctx;
    if (this.script) {
      const r = this.script.next();
      if (r.done) { this.script = null; clearControls(ctx); this.finished = true; }
    }
  }
  // after physics: bookkeeping + success detection. events / carEvents are this tick's only.
  post(dt, events, carEvents) {
    const ctx = this.ctx, c = this.car;
    ctx.t += dt;
    for (const e of events) {
      if (e.type === 'hit' && e.car === c) { ctx.touches++; if (airborne(ctx)) ctx.airTouches++; }
    }
    if (!airborne(ctx) && onGround(ctx)) ctx.data.airResets = 0;
    for (const e of events) if (e.type === 'hit' && e.car === c && c.isFlipping && ctx.resets > 0) ctx.data.resetHit = true;
    for (const ev of carEvents || c.events) {
      if (ev === 'flipreset') { ctx.resets++; ctx.data.airResets = (ctx.data.airResets || 0) + 1; }
      if (ev === 'flip') {
        ctx.flips++;
        // a dodge started right above the ground is a wavedash attempt
        if (c.pos.z < 45 && !ctx.data.dashed) { ctx.data.dashed = true; ctx.data.preDash = ctx.data.lastSpeed; }
      }
    }
    ctx.data.lastSpeed = Math.hypot(c.vel.x, c.vel.y);
    const air = airborne(ctx);
    if (air) this.airT += dt;
    if (this.wasAir && !air && c.numArenaWheels >= 3) ctx.landedClean = !c.worldContact && c.up.z > 0.85 && this.airT > 0.4;
    this.wasAir = air;
    if (!this.result) {
      const s = this.lesson.success(ctx);
      if (s) this.result = { ok: true, text: s };
      else if (this.lesson.fail) { const f = this.lesson.fail(ctx); if (f) this.result = { ok: false, text: f }; }
    }
  }
}

if (typeof module !== 'undefined') module.exports = { TUTORIALS, TutorialRun, lessonById };
