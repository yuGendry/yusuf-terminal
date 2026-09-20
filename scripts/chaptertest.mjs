/**
 * scripts/chaptertest.mjs — drives a chapter end to end.
 *
 * Starts the chapter, then walks the puzzle chain by invoking the same
 * interactions a player would, checking each step actually changes state.
 * Software rendering means every wait is on simulated time, not wall clock.
 *
 *   CHAPTER=2 npm run chaptertest
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'screenshots';
const CHAPTER = Number(process.env.CHAPTER || 1);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));

await page.goto(process.env.URL || 'http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 90000 });

await page.evaluate((preset) => { window.__PRESET = preset; }, process.env.PRESET || 'low');
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset(window.__PRESET || 'low');
  Settings.set('resolutionScale', 0.5);
});

await page.evaluate((ch) => window.__stitchwork.startGame({ fresh: true, chapter: ch }), CHAPTER);
await page.waitForFunction(
  () => window.__stitchwork?.state === 'play' && window.__stitchwork.game?.player,
  null, { timeout: 120000 }
);

const snap = () => page.evaluate(() => {
  const a = window.__stitchwork;
  const g = a.game;
  return {
    chapter: g.chapterId,
    pos: g.player.position.toArray().map((n) => +n.toFixed(1)),
    feet: +(g.player.position.y - g.player.character.halfHeight - g.player.character.radius).toFixed(2),
    objective: a.hud.objective,
    solved: [...g.puzzles.puzzles.values()].filter((p) => p.solved).map((p) => p.id),
    maskOwned: g.mask.owned,
    lenses: [...g.mask.unlocked],
    torch: g.flashlight.owned,
    interactables: g.interaction.items.size,
    drawCalls: a.engine.renderer.info.render.calls,
    tris: a.engine.renderer.info.render.triangles,
  };
});

console.log('=== SPAWNED ===');
console.log(JSON.stringify(await snap(), null, 2));

/** Fire a registered interactable by matching its label text. */
const use = (needle) => page.evaluate((n) => {
  const it = window.__stitchwork.game.interaction;
  for (const [obj, desc] of it.items) {
    const label = typeof desc.label === 'function' ? desc.label() : desc.label;
    if (label && label.toLowerCase().includes(n.toLowerCase())) {
      const enabled = desc.enabled ? desc.enabled() : true;
      if (!enabled) return { ok: false, why: 'disabled', label };
      try { desc.onUse?.(desc); } catch (e) { return { ok: false, why: String(e) }; }
      return { ok: true, label };
    }
  }
  return { ok: false, why: 'not found' };
}, needle);

const closeReader = () => page.evaluate(() => window.__stitchwork.game.reader.close());
const advance = (s) => page.waitForFunction((sec) => {
  const e = window.__stitchwork.engine;
  window.__t0 ??= e.elapsed;
  if (e.elapsed - window.__t0 >= sec) { delete window.__t0; return true; }
  return false;
}, s, { timeout: 120000, polling: 50 });

const steps = CHAPTER === 1
  ? [
      ['reach through the bent bar', 'ticket grille'],
      ['take the torch', 'torch'],
      ['take the porcelain mask', 'mask'],
    ]
  : [
      ['open the lens case', 'ember lens'],
    ];

for (const [needle, name] of steps) {
  const r = await use(needle);
  await advance(0.5);
  await closeReader();
  await advance(0.4);
  console.log(`step ${name.padEnd(16)} ->`, JSON.stringify(r));
}

console.log('=== AFTER STEPS ===');
console.log(JSON.stringify(await snap(), null, 2));

// Put the mask on and confirm the lens genuinely changes what is visible.
const maskCheck = await page.evaluate(() => {
  const g = window.__stitchwork.game;
  if (!g.mask.owned) return { skipped: 'no mask' };
  const count = () => {
    let tagged = 0; let visible = 0;
    g.level.scene.traverse((o) => {
      if (o.userData?.lensOnly) { tagged++; if (o.visible) visible++; }
    });
    return { tagged, visible };
  };
  const before = count();
  g.mask.putOn();
  const worn = count();
  g.mask.takeOff();
  const after = count();
  return { lens: g.mask.lens, before, worn, after };
});
console.log('=== MASK VISIBILITY ===');
console.log(JSON.stringify(maskCheck));

for (const id of ['ui-layer', 'game-layer']) {
  await page.evaluate((i) => (document.getElementById(i).style.display = 'none'), id);
}
await advance(0.6);
await page.screenshot({ path: `${OUT}/ch${CHAPTER}-start.png` });

// With the torch lit, which is how the player will actually see these rooms.
await page.evaluate(() => {
  const g = window.__stitchwork.game;
  g.flashlight.give({ battery: 1 });
  g.flashlight.on = true;
});
await advance(1.0);
await page.screenshot({ path: `${OUT}/ch${CHAPTER}-torch.png` });

// And through the mask, to check the lens grade and the revealed geometry.
await page.evaluate(() => window.__stitchwork.game.mask.putOn());
await advance(1.0);
await page.screenshot({ path: `${OUT}/ch${CHAPTER}-mask.png` });
await page.evaluate(() => window.__stitchwork.game.mask.takeOff());

console.log('=== LOGS ===');
console.log(logs.slice(0, 16).join('\n') || '(none)');

await browser.close();
