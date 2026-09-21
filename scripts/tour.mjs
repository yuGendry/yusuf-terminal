/**
 * scripts/tour.mjs — photograph every room in a chapter from eye height.
 *
 * Used to review scale, lighting and texturing after a layout change. Each
 * stop is a player teleport rather than a free camera, so what comes back is
 * what the player would actually see standing there — including the head
 * height, the torch and the fog.
 *
 *   CHAPTER=2 node scripts/tour.mjs
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAPTER = Number(process.env.CHAPTER || 1);
const OUT = process.env.OUT || `screenshots/tour${CHAPTER}`;
mkdirSync(OUT, { recursive: true });

/** Stops per chapter: [name, [x, y, z], yaw, pitch]. */
const TOURS = {
  1: [
    ['lobby-in',     [0, 1.2, 12.0],   0,             -0.02],
    ['lobby-west',   [-6, 1.2, 3.0],   Math.PI / 2,    0.0],
    ['lobby-desk',   [6.0, 1.2, -2.0], -1.2,           0.02],
    ['bar',          [-20, 1.2, 3.0],  Math.PI / 2,    0.0],
    ['bar-counter',  [-26, 1.2, 1.0],  0,              0.02],
    ['cloakroom',    [-30, 1.2, -5.5], 0,              0.08],
    ['pegs',         [-30, 1.2, -7.6], 0,              0.14],
    ['pegs-close',   [-30, 1.2, -11.6], 0,             0.24],
    ['cellar',       [-37.5, 1.2, -9.0], Math.PI / 2,  0.02],
    ['house-rear',   [0, 1.2, -10.0],  0,              0.05],
    ['house-stage',  [0, 1.2, -28.0],  0,              0.12],
  ],
  2: [
    ['carving-in',   [0, 1.2, 5.0],    0,              0.04],
    ['carving-back', [0, 1.2, -5.0],   Math.PI,        0.04],
    ['corridor',     [5, 1.2, -10.0],  0,              0.02],
    ['paint-shop',   [0, 1.2, -21.0],  0,              0.06],
    ['kiln',         [-10, 1.2, -25.0], Math.PI / 2,   0.06],
    ['conveyor',     [-13, 1.2, -32.0], 0,             0.10],
  ],
  3: [
    ['hall',         [0, 1.2, 7.0],    0,              0.05],
    ['hall-back',    [0, 1.2, -6.0],   Math.PI,        0.05],
    ['storage',      [-4, -2.0, -14.0], 0,             0.04],
    ['storage-deep', [-4, -2.0, -28.0], Math.PI,       0.04],
    ['practice',     [20, -2.0, -15.0], 0,             0.05],
  ],
  4: [
    ['landing',      [0, 1.2, 11.0],    0,             0.04],
    ['pump-room',    [-14, 1.2, 5.0],   Math.PI / 2,   0.04],
    ['stair-head',   [6, 1.2, -4.8],    0,             0.22],
    ['hall',         [6, -3.8, -21.0],  0,             0.02],
    ['hall-west',    [12, -3.8, -32.0], Math.PI / 2,   0.05],
    ['cut-stair',    [-8, -3.8, -30.0], Math.PI,       0.16],
    ['lab',          [21, -3.8, -32.0], -Math.PI / 2,  0.04],
    ['gallery',      [-8, 0.4, -47.5],  Math.PI,       0.04],
    ['threadworks',  [-8, -0.8, -57.5], Math.PI,       0.02],
    ['loom',         [-8, -3.8, -64.0], Math.PI,       0.04],
    ['spool-wall',   [-8, -3.8, -80.0], Math.PI,       0.05],
    ['lift',         [-8, -3.8, -88.0], Math.PI,       0.04],
  ],
};

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const url = new URL(process.env.URL || 'http://localhost:5173/');
url.searchParams.set('nocine', '1');
await page.goto(url.toString(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });

await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('high');
  Settings.set('resolutionScale', 0.7);
});

await page.evaluate((n) => window.__stitchwork.startGame({ fresh: true, chapter: n }), CHAPTER);
await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });

for (const id of ['ui-layer', 'game-layer']) {
  await page.evaluate((i) => (document.getElementById(i).style.display = 'none'), id);
}

const frames = (n) => page.waitForFunction(
  (target) => {
    const e = window.__stitchwork.engine;
    window.__f0 ??= e.frame;
    if (e.frame - window.__f0 >= target) { delete window.__f0; return true; }
    return false;
  }, n, { timeout: 180000, polling: 100 });

let i = 0;
for (const [name, pos, yaw, pitch] of TOURS[CHAPTER] ?? []) {
  await page.evaluate(({ pos, yaw, pitch }) => {
    const a = window.__stitchwork;
    const V = a.engine.camera.position.constructor;
    a.player.teleport(new V(pos[0], pos[1], pos[2]), yaw);
    a.player.pitch = pitch;
    a.game.flashlight.on = true;
  }, { pos, yaw, pitch });
  await frames(14);
  await page.screenshot({ path: `${OUT}/${String(++i).padStart(2, '0')}-${name}.png` });
  console.log('  ', name);
}

console.log('render:', JSON.stringify(await page.evaluate(() => ({
  drawCalls: window.__stitchwork.engine.renderer.info.render.calls,
  triangles: window.__stitchwork.engine.renderer.info.render.triangles,
}))));
if (errors.length) console.log('errors:', errors.slice(0, 10).join(' | '));
await browser.close();
