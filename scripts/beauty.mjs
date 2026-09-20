/**
 * scripts/beauty.mjs — render a few framed shots at a chosen quality preset.
 *
 * Used to eyeball the lighting and the post-processing chain. Software
 * rendering makes this slow, so it waits on rendered frames rather than on a
 * timer and keeps the resolution modest.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'screenshots';
const PRESET = process.env.PRESET || 'high';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });

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

await page.goto(withFlags(process.env.URL || 'http://localhost:5173/'), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 90000 });

await page.evaluate(async (preset) => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset(preset);
  Settings.set('resolutionScale', 0.75);
}, PRESET);

for (const id of ['ui-layer', 'game-layer', 'static-overlay']) {
  await page.evaluate((i) => (document.getElementById(i).style.display = 'none'), id);
}

/** Wait for n more rendered frames. */
const frames = (n) => page.waitForFunction(
  (target) => {
    const e = window.__stitchwork.engine;
    window.__f0 ??= e.frame;
    if (e.frame - window.__f0 >= target) { delete window.__f0; return true; }
    return false;
  }, n, { timeout: 180000, polling: 100 });

await frames(25);
await page.screenshot({ path: `${OUT}/10-menu-${PRESET}.png` });

// Into the proving ground.
await page.evaluate(() => (document.getElementById('ui-layer').style.display = ''));
await page.evaluate(() => {
  [...document.querySelectorAll('#menu-buttons .sw-btn')].find((b) => b.textContent.startsWith('New Game'))?.click();
});
await page.waitForFunction(() => window.__stitchwork?.player, null, { timeout: 90000 });
for (const id of ['ui-layer', 'game-layer']) {
  await page.evaluate((i) => (document.getElementById(i).style.display = 'none'), id);
}

const shots = [
  ['11-room', [1.5, 1.2, 7.5], -2.6, -0.06],
  ['12-platform', [-2.0, 1.2, 1.0], -1.05, -0.05],
  ['13-puppet', [-6.0, 2.35, -12.6], Math.PI + 0.35, -0.06],
];

for (const [name, pos, yaw, pitch] of shots) {
  await page.evaluate(({ pos, yaw, pitch }) => {
    const p = window.__stitchwork.player;
    const V = window.__stitchwork.engine.camera.position.constructor;
    p.teleport(new V(pos[0], pos[1], pos[2]), yaw);
    p.pitch = pitch;
  }, { pos, yaw, pitch });
  await frames(20);
  await page.screenshot({ path: `${OUT}/${name}-${PRESET}.png` });
}

console.log('render:', JSON.stringify(await page.evaluate(() => {
  const a = window.__stitchwork;
  return {
    preset: 'see env',
    frames: a.engine.frame,
    drawCalls: a.engine.renderer.info.render.calls,
    triangles: a.engine.renderer.info.render.triangles,
    programs: a.engine.renderer.info.programs?.length,
    glError: document.getElementById('viewport').getContext('webgl2').getError(),
  };
})));
console.log('logs:', logs.join('\n') || '(none)');
await browser.close();
