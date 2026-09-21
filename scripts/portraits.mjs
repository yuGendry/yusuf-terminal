/**
 * scripts/portraits.mjs — close-ups of the things that are supposed to be
 * frightening, and of the jumpscare in motion.
 *
 * Framed deliberately rather than by teleporting the player: these are the
 * shots that decide whether the art works, and a creature photographed from
 * wherever the player happened to be standing tells you nothing.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'screenshots/portraits';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const url = new globalThis.URL(process.env.URL || 'http://localhost:5173/');
url.searchParams.set('nocine', '1');
await page.goto(url.toString(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('high');
  Settings.set('resolutionScale', 0.8);
});

const frames = (n) => page.waitForFunction(
  (target) => {
    const e = window.__stitchwork.engine;
    window.__f0 ??= e.frame;
    if (e.frame - window.__f0 >= target) { delete window.__f0; return true; }
    return false;
  }, n, { timeout: 180000, polling: 100 });

const hideUI = () => page.evaluate(() => {
  for (const id of ['ui-layer', 'game-layer']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
/**
 * Measure a creature instead of guessing where its head is.
 *
 * Every one of these portraits was originally framed from a hand-written
 * offset above the root — "head is 1.6 up" — and every one of them was wrong,
 * because a marionette's root is its hanger, a doll's root is its feet, and
 * the Understudy's root is somewhere in its chest. Asking the bounding box
 * costs nothing and is right for all three.
 *
 * `expr` is evaluated in the page with `app` bound to window.__stitchwork.
 */
const boundsOf = (expr) => page.evaluate(async (src) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const got = new Function('app', `return (${src});`)(window.__stitchwork);
  const roots = (Array.isArray(got) ? got : [got]).filter(Boolean);
  if (!roots.length) return null;
  // Meshes only. Box3.setFromObject counts a marionette's control strings,
  // which run two metres up to the gantry: the box came out four metres tall,
  // the camera backed off to fit it, and the "close-up" was a wide shot of an
  // empty stage with a doll the size of a thumbnail in the middle of it.
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  for (const r of roots) {
    r.updateWorldMatrix(true, true);
    r.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      o.geometry.computeBoundingBox();
      one.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(one);
    });
  }
  if (!Number.isFinite(box.min.y) || box.isEmpty()) return null;
  const c = box.getCenter(new THREE.Vector3());
  const sz = box.getSize(new THREE.Vector3());
  const o = new THREE.Vector3();
  roots[0].getWorldPosition(o);
  return {
    centre: [c.x, c.y, c.z],
    size: [sz.x, sz.y, sz.z],
    // The head is the top of the silhouette, backed off by a fraction of the
    // height so the camera looks at a face rather than at a scalp.
    head: [c.x, box.max.y - sz.y * 0.09, c.z],
    // Where the object's own transform is. For a head joint this is the base
    // of the skull, which is a far better aim point for a face than the top
    // of the bounding box — Mister Tangle wears a top hat, and the box top is
    // the crown of the hat, thirty centimetres above his eyes.
    origin: [o.x, o.y, o.z],
  };
}, expr);

/**
 * Stop a creature moving for the duration of a shoot.
 *
 * Parking one by writing to `root.position` is pointless while its own update
 * is still running: it walks straight back out of frame between the write and
 * the screenshot, which is why the first pass at these portraits photographed
 * an empty catwalk.
 */
const freeze = (expr) => page.evaluate((src) => {
  const it = new Function('app', `return (${src});`)(window.__stitchwork);
  if (!it) return false;
  it.enabled = false;
  if (!it.__frozen) { it.__frozen = true; it.update = () => {}; }
  return true;
}, expr);

/**
 * Light a point in the world, three-quarters on, and leave the rig there.
 *
 * Separate from `portrait` because the jumpscare frames cannot move the
 * camera — the scare owns it — but still have to be lit. Chapter 4's
 * Understudy stands in an unlit flooded basement, and every attempt at
 * photographing the scare came back as a black rectangle.
 */
const lightAt = (at, { key = 6, fill = 0.6, range = 6, from = null } = {}) => page.evaluate(
  async ({ at, key, fill, range, from }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const scene = window.__stitchwork.engine.scene;
    const old = scene.getObjectByName('portrait-rig');
    if (old) scene.remove(old);

    const rig = new THREE.Group();
    rig.name = 'portrait-rig';
    const target = new THREE.Vector3(...at);
    const side = from && from[2] > at[2] ? 1 : -1;

    const k = new THREE.SpotLight(0xffe6c4, key, range, Math.PI / 4, 0.7, 2);
    k.position.set(at[0] + range * 0.12, at[1] + range * 0.14, at[2] + side * range * 0.16);
    k.target.position.copy(target);
    rig.add(k, k.target);

    const f = new THREE.PointLight(0x9fb4d0, fill, range * 0.7, 2);
    f.position.set(at[0] - range * 0.15, at[1] + 0.1, at[2] + side * range * 0.1);
    rig.add(f);

    scene.add(rig);
  }, { at, key, fill, range, from });

/** Hand the camera back to the player controller after a portrait shoot. */
const unpatchCamera = () => page.evaluate(() => {
  const pc = window.__stitchwork.game?.player;
  if (pc?.__portraitPatched) {
    delete pc._updateCameraFeel;   // fall back through to the prototype
    delete pc.__portraitPatched;
  }
});

const showUI = () => page.evaluate(() => {
  for (const id of ['ui-layer', 'game-layer']) {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  }
});

// ---------------------------------------------------------------- menu doll
await frames(20);
await hideUI();

/**
 * Point the camera at a world position from a given offset, and light it.
 *
 * The lamp is the point: these creatures live in rooms lit by one failing
 * bulb, and a portrait taken under the room's own lighting is a photograph of
 * a silhouette. A key light three quarters on is how you photograph a face.
 */
const portrait = async (name, { at, from, fov = 40, key = 6, fill = 0.6 }) => {
  await page.evaluate(async ({ at, from, fov, key, fill }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const app = window.__stitchwork;
    const cam = app.engine.camera;
    const scene = app.engine.scene;

    // The player controller rewrites the camera from the capsule every frame,
    // so simply pointing the camera at a creature produced a photograph of
    // wherever the player happened to be standing — which is exactly the
    // failure these portraits exist to catch. Stub the camera write out for
    // the duration of the shoot.
    const pc = app.game?.player;
    if (pc && !pc.__portraitPatched) {
      pc.__portraitPatched = true;
      pc._updateCameraFeel = () => {};
    }
    // The menu does the same thing by a different route: a 92-second dolly
    // down the centre aisle that rewrites the camera every frame. Keep the
    // puppet's own idle sway running — that is part of what is being
    // photographed — and only hold the camera still.
    const ms = app.menuScene;
    if (ms && !ms.__portraitPatched) {
      ms.__portraitPatched = true;
      const inner = ms.update.bind(ms);
      ms.update = (dt) => {
        const p = cam.position.clone();
        const q = cam.quaternion.clone();
        const f = cam.fov;
        inner(dt);
        cam.position.copy(p);
        cam.quaternion.copy(q);
        if (cam.fov !== f) { cam.fov = f; cam.updateProjectionMatrix(); }
      };
    }

    // Clear any previous rig.
    const old = scene.getObjectByName('portrait-rig');
    if (old) scene.remove(old);

    const rig = new THREE.Group();
    rig.name = 'portrait-rig';

    const target = new THREE.Vector3(...at);
    // Lights reach as far as the subject is away, so a wide shot of a row of
    // eleven dolls is not lit by a lamp with a four-metre falloff.
    const range = Math.max(6, Math.hypot(from[0] - at[0], from[1] - at[1], from[2] - at[2]) * 1.6);
    const k = new THREE.SpotLight(0xffe6c4, key * (range / 6) ** 2, range, Math.PI / 4, 0.7, 2);
    k.position.set(at[0] + range * 0.12, at[1] + range * 0.14, at[2] + (from[2] > at[2] ? 1 : -1) * range * 0.16);
    k.target.position.copy(target);
    rig.add(k, k.target);

    const f = new THREE.PointLight(0x9fb4d0, fill * (range / 6) ** 2, range * 0.7, 2);
    f.position.set(at[0] - range * 0.15, at[1] + 0.1, at[2] + (from[2] > at[2] ? 1 : -1) * range * 0.1);
    rig.add(f);

    scene.add(rig);

    cam.position.set(...from);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }, { at, from, fov, key, fill });
  await frames(14);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  ', name);
};

// The menu marionette stands on the stage of the menu scene.
const doll = await boundsOf('app.menuScene?.puppet?.root');
const dollHead = await boundsOf('app.menuScene?.puppet?.joints?.head');
if (doll) {
  // Prefer the head joint's origin; fall back to the silhouette's top.
  const [hx, hy, hz] = dollHead
    ? [dollHead.origin[0], dollHead.origin[1] + dollHead.size[1] * 0.18, dollHead.origin[2]]
    : doll.head;
  await portrait('01-marionette-face', {
    at: [hx, hy, hz],
    from: [hx + 0.26, hy + 0.08, hz + 0.8],
    fov: 32, key: 1.6, fill: 0.18,
  });
  const [cx, cy, cz] = doll.centre;
  await portrait('02-marionette-full', {
    at: [cx, cy, cz],
    from: [cx + 0.9, cy + 0.8, cz + doll.size[1] * 1.5 + 0.8],
    fov: 42, key: 4, fill: 0.4,
  });
}

// ------------------------------------------------- Mister Tangle, Chapter 1
await showUI();
await page.evaluate(() => window.__stitchwork.startGame({ fresh: true, chapter: 1 }));
await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });
await hideUI();

await freeze('app.game.level.tangle');
await page.evaluate(() => {
  const t = window.__stitchwork.game.level.tangle;
  if (!t) return;
  t.root.visible = true;
  // Park him somewhere photographable, facing the camera.
  // Puppet faces -Z at zero rotation, so turn it to meet the camera.
  t.root.position.set(0, 4.4, -22);
  t.root.rotation.y = Math.PI;
  // The body carries its own damped yaw inside the outer group; zero it so
  // the two do not cancel out and leave him facing away.
  t.puppet.root.rotation.y = 0;
});
const tangle = await boundsOf('app.game.level.tangle?.root');
const tangleHead = await boundsOf('app.game.level.tangle?.puppet?.joints?.head');
if (tangle) {
  // Prefer the head joint's origin; fall back to the silhouette's top.
  const [hx, hy, hz] = tangleHead
    ? [tangleHead.origin[0], tangleHead.origin[1] + tangleHead.size[1] * 0.18, tangleHead.origin[2]]
    : tangle.head;
  await portrait('03-tangle-face', {
    at: [hx, hy, hz],
    from: [hx + 0.36, hy + 0.08, hz + 1.25],
    fov: 34, key: 10, fill: 1.2,
  });
  const [cx, cy, cz] = tangle.centre;
  await portrait('04-tangle-full', {
    at: [cx, cy, cz],
    from: [cx + 1.5, cy + 0.6, cz + tangle.size[1] * 1.5 + 1.2],
    fov: 46, key: 16, fill: 2,
  });
}

// ------------------------------------------------------ the Choir, Chapter 3
await showUI();
await page.evaluate(() => window.__stitchwork.startGame({ fresh: true, chapter: 3 }));
await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });
await hideUI();

await freeze('app.game.level.choir');
// The choir dolls face -Z too, and they turn to look at the player as they
// move, so the one being photographed has to be aimed by hand.
await page.evaluate(() => {
  const d = window.__stitchwork.game.level.choir?.dolls?.[0];
  if (d) d.root.rotation.y = Math.PI;
});
const choir = await boundsOf('app.game.level.choir?.dolls?.[0]?.root');
const choirHead = await boundsOf('app.game.level.choir?.dolls?.[0]?.puppet?.joints?.head');
if (choir) {
  // Prefer the head joint's origin; fall back to the silhouette's top.
  const [hx, hy, hz] = choirHead
    ? [choirHead.origin[0], choirHead.origin[1] + choirHead.size[1] * 0.18, choirHead.origin[2]]
    : choir.head;
  await portrait('05-choir-face', {
    at: [hx, hy, hz],
    from: [hx + 0.16, hy + 0.05, hz + 0.62],
    fov: 30, key: 5, fill: 0.5,
  });
  // The row, not the individual: the whole of the choir seen at once is the
  // thing that is frightening about it.
  const row = await boundsOf('(app.game.level.choir?.dolls ?? []).map((d) => d.root)');
  const r = row ?? choir;
  const [cx, , cz] = r.centre;
  // Stand off by the width of the row rather than by a fixed 4.4 metres: the
  // choir is eleven dolls wide and the old framing put the camera inside the
  // stalls, looking at a pew.
  const spread = Math.max(r.size[0], r.size[2]);
  const eye = r.centre[1] + r.size[1] * 0.35;
  await portrait('06-choir-row', {
    at: [cx, eye, cz],
    from: [cx + spread * 0.25, eye + 0.9, cz + spread * 0.85 + 2.2],
    fov: 52, key: 14, fill: 2.2,
  });
}

// --------------------------------------------------------- the Understudy
await showUI();
await page.evaluate(() => window.__stitchwork.startGame({ fresh: true, chapter: 4 }));
await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });
await hideUI();

await freeze('app.game.level.understudy');
await page.evaluate(() => {
  const root = window.__stitchwork.game.level.understudy?.root;
  if (!root) return;
  root.visible = true;
  // Unlike the puppets, this one's face is on +Z.
  root.position.set(6, -5, -30);
  root.rotation.y = 0;
});
const under = await boundsOf('app.game.level.understudy?.root');
const underHead = await boundsOf('app.game.level.understudy?._head');
if (under) {
  // Prefer the head joint's origin; fall back to the silhouette's top.
  const [hx, hy, hz] = underHead
    ? [underHead.origin[0], underHead.origin[1] + underHead.size[1] * 0.18, underHead.origin[2]]
    : under.head;
  await portrait('07-understudy-face', {
    at: [hx, hy, hz],
    from: [hx + 0.24, hy + 0.06, hz + 1.15],
    fov: 32, key: 6, fill: 0.8,
  });
  const [cx, cy, cz] = under.centre;
  await portrait('08-understudy-full', {
    at: [cx, cy, cz],
    from: [cx + 1.4, cy + 0.7, cz + under.size[1] * 1.4 + 1.0],
    fov: 46, key: 12, fill: 1.6,
  });
}

// ------------------------------------------------------------- the jumpscare
// The scare drives the camera itself, so give it back first — and then let a
// few frames run, because handing the method back does not move the camera:
// the player controller only reclaims it on its next update, and `kill` snaps
// the scare's start pose from wherever the camera happens to be. Firing
// immediately meant the Understudy lunged at the camera from the far side of
// the level, out of a portrait rig parked forty metres away.
await unpatchCamera();
await showUI();
await frames(5);
await hideUI();
await page.evaluate(() => {
  const app = window.__stitchwork;
  app.engine.timeScale = 0.35;

  // Pin the scare to an exact moment rather than trying to catch one.
  //
  // Racing it does not work here: SwiftShader renders this at a frame or two
  // a second, so a single simulation step covers a quarter of the whole
  // 1.35-second animation. By the time a poll saw "time >= 0.6", stopped the
  // clock and took the picture, the scare had finished and the shot was of
  // the death screen. Holding `time` at a chosen value lets the pose be
  // recomputed identically every frame for as long as the shutter needs.
  const j = app.game.jumpscare;
  const inner = j.update.bind(j);
  j.__pin = null;
  j.update = (dt) => {
    const r = inner(dt);
    if (j.__pin !== null) j.time = j.__pin;
    return r;
  };
});
await page.evaluate(() => {
  const g = window.__stitchwork.game;
  const u = g.level.understudy;
  if (u) {
    u.root.visible = true;
    u.root.position.copy(g.player.position).setZ(g.player.position.z - 2.0);
  }
  g.jumpscare.__pin = 0.25;
  g.kill('understudy', u?.root ?? null);
});
// The scare happens in an unlit basement two feet from the creature's face.
const scareAt = await boundsOf('app.game.level.understudy?._head');
if (scareAt) await lightAt(scareAt.origin, { key: 9, fill: 1.2, range: 4 });

for (const [t, name] of [[0.25, 'lunge'], [0.6, 'close'], [0.95, 'contact']]) {
  await page.evaluate((v) => { window.__stitchwork.game.jumpscare.__pin = v; }, t);
  await frames(3);
  await page.screenshot({ path: `${OUT}/09-jumpscare-${name}.png` });
  console.log('   jumpscare', name);
}

await page.evaluate(() => {
  const j = window.__stitchwork.game.jumpscare;
  j.__pin = null;
  window.__stitchwork.engine.timeScale = 1;
});

// ------------------------------------------------ the kiln cones, Chapter 2
//
// The one shot that is a regression test rather than a beauty pass: the cones
// live inside a steel box, and the whole puzzle turns on being able to see
// them through it with Ember up. Both frames are taken from the same spot so
// the pair shows exactly what the lens buys you.
await unpatchCamera();
await showUI();
await page.evaluate(() => window.__stitchwork.startGame({ fresh: true, chapter: 2 }));
await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });

await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const app = window.__stitchwork;
  const g = app.game;
  // Standing at the kiln door, looking west into it. Forward is
  // (-sin yaw, 0, -cos yaw), so west — negative X — is yaw = +PI/2.
  g.player.teleport(new THREE.Vector3(-11.9, 1.2, -25), Math.PI / 2);
  g.player.pitch = -0.06;
  g.mask.give();
  g.mask.unlockLens('ember');
  g.mask.setLens('ember');
  // Mid-firing, so the cones are lit and the third one is on its way over.
  g.level.state.kilnFiring = true;
  g.level.state.kilnTemp = 1215;
});
await frames(16);
await hideUI();
await page.screenshot({ path: `${OUT}/10-kiln-naked-eye.png` });
console.log('   kiln naked eye');

await page.evaluate(() => window.__stitchwork.game.mask.putOn());
await frames(20);
await page.screenshot({ path: `${OUT}/11-kiln-ember.png` });
console.log('   kiln through Ember');

await browser.close();
if (errors.length) console.log('errors:', errors.slice(0, 8).join(' | '));
console.log('done');
