/** Counts what the menu scene actually contains, to find draw-call sources. */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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
await page.waitForTimeout(8000);
console.log(JSON.stringify(await page.evaluate(() => {
  const app = window.__stitchwork;
  const scene = app.engine.scene;
  let meshes = 0, instanced = 0, points = 0, lines = 0, casters = 0;
  const lights = [];
  scene.traverse((o) => {
    if (o.isInstancedMesh) instanced++;
    else if (o.isMesh) meshes++;
    if (o.isPoints) points++;
    if (o.isLine) lines++;
    if (o.isMesh && o.castShadow) casters++;
    if (o.isLight) lights.push({ type: o.type, shadow: !!o.castShadow, intensity: +o.intensity.toFixed(2) });
  });
  return {
    meshes, instanced, points, lines, casters,
    shadowLights: lights.filter((l) => l.shadow),
    totalLights: lights.length,
    render: app.engine.renderer.info.render,
    memory: app.engine.renderer.info.memory,
  };
}), null, 2));
await browser.close();
