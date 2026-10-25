// Stadium dressing built from the Kenney Racing Kit (CC0): two tiers of grandstands with an
// instanced crowd, floodlight towers, billboards, banner towers, TV cameras, tents and a tree
// line. Every prop is drawn as InstancedMeshes (one per mesh part and team tint), so the
// whole stadium costs a few dozen draw calls.
'use strict';

const STADIUM_TINT = [new THREE.Color(0x2f7bff), new THREE.Color(0xff7a1a), new THREE.Color(0x9aa3b8)];
const _yUp = new THREE.Matrix4().makeRotationX(Math.PI / 2); // glTF Y-up -> our Z-up

// placement: { x, y, z, yaw, s, tint } -> world matrix (prop origin, Z-up)
function propMatrix(p) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z || 0),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.yaw || 0),
    new THREE.Vector3(p.s, p.s, p.s));
}

function instanceProp(group, name, placements, opts = {}) {
  const src = ASSETS.props && ASSETS.props[name];
  if (!src || !placements.length) return;
  src.updateMatrixWorld(true);
  const byTint = new Map();
  for (const p of placements) {
    const k = p.tint === undefined ? -1 : p.tint;
    if (!byTint.has(k)) byTint.set(k, []);
    byTint.get(k).push(p);
  }
  src.traverse(o => {
    if (!o.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(_yUp, o.matrixWorld);
    for (const [tint, list] of byTint) {
      const mat = o.material.clone();
      const mname = o.material.name || '';
      if (tint >= 0 && /red|pylon/i.test(mname)) mat.color.copy(STADIUM_TINT[tint]);
      else if (!(opts.map && opts.map[mname])) mat.color.multiplyScalar(opts.dim || 0.55);
      if (opts.glow && opts.glow.test(mname)) { mat.emissive = new THREE.Color(0xfff6dd); mat.emissiveIntensity = 2.2; }
      if (opts.map && opts.map[mname]) { mat.map = opts.map[mname]; mat.emissiveMap = mat.map; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 0.85; mat.needsUpdate = true; }
      mat.envMapIntensity = 0.5;
      const im = new THREE.InstancedMesh(o.geometry, mat, list.length);
      list.forEach((p, i) => im.setMatrixAt(i, propMatrix(p).multiply(local)));
      im.castShadow = false; im.receiveShadow = false;
      im.frustumCulled = false;
      group.add(im);
    }
  });
}

// Tiles a stand along the line a->b with its front on the line, facing direction d (toward the pitch).
// After the Y-up conversion a stand tile spans local x 0..1 and runs from its front (y 0) to its back (y 1).
function standRow(out, a, b, d, S, z, tint) {
  const u = new THREE.Vector2(-d.y, d.x); // local x axis, so local +y (back) points away from the pitch
  const ab = new THREE.Vector2(b.x - a.x, b.y - a.y);
  const len = ab.dot(u);
  const n = Math.max(1, Math.floor(Math.abs(len) / S));
  const start = new THREE.Vector2(a.x, a.y);
  if (len < 0) start.set(b.x, b.y);
  const pad = (Math.abs(len) - n * S) / 2;
  const yaw = Math.atan2(u.y, u.x);
  for (let i = 0; i < n; i++) {
    const o = start.clone().addScaledVector(u, pad + i * S);
    out.push({ x: o.x, y: o.y, z, yaw, s: S, tint });
  }
}

// Seat heights of a stand prop (model space) found by ray casting, so the crowd sits on the steps
function seatSamples(name, cols, rows, fromY) {
  const src = ASSETS.props[name];
  const ray = new THREE.Raycaster();
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) / cols, z = -(r + 0.5) / rows;
      ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(src, true)[0];
      if (hit && hit.point.y > 0.05) pts.push(new THREE.Vector3(x, hit.point.y, z));
    }
  }
  return pts;
}

function crowdLayer(group, tiles, standName, quality) {
  const dense = quality === 'high' ? 1 : quality === 'low' ? 0.4 : 0.7;
  // both stand props share the same steps; the open one has no roof in the way of the rays
  const seats = seatSamples('grandStand', Math.round(22 * dense), 9, 2);
  if (!seats.length) return;
  const geo = new THREE.CapsuleGeometry(42, 80, 1, 5);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 82);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const count = tiles.length * seats.length;
  const im = new THREE.InstancedMesh(geo, mat, count);
  const shirt = [new THREE.Color(0x2f7bff), new THREE.Color(0xff7a1a), new THREE.Color(0xe8ecf4), new THREE.Color(0x2b2f3a), new THREE.Color(0xffd21f)];
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), col = new THREE.Color();
  let i = 0;
  const rnd = mulberry32(7);
  for (const t of tiles) {
    const world = propMatrix(t).multiply(_yUp);
    for (const s of seats) {
      pos.set(s.x + (rnd() - 0.5) * 0.02, s.y, s.z + (rnd() - 0.5) * 0.04).applyMatrix4(world);
      m.makeRotationZ(rnd() * 6.28);
      m.setPosition(pos);
      im.setMatrixAt(i, m);
      // fans wear their side's color, with a mix of neutrals
      const r = rnd();
      const team = t.tint >= 0 && t.tint < 2 ? t.tint : (rnd() < 0.5 ? 0 : 1);
      col.copy(r < 0.62 ? shirt[team] : shirt[2 + ((rnd() * 3) | 0)]).multiplyScalar(0.75 + rnd() * 0.35);
      im.setColorAt(i, col);
      i++;
    }
  }
  im.frustumCulled = false;
  im.userData.base = [];
  for (let k = 0; k < count; k++) { im.getMatrixAt(k, m); im.userData.base.push(m.elements[14]); }
  group.add(im);
  return im;
}

// The billboards are screens: one shared canvas showing the brand, or the live score and clock
const BOARD = { canvas: null, tex: null, key: '' };
function billboardTexture() {
  const c = BOARD.canvas = document.createElement('canvas');
  c.width = 512; c.height = 256;
  BOARD.tex = new THREE.CanvasTexture(c);
  BOARD.tex.encoding = THREE.sRGBEncoding;
  drawBoard(null);
  return BOARD.tex;
}
// state: null (brand) or { blue, orange, clock, flash: 'GOAL!' | null, team }
function drawBoard(state) {
  if (!BOARD.canvas) return;
  const key = JSON.stringify(state);
  if (key === BOARD.key) return;
  BOARD.key = key;
  const g = BOARD.canvas.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0, '#1e5cff'); grd.addColorStop(1, '#ff7a1a');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(8,12,26,0.6)'; g.fillRect(12, 40, 488, 176);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!state) {
    g.font = 'bold 76px sans-serif'; g.fillText('BOOSTBALL', 256, 128);
  } else if (state.flash) {
    g.fillStyle = state.team === 0 ? '#7fb2ff' : '#ffb27a';
    g.font = 'bold 110px sans-serif'; g.fillText(state.flash, 256, 128);
  } else {
    g.font = 'bold 96px sans-serif';
    g.fillStyle = '#9cc2ff'; g.fillText(String(state.blue), 96, 116);
    g.fillStyle = '#ffc08a'; g.fillText(String(state.orange), 416, 116);
    g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.fillText(state.clock, 256, 116);
    g.font = '28px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText('BLUE        ·        ORANGE', 256, 182);
  }
  BOARD.tex.needsUpdate = true;
}

// Returns { crowd: [InstancedMesh], cheer(t) } so the game can make the crowd jump on goals.
function dressStadium(group, quality) {
  const A = ARENA;
  const lower = [], upper = [];
  const S = 1000, S2 = 1150;
  const side = A.W + 260, end = A.L + A.GD + 220;
  const tSide = (y) => (y < -600 ? 0 : y > 600 ? 1 : 2);
  // long sides, split in thirds so each half of the pitch gets its team's colors
  for (const sx of [-1, 1]) {
    const d = new THREE.Vector2(-sx, 0);
    for (const [y0, y1] of [[-4200, -1500], [-1500, 1500], [1500, 4200]]) {
      standRow(lower, { x: sx * side, y: y0 }, { x: sx * side, y: y1 }, d, S, 0, tSide((y0 + y1) / 2));
      standRow(upper, { x: sx * (side + S * 0.9), y: y0 }, { x: sx * (side + S * 0.9), y: y1 }, d, S2, S * 0.85, tSide((y0 + y1) / 2));
    }
  }
  // behind the goals
  for (const sy of [-1, 1]) {
    const d = new THREE.Vector2(0, -sy), tint = sy < 0 ? 0 : 1;
    standRow(lower, { x: -3600, y: sy * end }, { x: 3600, y: sy * end }, d, S, 0, tint);
    standRow(upper, { x: -3600, y: sy * (end + S * 0.9) }, { x: 3600, y: sy * (end + S * 0.9) }, d, S2, S * 0.85, tint);
  }
  // corners, along the 45 degree corner walls
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const d = new THREE.Vector2(-sx, -sy).normalize(), off = 420;
    const p0 = { x: sx * (A.W + off * 0.7), y: sy * (A.C - A.W + off * 0.7) };
    const p1 = { x: sx * (A.C - A.L + off * 0.7), y: sy * (A.L + off * 0.7) };
    standRow(lower, p0, p1, d, S, 0, sy < 0 ? 0 : 1);
    const q = (p, k) => ({ x: p.x + d.x * -k, y: p.y + d.y * -k });
    standRow(upper, q(p0, S * 0.9), q(p1, S * 0.9), d, S2, S * 0.85, sy < 0 ? 0 : 1);
  }
  instanceProp(group, 'grandStand', lower);
  instanceProp(group, 'grandStandCovered', upper);
  const crowd = [crowdLayer(group, lower, 'grandStand', quality), crowdLayer(group, upper, 'grandStandCovered', quality)].filter(Boolean);

  // floodlight towers in the corners, lamps facing the pitch
  const towers = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * 6400, y = sy * 8000;
    towers.push({ x, y, z: 0, yaw: Math.atan2(-y, -x) - Math.PI / 2, s: 5200, tint: 2 });
  }
  instanceProp(group, 'lightPostLarge', towers, { dim: 0.35 });

  // billboards on top of the end stands and along the sides
  const boards = [];
  for (const sy of [-1, 1]) for (const x of [-2600, 0, 2600]) {
    boards.push({ x: x + sy * 700, y: sy * (end + S * 2.2), z: S * 0.85 + S2 * 1.05, yaw: sy < 0 ? Math.PI : 0, s: 1500 });
  }
  for (const sx of [-1, 1]) for (const y of [-3000, 0, 3000]) {
    boards.push({ x: sx * (side + S * 2.2), y: y - sx * 700, z: S * 0.85 + S2 * 1.05, yaw: sx < 0 ? Math.PI / 2 : -Math.PI / 2, s: 1500 });
  }
  instanceProp(group, 'billboard', boards);
  // screens: clean textured planes on both faces of each billboard panel, sized from the
  // panel mesh itself (model space, before the Y-up turn)
  const tex = billboardTexture();
  const box = new THREE.Box3();
  ASSETS.props.billboard.updateMatrixWorld(true);
  ASSETS.props.billboard.traverse(o => {
    if (o.isMesh && o.material.name === 'tankco') { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  });
  const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  // the panel is about twice as wide as it is tall; the mesh also has a lower strip, so anchor to the top
  const sw = size.x * 0.97, sh = Math.min(size.y, size.x * 0.49) * 0.97;
  ctr.y = box.max.y - sh / 2 - size.x * 0.015;
  const screenGeo = new THREE.PlaneGeometry(sw, sh);
  const screens = new THREE.InstancedMesh(screenGeo, screenMat, boards.length * 2);
  boards.forEach((p, i) => {
    for (const f of [0, 1]) {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(ctr.x, ctr.y, f ? box.min.z - 0.004 : box.max.z + 0.004),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f ? Math.PI : 0), new THREE.Vector3(1, 1, 1));
      screens.setMatrixAt(i * 2 + f, propMatrix(p).multiply(_yUp).multiply(local));
    }
  });
  screens.frustumCulled = false;
  group.add(screens);

  // team banner towers at the goal-end corners and flags along the roof line
  const banners = [], flags = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    banners.push({ x: sx * 3900, y: sy * (end + 250), z: 0, yaw: sy < 0 ? 0 : Math.PI, s: 1600, tint: sy < 0 ? 0 : 1 });
    for (let k = 0; k < 5; k++) flags.push({ x: sx * (side + S * 2.05), y: sy * (900 + k * 800), z: S * 0.85 + S2 * 1.2, yaw: sx < 0 ? 0 : Math.PI, s: 900, tint: sy < 0 ? 0 : 1 });
  }
  instanceProp(group, 'bannerTowerRed', banners);
  instanceProp(group, 'flagRed', flags);

  // TV cameras at the front of the side stands
  const cams = [];
  for (const sx of [-1, 1]) for (const y of [-2400, 0, 2400]) cams.push({ x: sx * (side + 120), y, z: 0, yaw: sx > 0 ? Math.PI : 0, s: 650, tint: 2 });
  instanceProp(group, 'camera_exclusive', cams);

  // fan zone tents and a tree line around the stadium
  const tents = [], trees = [], small = [];
  const rnd = mulberry32(11);
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) tents.push({ x: sx * 9300, y: -4500 + k * 3000, z: 0, yaw: sx < 0 ? Math.PI / 2 : -Math.PI / 2, s: 900, tint: k < 2 ? 0 : 1 });
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2, r = 15500 + rnd() * 7000;
    (rnd() < 0.6 ? trees : small).push({ x: Math.cos(a) * r * 0.85, y: Math.sin(a) * r, z: 0, yaw: rnd() * 6.28, s: 1400 + rnd() * 1000 });
  }
  instanceProp(group, 'tent', tents);
  instanceProp(group, 'treeLarge', trees, { dim: 0.3 });
  instanceProp(group, 'treeSmall', small, { dim: 0.3 });

  // goal celebrations: fans jump (t = seconds since the goal)
  const m = new THREE.Matrix4();
  function cheer(t) {
    for (const im of crowd) {
      const base = im.userData.base;
      for (let k = 0; k < base.length; k++) {
        im.getMatrixAt(k, m);
        const h = t > 0 && t < 4 ? Math.max(0, Math.sin(t * 9 + k * 1.7)) * 70 * (1 - t / 4) : 0;
        m.elements[14] = base[k] + h;
        im.setMatrixAt(k, m);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }
  return { crowd, cheer, board: drawBoard };
}

// Garage backdrop: a row of pit garages behind the turntable (the garage camera always looks
// along the same direction), with cones, barriers and light posts.
function dressGarage(scene) {
  const g = new THREE.Group();
  const view = new THREE.Vector2(-Math.cos(-0.9), -Math.sin(-0.9)); // camera -> turntable
  const face = view.clone().negate();
  const c = view.clone().multiplyScalar(1050);
  const u = new THREE.Vector2(-face.y, face.x);
  const bays = [];
  standRow(bays, { x: c.x - u.x * 2100, y: c.y - u.y * 2100 }, { x: c.x + u.x * 2100, y: c.y + u.y * 2100 }, face, 700, -16, 0);
  instanceProp(g, 'pitsGarage', bays.filter((_, i) => i % 2 === 0), { dim: 0.7 });
  instanceProp(g, 'pitsGarageClosed', bays.filter((_, i) => i % 2 === 1), { dim: 0.7 });
  const cones = [], barriers = [], posts = [];
  const rnd = mulberry32(5);
  for (let k = 0; k < 9; k++) {
    const a = -0.9 + Math.PI + (k - 4) * 0.28 + (rnd() - 0.5) * 0.08, r = 480 + rnd() * 90;
    cones.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -16, yaw: rnd() * 6.28, s: 420, tint: k % 2 });
  }
  for (const k of [-1, 1]) {
    const p = c.clone().multiplyScalar(0.55).addScaledVector(u, k * 620);
    barriers.push({ x: p.x, y: p.y, z: -16, yaw: Math.atan2(u.y, u.x), s: 900 });
    const q = c.clone().multiplyScalar(0.78).addScaledVector(u, k * 1100);
    posts.push({ x: q.x, y: q.y, z: -16, yaw: Math.atan2(-q.y, -q.x) - Math.PI / 2, s: 900 });
  }
  instanceProp(g, 'pylon', cones);
  instanceProp(g, 'barrierWhite', barriers, { dim: 0.8 });
  instanceProp(g, 'lightPostModern', posts, { dim: 0.6 });
  scene.add(g);
  // warm light spilling out of the garages
  const spill = new THREE.PointLight(0xffc98a, 0.9, 2400, 1.5);
  spill.position.set(c.x, c.y, 300);
  scene.add(spill);
}
