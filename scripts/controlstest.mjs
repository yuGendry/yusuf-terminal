/**
 * scripts/controlstest.mjs — every control, through the real event path.
 *
 * This dispatches genuine KeyboardEvents at the window, exactly as a browser
 * would. The earlier harness poked `input.down` directly, which bypassed the
 * keydown handler entirely — and so happily passed while crouch was completely
 * broken by a modifier-key guard in that handler. Test the seam you ship.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 90000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.35);
});
await page.evaluate(() => window.__stitchwork.startGame({ fresh: true, chapter: 1 }));
await page.waitForFunction(() => window.__stitchwork.game?.player, null, { timeout: 120000 });

/** Dispatch a real keydown/keyup at the window, with correct modifier flags. */
const key = (code, type) => page.evaluate(({ code, type }) => {
  const mods = {
    ControlLeft: 'ctrlKey', ControlRight: 'ctrlKey',
    ShiftLeft: 'shiftKey', ShiftRight: 'shiftKey',
    AltLeft: 'altKey', AltRight: 'altKey',
  };
  const init = { code, key: code, bubbles: true, cancelable: true };
  // A modifier's own keydown reports itself as held — the exact case that broke.
  if (type === 'keydown' && mods[code]) init[mods[code]] = true;
  window.dispatchEvent(new KeyboardEvent(type, init));
}, { code, type });

const advance = (s) => page.waitForFunction((sec) => {
  const e = window.__stitchwork.engine;
  window.__t0 ??= e.elapsed;
  if (e.elapsed - window.__t0 >= sec) { delete window.__t0; return true; }
  return false;
}, s, { timeout: 120000, polling: 40 });

const snap = () => page.evaluate(() => {
  const p = window.__stitchwork.game.player;
  const i = window.__stitchwork.input;
  return {
    pos: p.position.toArray().map((n) => +n.toFixed(2)),
    stance: p.stance,
    grounded: p.grounded,
    speed: +p.moveSpeed.toFixed(2),
    sprinting: p.sprinting,
    held: [...i.down],
  };
});

const reset = () => page.evaluate(() => {
  const g = window.__stitchwork.game;
  const V = g.player.position.constructor;
  g.player.teleport(new V(0, 1.2, 4), 0);
  window.__stitchwork.input.clearHeld();
});

const results = {};

// --- crouch (the regression) ----------------------------------------------
await reset(); await advance(0.4);
await key('ControlLeft', 'keydown');
await advance(0.6);
results['crouch (Ctrl held)'] = await snap();
await key('ControlLeft', 'keyup');
await advance(0.8);
results['stand (Ctrl up)'] = await snap();

// --- walk ------------------------------------------------------------------
await reset(); await advance(0.4);
const before = await snap();
await key('KeyW', 'keydown');
await advance(1.5);
const afterW = await snap();
await key('KeyW', 'keyup');
results['walk W'] = { moved: +Math.abs(afterW.pos[2] - before.pos[2]).toFixed(2), speed: afterW.speed };

// --- sprint ----------------------------------------------------------------
await reset(); await advance(0.4);
await key('KeyW', 'keydown');
await key('ShiftLeft', 'keydown');
await advance(1.5);
results['sprint W+Shift'] = await snap();
await key('KeyW', 'keyup'); await key('ShiftLeft', 'keyup');

// --- jump ------------------------------------------------------------------
await reset(); await advance(0.6);
const groundY = (await snap()).pos[1];
await key('Space', 'keydown');
await advance(0.28);
const apex = await snap();
await key('Space', 'keyup');
await advance(1.4);
const landed = await snap();
results['jump Space'] = {
  groundY, apexY: apex.pos[1], rose: +(apex.pos[1] - groundY).toFixed(2),
  landedY: landed.pos[1], backOnGround: landed.grounded,
};

// --- strafe ----------------------------------------------------------------
await reset(); await advance(0.4);
const b2 = await snap();
await key('KeyD', 'keydown');
await advance(1.2);
const a2 = await snap();
await key('KeyD', 'keyup');
results['strafe D'] = { movedX: +(a2.pos[0] - b2.pos[0]).toFixed(2) };

// --- mask / torch / hint ----------------------------------------------------
const actions = await page.evaluate(() => {
  const g = window.__stitchwork.game;
  g.mask.give(); g.mask.unlockLens('threadlight');
  g.flashlight.give({ battery: 1 });
  return true;
});
void actions;

await key('KeyF', 'keydown'); await advance(0.3); await key('KeyF', 'keyup');
await advance(0.3);
results['mask F'] = await page.evaluate(() => ({ worn: window.__stitchwork.game.mask.worn }));
await key('KeyF', 'keydown'); await advance(0.3); await key('KeyF', 'keyup'); await advance(0.3);
results['mask F again'] = await page.evaluate(() => ({ worn: window.__stitchwork.game.mask.worn }));

await key('KeyL', 'keydown'); await advance(0.3); await key('KeyL', 'keyup'); await advance(0.3);
results['torch L'] = await page.evaluate(() => ({ on: window.__stitchwork.game.flashlight.on }));

await key('KeyH', 'keydown'); await advance(0.3); await key('KeyH', 'keyup'); await advance(0.3);
results['hint H'] = await page.evaluate(() => ({
  shown: document.getElementById('hint-card')?.classList.contains('show'),
}));

console.log('=== CONTROLS ===');
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(22), JSON.stringify(v));
console.log('ERRORS:', errs.slice(0, 5).join(' | ') || '(none)');
await browser.close();
