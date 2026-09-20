/**
 * scripts/smoke.mjs — headless launch check.
 *
 * Loads the game in Chromium (SwiftShader), waits for boot, and reports engine
 * state, frame stats and every console/page error. Catches the class of bug a
 * build cannot: shader compile failures, WebGL state errors, and anything that
 * throws at runtime.
 *
 *   npm run dev            # in one terminal
 *   npm run smoke          # in another
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';

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
  const u = new globalThis.URL(url);
  u.searchParams.set('nocine', '1');
  return u.toString();
};


const URL = withFlags(process.env.URL || 'http://localhost:5173/');
const OUT = process.env.OUT || 'screenshots';
const HOLD = Number(process.env.HOLD || 9000);

mkdirSync(OUT, { recursive: true });

// The container ships a Chromium build that may not match the version this
// Playwright release expects, so point at it explicitly when it is present.
const EXECUTABLE = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });

await page.goto(withFlags(URL), { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(HOLD);

const state = await page.evaluate(() => {
  const app = window.__stitchwork;
  const canvas = document.getElementById('viewport');
  const gl = canvas?.getContext('webgl2');
  return {
    state: app?.state ?? 'none',
    bootGone: document.getElementById('boot')?.classList.contains('gone'),
    bootFailed: document.getElementById('boot')?.classList.contains('failed'),
    bootStatus: document.getElementById('boot-status')?.textContent,
    menuVisible: !!document.getElementById('main-menu'),
    buttons: [...document.querySelectorAll('#menu-buttons .sw-btn')].map((b) => b.firstChild?.textContent),
    fps: app?.engine?.fps?.toFixed?.(1),
    frames: app?.engine?.frame,
    drawCalls: app?.engine?.renderer?.info?.render?.calls,
    triangles: app?.engine?.renderer?.info?.render?.triangles,
    programs: app?.engine?.renderer?.info?.programs?.length,
    glError: gl ? gl.getError() : 'no-gl',
  };
});

await page.screenshot({ path: `${OUT}/01-menu.png` });

console.log('=== STATE ===');
console.log(JSON.stringify(state, null, 2));
console.log('=== LOGS ===');
console.log(logs.join('\n') || '(none)');

await browser.close();

const errors = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'));
process.exit(state.bootFailed || errors.length ? 1 : 0);
