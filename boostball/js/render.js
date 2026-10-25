// Three.js scene: stadium, arena, cars, ball, particles. World units = uu, z up.
'use strict';

const TEAM_COLORS = [
  { main: 0x1e6bff, light: 0x5aa0ff, glow: 0x2f8bff, css: '#3d8bff' },
  { main: 0xff6a12, light: 0xffa04d, glow: 0xff8a2a, css: '#ff8a2a' },
];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// ---------------------------------------------------------------- textures
function fieldTexture() {
  const A = ARENA;
  const Lt = A.L + A.GD;
  const c = makeCanvas(2048, 3000);
  const g = c.getContext('2d');
  const sx = c.width / (2 * A.W), sy = c.height / (2 * Lt);
  const X = (x) => (x + A.W) * sx, Y = (y) => (Lt - y) * sy;
  // grass stripes
  const stripes = 20;
  for (let i = 0; i < stripes; i++) {
    const y0 = -A.L + (2 * A.L) * i / stripes, y1 = -A.L + (2 * A.L) * (i + 1) / stripes;
    g.fillStyle = i % 2 ? '#2a6a33' : '#31763a';
    g.fillRect(0, Y(y1), c.width, Y(y0) - Y(y1));
  }
  // goal areas
  g.fillStyle = '#2a6f34';
  g.fillRect(X(-A.GW), Y(Lt), X(A.GW) - X(-A.GW), Y(A.L) - Y(Lt));
  g.fillRect(X(-A.GW), Y(-A.L), X(A.GW) - X(-A.GW), Y(-Lt) - Y(-A.L));
  // team tint
  let grd = g.createLinearGradient(0, Y(-A.L), 0, Y(-A.L + 2600));
  grd.addColorStop(0, 'rgba(40,110,255,0.32)'); grd.addColorStop(1, 'rgba(40,110,255,0)');
  g.fillStyle = grd; g.fillRect(0, Y(-A.L + 2600), c.width, Y(-Lt) - Y(-A.L + 2600));
  grd = g.createLinearGradient(0, Y(A.L), 0, Y(A.L - 2600));
  grd.addColorStop(0, 'rgba(255,120,30,0.32)'); grd.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grd; g.fillRect(0, Y(Lt), c.width, Y(A.L - 2600) - Y(Lt));
  // lines
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(c.width, Y(0)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), 1000 * sx, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(X(0), Y(0), 60 * sx, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) {
    // goal line + box
    g.beginPath(); g.moveTo(X(-A.GW), Y(s * A.L)); g.lineTo(X(A.GW), Y(s * A.L)); g.stroke();
    g.strokeRect(X(-1800), Math.min(Y(s * A.L), Y(s * (A.L - 1300))), 3600 * sx, 1300 * sy);
    g.strokeRect(X(-1100), Math.min(Y(s * A.L), Y(s * (A.L - 600))), 2200 * sx, 600 * sy);
    g.beginPath(); g.arc(X(0), Y(s * (A.L - 1300)), 500 * sx, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : Math.PI * 2); g.stroke();
  }
  // boost pad decals
  for (const p of BOOST_PADS) {
    g.fillStyle = p[2] ? 'rgba(255,190,60,0.35)' : 'rgba(255,210,90,0.25)';
    g.beginPath(); g.arc(X(p[0]), Y(p[1]), (p[2] ? 230 : 150) * sx, 0, Math.PI * 2); g.fill();
  }
  // subtle noise
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

function gridTexture(base, line, size = 256, cells = 4, alpha = false) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  g.strokeStyle = line; g.lineWidth = 2;
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(size, i * step); g.stroke();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function hexTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  const r = 22, h = r * Math.sqrt(3);
  for (let row = -1; row < 9; row++) for (let col = -1; col < 9; col++) {
    const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0), cy = row * h / 2;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    g.closePath(); g.stroke();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function netTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ballTexture() {
  const c = makeCanvas(1024, 512);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#d9dde3'); grd.addColorStop(0.5, '#f3f5f8'); grd.addColorStop(1, '#c8ccd3');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  // panels
  g.strokeStyle = '#55606e'; g.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    const x = i * 128;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 40, 170, x - 40, 340, x, 512); g.stroke();
  }
  for (const y of [128, 256, 384]) {
    g.beginPath();
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin(x / 1024 * Math.PI * 8) * 18);
    g.stroke();
  }
  g.fillStyle = '#ff8a2a';
  for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(64 + i * 128, 256, 18, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#3d8bff';
  for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(i * 128, 128, 12, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(i * 128, 384, 12, 0, Math.PI * 2); g.fill(); }
  return canvasTex(c);
}

function crowdTexture() {
  const c = makeCanvas(512, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#141826'; g.fillRect(0, 0, 512, 256);
  const cols = ['#3d8bff', '#ff8a2a', '#e8e8e8', '#ffd24a', '#8a8fa8', '#c33', '#2b4'];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.globalAlpha = 0.35 + Math.random() * 0.5;
    const x = Math.random() * 512, y = Math.random() * 256;
    g.fillRect(x, y, 3, 4);
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 512, 3);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- particles
class Particles {
  constructor(scene, max = 6000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.count = 0;
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 800 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; uniform float scale;
        void main(){ vColor=color; vAlpha=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize = min(size*scale/max(1.0,-mv.z), 90.0); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d)*4.0; if(r>1.0) discard;
          float a=(1.0-r); a*=a; gl_FragColor=vec4(vColor*(0.6+a), a*vAlpha); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.enabled = true;
    this.density = 1;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, opts) {
    if (!this.enabled) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.count < this.max) this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.drag[i] = opts && opts.drag !== undefined ? opts.drag : 2;
    this.grav[i] = opts && opts.grav ? opts.grav : 0;
    this.grow[i] = opts && opts.grow !== undefined ? opts.grow : 1;
    this.alpha[i] = 1;
  }
  update(dt) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] = this.vel[i3 + 2] * d + this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t;
      this.size[i] *= 1 + (this.grow[i] - 1) * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

// ---------------------------------------------------------------- car models
const BODY_SHAPES = {
  // profile points: [t (0 rear .. 1 front), z fraction of hitbox height above hitbox bottom]
  octane: { body: [[0, 0.1], [0, 0.95], [0.08, 1.05], [0.6, 1.05], [0.78, 0.9], [0.96, 0.6], [1, 0.34], [0.98, 0.08]],
            cabin: [[0.12, 1.0], [0.26, 1.72], [0.56, 1.75], [0.72, 1.0]], spoiler: true },
  dominus: { body: [[0, 0.12], [0, 1.0], [0.1, 1.05], [0.55, 1.0], [0.95, 0.75], [1, 0.45], [0.99, 0.1]],
             cabin: [[0.06, 1.0], [0.2, 1.6], [0.45, 1.6], [0.62, 1.0]], spoiler: true },
  plank: { body: [[0, 0.1], [0, 1.0], [0.3, 1.12], [0.7, 0.95], [1, 0.42], [0.99, 0.1]],
           cabin: [[0.2, 1.05], [0.32, 1.5], [0.5, 1.48], [0.62, 1.0]], spoiler: false },
  breakout: { body: [[0, 0.1], [0, 1.05], [0.25, 1.1], [0.6, 0.9], [1, 0.35], [0.98, 0.08]],
              cabin: [[0.14, 1.05], [0.3, 1.6], [0.48, 1.5], [0.62, 0.95]], spoiler: true },
  hybrid: { body: [[0, 0.1], [0, 1.0], [0.1, 1.08], [0.6, 1.0], [0.92, 0.8], [1, 0.45], [0.98, 0.1]],
            cabin: [[0.1, 1.02], [0.24, 1.62], [0.52, 1.62], [0.68, 1.0]], spoiler: true },
  merc: { body: [[0, 0.1], [0, 1.0], [0.05, 1.08], [0.7, 1.08], [0.85, 1.0], [1, 0.8], [1, 0.1]],
          cabin: [[0.05, 1.05], [0.12, 1.55], [0.62, 1.55], [0.74, 1.05]], spoiler: false },
};

const PAINTS = ['#1e6bff', '#ff6a12', '#e8e8ee', '#1b1d24', '#d61f2c', '#19b35a', '#ffd21f', '#8a2be2', '#00c2d1', '#ff4fa3', '#7a5230', '#6b7a8f', '#9fff3a', '#0b2a6b'];
const WHEEL_STYLES = ['Classic', 'Spoked', 'Disc', 'Neon'];
const TOPPERS = ['None', 'Halo', 'Cone', 'Crown', 'Fin'];
const ANTENNAS = ['None', 'Ball', 'Flag', 'Star'];
const BOOST_STYLES = ['Flame', 'Plasma', 'Sparkle'];

// Narrow the extruded width toward the top so bodies/cabins taper like a real car
function taperWidth(geo, zFrom, zTo, topScale) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = clamp((p.getZ(i) - zFrom) / (zTo - zFrom), 0, 1);
    p.setY(i, p.getY(i) * lerp(1, topScale, t * t));
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function extrudeProfile(points, depth, bevel) {
  const shape = new THREE.Shape();
  points.forEach((p, i) => i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1]));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 4,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, depth / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

function buildCarModel(cfg) {
  const hb = HITBOXES[cfg.body] || HITBOXES.octane;
  const shapeDef = BODY_SHAPES[cfg.body] || BODY_SHAPES.octane;
  const group = new THREE.Group();
  const x0 = hb.ox - hb.l / 2, zb = hb.oz - hb.h / 2;
  const P = (pts) => pts.map(([t, f]) => [x0 + t * hb.l, zb + f * hb.h]);
  const primary = new THREE.Color(cfg.primary || '#1e6bff');
  const accent = new THREE.Color(cfg.accent || '#ffffff');
  const bodyMat = new THREE.MeshStandardMaterial({ color: primary, metalness: 0.55, roughness: 0.32, envMapIntensity: 1 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2a48, metalness: 0.85, roughness: 0.12, emissive: 0x0a1428, emissiveIntensity: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.3, roughness: 0.7 });

  const mdl = buildModelCar(cfg);
  let roofTop, roofX0, roofX1, bodyMatOut = bodyMat;
  if (mdl) {
    // downloaded model fitted to the hitbox
    for (const c of mdl.group.children.slice()) group.add(c);
    bodyMatOut = mdl.paintMat;
    roofTop = hb.oz + hb.h / 2 + 1;
    roofX0 = hb.ox - hb.l * 0.25; roofX1 = hb.ox + hb.l * 0.1;
  } else {
    const bodyW = hb.w * 0.86;
    const bodyPts = P(shapeDef.body);
    const bodyGeo = taperWidth(extrudeProfile(bodyPts, bodyW, 5), zb + hb.h * 0.35, zb + hb.h * 1.15, 0.82);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);
    const cabPts = P(shapeDef.cabin);
    const cabGeo = taperWidth(extrudeProfile(cabPts, hb.w * 0.7, 4), zb + hb.h * 0.95, Math.max(...cabPts.map(p => p[1])), 0.62);
    const cabin = new THREE.Mesh(cabGeo, glassMat);
    cabin.castShadow = true;
    group.add(cabin);
    // roof accent strip
    const roofPts = P(shapeDef.cabin);
    roofTop = Math.max(...roofPts.map(p => p[1]));
    roofX0 = roofPts[1][0]; roofX1 = roofPts[2][0];
    const strip = new THREE.Mesh(new THREE.BoxGeometry(Math.max(8, roofX1 - roofX0) * 0.9, hb.w * 0.14, 2), accentMat);
    strip.position.set((roofX0 + roofX1) / 2, 0, roofTop + 3.2);
    group.add(strip);
    // hood stripe
    const hood = new THREE.Mesh(new THREE.BoxGeometry(hb.l * 0.3, hb.w * 0.16, 2), accentMat);
    hood.position.set(x0 + hb.l * 0.82, 0, zb + hb.h * 0.98);
    hood.rotation.y = 0.18;
    group.add(hood);
    // side skirts
    for (const s of [-1, 1]) {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(hb.l * 0.55, 3, hb.h * 0.25), accentMat);
      sk.position.set(hb.ox - hb.l * 0.03, s * (bodyW / 2 + 5.5), zb + hb.h * 0.32);
      group.add(sk);
    }
    // under-chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(hb.l * 0.92, hb.w * 0.7, 8), darkMat);
    chassis.position.set(hb.ox, 0, zb + 3);
    group.add(chassis);
    // spoiler
    if (shapeDef.spoiler) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(14, hb.w * 0.92, 3), accentMat);
      wing.position.set(x0 + 6, 0, zb + hb.h * 1.42);
      wing.rotation.y = -0.15;
      wing.castShadow = true;
      group.add(wing);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(4, 3, hb.h * 0.45), darkMat);
        post.position.set(x0 + 7, s * hb.w * 0.3, zb + hb.h * 1.18);
        group.add(post);
      }
    }
    // lights
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 });
    const frontZ = zb + hb.h * 0.55;
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 5), headMat);
      hl.position.set(x0 + hb.l + 1, s * bodyW * 0.33, frontZ);
      group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(3, 14, 5), tailMat);
      tl.position.set(x0 - 4, s * bodyW * 0.32, zb + hb.h * 0.7);
      group.add(tl);
    }
  }
  // exhaust
  if (!mdl) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 10, 12), darkMat);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(x0 - 3, 0, zb + hb.h * 0.42);
    group.add(exhaust);
  }
  const boostColor = new THREE.Color(cfg.boostColor || '#ff9a2a');
  const nozzleMat = new THREE.MeshBasicMaterial({ color: boostColor, transparent: true, opacity: 0.0 });
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(9, 50, 14, 1, true), nozzleMat);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(x0 - 30, 0, zb + hb.h * 0.42);
  group.add(nozzle);

  // wheels
  const wheels = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.9 });
  const wheelColor = new THREE.Color(cfg.wheelColor || '#c9ced8');
  const rimMat = cfg.wheel === 'Neon'
    ? new THREE.MeshStandardMaterial({ color: wheelColor, emissive: wheelColor, emissiveIntensity: 1.6 })
    : new THREE.MeshStandardMaterial({ color: wheelColor, metalness: 0.8, roughness: 0.25 });
  for (const w of WHEEL_LAYOUT(hb)) {
    const wg = new THREE.Group();
    const spin = new THREE.Group();
    const width = w.front ? 11 : 13;
    const mWheel = mdl && (!cfg.wheel || cfg.wheel === 'Classic') && mdl.wheelGeos[(w.front ? 'f' : 'b') + (w.y > 0 ? 'l' : 'r')];
    if (mWheel) {
      const mw = new THREE.Mesh(mWheel, mdl.baseMat);
      mw.scale.set(w.r, w.r * 1.1, w.r);
      mw.castShadow = true;
      spin.add(mw);
    } else {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, width, 20), tireMat);
      tire.castShadow = true;
      spin.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(w.r * 0.66, w.r * 0.66, width + 1, 16), rimMat);
      spin.add(rim);
    }
    if (mWheel) { /* model wheel already has its rim */ }
    else if (cfg.wheel === 'Spoked' || cfg.wheel === 'Classic' || !cfg.wheel) {
      const n = cfg.wheel === 'Spoked' ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(w.r * 1.25, width + 1.6, 2.2), cfg.wheel === 'Spoked' ? darkMat : rimMat);
        sp.rotation.y = i * Math.PI / n;
        spin.add(sp);
      }
    } else if (cfg.wheel === 'Disc') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(w.r * 0.8, w.r * 0.8, width + 1.4, 20), accentMat);
      spin.add(disc);
    } else if (cfg.wheel === 'Neon') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w.r * 0.85, 1.2, 6, 24), rimMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = (width / 2 + 0.5) * Math.sign(w.y);
      spin.add(ring);
    }
    wg.add(spin);
    wg.position.set(w.x, w.y + Math.sign(w.y) * 2, -4);
    group.add(wg);
    wheels.push({ group: wg, spin, def: w });
  }

  // topper
  const topZ = roofTop + 6;
  const topX = (roofX0 + roofX1) / 2;
  if (cfg.topper === 'Halo') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(16, 2.2, 8, 28), new THREE.MeshStandardMaterial({ color: 0xffe680, emissive: 0xffd040, emissiveIntensity: 1.4 }));
    halo.position.set(topX, 0, topZ + 14);
    group.add(halo);
  } else if (cfg.topper === 'Cone') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 16), new THREE.MeshStandardMaterial({ color: 0xff7b1a, roughness: 0.6 }));
    cone.rotation.x = Math.PI / 2;
    cone.position.set(topX, 0, topZ + 12);
    group.add(cone);
  } else if (cfg.topper === 'Crown') {
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.9, roughness: 0.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 8, 16, 1, true), crownMat);
    base.rotation.x = Math.PI / 2; base.position.set(topX, 0, topZ + 4);
    group.add(base);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 6), crownMat);
      const a = i / 6 * Math.PI * 2;
      sp.rotation.x = Math.PI / 2;
      sp.position.set(topX + Math.cos(a) * 11, Math.sin(a) * 11, topZ + 12);
      group.add(sp);
    }
  } else if (cfg.topper === 'Fin') {
    const fin = new THREE.Mesh(extrudeProfile([[0, 0], [30, 0], [4, 24]], 3, 0.5), accentMat);
    fin.position.set(topX - 12, 0, topZ - 4);
    group.add(fin);
  }
  // antenna
  if (cfg.antenna && cfg.antenna !== 'None') {
    const ax = x0 + 10, ay = -hb.w * 0.3, az = zb + hb.h * 1.05;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 50, 6), darkMat);
    stick.rotation.x = Math.PI / 2; stick.position.set(ax, ay, az + 25);
    group.add(stick);
    let topMesh;
    if (cfg.antenna === 'Ball') topMesh = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 10), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.4 }));
    else if (cfg.antenna === 'Flag') {
      topMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), new THREE.MeshStandardMaterial({ color: accent, side: THREE.DoubleSide }));
      topMesh.rotation.x = Math.PI / 2;
      topMesh.position.x = -9;
    } else {
      const st = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7.5, a = i / 10 * Math.PI * 2 + Math.PI / 2; i ? st.lineTo(Math.cos(a) * r, Math.sin(a) * r) : st.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      topMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(st, { depth: 2, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0xffaa00, emissiveIntensity: 0.6 }));
      topMesh.rotation.x = Math.PI / 2;
    }
    const holder = new THREE.Group();
    holder.position.set(ax, ay, az + 52);
    holder.add(topMesh);
    group.add(holder);
  }

  return { group, wheels, nozzle, nozzleMat, bodyMat: bodyMatOut, boostColor, exhaustLocal: new THREE.Vector3(x0 - 6, 0, zb + hb.h * 0.42), hb };
}

// ---------------------------------------------------------------- arena
function buildArena(scene, quality) {
  const A = ARENA;
  const group = new THREE.Group();
  scene.add(group);
  const path = arenaPath(220);
  const N = path.length;

  // floor
  const floorShape = new THREE.Shape();
  path.forEach((p, i) => {
    const x = p.x - p.nx * A.RF, y = p.y - p.ny * A.RF;
    i ? floorShape.lineTo(x, y) : floorShape.moveTo(x, y);
  });
  const floorGeo = new THREE.ShapeGeometry(floorShape);
  const Lt = A.L + A.GD;
  const uvFromXY = (geo) => {
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + A.W) / (2 * A.W);
      uv[i * 2 + 1] = (pos.getY(i) + Lt) / (2 * Lt);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };
  uvFromXY(floorGeo);
  const fieldTex = fieldTexture();
  const floorMat = new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.35 });
  const grass = ASSETS.textures && ASSETS.textures.grass_color;
  if (grass) {
    // tile a real grass texture over the painted field (stripes + lines stay from the field map)
    const gain = ASSETS.grassGain || new THREE.Vector3(1, 1, 1);
    floorMat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: grass };
      sh.uniforms.detailRepeat = { value: new THREE.Vector2(2 * A.W / 210, 2 * Lt / 210) };
      sh.uniforms.detailGain = { value: gain };
      sh.fragmentShader = 'uniform sampler2D detailMap; uniform vec2 detailRepeat; uniform vec3 detailGain;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          vec3 dtl = pow(texture2D(detailMap, vUv * detailRepeat).rgb, vec3(2.2)) * detailGain;
          diffuseColor.rgb *= mix(vec3(1.0), dtl, 0.9);`);
    };
  }
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  // goal floors
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(2 * A.GW, A.GD + A.RF);
    g.translate(0, s * (A.L - A.RF + (A.GD + A.RF) / 2), 0);
    uvFromXY(g);
    const m = new THREE.Mesh(g, floorMat);
    m.position.z = 0.5;
    m.receiveShadow = true;
    group.add(m);
  }

  // wall profile
  const prof = [];
  const fs = 10;
  for (let i = 0; i <= fs; i++) {
    const th = -Math.PI / 2 - (Math.PI / 2) * i / fs;
    prof.push({ u: A.RF + A.RF * Math.cos(th), z: A.RF + A.RF * Math.sin(th), nu: -Math.cos(th), nz: -Math.sin(th), part: 0 });
  }
  const breaks = [A.GH, 1000, 1350, A.H - A.RC].filter(z => z > A.RF);
  for (const z of breaks) prof.push({ u: 0, z, nu: 1, nz: 0, part: 1 });
  const cs = 8;
  for (let i = 1; i <= cs; i++) {
    const th = Math.PI - (Math.PI / 2) * i / cs;
    prof.push({ u: A.RC + A.RC * Math.cos(th), z: A.H - A.RC + A.RC * Math.sin(th), nu: -Math.cos(th), nz: -Math.sin(th), part: 2 });
  }

  const makeStrip = (j0, j1, colorFn) => {
    const verts = [], norms = [], uvs = [], cols = [], idx = [];
    const rows = j1 - j0 + 1;
    for (let i = 0; i <= N; i++) {
      const p = path[i % N];
      const s = i === N ? path[N - 1].s + Math.hypot(path[0].x - path[N - 1].x, path[0].y - path[N - 1].y) : p.s;
      for (let j = j0; j <= j1; j++) {
        const q = prof[j];
        const x = p.x - p.nx * q.u, y = p.y - p.ny * q.u;
        verts.push(x, y, q.z);
        norms.push(-p.nx * q.nu, -p.ny * q.nu, q.nz);
        uvs.push(s / 400, q.z / 400 + q.u / 400);
        const c = colorFn(x, y, q.z);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = i * rows + j, b = (i + 1) * rows + j, c = a + 1, d = b + 1;
        const cx = (verts[a * 3] + verts[d * 3]) / 2, cy = (verts[a * 3 + 1] + verts[d * 3 + 1]) / 2, cz = (verts[a * 3 + 2] + verts[d * 3 + 2]) / 2;
        if (Math.abs(cx) < A.GW && cz < A.GH && Math.abs(cy) > A.L - A.RF - 1) continue;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    return geo;
  };
  const blue = new THREE.Color(0x1d4fb8), orange = new THREE.Color(0xc4561a), neutral = new THREE.Color(0x3a4256);
  const teamTint = (x, y, z, strength) => {
    const t = clamp(y / (A.L * 0.9), -1, 1);
    const c = neutral.clone();
    if (t < 0) c.lerp(blue, -t * strength); else c.lerp(orange, t * strength);
    return c;
  };
  const rampGeo = makeStrip(0, fs, (x, y, z) => teamTint(x, y, z, 0.55));
  const hexTex = hexTexture();
  const rampMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: hexTex, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  const ramp = new THREE.Mesh(rampGeo, rampMat);
  ramp.receiveShadow = true;
  group.add(ramp);
  const wallGeo = makeStrip(fs, prof.length - 1, (x, y, z) => teamTint(x, y, z, 0.8).multiplyScalar(1.0 + z / A.H * 0.4));
  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: gridTexture('#ffffff', '#9fb6ff', 256, 2), transparent: true, opacity: 0.38,
    roughness: 0.2, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.renderOrder = 2;
  group.add(wall);

  // ceiling
  const ceilShape = new THREE.Shape();
  path.forEach((p, i) => {
    const x = p.x - p.nx * A.RC, y = p.y - p.ny * A.RC;
    i ? ceilShape.lineTo(x, y) : ceilShape.moveTo(x, y);
  });
  const ceil = new THREE.Mesh(new THREE.ShapeGeometry(ceilShape), new THREE.MeshStandardMaterial({
    color: 0x0c1230, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, roughness: 0.3, metalness: 0.5,
  }));
  ceil.position.z = A.H;
  ceil.renderOrder = 2;
  group.add(ceil);

  // glowing trims
  const trim = (zOff, uOff, color, width) => {
    const verts = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = path[i % N];
      const x = p.x - p.nx * uOff, y = p.y - p.ny * uOff;
      verts.push(x, y, zOff - width / 2, x, y, zOff + width / 2);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    const cols = [];
    for (let i = 0; i <= N; i++) {
      const p = path[i % N];
      const c = p.y < -200 ? new THREE.Color(TEAM_COLORS[0].glow) : p.y > 200 ? new THREE.Color(TEAM_COLORS[1].glow) : new THREE.Color(0xffffff);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  };
  group.add(trim(A.RF + 4, 1, 0, 14));
  group.add(trim(A.H - A.RC, 1, 0, 10));

  // goals
  const netTex = netTexture();
  for (const [ti, s] of [[0, -1], [1, 1]]) {
    const tc = TEAM_COLORS[ti];
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, color: tc.light, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    netTex.repeat.set(10, 4);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * A.GW, A.GH), netMat);
    back.rotation.x = Math.PI / 2;
    back.position.set(0, s * (A.L + A.GD), A.GH / 2);
    group.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(A.GD, A.GH), netMat);
      side.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      side.position.set(sx * A.GW, s * (A.L + A.GD / 2), A.GH / 2);
      group.add(side);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * A.GW, A.GD), netMat);
    top.position.set(0, s * (A.L + A.GD / 2), A.GH);
    group.add(top);
    // inner glow
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2 * A.GW, A.GH), new THREE.MeshBasicMaterial({ color: tc.main, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0, s * (A.L + A.GD - 2), A.GH / 2);
    group.add(glow);
    // frame
    const frameMat = new THREE.MeshStandardMaterial({ color: tc.main, emissive: tc.glow, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(24, 24, A.GH + 12), frameMat);
      post.position.set(sx * (A.GW + 12), s * (A.L + 4), A.GH / 2 + 6);
      group.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * A.GW + 48, 24, 24), frameMat);
    bar.position.set(0, s * (A.L + 4), A.GH + 12);
    group.add(bar);
    // team light on goal
    const pl = new THREE.PointLight(tc.glow, 0.6, 3000, 2);
    pl.position.set(0, s * (A.L + 300), 400);
    group.add(pl);
  }

  // boost pads
  const pads = [];
  const padBaseMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.4 });
  for (const p of BOOST_PADS) {
    const big = !!p[2];
    const g = new THREE.Group();
    g.position.set(p[0], p[1], 0);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(big ? 135 : 80, big ? 150 : 90, 5, 24), padBaseMat);
    base.rotation.x = Math.PI / 2; base.position.z = 2.5;
    base.receiveShadow = true;
    g.add(base);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.9 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(big ? 105 : 60, 24), glowMat);
    disc.position.z = 5.5;
    g.add(disc);
    let orb = null;
    if (big) {
      orb = new THREE.Mesh(new THREE.SphereGeometry(55, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.85 }));
      orb.position.z = 110;
      g.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(80, 5, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
      ring.position.z = 110;
      orb.userData.ring = ring;
      g.add(ring);
    }
    group.add(g);
    pads.push({ group: g, disc, orb, glowMat });
  }

  // stadium outside
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x0c0f18, roughness: 1 }));
  outer.position.z = -6;
  outer.receiveShadow = false;
  group.add(outer);
  const crowd = crowdTexture();
  const standMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9, color: 0xb8bed0 });
  const standGeoLong = new THREE.BoxGeometry(12000, 3000, 200);
  const standGeoShort = new THREE.BoxGeometry(9600, 3000, 200);
  crowd.repeat.set(10, 3);
  const addStand = (geo, x, y, rotZ) => {
    const m = new THREE.Mesh(geo, standMat);
    m.position.set(x, y, 1500);
    m.rotation.set(0, 0, rotZ);
    m.rotateX(-0.75);
    group.add(m);
  };
  addStand(standGeoLong, 6800, 0, Math.PI / 2);
  addStand(standGeoLong, -6800, 0, -Math.PI / 2);
  addStand(standGeoShort, 0, 8300, Math.PI);
  addStand(standGeoShort, 0, -8300, 0);
  // roof ring + floodlights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xf4f7ff });
  for (const [x, y] of [[6200, 7600], [-6200, 7600], [6200, -7600], [-6200, -7600]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(60, 90, 5200, 10), new THREE.MeshStandardMaterial({ color: 0x2a2f3c }));
    pole.rotation.x = Math.PI / 2; pole.position.set(x, y, 2600);
    group.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(900, 120, 500), lightMat);
    panel.position.set(x, y, 5300);
    panel.lookAt(0, 0, 0);
    group.add(panel);
  }
  // giant screens
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x223355 });
  for (const s of [-1, 1]) {
    const scr = new THREE.Mesh(new THREE.BoxGeometry(2600, 60, 1100), screenMat);
    scr.position.set(0, s * 9100, 3900);
    group.add(scr);
  }

  return { group, pads, floorMat, wallMat, rampMat };
}

// Small scene used only to bake reflections: night-stadium gradient, a ring of floodlight
// panels, the pitch below and team-colored glow at both ends.
function stadiumEnvScene() {
  const sc = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `varying vec3 vP; void main(){ float t = vP.z;
      vec3 sky = mix(vec3(0.05,0.07,0.14), vec3(0.01,0.015,0.04), smoothstep(0.0,0.8,t));
      vec3 ground = vec3(0.04,0.09,0.05);
      vec3 c = t > -0.05 ? sky : ground;
      c += vec3(0.25,0.22,0.3) * smoothstep(0.25,0.0,abs(t-0.12));
      c += vec3(0.0,0.08,0.35) * smoothstep(0.2,1.0,-vP.y) * smoothstep(0.4,0.0,abs(t-0.1));
      c += vec3(0.35,0.12,0.0) * smoothstep(0.2,1.0,vP.y) * smoothstep(0.4,0.0,abs(t-0.1));
      gl_FragColor = vec4(c,1.0); }`,
  }));
  sc.add(dome);
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.9) });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.3;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 7), panelMat);
    p.position.set(Math.cos(a) * 60, Math.sin(a) * 60, 42);
    p.lookAt(0, 0, 0);
    sc.add(p);
  }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.55, 0.7) }));
  top.position.z = 80; top.rotation.x = Math.PI;
  sc.add(top);
  return sc;
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(60000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x05070f) }, mid: { value: new THREE.Color(0x1a2348) }, bot: { value: new THREE.Color(0x3a2a40) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float t = vP.z; vec3 c = t>0.0 ? mix(mid, top, smoothstep(0.0,0.6,t)) : mix(mid, bot, smoothstep(0.0,-0.3,t));
        vec3 q = floor(vP*400.0); float s = step(0.9985, h(q)) * smoothstep(0.1,0.5,t);
        gl_FragColor = vec4(c + vec3(s), 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  scene.add(sky);
  return sky;
}

class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: settings.video.quality !== 'low', powerPreference: 'high-performance' });
    this.gl.outputEncoding = THREE.sRGBEncoding;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = settings.video.shadows;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1020, 14000, 52000);
    this.camera = new THREE.PerspectiveCamera(70, 1, 10, 130000);
    this.camera.up.set(0, 0, 1);
    this.buildLights();
    // image-based lighting for glossy paint, ball and metal
    {
      const pmrem = new THREE.PMREMGenerator(this.gl);
      this.envTex = pmrem.fromScene(stadiumEnvScene(), 0.03).texture;
      this.scene.environment = this.envTex;
    }
    this.sky = buildSky(this.scene);
    this.arena = buildArena(this.scene, settings.video.quality);
    this.particles = new Particles(this.scene, 7000);
    this.ballMesh = this.buildBall();
    this.carViews = new Map();
    this.shockwaves = [];
    if (THREE.EffectComposer && THREE.UnrealBloomPass) {
      const rt = new THREE.WebGLRenderTarget(16, 16, { samples: 4 });
      this.composer = new THREE.EffectComposer(this.gl, rt);
      this.renderPass = new THREE.RenderPass(this.scene, this.camera);
      this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.45, 0.9);
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.applyVideo();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xc8d4ff, 0x30283a, 0.45);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, 0.05);
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
    sun.position.set(800, -1200, 9000);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -6200; sc.right = 6200; sc.top = 6200; sc.bottom = -6200; sc.near = 1000; sc.far = 14000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 2;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.35);
    fill.position.set(-4000, 6000, 3000);
    this.scene.add(fill);
  }

  applyVideo() {
    const v = this.settings.video;
    const q = v.quality;
    const scale = v.renderScale || 1;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1.25) * scale);
    this.gl.shadowMap.enabled = !!v.shadows;
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.sun.castShadow = !!v.shadows;
    this.particles.enabled = v.particles !== false;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.gl.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.setFov(this.hfov || 110);
    this.particles.mat.uniforms.scale.value = h * 0.9;
  }
  setFov(hfovDeg) {
    this.hfov = hfovDeg;
    // horizontal FOV defined for 16:9 like the original camera settings
    const ref = 16 / 9;
    const v = 2 * Math.atan(Math.tan(hfovDeg * Math.PI / 360) / ref);
    let vf = v;
    if (this.camera.aspect < ref) vf = 2 * Math.atan(Math.tan(hfovDeg * Math.PI / 360) / this.camera.aspect);
    this.camera.fov = vf * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  buildBall() {
    const mat = new THREE.MeshPhysicalMaterial({ map: ballTexture(), metalness: 0.2, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.15, emissive: 0x0a0a0a });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(PHYS.BALL_R, 48, 32), mat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(PHYS.BALL_R * 1.06, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.add(glow);
    mesh.userData.glow = glow;
    return mesh;
  }

  addCar(car, cfg) {
    const model = buildCarModel({ ...cfg, body: car.body });
    this.scene.add(model.group);
    const label = document.createElement('div');
    label.className = 'nameplate ' + (car.team === 0 ? 'blue' : 'orange');
    label.textContent = car.name;
    document.getElementById('nameplates').appendChild(label);
    const hb = HITBOXES[car.body];
    const hbox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(hb.l, hb.w, hb.h)), new THREE.LineBasicMaterial({ color: 0x7dff9a }));
    hbox.position.set(hb.ox, 0, hb.oz);
    hbox.visible = !!this.settings.video.showHitbox;
    model.group.add(hbox);
    const view = { model, label, cfg, trailT: 0, hbox };
    this.carViews.set(car, view);
    return view;
  }
  removeCar(car) {
    const v = this.carViews.get(car);
    if (!v) return;
    this.scene.remove(v.model.group);
    v.label.remove();
    v.model.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.carViews.delete(car);
  }
  clearCars() { for (const c of Array.from(this.carViews.keys())) this.removeCar(c); this.hideGhost(); }

  // Academy ghost: a see-through copy of the car (and ball) replaying the bot's demo
  showGhost(body, carPose, ballPos) {
    if (!this.ghost || this.ghost.body !== body) {
      if (this.ghost) this.scene.remove(this.ghost.car, this.ghost.ball);
      const car = buildCarModel({ body, primary: '#7fe8ff', accent: '#7fe8ff', wheel: WHEEL_STYLES[0], wheelColor: '#7fe8ff', boostColor: '#7fe8ff', topper: 'None', antenna: 'None' }).group;
      const mat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.28, depthWrite: false });
      car.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } if (o.isPoints || o.isSprite) o.visible = false; });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(PHYS.BALL_R, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, wireframe: true }));
      this.scene.add(car, ball);
      this.ghost = { body, car, ball };
    }
    const g = this.ghost;
    g.car.visible = g.ball.visible = true;
    g.car.position.set(carPose[0], carPose[1], carPose[2]);
    g.car.quaternion.set(carPose[3], carPose[4], carPose[5], carPose[6]);
    g.ball.position.set(ballPos[0], ballPos[1], ballPos[2]);
  }
  hideGhost() { if (this.ghost) this.ghost.car.visible = this.ghost.ball.visible = false; }

  shockwave(x, y, z, color, size = 2500) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
    m.position.set(x, y, z);
    this.scene.add(m);
    const light = new THREE.PointLight(color, 4, size * 3, 2);
    light.position.set(x, y, z + 100);
    this.scene.add(light);
    this.shockwaves.push({ mesh: m, light, t: 0, size });
  }

  goalExplosion(x, y, z, team, style) {
    const tc = new THREE.Color(TEAM_COLORS[team].glow);
    this.shockwave(x, y, z, tc, 2600);
    const P = this.particles;
    const n = 700;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = 800 + Math.random() * 2600;
      const white = Math.random() < 0.25;
      P.emit(x, y, z, r * Math.cos(a) * sp, r * Math.sin(a) * sp, u * sp + 400,
        white ? 1 : tc.r, white ? 1 : tc.g, white ? 1 : tc.b, 40 + Math.random() * 90, 1.2 + Math.random() * 1.4, { drag: 1.6, grav: -500, grow: 0.7 });
    }
  }

  demoExplosion(x, y, z) {
    this.shockwave(x, y, z, new THREE.Color(0xff7a20), 900);
    for (let i = 0; i < 220; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 300 + Math.random() * 1200;
      const k = Math.random();
      this.particles.emit(x, y, z, r * Math.cos(a) * sp, r * Math.sin(a) * sp, u * sp + 300, 1, 0.4 + k * 0.5, 0.1 * k, 40 + Math.random() * 60, 0.6 + Math.random() * 0.9, { drag: 2.2, grav: -300, grow: 1.6 });
    }
  }

  hitSparks(x, y, z, strength) {
    const n = Math.min(60, 6 + strength / 40) | 0;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 200 + Math.random() * strength * 0.5;
      this.particles.emit(x, y, z, r * Math.cos(a) * sp, r * Math.sin(a) * sp, u * sp, 1, 0.9, 0.7, 12 + Math.random() * 14, 0.25 + Math.random() * 0.35, { drag: 3, grav: -800, grow: 0.5 });
    }
  }

  updateEffects(dt) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.t += dt;
      const k = s.t / 1.2;
      s.mesh.scale.setScalar(s.size * (1 - Math.pow(1 - Math.min(k, 1), 3)));
      s.mesh.material.opacity = Math.max(0, 0.32 * (1 - k) * (1 - k));
      s.light.intensity = Math.max(0, 4 * (1 - k * 1.5));
      if (k >= 1) {
        this.scene.remove(s.mesh); this.scene.remove(s.light);
        s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }
    this.particles.update(dt);
  }

  syncPads(world) {
    const t = performance.now() / 1000;
    world.pads.forEach((p, i) => {
      const v = this.arena.pads[i];
      v.glowMat.opacity = p.active ? 0.85 : 0.12;
      if (v.orb) {
        v.orb.visible = p.active;
        v.orb.userData.ring.visible = p.active;
        v.orb.position.z = 110 + Math.sin(t * 2 + i) * 10;
        v.orb.userData.ring.position.z = v.orb.position.z;
        v.orb.userData.ring.rotation.x = t * 1.5; v.orb.userData.ring.rotation.y = t;
      }
    });
  }

  syncBall(ball, alpha, extras) {
    const m = this.ballMesh;
    m.position.lerpVectors(ball.prevPos, ball.pos, alpha);
    m.quaternion.slerpQuaternions(ball.prevRot, ball.rot, alpha);
    m.scale.setScalar(ball.radius / PHYS.BALL_R);
    const glow = m.userData.glow;
    if (extras && extras.heat >= 0) {
      glow.material.color.set(TEAM_COLORS[extras.heat].glow);
      glow.material.opacity = 0.35 + 0.15 * Math.sin(performance.now() / 90);
    } else glow.material.opacity = 0;
  }

  syncCar(car, alpha, dt, camPos) {
    const v = this.carViews.get(car);
    if (!v) return;
    const g = v.model.group;
    g.visible = !car.demolished;
    v.hbox.visible = !!this.settings.video.showHitbox;
    v.label.style.display = 'none';
    if (car.demolished) return;
    g.position.lerpVectors(car.prevPos, car.pos, alpha);
    g.quaternion.slerpQuaternions(car.prevQuat, car.quat, alpha);
    // wheels
    for (let i = 0; i < v.model.wheels.length; i++) {
      const wv = v.model.wheels[i], w = car.wheels[i];
      const hubDrop = Math.min(w.t, PHYS.SUSP_LEN) - w.r;
      wv.group.position.z = HUB_Z - hubDrop;
      wv.spin.rotation.y = w.spin;
      if (w.front) wv.group.rotation.z = -car.controls.steer * 0.42 * (car.onGround ? 1 : 0.3);
    }
    // boost
    const boosting = car.isBoosting;
    v.model.nozzleMat.opacity += ((boosting ? 0.85 : 0) - v.model.nozzleMat.opacity) * Math.min(1, dt * 20);
    v.model.nozzle.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    if (this.particles.enabled) {
      const ex = _rv1.copy(v.model.exhaustLocal).applyQuaternion(g.quaternion).add(g.position);
      const back = _rv2.set(-1, 0, 0).applyQuaternion(g.quaternion);
      const col = v.model.boostColor;
      const style = v.cfg.boostStyle || 'Flame';
      if (boosting) {
        const n = 3;
        for (let k = 0; k < n; k++) {
          const jx = (Math.random() - 0.5) * 30, jy = (Math.random() - 0.5) * 30, jz = (Math.random() - 0.5) * 30;
          const sp = 500 + Math.random() * 400;
          if (style === 'Sparkle') {
            this.particles.emit(ex.x, ex.y, ex.z, back.x * sp + jx * 8, back.y * sp + jy * 8, back.z * sp + jz * 8, 1, 1, 1, 10 + Math.random() * 10, 0.6, { drag: 3, grav: -200, grow: 0.6 });
            this.particles.emit(ex.x, ex.y, ex.z, back.x * sp * 0.5 + jx, back.y * sp * 0.5 + jy, back.z * sp * 0.5 + jz, col.r, col.g, col.b, 16, 0.35, { drag: 4, grow: 1.4 });
          } else if (style === 'Plasma') {
            this.particles.emit(ex.x + jx * 0.3, ex.y + jy * 0.3, ex.z + jz * 0.3, back.x * sp * 0.4, back.y * sp * 0.4, back.z * sp * 0.4, col.r, col.g, col.b, 22, 0.5, { drag: 4, grow: 0.5 });
          } else {
            const hot = Math.random();
            this.particles.emit(ex.x, ex.y, ex.z, back.x * sp + jx, back.y * sp + jy, back.z * sp + jz,
              lerp(col.r, 1, hot * 0.5), lerp(col.g, 0.9, hot * 0.3), lerp(col.b, 0.5, hot * 0.2), 16 + Math.random() * 10, 0.3 + Math.random() * 0.2, { drag: 3, grow: 2.4 });
          }
        }
      }
      if (car.supersonic) {
        for (const s of [-1, 1]) {
          const p = _rv3.set(v.model.hb.ox - v.model.hb.l / 2, s * v.model.hb.w * 0.45, v.model.hb.oz).applyQuaternion(g.quaternion).add(g.position);
          this.particles.emit(p.x, p.y, p.z, 0, 0, 0, 0.9, 0.95, 1, 9, 0.35, { drag: 0, grow: 0.8 });
        }
      }
    }
    // nameplate
    if (v.showName && camPos) {
      const p = _rv1.copy(g.position); p.z += 120;
      const dist = p.distanceTo(camPos);
      p.project(this.camera);
      if (p.z < 1 && p.z > -1 && dist > 300) {
        v.label.style.display = 'block';
        v.label.style.transform = `translate(-50%,-100%) translate(${(p.x * 0.5 + 0.5) * window.innerWidth}px, ${(-p.y * 0.5 + 0.5) * window.innerHeight}px) scale(${clamp(2500 / dist, 0.55, 1.1)})`;
      }
    }
  }

  render(scene, camera) {
    scene = scene || this.scene; camera = camera || this.camera;
    if (this.composer && this.settings.video.bloom !== false) {
      this.renderPass.scene = scene; this.renderPass.camera = camera;
      this.composer.render();
    } else this.gl.render(scene, camera);
  }
}
const _rv1 = new THREE.Vector3(), _rv2 = new THREE.Vector3(), _rv3 = new THREE.Vector3();

// ---------------------------------------------------------------- garage showroom
class Garage {
  constructor(envTex) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a14);
    this.scene.fog = new THREE.Fog(0x070a14, 900, 2600);
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 10000);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x202030, 0.7));
    const key = new THREE.SpotLight(0xffffff, 1.3, 2500, 0.6, 0.6, 1);
    key.position.set(300, -400, 700);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    this.scene.add(key.target);
    const rim = new THREE.DirectionalLight(0x6aa0ff, 0.9);
    rim.position.set(-400, 500, 200);
    this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff9a50, 0.6);
    rim2.position.set(500, 300, 100);
    this.scene.add(rim2);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(190, 200, 16, 64), new THREE.MeshStandardMaterial({ color: 0x1a1e2a, metalness: 0.5, roughness: 0.45 }));
    plat.rotation.x = Math.PI / 2; plat.position.z = -8;
    plat.receiveShadow = true;
    this.scene.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(196, 3, 8, 96), new THREE.MeshBasicMaterial({ color: 0x3d8bff }));
    ring.position.z = 0;
    this.scene.add(ring);
    this.ring = ring;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3000, 64), new THREE.MeshStandardMaterial({ color: 0x0b0e18, roughness: 0.6, metalness: 0.4 }));
    floor.position.z = -16;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.scene.environment = envTex || null;
    this.model = null;
    this.angle = 0.6;
    this.dragging = false;
    this.zoom = 1;
  }
  setCar(cfg) {
    if (this.model) {
      this.holder.remove(this.model.group);
      this.model.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.model = buildCarModel(cfg);
    this.model.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    for (const w of this.model.wheels) w.group.position.z = HUB_Z - (PHYS.SUSP_LEN - 2) + w.def.r;
    this.model.group.position.z = 17 - 2;
    this.holder.add(this.model.group);
    this.cfg = cfg;
    this.ring.material.color.set(cfg.primary);
  }
  update(dt, aspect, showBoost) {
    if (!this.dragging) this.angle += dt * 0.35;
    this.holder.rotation.z = this.angle;
    const d = 520 * this.zoom;
    this.camera.aspect = aspect;
    this.camera.position.set(Math.cos(-0.9) * d, Math.sin(-0.9) * d, 150 * this.zoom);
    this.camera.lookAt(0, 0, 40);
    // shift car left in frame to make room for the menu
    this.camera.setViewOffset(1000 * aspect, 1000, -170 * aspect, 0, 1000 * aspect, 1000);
    this.camera.updateProjectionMatrix();
    if (this.model) {
      for (const w of this.model.wheels) w.spin.rotation.y += dt * 2;
      this.model.nozzleMat.opacity = showBoost ? 0.8 : 0;
    }
  }
}
