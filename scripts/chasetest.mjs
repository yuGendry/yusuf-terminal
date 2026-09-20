/**
 * scripts/chasetest.mjs — exercises Mister Tangle.
 *
 * Verifies the rail AI actually moves along its graph toward the player,
 * changes state, and can catch. The rail constraint is the chapter's core
 * rule, so this checks he never leaves the network.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack ?? '').split('\n').slice(0,3).join('\n')}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });

await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 90000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.35);
});
await page.evaluate(() => window.__stitchwork.startGame({ fresh: true, chapter: 1 }));
await page.waitForFunction(() => window.__stitchwork.game?.player, null, { timeout: 120000 });

const advance = (s) => page.waitForFunction((sec) => {
  const e = window.__stitchwork.engine;
  window.__t0 ??= e.elapsed;
  if (e.elapsed - window.__t0 >= sec) { delete window.__t0; return true; }
  return false;
}, s, { timeout: 180000, polling: 50 });

// Put the player up on the catwalk and wake Tangle.
await page.evaluate(() => {
  const g = window.__stitchwork.game;
  const V = g.player.position.constructor;
  g.player.teleport(new V(-7, 8.0, -33), 0);
  g.level.tangle.spawnNear(new V(-7, 9.4, -33));
  g.level.tangle.awareness = 1;
  g.level.tangle.lastKnown.copy(g.player.position);
});
await advance(0.5);

const sample = () => page.evaluate(() => {
  const t = window.__stitchwork.game.level.tangle;
  const p = t.position;
  // How far off the rail network is he? Should always be ~0.
  const c = t.rails.closest(p);
  return {
    state: t.state,
    pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
    offRail: +c.distance.toFixed(4),
    edge: t.edge,
    t: +t.t.toFixed(2),
    speed: +t.speed.toFixed(2),
    awareness: +t.awareness.toFixed(2),
    reach: +t.reach.toFixed(2),
    playerDist: +p.distanceTo(window.__stitchwork.game.player.position).toFixed(2),
  };
});

console.log('t=0.5 ', JSON.stringify(await sample()));
for (const s of [1, 2, 3, 4, 6]) {
  await advance(1.5);
  console.log(`t=${String(s * 1.5 + 0.5).padEnd(5)}`, JSON.stringify(await sample()));
}

// Move the player to the far end and check he routes across the graph.
await page.evaluate(() => {
  const g = window.__stitchwork.game;
  const V = g.player.position.constructor;
  g.player.teleport(new V(7, 8.0, -20), 0);
  g.level.tangle.lastKnown.copy(g.player.position);
  g.level.tangle.awareness = 1;
});
for (const s of [1, 2, 3]) {
  await advance(2);
  console.log(`re-route ${s} `, JSON.stringify(await sample()));
}

// Does being caught actually fire?
const caught = await page.evaluate(async () => {
  const g = window.__stitchwork.game;
  let fired = false;
  g.level.tangle.once('caught', () => { fired = true; });
  const V = g.player.position.constructor;
  const tp = g.level.tangle.position;
  g.player.teleport(new V(tp.x, 7.2, tp.z), 0);
  g.level.tangle.setState('lunging');
  g.level.tangle.reach = 1;
  await new Promise((r) => setTimeout(r, 2500));
  return { fired, dead: g.dead };
});
console.log('catch test ', JSON.stringify(caught));

console.log('=== LOGS ===');
console.log(logs.slice(0, 10).join('\n') || '(none)');
await browser.close();
