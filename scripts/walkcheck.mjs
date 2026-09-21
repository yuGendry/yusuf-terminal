/**
 * scripts/walkcheck.mjs — can the player actually walk to everything?
 *
 * This is the check the project kept needing and did not have. Every
 * structural bug that has shipped has been the same shape — a place the player
 * cannot get to — and each existing check misses it for its own reason:
 *
 *   doorcheck  tests DECLARED openings. Chapter 3's stair was a hand-built run
 *              of treads descending through a wall that had no opening cut for
 *              it at all, so there was nothing to test. It also tests each
 *              opening in isolation: Chapter 3's costume store had an east
 *              doorway that opened onto two metres of void because the room it
 *              was meant to meet was somewhere else entirely, and a probe that
 *              only looks 1.2m past the wall cannot see that.
 *   reachcheck tests whether you could use a thing if you were STANDING next
 *              to it. It never asks whether you can get to where it wants you
 *              to stand.
 *   leakcheck  tests collision that should not be there, not passage that
 *              should.
 *
 * So this one floods the level. It builds a graph of every surface a player
 * could stand on, connects surfaces a player could step between, floods it
 * from the spawn point, and then reports anything the game needs — an
 * interactable, a puzzle marker, a trigger — that the flood never reached.
 * It also reports whole regions that are cut off, which is what a severed room
 * looks like from the inside.
 *
 *   CHAPTERS=3 npm run walkcheck
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAPTERS = (process.env.CHAPTERS || '1,2,3,4').split(',').map(Number);
const STEP = Number(process.env.STEP || 0.75);

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const url = new globalThis.URL(process.env.URL || 'http://localhost:5173/');
url.searchParams.set('nocine', '1');
await page.goto(url.toString(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__stitchwork?.state === 'menu', null, { timeout: 120000 });
await page.evaluate(async () => {
  const { Settings } = await import('/src/core/Settings.js');
  Settings.applyPreset('low');
  Settings.set('resolutionScale', 0.25);
});

let failures = 0;

for (const chapter of CHAPTERS) {
  await page.evaluate((n) => window.__stitchwork.startGame({ fresh: true, chapter: n }), chapter);
  await page.waitForFunction(() => window.__stitchwork?.state === 'play', null, { timeout: 180000 });

  // Open every door and wait for the leaves to swing clear.
  await page.evaluate(() => {
    for (const d of window.__stitchwork.game.level.kit?.doors ?? []) { d.unlock(); d.open(); }
  });
  await page.waitForTimeout(400);
  if (process.env.PROBE) {
    const [px, pz, r] = process.env.PROBE.split(',').map(Number);
    await page.evaluate(([a, b, c]) => { window.__walkProbe = [a, b, c]; }, [px, pz, r ?? 2]);
  }

  const report = await page.evaluate(async ({ step }) => {
    const { collisionGroups, GROUP } = await import('/src/core/Physics.js');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const app = window.__stitchwork;
    const g = app.game;
    const ph = g.physics;
    const W = collisionGroups(0xffff, GROUP.WORLD);

    // Lens-gated collision is made solid HERE rather than in an earlier call,
    // because the level's own update() runs between calls and sets it straight
    // back from the live mask state. Everything below happens inside one
    // synchronous evaluate, so no frame can undo it.
    g.mask.give();
    for (const id of ['threadlight', 'ember', 'echo', 'hollow']) g.mask.unlockLens(id);
    g.level.forceSolid?.(true);

    // --- bounds ------------------------------------------------------------
    const bounds = new THREE.Box3();
    g.level.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const m = o.material;
      if (m?.transmission > 0.25) return;
      bounds.expandByObject(o);
    });
    const pad = 2;
    const x0 = Math.floor(bounds.min.x - pad);
    const x1 = Math.ceil(bounds.max.x + pad);
    const z0 = Math.floor(bounds.min.z - pad);
    const z1 = Math.ceil(bounds.max.z + pad);
    const top = bounds.max.y + 2;
    const bottom = bounds.min.y - 2;

    // --- standable surfaces -------------------------------------------------
    //
    // A column can hold several floors — a gallery over a hall, a stage over a
    // trap room — so each column is cast repeatedly from the top down, and
    // every surface with room to stand on becomes its own node.
    const HEAD = 1.15;         // clearance needed above a surface to count
    const MAX_FLOORS = 6;
    const nodes = [];
    const index = new Map();   // "ix,iz" -> node[]

    const cols = Math.round((x1 - x0) / step) + 1;
    const rows = Math.round((z1 - z0) / step) + 1;

    for (let ix = 0; ix < cols; ix++) {
      for (let iz = 0; iz < rows; iz++) {
        const x = x0 + ix * step;
        const z = z0 + iz * step;
        let y = top;
        const here = [];
        let guard = 0;
        while (guard++ < 48 && y > bottom && here.length < MAX_FLOORS) {
          const hit = ph.raycast({ x, y, z }, { x: 0, y: -1, z: 0 }, y - bottom, W);
          if (!hit) break;

          // Rapier reports a hit at zero distance when the ray STARTS inside a
          // solid, so a column that happens to land on a wall gets stuck: it
          // finds the top of the wall, drops a little, is still inside the
          // wall, and reports that as another surface, over and over, never
          // reaching the floor underneath. Wall planes land on grid columns
          // all the time — that is what a doorway is — so without this the
          // room on the far side of every such door looks severed.
          if (hit.distance < 0.02) {
            y -= 0.4;
            continue;
          }

          const sy = hit.point.y;
          // Clear headroom directly above the surface?
          const blocked = ph.raycast({ x, y: sy + 0.12, z }, { x: 0, y: 1, z: 0 }, HEAD, W);
          if (!blocked) {
            const node = { x, z, y: sy, i: nodes.length, ix, iz, seen: false };
            nodes.push(node);
            here.push(node);
          }
          y = sy - 0.35;   // carry on below this surface
        }
        if (here.length) index.set(`${ix},${iz}`, here);
      }
    }

    // --- edges --------------------------------------------------------------
    //
    // The vertical limits are NOT the character controller's 0.42m auto-step.
    // A grid cell is 0.75m across and a stair tread is 0.32m going, so two
    // adjacent samples on a staircase are two and a bit treads apart — half a
    // metre of rise that a player climbs one tread at a time without noticing.
    // Testing 0.42 against a sampled stair rejects every staircase in the game
    // and reports the entire floor below as cut off.
    //
    // So the rise is allowed a full grid step, and instead of tightening it
    // the link is qualified by the ground between the two nodes: the midpoint
    // has to have floor at a height between them. That is what a stair, a ramp
    // and a doorway all have, and what a ledge, a gap and a wall do not — and
    // it catches the severed rooms this tool exists for without also
    // condemning the stairs.
    const ASCEND = step;
    const DESCEND = 2.0;       // a drop a player survives and cannot climb back

    const linkable = (a, b) => {
      const rise = b.y - a.y;
      if (rise > ASCEND || rise < -DESCEND) return false;

      const ay = a.y + 0.55;
      const by = b.y + 0.55;
      const d = { x: b.x - a.x, y: by - ay, z: b.z - a.z };
      const len = Math.hypot(d.x, d.y, d.z);
      if (len < 1e-4) return true;
      const clear = ph.raycast({ x: a.x, y: ay, z: a.z },
        { x: d.x / len, y: d.y / len, z: d.z / len }, len, W) === null;
      if (!clear) return false;

      // An ordinary step needs nothing under it but a clear line — that is
      // what the character controller's auto-step is for, and thresholds,
      // sills and kerbs are full of them. Requiring continuous ground here
      // severed the catwalk from the high opening it runs through, over a
      // 31cm sill.
      if (Math.abs(rise) <= 0.45) return true;

      // Anything steeper does need ground between: that is how a stair or a
      // ramp differs from a ledge you cannot climb.
      const hi = Math.max(a.y, b.y);
      const lo = Math.min(a.y, b.y);
      const mid = ph.raycast(
        { x: (a.x + b.x) / 2, y: hi + 0.7, z: (a.z + b.z) / 2 },
        { x: 0, y: -1, z: 0 }, (hi - lo) + 1.5, W
      );
      if (!mid) return false;
      return mid.point.y >= lo - 0.55 && mid.point.y <= hi + 0.55;
    };

    for (const node of nodes) {
      node.edges = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let neighbours = index.get(`${node.ix + dx},${node.iz + dz}`);
        // A wall is about a third of a metre thick, and when a doorway's wall
        // plane happens to land on a grid column that column has no floor in
        // it at all — the downward cast lands on top of the wall and never
        // gets underneath. The two sides of the door are then two cells apart
        // and never tested against each other, and a perfectly good doorway
        // reads as a severed room.
        //
        // So when the next column is empty, reach across it. The straight ray
        // and the ground-continuity test still have to pass, and they are what
        // tells a doorway from a wall: through a doorway the midpoint cast
        // finds the floor, through a wall it finds the top of the wall.
        if (!neighbours?.length) {
          neighbours = index.get(`${node.ix + dx * 2},${node.iz + dz * 2}`);
        }
        for (const other of neighbours ?? []) {
          if (linkable(node, other)) node.edges.push(other);
        }
      }
    }

    // --- flood from the spawn ----------------------------------------------
    const spawn = g.level.spawn;
    let start = null;
    let bestD = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - spawn.x, (n.y - (spawn.y - 0.95)) * 2, n.z - spawn.z);
      if (d < bestD) { bestD = d; start = n; }
    }
    if (!start) return { error: 'no standable surface anywhere near the spawn' };

    const queue = [start];
    start.seen = true;
    let reached = 1;
    while (queue.length) {
      const n = queue.pop();
      for (const e of n.edges) {
        if (e.seen) continue;
        e.seen = true;
        reached++;
        queue.push(e);
      }
    }

    // --- what the chapter needs the player to get to ------------------------
    const targets = [];
    for (const item of g.interaction.items.values()) {
      if (!item.object) continue;
      const b = new THREE.Box3().setFromObject(item.object);
      if (!isFinite(b.min.x)) continue;
      const c = b.getCenter(new THREE.Vector3());
      const label = typeof item.label === 'function'
        ? (() => { try { return item.label(); } catch { return '(dynamic)'; } })()
        : (item.label ?? '(unlabelled)');
      // Some things are deliberately somewhere the player never stands: the
      // torch starts inside a drawer three metres behind a ticket window and
      // only comes within reach once the drawer is opened. A level marks those
      // rather than the tool guessing.
      if (item.reachedFromElsewhere) continue;
      targets.push({ kind: 'use', label, x: c.x, y: c.y, z: c.z });
    }
    for (const p of g.puzzles?.puzzles?.values?.() ?? []) {
      if (!p?.marker) continue;
      targets.push({ kind: 'puzzle', label: p.name ?? p.id, x: p.marker.x, y: p.marker.y, z: p.marker.z });
    }

    const unreachable = [];
    for (const t of targets) {
      let ok = false;
      for (const n of nodes) {
        if (!n.seen) continue;
        if (Math.abs(n.x - t.x) > 2.2 || Math.abs(n.z - t.z) > 2.2) continue;
        if (Math.abs(n.y - t.y) > 2.6) continue;
        ok = true;
        break;
      }
      if (!ok) unreachable.push(t);
    }

    // --- cut-off regions ----------------------------------------------------
    const islands = [];
    for (const n of nodes) {
      if (n.seen || n.island) continue;
      const q = [n];
      n.island = true;
      const members = [];
      while (q.length) {
        const m = q.pop();
        members.push(m);
        for (const e of m.edges) {
          if (e.seen || e.island) continue;
          e.island = true;
          q.push(e);
        }
      }
      if (members.length < 18) continue;

      // Two kinds of unreachable surface are not bugs and have to be filtered
      // out or the report is unreadable:
      //
      //  - The tops of things. A rack, a wall head, a crate stack: standable,
      //    unreachable, and entirely intentional. The tell is that the same
      //    column also holds a surface the player CAN reach — the floor of the
      //    room the rack is standing in.
      //  - Roofs. The outside of the building has floor and headroom and is
      //    not part of the level. The tell is that nothing is above it.
      const overReachable = members.filter((m) => {
        for (const other of index.get(`${m.ix},${m.iz}`) ?? []) {
          if (other !== m && other.seen && other.y < m.y) return true;
        }
        return false;
      }).length;
      if (overReachable > members.length * 0.5) continue;

      const cx = members.reduce((a, m) => a + m.x, 0) / members.length;
      const cy = members.reduce((a, m) => a + m.y, 0) / members.length;
      const cz = members.reduce((a, m) => a + m.z, 0) / members.length;

      const roofed = ph.raycast({ x: cx, y: cy + 0.3, z: cz }, { x: 0, y: 1, z: 0 }, 9, W);
      if (!roofed) continue;

      islands.push({
        cells: members.length,
        at: [+cx.toFixed(1), +cy.toFixed(1), +cz.toFixed(1)],
        area: +(members.length * step * step).toFixed(0),
      });
    }
    islands.sort((a, b) => b.cells - a.cells);

    // Optional: dump the nodes around a point, for working out exactly where a
    // flood stops.
    let probe = null;
    if (window.__walkProbe) {
      const [px, pz, r] = window.__walkProbe;
      probe = nodes
        .filter((n) => Math.abs(n.x - px) <= r && Math.abs(n.z - pz) <= r)
        .map((n) => ({
          at: [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2)],
          seen: n.seen,
          links: n.edges.length,
        }))
        .sort((a, b) => b.at[2] - a.at[2]);
    }

    return {
      probe,
      nodes: nodes.length,
      reached,
      spawnAt: [+start.x.toFixed(1), +start.y.toFixed(1), +start.z.toFixed(1)],
      targets: targets.length,
      unreachable,
      islands: islands.slice(0, 8),
    };
  }, { step: STEP });

  console.log(`\n=== Chapter ${chapter} ===`);
  if (report.probe) {
    for (const row of report.probe) {
      console.log(`  probe ${JSON.stringify(row.at)} seen=${row.seen} links=${row.links}`);
    }
  }
  if (report.error) {
    failures++;
    console.log(`  FAIL  ${report.error}`);
    continue;
  }
  const areaOk = (report.reached * STEP * STEP).toFixed(0);
  console.log(`  walkable surface reached from spawn: ${report.reached}/${report.nodes} cells (~${areaOk} m2)`);

  for (const u of report.unreachable) {
    failures++;
    console.log(`  FAIL  ${u.kind}: ${u.label}`);
    console.log(`        at [${u.x.toFixed(1)}, ${u.y.toFixed(1)}, ${u.z.toFixed(1)}] — the player cannot walk to it`);
  }
  for (const island of report.islands) {
    failures++;
    console.log(`  FAIL  ${island.cells} cells (~${island.area} m2) of floor around [${island.at}] are cut off from the spawn`);
  }
  if (!report.unreachable.length && !report.islands.length) {
    console.log(`  all ${report.targets} objectives walkable, no cut-off regions`);
  }
}

await browser.close();
if (errors.length) console.log('\nerrors:', errors.slice(0, 6).join(' | '));
if (failures) {
  console.log(`\n${failures} place(s) the player cannot reach.`);
  process.exit(1);
}
console.log('\nEvery chapter is walkable end to end.');
