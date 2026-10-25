// Core constants + small helpers. Units are Unreal units (uu) and seconds, z is up.
// Values follow the publicly documented / community-measured Soccar physics.
'use strict';

const PHYS = {
  TICK: 1 / 120,
  GRAVITY: -650,

  BALL_R: 91.25,
  BALL_MASS: 30,
  BALL_MAX_SPEED: 6000,
  BALL_MAX_ANG: 6,
  BALL_DRAG: -0.0305,
  BALL_REST: 0.6,
  BALL_MU: 2.0,
  BALL_SPIN_A: 0.0003,

  CAR_MASS: 180,
  CAR_MAX_SPEED: 2300,
  CAR_MAX_ANG: 5.5,
  SUPERSONIC: 2200,
  SUPERSONIC_MAINTAIN: 2100,

  BOOST_ACCEL_GROUND: 2975 / 3,
  BOOST_ACCEL_AIR: 3175 / 3,
  BOOST_USE: 100 / 3,
  BOOST_MIN_TIME: 0.1,
  BOOST_SPAWN: 100 / 3,

  THROTTLE_AIR: 200 / 3,
  BRAKE: 3500,
  COAST: 525,

  JUMP_IMPULSE: 875 / 3,
  JUMP_ACCEL: 4375 / 3,
  JUMP_MAX_TIME: 0.2,
  JUMP_MIN_TIME: 0.025,
  DOUBLE_JUMP_WINDOW: 1.25,

  FLIP_TIME: 0.65,
  FLIP_IMPULSE: 500,
  FLIP_Z_DAMP_START: 0.15,
  FLIP_Z_DAMP_END: 0.21,
  FLIP_Z_DAMP_120: 0.35,
  FLIP_BACK_SCALE: 2.5,
  FLIP_SIDE_SCALE: 1.9,
  FLIP_BACK_X: 16 / 15,
  DODGE_DEADZONE: 0.5,

  // Air control: angular acceleration (rad/s^2) per full input, damping per rad/s
  T_ROLL: 36.07956616966136,
  T_PITCH: 12.14599781908070,
  T_YAW: 8.91962804287785,
  D_ROLL: -4.47166302201591,
  D_PITCH: -2.798194258050845,
  D_YAW: -1.886491900437232,

  // Suspension (per wheel, expressed as acceleration per uu of compression)
  SUSP_K: 150,
  SUSP_DAMP_COMP: 8,
  SUSP_DAMP_RELAX: 5,
  SUSP_LEN: 34,

  AUTOFLIP_IMPULSE: 200,
  AUTOFLIP_TIME: 0.4,

  DEMO_RESPAWN: 3,
  STICKY: 0.5,
  // feel tuning (see README): soft touches ramp the extra impulse in, ball spins less off car contacts
  PSY_CURVE: [[0, 0], [300, 0.12], [900, 0.65], [2300, 0.55], [4600, 0.30]],
  CARBALL_SPIN_INERTIA: 4,
};

const THROTTLE_CURVE = [[0, 1600], [1400, 160], [1410, 0], [2300, 0]];
const STEER_CURVATURE = [[0, 0.0069], [500, 0.00398], [1000, 0.00235], [1500, 0.001375], [1750, 0.0011], [2300, 0.00088]];
const PSYONIX_SCALE = [[0, 0.65], [500, 0.65], [2300, 0.55], [4600, 0.30]];
const BUMP_VEL = [[0, 5 / 6], [1400, 1100], [2200, 1530]];
const BUMP_UP = [[0, 2 / 6], [1400, 278], [2200, 417]];

// Hitboxes: length, width, height, offset x, offset z (relative to car origin)
const HITBOXES = {
  octane:   { name: 'Octane',   l: 118.01, w: 84.20, h: 36.16, ox: 13.88, oz: 20.75 },
  dominus:  { name: 'Dominus',  l: 127.93, w: 83.28, h: 31.30, ox: 9.00,  oz: 15.75 },
  plank:    { name: 'Plank',    l: 128.82, w: 84.67, h: 29.39, ox: 9.01,  oz: 12.09 },
  breakout: { name: 'Breakout', l: 131.49, w: 80.52, h: 30.30, ox: 12.50, oz: 11.75 },
  hybrid:   { name: 'Hybrid',   l: 127.02, w: 82.19, h: 34.16, ox: 13.88, oz: 20.75 },
  merc:     { name: 'Merc',     l: 120.72, w: 76.71, h: 41.66, ox: 11.38, oz: 21.50 },
};

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
function curve(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const a = table[i - 1], b = table[i];
      return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
  }
  return table[table.length - 1][1];
}

// Deterministic PRNG for training packs
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function safeStore(key, val) {
  try {
    if (val === undefined) { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { return null; }
  return null;
}
