// Detailed car, ball and stadium models (converted from the FBX/USDZ files in assets/rl).
// They replace the toy-car bodies where present: Octane, Dominus and Fennec, the ball and the
// stadium ring around the arena. Everything degrades to the built-in models when absent.
'use strict';

const RL_CARS = { octane: 'rl_octane', dominus: 'rl_dominus', fennec: 'rl_fennec' };
const RL_YUP = new THREE.Matrix4().makeRotationX(Math.PI / 2); // glTF Y-up -> our Z-up

async function loadRLAssets(parse) {
  const get = async (name) => {
    const b64 = window.BB_ASSETS && window.BB_ASSETS['models/' + name + '.glb'];
    if (!b64) return null;
    try { return (await parse(b64ToArrayBuffer(b64))).scene; } catch (e) { console.warn('model', name, e); return null; }
  };
  for (const [body, file] of Object.entries(RL_CARS)) {
    const scene = await get(file);
    if (scene) ASSETS.cars[body] = makeRLCarTemplate(scene, body);
  }
  ASSETS.rlBall = await get('rl_ball');
  ASSETS.rlStadium = await get('rl_stadium');
}

// Which wheel a mesh belongs to, from its own or a parent's name ("Dieci_-_FL_(Octane)")
function rlWheelKey(o) {
  for (let p = o; p; p = p.parent) {
    const m = (p.name || '').match(/(?:^|[^A-Za-z])([FB])([LR])(?:[^A-Za-z]|$)/);
    if (m) return m[1].toLowerCase() + m[2].toLowerCase();
  }
  return null;
}

function makeRLCarTemplate(root, body) {
  root.updateMatrixWorld(true);
  const bodyParts = [], wheelParts = { fl: [], fr: [], bl: [], br: [] };
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    geo.applyMatrix4(RL_YUP);
    const part = { geo, name: o.material.name || '', map: o.material.map || null };
    const wk = rlWheelKey(o);
    if (wk) wheelParts[wk].push(part); else bodyParts.push(part);
  });
  // wheel centers and radii in model space
  const wheelInfo = {};
  for (const [k, parts] of Object.entries(wheelParts)) {
    const box = new THREE.Box3();
    for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    wheelInfo[k] = { c: box.getCenter(new THREE.Vector3()), r: (box.max.z - box.min.z) / 2 };
  }
  // scale so the wheelbase matches our wheel layout, and sit the wheels on the resting hubs
  const lay = WHEEL_LAYOUT(HITBOXES[body]);
  const front = wheelInfo.fl.c.clone().add(wheelInfo.fr.c).multiplyScalar(0.5);
  const rear = wheelInfo.bl.c.clone().add(wheelInfo.br.c).multiplyScalar(0.5);
  const s = (lay[0].x - lay[2].x) / Math.max(1, front.x - rear.x);
  const restZ = HUB_Z - (PHYS.SUSP_LEN - 1.5 - lay[0].r); // front hub height at rest
  const fit = new THREE.Matrix4().makeTranslation(lay[0].x - s * front.x, -s * (front.y + rear.y) / 2, restZ - s * front.z)
    .multiply(new THREE.Matrix4().makeScale(s, s, s));
  for (const p of bodyParts) p.geo.applyMatrix4(fit);
  // wheels: centered on their own axle, radius 1, so each can be scaled to its physics radius
  const wheels = {};
  for (const [k, parts] of Object.entries(wheelParts)) {
    const { c, r } = wheelInfo[k];
    for (const p of parts) { p.geo.translate(-c.x, -c.y, -c.z); p.geo.scale(1 / r, 1 / r, 1 / r); }
    wheels[k] = parts;
  }
  return { rl: true, parts: bodyParts, wheels, body };
}

// Paint mask shader: the body texture is a mask (white = primary paint, grey = accent)
function rlBodyMaterial(primary, accent, mask) {
  const mat = new THREE.MeshPhysicalMaterial({ color: primary, map: mask, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const acc = new THREE.Color(accent);
  mat.userData.accent = acc;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAccent = { value: acc };
    sh.fragmentShader = 'uniform vec3 uAccent;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n  float pm = smoothstep(0.25, 0.65, texture2D(map, vUv).g);\n  diffuseColor.rgb = mix(uAccent, diffuseColor.rgb, pm);\n#endif');
  };
  mat.customProgramCacheKey = () => 'rlBodyMask';
  return mat;
}

function buildRLCar(tpl, cfg) {
  const group = new THREE.Group();
  const primary = new THREE.Color(cfg.primary || '#1e6bff'), accent = new THREE.Color(cfg.accent || '#ffffff');
  const paintMat = new THREE.MeshPhysicalMaterial({ color: primary, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.3, roughness: 0.35, clearcoat: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c131c, metalness: 0.6, roughness: 0.05, clearcoat: 1 });
  const lights = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d6, emissiveIntensity: 2.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92 });
  const wheelColor = new THREE.Color(cfg.wheelColor || '#c9ced8');
  const cache = new Map();
  const matFor = (name, map) => {
    const key = name + '|' + (map ? map.uuid : '');
    if (cache.has(key)) return cache.get(key);
    let m;
    if (/window|glass/i.test(name)) m = glass;
    else if (/headlight|light/i.test(name)) m = lights;
    else if (/tread|tire|tyre/i.test(name)) m = rubber;
    else if (/paint/i.test(name)) m = paintMat;
    else if (/body/i.test(name)) m = map ? rlBodyMaterial(primary, accent, map) : paintMat;
    else if (/rim|cristiano/i.test(name)) {
      m = map ? new THREE.MeshStandardMaterial({ map, metalness: 0.7, roughness: 0.3 })
        : new THREE.MeshStandardMaterial({ color: wheelColor, metalness: 0.85, roughness: 0.25 });
      if (map && cfg.wheelColor) m.color = wheelColor.clone().lerp(new THREE.Color(1, 1, 1), 0.5);
    } else if (map) m = new THREE.MeshStandardMaterial({ map, metalness: 0.35, roughness: 0.55 });
    else m = new THREE.MeshStandardMaterial({ color: 0x24272e, metalness: 0.4, roughness: 0.5 });
    cache.set(key, m);
    return m;
  };
  for (const p of tpl.parts) {
    const mesh = new THREE.Mesh(p.geo, matFor(p.name, p.map));
    mesh.castShadow = true;
    group.add(mesh);
  }
  const wheelMeshes = {};
  for (const [k, parts] of Object.entries(tpl.wheels)) wheelMeshes[k] = parts.map(p => ({ geo: p.geo, mat: matFor(p.name, p.map) }));
  return { group, paintMat, accentMat, baseMat: paintMat, wheelGeos: {}, rlWheels: wheelMeshes, hb: HITBOXES[cfg.body] };
}

// Ball: the model fitted to the physics radius, centered
function buildRLBall() {
  const src = ASSETS.rlBall;
  if (!src) return null;
  const g = src.clone(true);
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = new THREE.MeshStandardMaterial({ map: o.material.map, color: 0xffffff, metalness: 0.25, roughness: 0.45 });
  });
  const up = new THREE.Group();
  up.quaternion.setFromRotationMatrix(RL_YUP);
  up.add(g);
  up.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(up);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = (PHYS.BALL_R * 2) / Math.max(size.x, size.y, size.z);
  up.scale.setScalar(k);
  up.position.copy(c).multiplyScalar(-k);
  const holder = new THREE.Group();
  holder.add(up);
  return holder;
}

// Stadium ring around our arena. The model's own pitch and glass dome are hidden: the arena
// (and its physics) stays ours. Its field enclosure is 556 x 368 model units, so x22 matches
// our 12000 x 8192 arena including the goals; the long axis is turned onto our y.
const RL_STADIUM_PALETTE = {
  play_ring02: { color: 0x283247, seats: true },
  playarea_Boundary: { color: 0x161b26 },
  nuke_bottomframe: { color: 0x6b7488, metalness: 0.6, roughness: 0.4 },
  entry_GlowHolder: { color: 0x8d99b0, metalness: 0.5, roughness: 0.45 },
  fut_secondary: { color: 0x39435a },
  Side: { color: 0x262e40 },
  split: { color: 0x4a556c, metalness: 0.4 },
  lambert1_002: { color: 0x353c4a },
  shield_main: { color: 0xc9a24a, metalness: 0.85, roughness: 0.28 },
  shield_octaneBody: { color: 0xd8dde8, metalness: 0.8, roughness: 0.25 },
  rl_curve2: { color: 0xe4e9f2, roughness: 0.5 },
  rl_curve2_glow: { color: 0x3d8bff, glow: 2.2 },
  glow: { color: 0xff7a1a, glow: 2.2 },
  orangeGlow_001: { color: 0xff7a1a, glow: 2.2 },
  win_glow2: { color: 0xff7a1a, glow: 2.2 },
  blue_Glow: { color: 0x3d8bff, glow: 2.2 },
  win_glow1: { color: 0x3d8bff, glow: 2.2 },
  lightRank04: { color: 0xffffff, glow: 1.6 },
  lightRank01: { color: 0x0b0e14, roughness: 1 },
  play_lambert1: { hide: true }, play_Glassdome1: { hide: true }, playOuter1: { hide: true },
};

function dressRLStadium(group) {
  const src = ASSETS.rlStadium;
  const root = src.clone(true);
  const boardTex = billboardTexture();
  const S = 22;
  root.scale.setScalar(S);
  root.rotation.z = Math.PI / 2;
  root.position.z = -3 * S - 12; // model field level (~3 units up) onto our floor, a hair below it
  root.traverse(o => {
    if (!o.isMesh) return;
    const name = o.material.name || '';
    o.userData.rlName = name;
    const pal = RL_STADIUM_PALETTE[name] || {};
    if (pal.hide) { o.visible = false; return; }
    if (/^blueBanner_[3-6]$/.test(name)) { // single-panel screens show the live score
      o.material = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false, side: THREE.DoubleSide });
      return;
    }
    if (o.material.map) { // banners keep their artwork, lit like screens
      o.material = new THREE.MeshStandardMaterial({ map: o.material.map, emissive: 0xffffff, emissiveMap: o.material.map, emissiveIntensity: 0.6, roughness: 0.6, side: THREE.DoubleSide });
      return;
    }
    const m = new THREE.MeshStandardMaterial({ color: pal.color !== undefined ? pal.color : 0x3a4252, metalness: pal.metalness || 0.15, roughness: pal.roughness || 0.75, side: THREE.DoubleSide });
    if (pal.glow) { m.emissive = new THREE.Color(pal.color); m.emissiveIntensity = pal.glow; }
    if (pal.seats) {
      // fans' sides: seats go blue on our half, orange on theirs (model x is our y)
      const pos = o.geometry.attributes.position, cols = new Float32Array(pos.count * 3);
      const blue = new THREE.Color(0x2a4fb0), orange = new THREE.Color(0xb35a1c), mid = new THREE.Color(0x5d6578), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.clamp(pos.getX(i) / 300, -1, 1);
        c.copy(mid).lerp(t < 0 ? blue : orange, Math.min(1, Math.abs(t) * 1.6));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      o.geometry = o.geometry.clone();
      o.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      m.vertexColors = true; m.color.set(0xffffff);
    }
    o.geometry.computeVertexNormals();
    o.material = m;
    o.castShadow = false; o.receiveShadow = false;
  });
  group.add(root);

  return { crowd: [], cheer() {}, board: drawBoard };
}
