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
const CHAPTERS = (process.env.CHAPTERS || '1,2,3').split(',').map(Number);

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
    const THREE = await import('/node_modules/three/build/three.module.js');
    const app = window.__stitchwork;
    const scene = app.game.level.scene;
    const items = [...app.game.interaction.items.values()];

    // Everything solid enough to stand on or be blocked by.
    const solids = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (o.userData?.lensOnly || o.userData?.maskOnly) return;
      const m = o.material;
      if (m?.transparent && (m.opacity ?? 1) < 0.55) return;
      solids.push(o);
    });

    const ray = new THREE.Raycaster();
    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    const size = new THREE.Vector3();

    const EYE = 1.62;          // standing eye height above the feet
    const HEADROOM = 1.75;     // a standing capsule needs this much clear
    const RING = [0.9, 1.4, 1.9, 2.4];
    const ANGLES = 16;

    /** Is anything solid between two points (ignoring the target itself)? */
    const blocked = (from, to, target) => {
      const dir = to.clone().sub(from);
      const dist = dir.length();
      if (dist < 1e-4) return false;
      ray.set(from, dir.normalize());
      ray.far = dist - 0.06;
      for (const hit of ray.intersectObjects(solids, false)) {
        // The target and its own children never block themselves.
        let o = hit.object;
        let own = false;
        while (o) { if (o === target) { own = true; break; } o = o.parent; }
        if (!own) return true;
      }
      return false;
    };

    /** Floor height under a point, or null. */
    const floorUnder = (p) => {
      ray.set(new THREE.Vector3(p.x, p.y + 2.2, p.z), new THREE.Vector3(0, -1, 0));
      ray.far = 6;
      const hit = ray.intersectObjects(solids, false)[0];
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

      // --- floating? -------------------------------------------------------
      // Look for support: floor below, or a surface within half a metre to
      // any side. A key hanging in the air a metre from its peg passes every
      // other check in the project and is still plainly broken.
      let supported = false;
      const probes = [
        [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0],
      ];
      for (const [dx, dy, dz] of probes) {
        ray.set(centre, new THREE.Vector3(dx, dy, dz));
        ray.far = Math.max(size.x, size.y, size.z) / 2 + 0.55;
        for (const hit of ray.intersectObjects(solids, false)) {
          let o = hit.object, own = false;
          while (o) { if (o === obj) { own = true; break; } o = o.parent; }
          if (!own) { supported = true; break; }
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

          const fy = floorUnder(new THREE.Vector3(px, centre.y, pz));
          if (fy === null) continue;
          // No standing on the object itself, or on something above head height.
          if (Math.abs(fy - centre.y) > 3.0) continue;

          const feet = new THREE.Vector3(px, fy + 0.05, pz);
          // Headroom for a standing capsule.
          ray.set(feet, new THREE.Vector3(0, 1, 0));
          ray.far = HEADROOM;
          if (ray.intersectObjects(solids, false).length) continue;

          const eye = new THREE.Vector3(px, fy + EYE, pz);
          if (eye.distanceTo(centre) > reach) continue;
          if (blocked(eye, centre, obj)) continue;

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
