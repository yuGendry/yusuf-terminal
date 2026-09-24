/**
 * scripts/sequencecheck.mjs — can a chapter be played out of order?
 *
 * The class of bug this exists for was reported by a player, not found by any
 * harness: in Chapter 1 the lobby's north opening was a bare gap, so you could
 * walk straight past the ticket window, the package and the cloakroom into the
 * auditorium and start throwing breakers. Nothing errored. The chapter simply
 * played itself in the wrong order, with the mask that is meant to be its
 * turning point picked up afterwards as a curiosity.
 *
 * Every other check asks "can the player reach this?" and passes when the
 * answer is yes. This one asks the opposite question about the things that are
 * supposed to be gated: from the spawn point, *without solving anything*, how
 * much of the chapter is already standing open?
 *
 * It floods from the spawn exactly as walkcheck does — but with every door in
 * its authored state instead of unlocked and swung wide — and then asks, of
 * every later step in the chain, whether the player could already *begin* it:
 * walk to it, and find something there that will respond. A step you can
 * stand next to but not act on is properly gated and passes. That distinction
 * is the whole point — the mask sits in the open on the box-office counter
 * and always will, but it refuses to be picked up until you have a light, and
 * a check that only measured distance would call that a break forever.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAPTERS = (process.env.CHAPTERS || '1,2,3,4').split(',').map(Number);
const STEP = 0.75;

/**
 * The intended order of each chapter, as the levels themselves activate them.
 * Anything reachable from the spawn that is not the FIRST entry here is a
 * chapter that can be played out of order.
 */
const CHAIN = {
  1: ['ch1-ticket', 'ch1-mask', 'ch1-cloakroom', 'ch1-breakers', 'ch1-board'],
  2: ['ch2-lens', 'ch2-hand', 'ch2-keypad', 'ch2-glaze', 'ch2-kiln'],
  3: ['ch3-lens', 'ch3-blocking', 'ch3-lantern', 'ch3-gloam', 'ch3-tannoy', 'ch3-music', 'ch3-choir'],
  4: ['ch4-pumps', 'ch4-hollow', 'ch4-diptank', 'ch4-stair', 'ch4-warp', 'ch4-counterweight'],
};

/**
 * Steps that are deliberately open from the spawn.
 *
 * Every entry here is a decision, not a waiver, and needs a reason. The point
 * of the check is to fail when something opens up that nobody chose to open —
 * so a list that grows by reflex defeats it. If a step lands here, say why it
 * is allowed to be reachable with nothing solved.
 */
const OPEN_FROM_SPAWN = {
  // The cloakroom is a self-contained puzzle in the lobby's own wing: find
  // the cloakroom ticket, work out that the peg numbering runs down the
  // columns, search that coat. Solving it early yields the cellar key, and
  // the cellar only leads to a breaker that is useless until the board
  // matters — which is behind the house doors. So it is genuinely parallel
  // rather than a skip, and forcing an order on it would make the lobby a
  // corridor for no gain.
  1: ['ch1-cloakroom'],

  // The magic lantern is optional lore: three discs, a photograph, a line of
  // dialogue, and `lanternDone` gates nothing else in the chapter. It sits in
  // the green room directly off the rehearsal hall, in the same zone as the
  // blocking puzzle, so it is parallel content rather than a step skipped.
  3: ['ch3-lantern'],
};

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const url = new globalThis.URL(process.env.URL || 'http://localhost:5173/');
url.searchParams.set('nocine', '1');
await page.goto(url.toString(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.3);
});

let failures = 0;

for (const chapter of CHAPTERS) {
  await page.evaluate((n) => window.__stitchwork.startGame({ fresh: true, chapter: n }), chapter);
  await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 300000 });

  const report = await page.evaluate(async ([step, chain, open]) => {
    const { collisionGroups, GROUP } = await import('/src/core/Physics.js');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const app = window.__stitchwork;
    const ph = app.game.physics;
    const W = collisionGroups(0xffff, GROUP.WORLD);

    // Deliberately NOT unlocking anything. The authored state is the point.
    const bounds = new THREE.Box3();
    app.game.level.scene.traverse((o) => { if (o.isMesh && o.visible) bounds.expandByObject(o); });
    const x0 = Math.floor(bounds.min.x - 1), x1 = Math.ceil(bounds.max.x + 1);
    const z0 = Math.floor(bounds.min.z - 1), z1 = Math.ceil(bounds.max.z + 1);
    const top = bounds.max.y + 2, bottom = bounds.min.y - 2;

    const HEAD = 1.15;
    const nodes = [];
    const index = new Map();
    const cols = Math.round((x1 - x0) / step) + 1;
    const rows = Math.round((z1 - z0) / step) + 1;

    for (let ix = 0; ix < cols; ix++) {
      for (let iz = 0; iz < rows; iz++) {
        const x = x0 + ix * step, z = z0 + iz * step;
        let y = top; const here = []; let guard = 0;
        while (guard++ < 48 && y > bottom && here.length < 6) {
          const hit = ph.raycast({ x, y, z }, { x: 0, y: -1, z: 0 }, y - bottom, W);
          if (!hit) break;
          if (hit.distance < 0.02) { y -= 0.4; continue; }
          const sy = hit.point.y;
          if (!ph.raycast({ x, y: sy + 0.12, z }, { x: 0, y: 1, z: 0 }, HEAD, W)) {
            const node = { x, z, y: sy, i: nodes.length, ix, iz, seen: false, edges: [] };
            nodes.push(node); here.push(node);
          }
          y = sy - 0.35;
        }
        if (here.length) index.set(`${ix},${iz}`, here);
      }
    }

    const linkable = (a, b) => {
      const rise = b.y - a.y;
      if (rise > step || rise < -2.0) return false;
      const ay = a.y + 0.55, by = b.y + 0.55;
      const d = { x: b.x - a.x, y: by - ay, z: b.z - a.z };
      const len = Math.hypot(d.x, d.y, d.z);
      if (len < 1e-4) return true;
      if (ph.raycast({ x: a.x, y: ay, z: a.z },
        { x: d.x / len, y: d.y / len, z: d.z / len }, len, W) !== null) return false;
      if (Math.abs(rise) <= 0.45) return true;
      const hi = Math.max(a.y, b.y), lo = Math.min(a.y, b.y);
      const mid = ph.raycast({ x: (a.x + b.x) / 2, y: hi + 0.7, z: (a.z + b.z) / 2 },
        { x: 0, y: -1, z: 0 }, (hi - lo) + 1.5, W);
      return !!mid && mid.point.y >= lo - 0.55 && mid.point.y <= hi + 0.55;
    };

    for (const node of nodes) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let n = index.get(`${node.ix + dx},${node.iz + dz}`);
        if (!n) n = index.get(`${node.ix + dx * 2},${node.iz + dz * 2}`);
        for (const other of n ?? []) if (linkable(node, other)) node.edges.push(other);
      }
    }

    const spawn = app.game.level.spawn;
    let start = null, best = Infinity;
    for (const n of nodes) {
      const d = (n.x - spawn.x) ** 2 + (n.z - spawn.z) ** 2 + (n.y - spawn.y) ** 2;
      if (d < best) { best = d; start = n; }
    }
    const queue = [start];
    start.seen = true;
    while (queue.length) {
      const n = queue.pop();
      for (const e of n.edges) if (!e.seen) { e.seen = true; queue.push(e); }
    }

    const reached = (p) => nodes.some((n) => n.seen
      && Math.abs(n.x - p.x) < step && Math.abs(n.z - p.z) < step && Math.abs(n.y - p.y) < 2.2);

    /**
     * Is there anything at this marker that would actually respond?
     *
     * `enabled` is how a level says "not yet". An interactable that refuses
     * is a closed gate even though the player can walk right up to it, so a
     * step whose every interactable is disabled has not been broken into.
     */
    const v = new THREE.Vector3();
    const liveAt = (marker) => {
      const live = [];
      for (const [obj, desc] of app.game.interaction.items) {
        obj.getWorldPosition(v);
        if (v.distanceTo(marker) > 3.2) continue;
        if (desc.enabled && !desc.enabled()) continue;
        // Notes, stubs and tapes are scattered on purpose and can be picked
        // up whenever you find them. One lying near a puzzle marker is not
        // the puzzle being started.
        if (desc.collectible) continue;
        const label = typeof desc.label === 'function' ? desc.label() : desc.label;
        live.push(label ?? '(unlabelled)');
      }
      return live;
    };

    const out = [];
    for (let i = 1; i < chain.length; i++) {
      const puzzle = app.game.puzzles.puzzles.get(chain[i]);
      if (!puzzle?.marker) continue;
      if (open.includes(chain[i])) continue;
      if (!reached(puzzle.marker)) continue;
      const live = liveAt(puzzle.marker);
      if (live.length) {
        out.push({ id: chain[i], step: i, name: puzzle.name, live: live.slice(0, 3) });
      }
    }
    return { out, floor: nodes.filter((n) => n.seen).length };
  }, [STEP, CHAIN[chapter] ?? [], OPEN_FROM_SPAWN[chapter] ?? []]);

  if (!report.out.length) {
    console.log(`ch${chapter}: nothing later in the chain is open from the spawn`);
  } else {
    failures += report.out.length;
    console.log(`ch${chapter}: ${report.out.length} puzzle(s) reachable before their prerequisites`);
    for (const r of report.out) {
      console.log(`   step ${r.step + 1} "${r.name}" (${r.id}) can be started with nothing solved`);
      console.log(`     live here: ${r.live.join(', ')}`);
    }
  }
}

await browser.close();
if (errors.length) console.log('page errors:', errors.slice(0, 4).join(' | '));
if (failures) { console.log(`\n${failures} sequence break(s)`); process.exit(1); }
console.log('\nsequencecheck passed');
