/**
 * scripts/look.mjs — render the game from arbitrary vantage points.
 *
 *   CHAPTER=1 SHOTS="house:0,1.2,-16,0,-0.05" npm run look
 *
 * Each shot is name:x,y,z,yaw,pitch. Used to check how a room actually reads.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'screenshots';
const CHAPTER = Number(process.env.CHAPTER || 1);
const PRESET = process.env.PRESET || 'high';
const TORCH = process.env.TORCH !== '0';
mkdirSync(OUT, { recursive: true });

const shots = (process.env.SHOTS || 'house:0,1.2,-16,0,-0.05')
  .split(';')
  .map((s) => {
    const [name, nums] = s.split(':');
    const [x, y, z, yaw, pitch] = nums.split(',').map(Number);
    return { name, x, y, z, yaw, pitch: pitch || 0 };
  });

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

/**
 * Cutscenes off.
 *
 * Every harness below drives the game by clicking New Game and then waiting
 * on gameplay state. With cinematics on, that click is followed by a
 * forty-eight second drive and a nineteen second chapter opening before the
 * player exists — so a test that does not ask for them would spend its whole
 * budget watching them. `?nocine=1` skips them while still running every beat,
 * so the world state the test then inspects is exactly the one a player gets.
 */
const withFlags = (url) => {
  const u = new URL(url);
  u.searchParams.set('nocine', '1');
  return u.toString();
};

await page.goto(withFlags('http://localhost:5173/'), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 90000 });
await page.evaluate(async (p) => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset(p);
  Settings.set('resolutionScale', 0.6);
}, PRESET);

await page.evaluate((ch) => window.__stitchwork.startGame({ fresh: true, chapter: ch }), CHAPTER);
await page.waitForFunction(() => window.__stitchwork.game?.player, null, { timeout: 120000 });

for (const id of ['ui-layer', 'game-layer', 'static-overlay']) {
  await page.evaluate((i) => (document.getElementById(i).style.display = 'none'), id);
}
await page.evaluate((on) => {
  const g = window.__stitchwork.game;
  g.flashlight.give({ battery: 1 });
  g.flashlight.on = on;
}, TORCH);

const frames = (n) => page.waitForFunction((t) => {
  const e = window.__stitchwork.engine;
  window.__f0 ??= e.frame;
  if (e.frame - window.__f0 >= t) { delete window.__f0; return true; }
  return false;
}, n, { timeout: 180000, polling: 100 });

for (const s of shots) {
  await page.evaluate((v) => {
    const p = window.__stitchwork.game.player;
    const V = p.position.constructor;
    p.teleport(new V(v.x, v.y, v.z), v.yaw, { snapToFloor: false });
    p.pitch = v.pitch;
  }, s);
  await frames(18);
  const stats = await page.evaluate(() => {
    const r = window.__stitchwork.engine.renderer.info.render;
    return { calls: r.calls, tris: r.triangles };
  });
  await page.screenshot({ path: `${OUT}/look-ch${CHAPTER}-${s.name}.png` });
  console.log(`${s.name.padEnd(12)} calls=${stats.calls} tris=${stats.tris}`);
}

console.log('ERRORS:', errs.slice(0, 4).join(' | ') || '(none)');
await browser.close();
