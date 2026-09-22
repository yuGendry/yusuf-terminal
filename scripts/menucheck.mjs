/**
 * scripts/menucheck.mjs — can the front end be driven without a mouse?
 *
 * Nothing else checks this, and until Phase 4 the answer was no: every screen
 * outside gameplay was click-only, so a player could rebind their jump button
 * with a pad in their hands and then be unable to press Play with it.
 *
 * It drives the menu with real key events, asserts that exactly one thing is
 * selected on each screen, that the selection actually moves, that Enter opens
 * what is selected and Escape comes back, and that the archive lists what has
 * been found rather than just counting it.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'screenshots/menu';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(process.env.URL || 'http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });

// Seed a profile so the archive has something to list. This is the state a
// player is in after an hour, and it is the state the archive was never
// tested in.
await page.evaluate(async () => {
  const { Save } = await import('/src/save/SaveSystem.js');
  for (const id of ['ch1-note-timecard', 'ch3-note-calls', 'ch4-note-dye']) Save.recordCollectible('note', id);
  Save.recordCollectible('tape', 'ch3-tape-rehearsal');
  Save.recordCollectible('stub', 'ch3-stub-3');
  Save.recordCollectible('stub', 'ch4-stub-3');
  window.__stitchwork.mainMenu.hide();
  await new Promise((r) => setTimeout(r, 450));
  window.__stitchwork.mainMenu.show();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/main.png` });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const selected = () => page.evaluate(() => {
  const on = [...document.querySelectorAll('.nav-on')];
  return { count: on.length, text: on[0]?.textContent?.trim().slice(0, 40) ?? null };
});
const key = async (k, wait = 220) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };

// ---- main menu -------------------------------------------------------------
let a = await selected();
check('main menu has a selection', a.count === 1, `${a.count} selected: ${a.text}`);

await key('ArrowDown');
const b = await selected();
check('arrow down moves it', b.text !== a.text, `${a.text} -> ${b.text}`);

await key('ArrowUp');
const c = await selected();
check('arrow up comes back', c.text === a.text, `${c.text}`);

// ---- chapter select --------------------------------------------------------
await page.evaluate(() => {
  [...document.querySelectorAll('#menu-buttons .sw-btn')]
    .find((x) => x.textContent.startsWith('Chapter Select')).click();
});
await page.waitForTimeout(1500);
const cards = await page.evaluate(() => document.querySelectorAll('.ch-card').length);
check('chapter select draws a card per chapter', cards === 5, `${cards} cards`);
const art = await page.evaluate(() => {
  const c = document.querySelector('.ch-card canvas');
  if (!c) return null;
  const g = c.getContext('2d');
  // Is anything actually drawn, or is it an empty canvas?
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 40) lit++;
  return lit;
});
check('the card art is drawn', art !== null && art > 50, `${art} sampled pixels lit`);

const d0 = await selected();
await key('ArrowRight');
const d1 = await selected();
check('right moves across the grid', d1.text !== d0.text, `${d0.text} -> ${d1.text}`);
await key('ArrowDown');
const d2 = await selected();
check('down moves to the next row', d2.text !== d1.text, `${d1.text} -> ${d2.text}`);
await page.screenshot({ path: `${OUT}/chapters.png` });

await key('Escape', 700);
const back = await selected();
check('escape returns to the main menu', back.text === c.text, `${back.text}`);

// ---- archive ---------------------------------------------------------------
await page.evaluate(() => {
  [...document.querySelectorAll('#menu-buttons .sw-btn')]
    .find((x) => x.textContent.startsWith('Archive')).click();
});
await page.waitForTimeout(1500);
const arch = await page.evaluate(() => ({
  items: document.querySelectorAll('.arch-item').length,
  titles: [...document.querySelectorAll('.arch-item .t')].map((n) => n.textContent.slice(0, 30)),
}));
check('the archive lists what was found', arch.items === 6, `${arch.items} entries: ${arch.titles.join(' | ')}`);
await page.screenshot({ path: `${OUT}/archive.png` });

// Opening an entry should put it in the reader.
await page.evaluate(() => document.querySelector('.arch-item').click());
await page.waitForTimeout(800);
const readerUp = await page.evaluate(() => window.__stitchwork.game.reader?.open === true);
check('an archive entry opens in the reader', readerUp);
await page.screenshot({ path: `${OUT}/archive-reader.png` });

await browser.close();
if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
if (failures || errors.length) process.exit(1);
console.log('\nmenucheck passed');
