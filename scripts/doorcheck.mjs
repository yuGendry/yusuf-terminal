/**
 * scripts/doorcheck.mjs — proves every doorway is actually passable.
 *
 * Three chapters shipped a door that unbolted onto a solid wall. Cutting an
 * opening in one room's wall says nothing about the room on the other side of
 * it, and nothing in the build catches the mismatch — the door mesh swings
 * perfectly, the collider is removed, and the player walks into plaster.
 *
 * So: unlock and open every door in the chapter, then fire a grid of rays
 * straight through each one — several heights, several lateral offsets — and
 * report any that are blocked. A doorway is passable only if a player-width
 * band through the middle of it is clear at head height.
 *
 *   CHAPTER=2 npm run doorcheck
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAPTERS = (process.env.CHAPTER ? [Number(process.env.CHAPTER)] : [1, 2, 3]);

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 90000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.3);
});

let failures = 0;

for (const ch of CHAPTERS) {
  await page.evaluate((c) => window.__stitchwork.startGame({ fresh: true, chapter: c }), ch);
  await page.waitForFunction(
    (c) => window.__stitchwork.game?.player && window.__stitchwork.game.chapterId === c,
    ch, { timeout: 120000 }
  );

  const report = await page.evaluate(async () => {
    const g = window.__stitchwork.game;
    const ph = g.physics;
    const doors = g.level.kit?.doors ?? [];

    // Open everything, so we are testing the doorway and not the leaf.
    for (const d of doors) { d.unlock(); d.open(); }
    await new Promise((r) => setTimeout(r, 300));

    const out = [];
    for (const d of doors) {
      const m = d.metrics;
      // The door's own facing: rotY 0 means the leaf lies in the XY plane, so
      // "through" is along Z. Rotate the probe direction with the door.
      const through = { x: -Math.sin(m.rotY), y: 0, z: -Math.cos(m.rotY) };
      const across = { x: Math.cos(m.rotY), y: 0, z: -Math.sin(m.rotY) };

      // Centre of the opening: the pivot sits at one edge, the leaf spans
      // half a width from it.
      const cx = m.x + across.x * (m.width / 2);
      const cz = m.z + across.z * (m.width / 2);

      const blocked = [];
      let tested = 0;
      // A player is 0.6m wide; probe the middle 0.6m of the opening only.
      for (const lateral of [-0.4, -0.2, 0, 0.2, 0.4]) {
        for (const h of [0.35, 0.95, 1.55]) {
          tested++;
          const ox = cx + across.x * lateral - through.x * 1.2;
          const oz = cz + across.z * lateral - through.z * 1.2;
          const hit = ph.raycast({ x: ox, y: m.y + h, z: oz }, through, 2.4);
          if (!hit) continue;
          // Only obstructions in the doorway itself matter; the far side of
          // the room beyond it is supposed to be solid.
          const offsetFromPlane = hit.distance - 1.2;
          if (Math.abs(offsetFromPlane) > 0.55) continue;
          blocked.push({
            lateral, h,
            d: +hit.distance.toFixed(2),
            at: +offsetFromPlane.toFixed(2),
            what: hit.collider?.userData?.surface ?? hit.collider?.userData?.door ?? '?',
            point: [+hit.point.x.toFixed(2), +hit.point.y.toFixed(2), +hit.point.z.toFixed(2)],
          });
        }
      }
      out.push({ name: m.name, tested, blocked });
    }
    return out;
  });

  console.log(`\n=== Chapter ${ch} ===`);
  for (const d of report) {
    if (d.blocked.length === 0) {
      console.log(`  PASS  ${d.name}`);
    } else {
      failures++;
      console.log(`  FAIL  ${d.name} — ${d.blocked.length}/${d.tested} probes blocked`);
      for (const b of d.blocked.slice(0, 4)) {
        console.log(`          lateral ${b.lateral}m h=${b.h}m -> ${b.at >= 0 ? '+' : ''}${b.at}m past the plane, "${b.what}" at ${JSON.stringify(b.point)}`);
      }
    }
  }
}

console.log(`\n${failures === 0 ? 'All doorways passable.' : `${failures} doorway(s) blocked.`}`);
if (errs.length) console.log('ERRORS:', errs.slice(0, 3).join(' | '));
await browser.close();
process.exit(failures ? 1 : 0);
