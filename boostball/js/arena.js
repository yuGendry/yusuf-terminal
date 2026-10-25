// Soccar arena: 8192 x 10240 uu floor, goals 1786 x 642.775 x 880. The ceiling defaults to
// 2800 uu (taller than the real 2044, which is available as the 'Rocket League' mutator).
// Collision is analytic: a 2D rounded octagon (walls + 45deg corners) extruded
// vertically with curved floor->wall and wall->ceiling transitions, plus goal boxes.
'use strict';

const ARENA = {
  W: 4096,          // half width (x)
  L: 5120,          // half length (y) - back wall / goal line
  H: 2800,          // ceiling (changed by the Ceiling Height mutator)
  C: 8064,          // corner planes: |x| + |y| = C
  RV: 450,          // vertical rounding where walls meet corner planes
  RF: 440,          // floor -> wall ramp radius
  RC: 400,          // wall -> ceiling radius
  GW: 893,          // goal half width
  GH: 642.775,      // goal height
  GD: 880,          // goal depth
  SCALE: 1,
};

const ARENA_DEFAULT_H = 2800;
const SQRT2 = Math.SQRT2;

function arenaDerived() {
  const A = ARENA;
  A.Wp = A.W - A.RV;
  A.Lp = A.L - A.RV;
  A.Cp = A.C - A.RV * SQRT2;
  A.v1x = A.Wp; A.v1y = A.Cp - A.Wp;
  A.v2x = A.Cp - A.Lp; A.v2y = A.Lp;
}
arenaDerived();

// closest point on segment helper -> writes into tmp2
const _cp = { x: 0, y: 0, d2: 0 };
function segClosest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  _cp.x = ax + dx * t; _cp.y = ay + dy * t;
  const ex = px - _cp.x, ey = py - _cp.y;
  _cp.d2 = ex * ex + ey * ey;
}

// 2D: inward distance u from rounded octagon boundary (positive inside) + outward normal (folded quadrant)
const _s2 = { u: 0, nx: 0, ny: 0 };
function arenaSd2(ax, ay) {
  const A = ARENA;
  const p1 = A.Wp - ax, p2 = A.Lp - ay, p3 = (A.Cp - ax - ay) / SQRT2;
  if (p1 >= 0 && p2 >= 0 && p3 >= 0) {
    if (p1 <= p2 && p1 <= p3) { _s2.u = p1 + A.RV; _s2.nx = 1; _s2.ny = 0; }
    else if (p2 <= p3) { _s2.u = p2 + A.RV; _s2.nx = 0; _s2.ny = 1; }
    else { _s2.u = p3 + A.RV; _s2.nx = 1 / SQRT2; _s2.ny = 1 / SQRT2; }
    return _s2;
  }
  let best = Infinity, bx = 0, by = 0;
  segClosest(ax, ay, A.Wp, 0, A.v1x, A.v1y);
  if (_cp.d2 < best) { best = _cp.d2; bx = _cp.x; by = _cp.y; }
  segClosest(ax, ay, A.v1x, A.v1y, A.v2x, A.v2y);
  if (_cp.d2 < best) { best = _cp.d2; bx = _cp.x; by = _cp.y; }
  segClosest(ax, ay, A.v2x, A.v2y, 0, A.Lp);
  if (_cp.d2 < best) { best = _cp.d2; bx = _cp.x; by = _cp.y; }
  const d = Math.sqrt(best);
  _s2.u = A.RV - d;
  if (d > 1e-6) { _s2.nx = (ax - bx) / d; _s2.ny = (ay - by) / d; }
  else { _s2.nx = 1; _s2.ny = 0; }
  return _s2;
}

// 3D arena shell (no goals). Returns distance to surface (positive = free space) and inward normal.
const _as = { d: 0, nx: 0, ny: 0, nz: 0 };
function arenaShell(x, y, z) {
  const A = ARENA;
  const sx = x < 0 ? -1 : 1, sy = y < 0 ? -1 : 1;
  const s = arenaSd2(x * sx, y * sy);
  const Nx = s.nx * sx, Ny = s.ny * sy; // outward horizontal
  const u = s.u;
  if (u < A.RF && z < A.RF) {
    const cu = A.RF - u, cz = A.RF - z;
    const dist = Math.sqrt(cu * cu + cz * cz) || 1e-6;
    _as.d = A.RF - dist;
    _as.nx = -Nx * cu / dist; _as.ny = -Ny * cu / dist; _as.nz = cz / dist;
  } else if (u < A.RC && z > A.H - A.RC) {
    const cu = A.RC - u, cz = (A.H - A.RC) - z;
    const dist = Math.sqrt(cu * cu + cz * cz) || 1e-6;
    _as.d = A.RC - dist;
    _as.nx = -Nx * cu / dist; _as.ny = -Ny * cu / dist; _as.nz = cz / dist;
  } else {
    _as.d = u; _as.nx = -Nx; _as.ny = -Ny; _as.nz = 0;
    if (z < _as.d) { _as.d = z; _as.nx = 0; _as.ny = 0; _as.nz = 1; }
    if (A.H - z < _as.d) { _as.d = A.H - z; _as.nx = 0; _as.ny = 0; _as.nz = -1; }
  }
  return _as;
}

// Contact list pool
const CONTACT_POOL = [];
for (let i = 0; i < 16; i++) CONTACT_POOL.push({ d: 0, nx: 0, ny: 0, nz: 0 });
function pushContact(out, d, nx, ny, nz) {
  if (out.length >= CONTACT_POOL.length) return;
  const c = CONTACT_POOL[out.length];
  c.d = d; c.nx = nx; c.ny = ny; c.nz = nz;
  out.push(c);
}

// All surfaces within distance r of point p. Results valid until next call.
const _contacts = [];
function queryContacts(x, y, z, r) {
  const A = ARENA;
  const out = _contacts; out.length = 0;
  const ay = Math.abs(y), axx = Math.abs(x), sy = y < 0 ? -1 : 1;
  const insideGoalX = axx < A.GW;
  const inMouthProj = insideGoalX && z < A.GH;

  // Arena shell (skip entirely if center is inside the goal box)
  if (!(ay > A.L && inMouthProj)) {
    const s = arenaShell(x, y, z);
    if (s.d < r) {
      const spx = x - s.nx * s.d, spy = y - s.ny * s.d, spz = z - s.nz * s.d;
      const inMouth = Math.abs(spx) < A.GW && spz < A.GH && Math.abs(spy) > A.L - A.RF - 1;
      if (!inMouth) pushContact(out, s.d, s.nx, s.ny, s.nz);
    }
  }

  if (ay > A.L - A.RF - r - 2 && axx < A.GW + r + 2) {
    // goal floor (also fills the cut ramp in front of the mouth)
    if (insideGoalX && ay > A.L - A.RF - 1 && z < r) pushContact(out, z, 0, 0, 1);
    if (ay > A.L) {
      if (insideGoalX || axx < A.GW + r) {
        const ds = A.GW - axx;
        if (ds < r) pushContact(out, ds, -sign(x), 0, 0);
      }
      const dt = A.GH - z;
      if (dt < r && insideGoalX) pushContact(out, dt, 0, 0, -1);
      const db = A.L + A.GD - ay;
      if (db < r) pushContact(out, db, 0, -sy, 0);
      if (z < r && !insideGoalX) pushContact(out, z, 0, 0, 1);
    } else if (insideGoalX && z < A.GH) {
      // posts
      const xs = (x < 0 ? -1 : 1) * A.GW;
      const dx = x - xs, dy = y - sy * A.L;
      const dp = Math.sqrt(dx * dx + dy * dy);
      if (dp < r && dp > 1e-6) pushContact(out, dp, dx / dp, dy / dp, 0);
      // crossbar
      const dz = z - A.GH;
      const dc = Math.sqrt(dy * dy + dz * dz);
      if (dc < r && dc > 1e-6) pushContact(out, dc, 0, dy / dc, dz / dc);
    }
  }
  return out;
}

// Closest-surface distance along a ray (approximated by local tangent plane)
// Returns t or -1. Writes normal to _rayN.
const _rayN = { x: 0, y: 0, z: 0 };
function rayArena(px, py, pz, dx, dy, dz, maxT) {
  const cs = queryContacts(px, py, pz, maxT + 30);
  let best = -1;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const cosA = -(dx * c.nx + dy * c.ny + dz * c.nz);
    if (cosA < 0.25) continue;
    const t = c.d / cosA;
    if (t < -15 || t > maxT) continue;
    if (best < 0 || t < best) {
      best = t; _rayN.x = c.nx; _rayN.y = c.ny; _rayN.z = c.nz;
    }
  }
  return best < 0 ? -1 : Math.max(0, best);
}

// Boundary path for rendering: list of {x, y, nx, ny, s} (outward normals) CCW, closed
function arenaPath(step) {
  const A = ARENA;
  const q = [];
  const addLine = (x0, y0, x1, y1, nx, ny, splits) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / step));
    const ts = [];
    for (let i = 0; i <= n; i++) ts.push(i / n);
    if (splits) for (const sx of splits) {
      const t = (sx - x0) / (x1 - x0);
      if (t > 0 && t < 1) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    for (const t of ts) q.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny });
  };
  const addArc = (cx, cy, a0, a1, segs) => {
    for (let i = 1; i < segs; i++) {
      const a = a0 + (a1 - a0) * i / segs;
      q.push({ x: cx + Math.cos(a) * A.RV, y: cy + Math.sin(a) * A.RV, nx: Math.cos(a), ny: Math.sin(a) });
    }
  };
  const r2 = 1 / SQRT2;
  addLine(A.W, 0, A.W, A.v1y, 1, 0);
  addArc(A.v1x, A.v1y, 0, Math.PI / 4, 6);
  addLine(A.v1x + A.RV * r2, A.v1y + A.RV * r2, A.v2x + A.RV * r2, A.v2y + A.RV * r2, r2, r2);
  addArc(A.v2x, A.v2y, Math.PI / 4, Math.PI / 2, 6);
  addLine(A.v2x, A.L, 0, A.L, 0, 1, [A.GW, A.GW + 60, A.GW + 180]);
  // dedupe
  const q1 = [];
  for (const p of q) {
    const last = q1[q1.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) q1.push(p);
  }
  const full = [];
  const push = (p) => {
    const last = full[full.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) full.push(p);
  };
  for (const p of q1) push(p);
  for (const p of q1.slice().reverse()) push({ x: -p.x, y: p.y, nx: -p.nx, ny: p.ny });
  for (const p of q1) push({ x: -p.x, y: -p.y, nx: -p.nx, ny: -p.ny });
  for (const p of q1.slice().reverse()) push({ x: p.x, y: -p.y, nx: p.nx, ny: -p.ny });
  if (Math.hypot(full[0].x - full[full.length - 1].x, full[0].y - full[full.length - 1].y) < 0.5) full.pop();
  let s = 0;
  for (let i = 0; i < full.length; i++) {
    if (i > 0) s += Math.hypot(full[i].x - full[i - 1].x, full[i].y - full[i - 1].y);
    full[i].s = s;
  }
  return full;
}

// Standard Soccar boost pad layout
const BOOST_PADS = [
  [0, -4240, 0], [-1792, -4184, 0], [1792, -4184, 0], [-3072, -4096, 1], [3072, -4096, 1],
  [-940, -3308, 0], [940, -3308, 0], [0, -2816, 0], [-3584, -2484, 0], [3584, -2484, 0],
  [-1788, -2300, 0], [1788, -2300, 0], [-2048, -1036, 0], [0, -1024, 0], [2048, -1036, 0],
  [-3584, 0, 1], [-1024, 0, 0], [1024, 0, 0], [3584, 0, 1],
  [-2048, 1036, 0], [0, 1024, 0], [2048, 1036, 0], [-1788, 2300, 0], [1788, 2300, 0],
  [-3584, 2484, 0], [3584, 2484, 0], [0, 2816, 0], [-940, 3310, 0], [940, 3308, 0],
  [-3072, 4096, 1], [3072, 4096, 1], [-1792, 4184, 0], [1792, 4184, 0], [0, 4240, 0],
];

// Kickoff spawns for blue (team 0). Orange is mirrored.
const KICKOFF_SPAWNS = [
  { x: -2048, y: -2560, yaw: 0.25 * Math.PI },
  { x: 2048, y: -2560, yaw: 0.75 * Math.PI },
  { x: -256, y: -3840, yaw: 0.5 * Math.PI },
  { x: 256, y: -3840, yaw: 0.5 * Math.PI },
  { x: 0, y: -4608, yaw: 0.5 * Math.PI },
];
const RESPAWN_SPOTS = [
  { x: -2304, y: -4608, yaw: 0.5 * Math.PI },
  { x: -2688, y: -4608, yaw: 0.5 * Math.PI },
  { x: 2304, y: -4608, yaw: 0.5 * Math.PI },
  { x: 2688, y: -4608, yaw: 0.5 * Math.PI },
];
