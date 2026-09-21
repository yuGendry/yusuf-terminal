/**
 * scripts/leakcheck.mjs — does a chapter take its collision with it?
 *
 * The Physics world is built once at boot and shared by every chapter, so
 * unloading a level does not remove its colliders — something has to do that
 * explicitly. Nothing did. Every chapter loaded after the first was therefore
 * standing inside the previous chapter's walls, invisibly: in Chapter 2 the
 * rack of carved hands sits where Chapter 1's lobby wall was, so the key
 * behind it could not be reached at all.
 *
 * It is invisible to every other check. The scene graph is correct, the
 * geometry is correct, the level is correct — only the physics world is wrong,
 * and only when more than one chapter has been played in a session, which is
 * exactly what a player does and exactly what a single-chapter test does not.
 *
 * This loads every chapter twice: once from a fresh world, and once after
 * every other chapter has been loaded and unloaded. If unloading works, the
 * collider count is identical both times.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAPTERS = (process.env.CHAPTERS || '1,2,3,4').split(',').map(Number);

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const url = new globalThis.URL(process.env.URL || 'http://localhost:5173/');
url.searchParams.set('nocine', '1');
await page.goto(url.toString(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.25);
});

const load = async (n) => {
  await page.evaluate((c) => window.__stitchwork.startGame({ fresh: true, chapter: c }), n);
  await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });
  return page.evaluate(() => ({
    colliders: window.__stitchwork.game.physics.world.colliders.len(),
    bodies: window.__stitchwork.game.physics.world.bodies.len(),
  }));
};

// Pass one: each chapter from a world that has only ever held that chapter's
// predecessors' *unloaded* content.
const first = {};
for (const n of CHAPTERS) {
  first[n] = await load(n);
  console.log(`  chapter ${n}: ${first[n].colliders} colliders, ${first[n].bodies} bodies`);
}

console.log('\n  — reloading each chapter after every other one —\n');

let failures = 0;
for (const n of CHAPTERS) {
  const again = await load(n);
  const drift = again.colliders - first[n].colliders;
  if (drift === 0) {
    console.log(`  PASS  chapter ${n}: ${again.colliders} colliders, unchanged`);
  } else {
    failures++;
    console.log(
      `  FAIL  chapter ${n}: ${again.colliders} colliders, ${drift > 0 ? '+' : ''}${drift} ` +
      `— the previous chapter's collision is still in the world`
    );
  }
}

await browser.close();
if (errors.length) console.log('\nerrors:', errors.slice(0, 6).join(' | '));
if (failures) {
  console.log('\nCollision is leaking between chapters.');
  process.exit(1);
}
console.log('\nNo collision leaks between chapters.');
