// Loads the embedded CC0 assets (Kenney Toy Car Kit, ambientCG grass) and turns each
// car model into a template fitted to its body's hitbox.
'use strict';

const BODY_MODELS = {
  octane: 'vehicle-racer',
  dominus: 'vehicle-speedster',
  plank: 'vehicle-racer-low',
  breakout: 'vehicle-vintage-racer',
  hybrid: 'vehicle-suv',
  merc: 'vehicle-truck',
};

const ASSETS = { ready: false, cars: {}, textures: {}, colormap: null };

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function assetDataUri(path) {
  const b64 = window.BB_ASSETS && window.BB_ASSETS[path];
  if (!b64) return null;
  const ext = path.split('.').pop();
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/octet-stream';
  return `data:${mime};base64,${b64}`;
}
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

async function loadAssets() {
  if (!window.BB_ASSETS || !THREE.GLTFLoader) return ASSETS;
  try {
    // colormap pixels let us tell paint triangles from trim/glass/tyre triangles
    const cmUri = assetDataUri('models/colormap.png');
    const cmImg = await loadImage(cmUri);
    const cv = document.createElement('canvas');
    cv.width = cmImg.width; cv.height = cmImg.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(cmImg, 0, 0);
    ASSETS.colormap = { data: ctx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
    const cmTex = new THREE.Texture(cmImg);
    cmTex.encoding = THREE.sRGBEncoding; cmTex.flipY = false; cmTex.needsUpdate = true;
    cmTex.magFilter = THREE.NearestFilter;
    ASSETS.colormapTex = cmTex;

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/colormap\.png$/.test(url) ? cmUri : url));
    const loader = new THREE.GLTFLoader(manager);
    const parse = (buf) => new Promise((res, rej) => loader.parse(buf, '', res, rej));
    for (const [body, file] of Object.entries(BODY_MODELS)) {
      const b64 = window.BB_ASSETS['models/' + file + '.glb'];
      if (!b64) continue;
      const gltf = await parse(b64ToArrayBuffer(b64));
      ASSETS.cars[body] = makeCarTemplate(gltf.scene, body);
    }
    for (const t of ['grass_color', 'grass_normal']) {
      const uri = assetDataUri('textures/' + t + '.jpg');
      if (!uri) continue;
      const img = await loadImage(uri);
      const tex = new THREE.Texture(img);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      if (t === 'grass_color') {
        tex.encoding = THREE.sRGBEncoding;
        // per-channel average (linear) so the tile only adds variation, not a tint
        const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 64;
        const x2 = c2.getContext('2d'); x2.drawImage(img, 0, 0, 64, 64);
        const d = x2.getImageData(0, 0, 64, 64).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += Math.pow(d[i + k] / 255, 2.2);
        const n = d.length / 4;
        ASSETS.grassGain = new THREE.Vector3(n / sum[0], n / sum[1], n / sum[2]);
      }
      tex.needsUpdate = true;
      ASSETS.textures[t] = tex;
    }
    ASSETS.ready = true;
  } catch (e) {
    console.warn('Model assets failed to load, using built-in shapes', e);
  }
  return ASSETS;
}

// model space: +X right, +Y up, -Z forward  ->  car space: +X forward, +Y left, +Z up
const MODEL_TO_CAR = new THREE.Matrix4().set(
  0, 0, -1, 0,
  -1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 0, 1);

function sampleColormap(u, v) {
  const cm = ASSETS.colormap;
  const x = clamp(Math.floor(u * cm.w), 0, cm.w - 1);
  const y = clamp(Math.floor(v * cm.h), 0, cm.h - 1);
  const i = (y * cm.w + x) * 4;
  return [cm.data[i], cm.data[i + 1], cm.data[i + 2]];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

// Splits a body geometry into material groups: 0 = original texture, 1 = paint, 2 = accent
function splitPaint(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position, uv = g.attributes.uv;
  const tris = pos.count / 3;
  const hueArea = new Map();
  const info = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    const i = t * 3;
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3;
    const v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
    const [h, s, l] = rgbToHsl(...sampleColormap(u, v));
    const colorful = s > 0.35 && l > 0.2 && l < 0.85;
    const key = colorful ? Math.round(h * 12) % 12 : -1;
    info.push(key);
    if (key >= 0) hueArea.set(key, (hueArea.get(key) || 0) + area);
  }
  const ranked = [...hueArea.entries()].sort((x, y) => y[1] - x[1]);
  const paintKey = ranked.length ? ranked[0][0] : -2;
  const accentKey = ranked.length > 1 && ranked[1][1] > ranked[0][1] * 0.04 ? ranked[1][0] : -3;
  const cls = info.map(k => (k === paintKey ? 1 : k === accentKey ? 2 : 0));
  // reorder triangles by class and add groups
  const order = [0, 1, 2].flatMap(k => cls.map((cc, t) => (cc === k ? t : -1)).filter(t => t >= 0));
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const src = g.attributes[name];
    const arr = new src.array.constructor(src.array.length);
    const n = src.itemSize;
    order.forEach((t, j) => {
      for (let k = 0; k < 3 * n; k++) arr[j * 3 * n + k] = src.array[t * 3 * n + k];
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  let start = 0;
  for (let k = 0; k < 3; k++) {
    const cnt = cls.filter(cc => cc === k).length * 3;
    if (cnt) out.addGroup(start, cnt, k);
    start += cnt;
  }
  out.computeVertexNormals();
  return out;
}

function makeCarTemplate(root, body) {
  const hb = HITBOXES[body];
  root.updateMatrixWorld(true);
  const bodyGeos = [], wheelGeos = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    const name = (o.name || '').toLowerCase();
    if (name.startsWith('wheel')) {
      // keep wheel centered on its own axle, only reorient
      geo.applyMatrix4(MODEL_TO_CAR);
      const side = /l$/.test(name) ? 'left' : 'right';
      const front = /-f/.test(name);
      wheelGeos[(front ? 'f' : 'b') + side[0]] = geo;
    } else {
      geo.applyMatrix4(o.matrixWorld);
      geo.applyMatrix4(MODEL_TO_CAR);
      bodyGeos.push(geo);
    }
  });
  // fit the body to the hitbox: same length and width, top a hair above the hitbox top
  const box = new THREE.Box3();
  for (const g of bodyGeos) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const size = box.getSize(new THREE.Vector3());
  const zBottom = hb.oz - hb.h / 2 - 9, zTop = hb.oz + hb.h / 2 + 3;
  const sx = hb.l / size.x, sy = hb.w * 0.97 / size.y, sz = (zTop - zBottom) / size.z;
  const fit = new THREE.Matrix4().makeTranslation(hb.ox, 0, zBottom)
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z));
  const parts = bodyGeos.map(g => { g.applyMatrix4(fit); return splitPaint(g); });
  // wheel geometry normalized to radius 1 (tyre height) so it can be scaled per wheel
  for (const k of Object.keys(wheelGeos)) {
    const g = wheelGeos[k];
    g.computeBoundingBox();
    const r = (g.boundingBox.max.z - g.boundingBox.min.z) / 2;
    const cz = (g.boundingBox.max.z + g.boundingBox.min.z) / 2, cx = (g.boundingBox.max.x + g.boundingBox.min.x) / 2;
    g.translate(-cx, 0, -cz);
    g.scale(1 / r, 1 / r, 1 / r);
  }
  return { parts, wheels: wheelGeos, body };
}

// Builds a renderable car from a template. Returns null when assets aren't available.
function buildModelCar(cfg) {
  const tpl = ASSETS.cars[cfg.body];
  if (!ASSETS.ready || !tpl) return null;
  const hb = HITBOXES[cfg.body];
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ map: ASSETS.colormapTex, roughness: 0.55, metalness: 0.15 });
  const paintMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(cfg.primary || '#1e6bff'), metalness: 0.3, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(cfg.accent || '#ffffff'), metalness: 0.3, roughness: 0.35, clearcoat: 0.6 });
  for (const p of tpl.parts) {
    const m = new THREE.Mesh(p, [baseMat, paintMat, accentMat]);
    m.castShadow = true;
    group.add(m);
  }
  return { group, paintMat, accentMat, baseMat, wheelGeos: tpl.wheels, hb };
}
