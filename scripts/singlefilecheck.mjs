/**
 * scripts/singlefilecheck.mjs — does the double-click build actually run?
 *
 * The one-file build exists so somebody with no Node, no terminal and no
 * patience can open the game by double-clicking it. That only works if the
 * page needs nothing from the disk beside it, because a page loaded from
 * `file://` is treated as a unique opaque origin and every sibling fetch is
 * refused. This loads the built file over `file://` — exactly as Explorer
 * would — and fails if anything at all was requested off-origin, if the boot
 * sequence stalls, or if the menu never comes up.
 */
import { chromium } from 'playwright';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FILE = resolve(process.env.FILE || 'build-out/STITCHWORK.html');

if (!existsSync(FILE)) {
  console.log(`missing: ${FILE}`);
  process.exit(1);
}
const mb = statSync(FILE).size / 1024 / 1024;

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });

const errors = [];
const fetched = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // The font stylesheet is the page's one outbound request and it fails in a
  // sandbox whose proxy CA the browser does not trust. That is the network,
  // not the build: the page falls back to its local stack and plays fine.
  const t = m.text();
  if (t.includes('ERR_CERT_AUTHORITY_INVALID') || t.includes('Failed to load resource')) return;
  errors.push(`[console] ${t}`);
});
page.on('request', (r) => {
  const u = r.url();
  // Anything that is not the document itself is a real network request. The
  // font stylesheet is the one thing the page is allowed to want.
  if (u.startsWith('file://')) fetched.push(u);
  else if (!u.includes('fonts.googleapis.com') && !u.includes('fonts.gstatic.com')) fetched.push(u);
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

await page.goto(`file://${FILE}`, { waitUntil: 'load', timeout: 600000 });

let booted = true;
try {
  await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 900000 });
} catch { booted = false; }

check('boots to the menu from file://', booted);
check('asks the disk for nothing else', fetched.length <= 1,
  fetched.length > 1 ? `${fetched.length - 1} extra: ${fetched.slice(1, 4).join(', ')}` : '');

const state = await page.evaluate(() => {
  const a = window.__stitchwork;
  return {
    buttons: [...document.querySelectorAll('#menu-buttons .sw-btn')].length,
    gl: !!a?.engine?.renderer,
    physics: !!a?.physics?.world,
    frames: a?.engine?.frame ?? 0,
  };
}).catch(() => ({}));

check('the menu is built', (state.buttons ?? 0) >= 5, `${state.buttons} buttons`);
check('WebGL2 is up', !!state.gl);
check('Rapier initialised without a .wasm fetch', !!state.physics);

// Saving. On file:// the page is an opaque origin and storage can be refused
// outright, which must degrade to "does not remember" rather than throwing.
const storage = await page.evaluate(() => {
  try {
    localStorage.setItem('__probe', '1');
    const ok = localStorage.getItem('__probe') === '1';
    localStorage.removeItem('__probe');
    return ok ? 'works' : 'silently dropped';
  } catch (e) {
    return 'refused: ' + e.name;
  }
}).catch((e) => 'threw: ' + e.message);
console.log(`  NOTE  localStorage on file:// — ${storage}`);

// And it has to actually start a chapter — that is where the dynamic imports
// live, and flattening them is the part of this build most likely to break.
// Skippable because a software renderer takes many minutes over it.
let played = 'skipped';
if (!process.env.QUICK) {
  played = true;
  // The chapter number is read here, in Node, and passed in. Reading
  // `process.env` inside the page callback throws a ReferenceError in the
  // browser, which the catch below then swallowed as "the chapter did not
  // load" — a harness bug that condemned a build that works perfectly.
  const chapter = Number(process.env.CH) || 1;
  try {
    await page.evaluate((n) => window.__stitchwork.startGame({ fresh: true, chapter: n }), chapter);
    await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 900000 });
  } catch (e) {
    played = false;
    console.log(`        ${String(e).split('\n')[0].slice(0, 160)}`);
  }
  check(`chapter ${chapter} loads (dynamic imports flattened)`, played);
}

await page.screenshot({ path: 'screenshots/singlefile.png' });
await browser.close();

console.log(`\n  ${mb.toFixed(1)} MB, one file`);
if (errors.length) console.log('  errors:', errors.slice(0, 5).join(' | '));
if (failures || errors.length) process.exit(1);
console.log('  singlefilecheck passed');
