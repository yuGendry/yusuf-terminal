/**
 * scripts/reachcheck.mjs — can the player actually get to everything?
 *
 * This checks the class of bug that has repeatedly made a chapter
 * unfinishable and that nothing else catches: an interactable that is
 * registered, lit, labelled and completely unusable because it is three metres
 * behind a wall, a centimetre inside one, or floating in mid-air where a rack
 * used to be.
 *
 * The existing harnesses all miss it by construction. They invoke
 * interactions by label — `use('Take the torch')` — which works perfectly on
 * an object walled into the masonry, because calling onUse never involves
 * standing anywhere or looking at anything.
 *
 * So this one stands where a player would stand. For every registered
 * interactable it samples positions on a ring around the object at floor
 * level, and for each candidate asks the three questions the real interaction
 * code asks:
 *
 *   1. Is there floor there, and room for a standing capsule?
 *   2. Is the object within its own declared reach of the player's eye?
 *   3. Is the line from that eye to the object unobstructed?
 *
 * If no sampled position answers yes to all three, the object is unreachable
 * and the run fails.
 *
 * It also reports geometry that is floating — nothing within half a metre
 * below or beside it — because a key hanging in mid-air a metre from its peg
 * is technically reachable and still obviously broken.
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
    const items = [...app.game.interaction.items.values()];

    // Everything here is asked of the *physics* world rather than of the scene
    // graph, because that is what the game asks. Interaction._hasClearPath
    // raycasts against GROUP.WORLD colliders, so a mesh with no collider —
    // water, a glow, a floating plank, a lens-only marker — cannot block an
    // interaction and must not be treated as blocking one here either. A
    // scene-graph raycast reported the water surface as an occluder and
    // condemned every object standing under it.
    const WORLD_ONLY = collisionGroups(0xffff, GROUP.WORLD);

    // Support is a *visual* question, not a physics one, and so it is asked of
    // the scene graph. Plenty of things in the game are legitimately rested on
    // props that have no collider — a note on a gramophone cabinet, a stub on
    // a shelf — and those look and read as supported. Only something with
    // nothing under it at all is a bug.
    const solids = [];
    app.game.level.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (o.userData?.lensOnly || o.userData?.maskOnly) return;
      const m = o.material;
      // Water, glass and glows are see-through: they hold nothing up.
      if (m?.transmission > 0.25) return;
      if (m?.transparent && (m.opacity ?? 1) < 0.9) return;
      if (m?.blending && m.blending !== 1) return;   // additive / multiply
      solids.push(o);
    });
    const vray = new THREE.Raycaster();

    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    const size = new THREE.Vector3();

    const EYE = 1.62;          // standing eye height above the feet
    const HEADROOM = 1.7;      // a standing capsule needs this much clear
    const RING = [0.9, 1.4, 1.9, 2.4];
    const ANGLES = 16;

    /** Is anything solid between two points? Stops short, as the game does. */
    const blocked = (from, to) => {
      const dir = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
      const dist = Math.hypot(dir.x, dir.y, dir.z);
      if (dist < 1e-4) return false;
      dir.x /= dist; dir.y /= dist; dir.z /= dist;
      return ph.raycast(from, dir, Math.max(0.05, dist - 0.14), WORLD_ONLY) !== null;
    };

    /** Floor height under a point, or null. */
    const floorUnder = (p) => {
      const hit = ph.raycast({ x: p.x, y: p.y + 2.4, z: p.z }, { x: 0, y: -1, z: 0 }, 7, WORLD_ONLY);
      return hit ? hit.point.y : null;
    };

    const out = [];

    for (const item of items) {
      const obj = item.object;
      if (!obj) continue;

      box.setFromObject(obj);
      if (!isFinite(box.min.x)) continue;
      box.getCenter(centre);
      box.getSize(size);

      const reach = item.reach ?? 2.6;
      const label = typeof item.label === 'function'
        ? (() => { try { return item.label(); } catch { return '(dynamic)'; } })()
        : (item.label ?? '(unlabelled)');

      // --- supported? ------------------------------------------------------
      // Something under, beside or above it. Sampled across the footprint
      // rather than from the centre alone, because an object resting on the
      // very edge of a table misses a single downward ray and is reported as
      // floating when it is merely badly placed.
      const span = Math.max(size.x, size.y, size.z) / 2 + 0.55;
      const inset = 0.32;
      const probes = [];
      for (const [ox, oz] of [[0, 0], [-inset, -inset], [inset, -inset], [-inset, inset], [inset, inset]]) {
        probes.push({
          from: new THREE.Vector3(centre.x + size.x * ox, centre.y, centre.z + size.z * oz),
          dir: new THREE.Vector3(0, -1, 0),
        });
      }
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        probes.push({ from: centre.clone(), dir: new THREE.Vector3(...d) });
      }

      let supported = false;
      for (const probe of probes) {
        vray.set(probe.from, probe.dir);
        vray.far = span;
        for (const hit of vray.intersectObjects(solids, false)) {
          let o = hit.object;
          let own = false;
          while (o) { if (o === obj) { own = true; break; } o = o.parent; }
          if (own) continue;
          supported = true;
          break;
        }
        if (supported) break;
      }

      // --- reachable? ------------------------------------------------------
      let stand = null;
      search:
      for (const r of RING) {
        for (let i = 0; i < ANGLES; i++) {
          const a = (i / ANGLES) * Math.PI * 2;
          const px = centre.x + Math.cos(a) * r;
          const pz = centre.z + Math.sin(a) * r;

          const fy = floorUnder({ x: px, y: centre.y, z: pz });
          if (fy === null) continue;
          // No standing on the object itself, or on a floor far from its level.
          if (Math.abs(fy - centre.y) > 3.0) continue;

          const feet = { x: px, y: fy + 0.08, z: pz };
          if (ph.raycast(feet, { x: 0, y: 1, z: 0 }, HEADROOM, WORLD_ONLY)) continue;

          const eye = { x: px, y: fy + EYE, z: pz };
          const d = Math.hypot(eye.x - centre.x, eye.y - centre.y, eye.z - centre.z);
          if (d > reach) continue;
          if (blocked(eye, centre)) continue;

          stand = [+px.toFixed(2), +fy.toFixed(2), +pz.toFixed(2)];
          break search;
        }
      }

      out.push({
        label,
        at: [+centre.x.toFixed(2), +centre.y.toFixed(2), +centre.z.toFixed(2)],
        reach,
        reachable: !!stand,
        stand,
        supported,
      });
    }
    return out;
  });

  console.log(`\n=== Chapter ${chapter} — ${report.length} interactables ===`);
  for (const r of report) {
    const bad = !r.reachable || !r.supported;
    if (!bad) continue;
    failures++;
    const why = [
      !r.reachable ? 'UNREACHABLE (no standing position with a clear line within reach)' : null,
      !r.supported ? 'FLOATING (nothing supporting it within 0.55m)' : null,
    ].filter(Boolean).join(' + ');
    console.log(`  FAIL  ${r.label}`);
    console.log(`        at ${JSON.stringify(r.at)}  reach ${r.reach}  — ${why}`);
  }
  const ok = report.filter((r) => r.reachable && r.supported).length;
  console.log(`  ${ok}/${report.length} reachable and supported`);
}

await browser.close();

if (errors.length) console.log('\nerrors:', errors.slice(0, 8).join(' | '));
if (failures) {
  console.log(`\n${failures} interactable(s) a player could not use.`);
  process.exit(1);
}
console.log('\nEverything registered is reachable.');
