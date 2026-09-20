/**
 * scripts/playtest.mjs — drives the game past the menu and exercises movement.
 *
 * Runs against a software renderer, which is roughly two orders of magnitude
 * slower than a GPU. Waiting on wall-clock time would therefore advance almost
 * no simulated time, so every step here waits on `engine.elapsed` instead and
 * the graphics preset is dropped to Low to buy frames. What is being tested is
 * the simulation, not the frame rate.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

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
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 60000 });

const hideUI = () => page.evaluate(() => {
  for (const id of ['ui-layer', 'game-layer', 'static-overlay']) document.getElementById(id).style.display = 'none';
});
const showUI = () => page.evaluate(() => {
  for (const id of ['ui-layer', 'game-layer']) document.getElementById(id).style.display = '';
});

await hideUI();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/02-menu-clean.png` });
await showUI();

// Low preset: the software renderer needs the frames more than the test needs
// ambient occlusion.
await page.evaluate(() => window.__stitchwork.engine && (window.Settings_applyLow = true));
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.4);
});

await page.evaluate(() => {
  [...document.querySelectorAll('#menu-buttons .sw-btn')]
    .find((b) => b.textContent.startsWith('New Game'))?.click();
});
await page.waitForFunction(() => window.__stitchwork?.player, null, { timeout: 60000 });

/** Wait until the engine's own clock has advanced `seconds` of simulated time. */
async function advance(seconds) {
  await page.waitForFunction(
    (s) => {
      const e = window.__stitchwork.engine;
      window.__t0 ??= e.elapsed;
      if (e.elapsed - window.__t0 >= s) { window.__t0 = null; delete window.__t0; return true; }
      return false;
    },
    seconds,
    { timeout: 120000, polling: 50 }
  );
}

const press = (codes) => page.evaluate((cs) => {
  const i = window.__stitchwork.input;
  i.enabled = true;
  for (const c of cs) { i.down.add(c); i._pressedCodes.add(c); }
}, codes);
const release = (codes) => page.evaluate((cs) => {
  const i = window.__stitchwork.input;
  for (const c of cs) { i.down.delete(c); i._releasedCodes.add(c); }
}, codes);

async function hold(codes, seconds) {
  await press(codes);
  await advance(seconds);
  await release(codes);
  await advance(0.2);
}

const put = (x, y, z, yaw) => page.evaluate(({ x, y, z, yaw }) => {
  const p = window.__stitchwork.player;
  p.teleport(new (window.__stitchwork.engine.camera.position.constructor)(x, y, z), yaw);
}, { x, y, z, yaw });

const sample = () => page.evaluate(() => {
  const p = window.__stitchwork.player;
  const c = p.character;
  return {
    pos: p.position.toArray().map((n) => +n.toFixed(2)),
    feet: +(p.position.y - c.halfHeight - c.radius).toFixed(3),
    speed: +p.moveSpeed.toFixed(2),
    grounded: p.grounded,
    stance: p.stance,
    stamina: +p.stamina.toFixed(2),
    noise: +p.noiseLevel.toFixed(2),
  };
});

const results = {};
const YAW = { posZ: Math.PI, negZ: 0, posX: -Math.PI / 2, negX: Math.PI / 2 };

// --- 1. walk ---------------------------------------------------------------
await put(0, 1.2, 9, YAW.posZ);
await advance(0.4);
results['1 spawn'] = await sample();
await hold(['KeyW'], 2);
results['2 walked 2s'] = await sample();

// --- 2. sprint -------------------------------------------------------------
await hold(['KeyW', 'ShiftLeft'], 2);
results['3 sprinted 2s'] = await sample();

// --- 3. wall collision -----------------------------------------------------
// Far wall spans z=14.8 (inner face); a 0.3m-radius capsule should stop at 14.5.
await put(0, 1.2, 13.0, YAW.posZ);
await advance(0.3);
await hold(['KeyW'], 4);
results['4 into wall'] = await sample();

// --- 4. stairs (auto-step, no jumping) -------------------------------------
// Stair run climbs to the 1.6m platform at x=-6.5, from z=-3.5 to z=-7.
await put(-6.5, 1.2, -0.6, YAW.negZ);
await advance(0.3);
await hold(['KeyW'], 2.2);
results['5 up stairs'] = await sample();

// --- 5. ramp ---------------------------------------------------------------
await put(-9.6, 1.2, 1.6, YAW.negZ);
await advance(0.3);
await hold(['KeyW'], 3.0);
results['6 up ramp'] = await sample();

// --- 6. crouch through the low vent ---------------------------------------
// The gap at x=4.5, z=6 is 1.1m high: standing must be refused inside it.
await put(4.5, 1.2, 8.6, YAW.negZ);
await advance(0.3);
await press(['ControlLeft']);
await advance(0.5);
results['7 crouched'] = await sample();
await hold(['KeyW'], 1.9);
results['8 in vent'] = await sample();
await release(['ControlLeft']);
await advance(1.0);
results['9 stand under vent'] = await sample();

await hideUI();
await advance(0.3);
await page.screenshot({ path: `${OUT}/03-play.png` });
await showUI();

const render = await page.evaluate(() => {
  const a = window.__stitchwork;
  return {
    frames: a.engine.frame,
    drawCalls: a.engine.renderer.info.render.calls,
    triangles: a.engine.renderer.info.render.triangles,
    glError: document.getElementById('viewport').getContext('webgl2').getError(),
  };
});

console.log('=== TRACE ===');
for (const [k, v] of Object.entries(results)) {
  console.log(
    `${k.padEnd(22)} pos=${JSON.stringify(v.pos).padEnd(24)} feet=${String(v.feet).padEnd(7)} ` +
    `spd=${String(v.speed).padEnd(5)} grnd=${String(v.grounded).padEnd(5)} ${v.stance.padEnd(6)} noise=${v.noise}`
  );
}
console.log('=== RENDER ===');
console.log(JSON.stringify(render));
console.log('=== LOGS ===');
console.log(logs.join('\n') || '(none)');

await browser.close();
