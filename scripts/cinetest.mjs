/**
 * scripts/cinetest.mjs — verify the presentation layer end to end.
 *
 * Walks the exact path a player takes from the main menu into gameplay:
 *
 *   menu → intro drive → chapter title page → chapter opening → play
 *
 * and screenshots each stage. Software rendering is slow, so the engine's
 * debug clock multiplier is wound up rather than waiting in real time; every
 * wait in here is on *simulated* state (cinematic.time, app.state), never on
 * a wall clock, because wall-clock waits pass on a fast machine and fail on
 * this one for reasons that have nothing to do with the code.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'screenshots/cine';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

const log = (...a) => console.log('  ', ...a);

await page.goto(process.env.URL || 'http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });
log('menu up');

// Quality down, clock up.
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('medium');
  Settings.set('resolutionScale', 0.6);
  window.__stitchwork.engine.timeScale = 6;
});

await page.screenshot({ path: `${OUT}/00-menu.png` });

// ---------------------------------------------------------------- intro drive
await page.evaluate(() => {
  [...document.querySelectorAll('#menu-buttons .sw-btn')]
    .find((b) => b.textContent.trim().startsWith('New Game'))?.click();
});

await page.waitForFunction(() => window.__stitchwork?.state === 'cinematic', null, { timeout: 120000 });
log('intro drive started');

/**
 * Hold until the running cinematic's own clock passes `t`, then stop the clock.
 *
 * Software rendering gives about 1.5 fps, and the multiplier means each of
 * those frames advances the cinematic by most of a second — so between
 * "time >= t" becoming true and the screenshot actually being captured, the
 * shot has already moved on. Freezing the engine clock at the moment the
 * condition trips is the only way to photograph the pose that was asked for
 * rather than the one three seconds after it.
 */
const atTime = async (t) => {
  await page.waitForFunction(
    (target) => {
      const c = window.__stitchwork.cinematic;
      return !c || c.time >= target;
    }, t, { timeout: 240000, polling: 100 });
  await page.evaluate(() => { window.__stitchwork.engine.timeScale = 0; });
  // Let a couple of frames render at the frozen pose.
  await page.waitForFunction(
    () => {
      const e = window.__stitchwork.engine;
      window.__f0 ??= e.frame;
      if (e.frame - window.__f0 >= 2) { delete window.__f0; return true; }
      return false;
    }, null, { timeout: 120000, polling: 100 });
};

const resume = (scale = 6) =>
  page.evaluate((k) => { window.__stitchwork.engine.timeScale = k; }, scale);

for (const [t, name] of [[3, 'road'], [16, 'photo'], [30, 'dials'], [43, 'factory']]) {
  await atTime(t);
  const info = await page.evaluate(() => {
    const c = window.__stitchwork.cinematic;
    return c ? { t: +c.time.toFixed(1) } : { t: 'ended' };
  });
  await page.screenshot({ path: `${OUT}/01-drive-${String(t).padStart(2, '0')}-${name}.png` });
  log(`drive @${info.t}s → ${name}`);
  await resume();
}

// ---------------------------------------------------------- chapter title page
await page.waitForSelector('.chapter-screen.show', { timeout: 180000 });
log('chapter page up');
await page.waitForSelector('.chapter-screen.armed', { timeout: 300000 });
await page.screenshot({ path: `${OUT}/02-chapter-page.png` });

const pageText = await page.evaluate(() => {
  const el = document.querySelector('.chapter-screen');
  return {
    title: el.querySelector('.cs-title')?.textContent,
    chapter: el.querySelector('.cs-chapter')?.textContent,
    score: [...el.querySelectorAll('.cs-fact')]
      .map((f) => `${f.querySelector('.k').textContent}: ${f.querySelector('.v').textContent}`),
  };
});
log('page says', JSON.stringify(pageText));

// ------------------------------------------------------- chapter opening shot
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__stitchwork?.state === 'cinematic', null, { timeout: 60000 });
log('chapter opening started');

for (const [t, name] of [[2, 'high'], [9, 'drift'], [16, 'settle']]) {
  await atTime(t);
  await page.screenshot({ path: `${OUT}/03-open-${String(t).padStart(2, '0')}-${name}.png` });
  log(`opening @${t}s`);
  await resume();
}

// ----------------------------------------------------------------------- play
await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => { window.__stitchwork.engine.timeScale = 1; });
await page.waitForFunction(
  () => {
    const e = window.__stitchwork.engine;
    window.__f0 ??= e.frame;
    if (e.frame - window.__f0 >= 8) { delete window.__f0; return true; }
    return false;
  }, null, { timeout: 180000, polling: 100 });
await page.screenshot({ path: `${OUT}/04-play.png` });

const final = await page.evaluate(() => ({
  state: window.__stitchwork.state,
  chapter: window.__stitchwork.game?.chapterId,
  theme: window.__stitchwork.music?.themeName,
  scoreTitle: window.__stitchwork.music?.themeTitle,
  player: !!window.__stitchwork.game?.player,
  drawCalls: window.__stitchwork.engine.renderer.info.render.calls,
}));
log('in play:', JSON.stringify(final));

// --------------------------------------------------------------- chapter end
log('forcing chapter completion to test the closing cinematic');
await page.evaluate(() => { window.__stitchwork.engine.timeScale = 6; });
await page.evaluate(() => window.__stitchwork.game.completeChapter(1));
await page.waitForFunction(() => window.__stitchwork?.state === 'cinematic', null, { timeout: 60000 });
for (const [t, name] of [[2, 'hold'], [8, 'rise']]) {
  await atTime(t);
  await page.screenshot({ path: `${OUT}/05-close-${String(t).padStart(2, '0')}-${name}.png` });
  log(`closing @${t}s`);
  await resume();
}

// It should roll straight into chapter 2's title page.
await page.waitForSelector('.chapter-screen.show', { timeout: 180000 });
await page.waitForSelector('.chapter-screen.armed', { timeout: 300000 });
await page.screenshot({ path: `${OUT}/06-chapter2-page.png` });
const ch2 = await page.evaluate(() => ({
  title: document.querySelector('.cs-title')?.textContent,
  theme: window.__stitchwork.music?.themeName,
  score: window.__stitchwork.music?.themeTitle,
}));
log('chapter 2 page:', JSON.stringify(ch2));

await browser.close();

if (errors.length) {
  console.log('\nERRORS:');
  for (const e of errors.slice(0, 25)) console.log(' ', e);
  process.exit(1);
}
console.log('\ncinetest: clean');
