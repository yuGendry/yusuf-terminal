/**
 * scripts/signcheck.mjs — is the writing on the wall actually facing the room?
 *
 * Every clue in this game that is not an interactable is a flat plane with a
 * canvas on it: a gauge, a works order, a cone chart, a notice, a stencilled
 * plate. Nothing checks them, because they are not registered with the
 * interaction system and the player never presses a key on them — they are
 * read by looking. So none of the existing harnesses can tell the difference
 * between a sign and a sign nailed up back to front.
 *
 * Chapter 2's kiln gauge was mounted with `rotation.y = -Math.PI / 2`, which
 * sends a plane's +Z normal to -X: it faced west, into three centimetres of
 * the kiln's own steel, and it was single-sided. The number the puzzle's whole
 * lesson turns on ("fire to the cone, never to the dial") could not be seen
 * from anywhere in the room. It shipped that way through four chapters of
 * checks because every check was asking a different question.
 *
 * This one asks: for each single-sided flat plane in the level, is the face
 * that carries the picture pointing at open space the player can occupy?
 *
 *   1. Cast along the normal from just in front of the plane. If something
 *      solid is within BURIED metres, the readable face is inside geometry.
 *   2. Cast along the *back* of the plane the same way. If the back is clear
 *      and the front is not, the sign is on backwards — the single most
 *      likely authoring mistake and the one worth naming explicitly.
 *   3. Find somewhere to stand in front of it, within reading distance, with
 *      floor under the feet and a clear line to the middle of the sign.
 *
 * Double-sided planes are skipped: they read from either face by definition.
 *
 * A plane tagged `lensOnly` is judged with that lens up: the colliders of
 * everything tagged `hiddenBy` the same lens are switched off for the
 * duration, because that is precisely the state the player reads it in. The
 * kiln's witness cones are supposed to be sealed inside a steel box; Ember is
 * what opens it.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAPTERS = (process.env.CHAPTERS || '1,2,3,4').split(',').map(Number);

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const url = new globalThis.URL(process.env.URL || 'http://localhost:5173/');
url.searchParams.set('nocine', '1');
await page.goto(url.toString(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.3);
});

let failures = 0;

for (const chapter of CHAPTERS) {
  await page.evaluate((n) => window.__stitchwork.startGame({ fresh: true, chapter: n }), chapter);
  await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });

  const report = await page.evaluate(async () => {
    const { collisionGroups, GROUP } = await import('/src/core/Physics.js');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const app = window.__stitchwork;
    const ph = app.game.physics;
    const WORLD_ONLY = collisionGroups(0xffff, GROUP.WORLD);

    const BURIED = 0.35;      // solid this close along the normal = entombed
    const READ_MAX = 3.2;     // no sign in this game is meant to be read further
    const EYE = 1.62;
    const HEADROOM = 1.7;

    const ray = (from, dir, far) => ph.raycast(from, dir, far, WORLD_ONLY);

    const floorUnder = (x, y, z) => {
      const hit = ray({ x, y: y + 2.4, z }, { x: 0, y: -1, z: 0 }, 7, WORLD_ONLY);
      return hit ? hit.point.y : null;
    };

    const blocked = (from, to) => {
      const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
      const dist = Math.hypot(d.x, d.y, d.z);
      if (dist < 1e-4) return false;
      d.x /= dist; d.y /= dist; d.z /= dist;
      return ray(from, d, Math.max(0.05, dist - 0.14)) !== null;
    };

    const out = [];
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    // Colliders that a given lens sees through, so a lens-gated sign is judged
    // in the world the player is actually looking at.
    const seeThrough = new Map();   // lens id -> [collider handle]
    app.game.level.scene.traverse((o) => {
      const hb = o.userData?.hiddenBy;
      const handle = o.userData?.physics;
      if (hb === undefined || handle === undefined) return;
      for (const lens of Array.isArray(hb) ? hb : [hb]) {
        if (!seeThrough.has(lens)) seeThrough.set(lens, []);
        seeThrough.get(lens).push(handle);
      }
    });
    let openLens = null;
    const setLens = (lens) => {
      if (lens === openLens) return;
      for (const h of seeThrough.get(openLens) ?? []) ph.setColliderEnabled(h, true);
      for (const h of seeThrough.get(lens) ?? []) ph.setColliderEnabled(h, false);
      openLens = lens;
      ph.refreshQueries?.();
    };

    const planes = [];
    app.game.level.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g?.type?.includes('Plane')) return;
      const m = o.material;
      if (!m || Array.isArray(m)) return;
      // Double-sided reads either way; that is the whole point of the flag.
      if (m.side === THREE.DoubleSide || m.side === THREE.BackSide) return;
      // Nothing to read on it.
      if (!m.map && !m.emissiveMap) return;
      // Lens-gated planes still have to face the room, so they are included;
      // only things the level itself has switched off are skipped.
      if (!o.visible && !o.userData?.lensOnly && !o.userData?.maskOnly) return;
      // Floors and ceilings: a plane lying flat is not signage.
      o.matrixWorld.decompose(pos, quat, scl);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
      if (Math.abs(n.y) > 0.8) return;

      const p = { x: pos.x, y: pos.y, z: pos.z };
      const label = `${o.name || m.map?.name || 'plane'} @ ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
      const lo = o.userData?.lensOnly;
      planes.push({ p, n: n.clone(), label, lens: Array.isArray(lo) ? lo[0] : (lo ?? null) });
    });

    // Group by lens so the collider toggling happens a handful of times rather
    // than once per sign.
    planes.sort((a, b) => String(a.lens).localeCompare(String(b.lens)));
    for (const { p, n, label, lens } of planes) {
      setLens(lens);

      const front = ray({ x: p.x + n.x * 0.04, y: p.y + n.y * 0.04, z: p.z + n.z * 0.04 },
        { x: n.x, y: n.y, z: n.z }, BURIED);
      const back = ray({ x: p.x - n.x * 0.04, y: p.y - n.y * 0.04, z: p.z - n.z * 0.04 },
        { x: -n.x, y: -n.y, z: -n.z }, BURIED);

      if (front && !back) { out.push({ label, why: 'mounted back to front — the picture faces into geometry, the blank side faces the room' }); continue; }
      if (front && back) { out.push({ label, why: 'sealed inside geometry on both faces' }); continue; }

      // Somewhere to stand and read it.
      let ok = false;
      for (const d of [0.7, 1.1, 1.6, 2.2, READ_MAX]) {
        for (const off of [0, 0.5, -0.5, 1.0, -1.0]) {
          // Slide along the sign's own plane so a reader can stand off-centre.
          const t = new THREE.Vector3(0, 1, 0).cross(n).normalize();
          const sx = p.x + n.x * d + t.x * off;
          const sz = p.z + n.z * d + t.z * off;
          const fy = floorUnder(sx, p.y, sz);
          if (fy === null) continue;
          const feet = { x: sx, y: fy + 0.1, z: sz };
          if (ray(feet, { x: 0, y: 1, z: 0 }, HEADROOM)) continue;
          const eye = { x: sx, y: fy + EYE, z: sz };
          if (Math.hypot(eye.x - p.x, eye.y - p.y, eye.z - p.z) > READ_MAX + 0.4) continue;
          if (blocked(eye, p)) continue;
          ok = true; break;
        }
        if (ok) break;
      }
      if (!ok) {
        out.push({
          label,
          why: lens
            ? `nowhere to stand within reading distance with a clear line to it (with the ${lens} lens up)`
            : 'nowhere to stand within reading distance with a clear line to it',
        });
      }
    }

    setLens(null);   // leave the world as it was found
    return out;
  });

  if (report.length === 0) {
    console.log(`ch${chapter}: every sign faces the room`);
  } else {
    failures += report.length;
    console.log(`ch${chapter}: ${report.length} unreadable`);
    for (const r of report) console.log(`   ${r.label}\n     ${r.why}`);
  }
}

await browser.close();
if (errors.length) console.log('page errors:', errors.slice(0, 6).join(' | '));
if (failures) { console.log(`\n${failures} unreadable sign(s)`); process.exit(1); }
console.log('\nsigncheck passed');
