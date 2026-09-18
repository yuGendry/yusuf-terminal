/** Counts what the menu scene actually contains, to find draw-call sources. */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.URL || 'http://localhost:5173/', { waitUntil: 'load' });
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
