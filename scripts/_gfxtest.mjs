import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync('screenshots/gfx', { recursive: true });
const browser = await chromium.launch({ executablePath: existsSync(EXE)?EXE:undefined,
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:960,height:540} });
const errs=[]; page.on('pageerror', e=>errs.push(e.message));
page.on('console', m=>{ const t=m.text(); if(m.type()==='error' && !t.includes('ERR_CERT') && !t.includes('Failed to load resource')) errs.push('[c] '+t); });
const url = new globalThis.URL('http://localhost:5173/'); url.searchParams.set('nocine','1');
await page.goto(url.toString(), { waitUntil:'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, {timeout:120000});
await page.evaluate(async () => { const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('high'); Settings.set('resolutionScale', 0.6); });
const CH = Number(process.env.CH || 1);
await page.evaluate((c) => window.__stitchwork.startGame({ fresh:true, chapter:c }), CH);
await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, {timeout:300000});
const frames = (n) => page.waitForFunction((t) => { const e = window.__stitchwork.engine;
  window.__f0 ??= e.frame; if (e.frame - window.__f0 >= t) { delete window.__f0; return true; } return false;
}, n, {timeout:300000, polling:100});
if (process.env.SETUP) await page.evaluate(`(${process.env.SETUP})()`);
for (const i of ['ui-layer','game-layer']) await page.evaluate((x)=>{const e=document.getElementById(x); if(e)e.style.display='none';}, i);
await frames(30);
await page.screenshot({ path: `screenshots/gfx/${process.env.NAME || 'shot'}.png` });
console.log(JSON.stringify(await page.evaluate(() => {
  const e = window.__stitchwork.engine, p = e.postfx;
  return { fps:+e.fps.toFixed(1), calls:e.renderer.info.render.calls, tris:e.renderer.info.render.triangles,
           taa:p.enableTAA, bloomLevels:p._bloomActive, mip0:[p.bloomMips[0].width,p.bloomMips[0].height] };
})));
await browser.close();
console.log(errs.length ? 'ERRORS: '+errs.slice(0,4).join(' | ') : 'clean');
