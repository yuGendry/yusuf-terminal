import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, instance, textureCompress, join, flatten, meshopt, quantize, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const S = process.env.S, OUT = '/home/user/yusuf-terminal/neoncoast/assets/';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const which = process.argv.slice(2);
const tex = (size, fmt='webp') => textureCompress({ encoder: sharp, targetFormat: fmt, resize: [size, size], quality: 80 });
async function save(doc, name, { mesh = true, q = true } = {}) {
  const steps = [prune(), dedup()];
  if (mesh) steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  await io.write(OUT + name, doc);
  console.log(name, (fs.statSync(OUT + name).size / 1e6).toFixed(2), 'MB');
}
function removeNode(n) { n.listChildren().forEach(removeNode); n.dispose(); }
function tris(doc){let t=0; for(const m of doc.getRoot().listMeshes()) for(const p of m.listPrimitives()){const i=p.getIndices(); t+=(i?i.getCount():p.getAttribute('POSITION').getCount())/3;} return t|0;}

if (which.includes('city')) {
  const doc = await io.read(S + '/glb/sf.glb');
  const junkMat = /^(Mat_Coin|Mat_Zone|Flash_01|MiniGrumete|MiniHomer|Trials_Atlas|Default_Material)/;
  for (const n of doc.getRoot().listNodes()) {
    if (n.isDisposed()) continue;
    if (/^(NetworkBounds|Zones|SpawnPoints|MiniZones|FirstSpawnPoint|Lighting|TrafficITS|TrafficManager|CollectablesAllZones)/.test(n.getName())) { removeNode(n); continue; }
    const m = n.getMesh();
    if (m) for (const p of m.listPrimitives()) if (junkMat.test(p.getMaterial()?.getName() || '')) p.dispose();
  }
  await doc.transform(prune(), dedup());
  // canonical material names (strip .001 suffixes) so dedup can merge
  for (const m of doc.getRoot().listMaterials()) { m.setName(m.getName().replace(/\.\d+$/, '')); }
  // merge materials with same name
  const keep = {};
  for (const m of doc.getRoot().listMaterials()) { const k = m.getName(); if (!keep[k]) keep[k] = m; }
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) { const m = p.getMaterial(); if (m) p.setMaterial(keep[m.getName()]); }
  for (const m of doc.getRoot().listMaterials()) {
    const n = m.getName();
    m.setAlphaMode(/Trees|Hedge|Island|Bridge_01$/.test(n) ? 'MASK' : 'OPAQUE'); m.setAlphaCutoff(0.5);
    m.setMetallicFactor(0); m.setRoughnessFactor(0.92);
  }
  // opaque materials: drop the (unused, all-zero) alpha channel so WebP keeps the colours
  for (const m of doc.getRoot().listMaterials()) {
    if (m.getAlphaMode() === 'MASK') continue;
    const t = m.getBaseColorTexture(); if (!t || t.getExtras().noAlpha) continue;
    t.setImage(await sharp(Buffer.from(t.getImage())).removeAlpha().png().toBuffer()).setMimeType('image/png'); t.setExtras({ noAlpha: true });
  }
  await doc.transform(prune(), flatten(), join({ keepNamed: false }), weld(), tex(1024));
  console.log('city tris', tris(doc));
  await save(doc, 'city.glb');
}

if (which.includes('cars')) {
  const doc = await io.read(S + '/glb/cars.glb');
  const r = doc.getRoot(); const T = S + '/raw/cars/textures/';
  const mkTex = (file) => { const t = doc.createTexture(file).setImage(fs.readFileSync(T + file)).setMimeType(file.endsWith('.jpg') ? 'image/jpeg' : 'image/png'); return t; };
  const bodyTex = { Compact: 'CompactBlue.png', Coupe: 'CoupeBlue.png', Hatchback: 'HatchbackYellow.png', minivan: 'MinivanRed.png', Offroad: 'OffroadGreen.png', Pickup: 'PickupGreen.png', Sedan: 'SedanYellow.png', Sport: 'SportRed.png', SUV: 'SUVBlack.png', Wagon: 'WagonBlue.png' };
  const opt = doc.createMaterial('optics').setBaseColorTexture(mkTex('lights.jpg')).setRoughnessFactor(0.3);
  const glass = doc.createMaterial('glass').setBaseColorFactor([0.05, 0.07, 0.09, 0.75]).setAlphaMode('BLEND').setRoughnessFactor(0.05).setMetallicFactor(0.2);
  const wheelMats = {};
  for (const n of r.listNodes()) {
    const nm = n.getName(); const m = n.getMesh();
    if (nm === 'Cylinder001' || nm === 'Object005') { n.dispose(); continue; }
    if (!m) continue;
    const bk = Object.keys(bodyTex).find(k => nm.startsWith(k + ' '));
    if (bk) {
      const body = doc.createMaterial('body_' + bk).setBaseColorTexture(mkTex(bodyTex[bk])).setRoughnessFactor(0.35).setMetallicFactor(0.3);
      for (const p of m.listPrimitives()) { const mn = p.getMaterial().getName(); p.setMaterial(mn === 'Body' ? body : mn === 'Glass' ? glass : opt); }
      n.setName('body:' + bk);
    } else if (/^Wheel_/.test(nm)) {
      const L = nm[6];
      const f = L === 'A' ? 'Wheel_A_Diffuse.png' : `wheel_${L}_Diffuse.png`;
      if (!wheelMats[L]) wheelMats[L] = doc.createMaterial('wheel_' + L).setBaseColorTexture(mkTex(fs.existsSync(T + f) ? f : 'wheel_1_Diffuse.png')).setRoughnessFactor(0.7);
      for (const p of m.listPrimitives()) p.setMaterial(wheelMats[L]);
      n.setName('wheel:' + L);
    }
  }
  await doc.transform(prune(), weld(), tex(512));
  console.log('cars tris', tris(doc));
  await save(doc, 'cars.glb');
}

if (which.includes('police')) {
  const THREE = await import('three'); const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const dir = S + '/raw/police/source/2011 Chevrolet Cruze Police/';
  const obj = new OBJLoader().parse(fs.readFileSync(dir + 'CruzePolice.obj', 'utf8'));
  const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene();
  const texs = { 'Material.001': 'Police_cruze.png', 'Material.002': 'Police_flare_red.png', 'Material.004': 'Police_flare.png' };
  const mats = {};
  obj.traverse(o => { if (!o.isMesh) return;
    const g = o.geometry; const ml = Array.isArray(o.material) ? o.material : [o.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    const mesh = doc.createMesh(o.name);
    for (const gr of groups) {
      const mn = ml[gr.materialIndex].name;
      if (!mats[mn]) { const t = texs[mn]; mats[mn] = doc.createMaterial(mn).setRoughnessFactor(0.4).setMetallicFactor(0.2);
        if (t) { mats[mn].setBaseColorTexture(doc.createTexture(t).setImage(fs.readFileSync(dir + t)).setMimeType('image/png')); if (mn !== 'Material.001') mats[mn].setAlphaMode('BLEND').setEmissiveFactor([1,1,1]).setEmissiveTexture(mats[mn].getBaseColorTexture()); } }
      const sl = (a, n) => a ? a.array.slice(gr.start * n, (gr.start + gr.count) * n) : null;
      const prim = doc.createPrimitive().setMaterial(mats[mn])
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(sl(g.attributes.position, 3)).setBuffer(buf));
      if (g.attributes.normal) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(sl(g.attributes.normal, 3)).setBuffer(buf));
      if (g.attributes.uv) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray((() => { const u = sl(g.attributes.uv, 2); for (let i = 1; i < u.length; i += 2) u[i] = 1 - u[i]; return u; })()).setBuffer(buf));
      mesh.addPrimitive(prim);
    }
    scene.addChild(doc.createNode(o.name).setMesh(mesh));
  });
  await doc.transform(weld(), tex(512, 'png'));
  console.log('police tris', tris(doc));
  await save(doc, 'police.glb');
}

if (which.includes('people')) {
  const doc = await io.read(S + '/glb/citizen.glb');
  await doc.transform(weld(), tex(512));
  for (const m of doc.getRoot().listMaterials()) { m.setMetallicFactor(0); m.setRoughnessFactor(0.85); m.setAlphaMode('OPAQUE'); }
  console.log('people tris', tris(doc));
  await save(doc, 'people.glb', { mesh: false });
}

async function usdScene(src, name, { ratio = 0.5, err = 0.01, texSize = 1024, drop } = {}) {
  const doc = await io.read(S + '/glb/' + src);
  if (drop) for (const n of doc.getRoot().listNodes()) if (drop.test(n.getName())) n.dispose();
  await doc.transform(prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: err }), instance({ min: 3 }), tex(texSize));
  // join remaining non-instanced nodes per material
  await doc.transform(flatten(), join({ keepNamed: false }));
  console.log(name, 'tris (unique)', tris(doc));
  await save(doc, name);
}
if (which.includes('island')) await usdScene('island_raw.glb', 'island.glb', { ratio: 0.6, err: 0.0005, texSize: 512 });
if (which.includes('pine')) await usdScene('pine_raw.glb', 'pine.glb', { ratio: 0.12, err: 0.02, texSize: 1024 });
if (which.includes('lake')) await usdScene('lake_raw.glb', 'lake.glb', { ratio: 0.25, err: 0.004, texSize: 1024 });
