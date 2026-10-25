// Finds, for every Academy lesson and car body, a knob setting that makes the bot's demo
// land the move, and writes the table into js/tutorials.js (DEMO_PLANS).
// The physics is deterministic, so a plan found here replays the same way in the game.
//
//   node tools/plan-demos.js path/to/three.min.js     (three@0.147.0 build)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const threePath = process.argv[2];
if (!threePath) { console.error('usage: node tools/plan-demos.js path/to/three.min.js'); process.exit(1); }

const ctx = { console, Math, Map, Set, Array, Object, JSON, Float32Array, Uint16Array, Uint32Array, Int32Array, Uint8Array, Symbol, Infinity, NaN, Number, String, Boolean, Error, parseInt, parseFloat, isNaN, isFinite, Date, WeakMap, Promise, setTimeout };
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(threePath, 'utf8'), ctx);
let src = '';
for (const f of ['core.js', 'arena.js', 'physics.js', 'ai.js', 'tutorials.js']) src += fs.readFileSync(path.join(root, 'js', f), 'utf8') + '\n';
src += ';globalThis.API = { TUTORIALS, TutorialRun, World, Car, PHYS };';
vm.runInContext(src, ctx, { filename: 'tutorials-bundle.js' });
const { TUTORIALS, TutorialRun, World, Car, PHYS } = ctx.API;

const BODIES = ['octane', 'dominus', 'plank', 'breakout', 'hybrid', 'merc'];
function lands(lesson, body, tune) {
  const w = new World();
  const c = w.addCar(new Car({ body }));
  const run = new TutorialRun(w, c, lesson);
  run.start('demo', tune);
  for (let i = 0; i < 120 * 14 && !run.result && !run.finished; i++) {
    run.pre(PHYS.TICK); w.step(PHYS.TICK); run.post(PHYS.TICK, w.events, c.events);
    w.events.length = 0; c.events.length = 0;
  }
  return !!(run.result && run.result.ok);
}

const plans = {};
for (const lesson of TUTORIALS) {
  if (!lesson.knobs) continue;
  let combos = [{}];
  for (const [k, vals] of Object.entries(lesson.knobs)) {
    const next = [];
    for (const v of vals) for (const cmb of combos) next.push({ ...cmb, [k]: v });
    combos = next;
  }
  for (const body of BODIES) {
    const found = combos.find(t => lands(lesson, body, t));
    if (found) (plans[lesson.id] = plans[lesson.id] || {})[body] = found;
    console.log(lesson.id.padEnd(13), body.padEnd(9), found ? JSON.stringify(found) : 'NO PLAN');
  }
}

const file = path.join(root, 'js', 'tutorials.js');
const text = fs.readFileSync(file, 'utf8');
const out = text.replace(/\/\/ DEMO_PLANS_BEGIN[\s\S]*?\/\/ DEMO_PLANS_END/,
  '// DEMO_PLANS_BEGIN\nconst DEMO_PLANS = ' + JSON.stringify(plans) + ';\n// DEMO_PLANS_END');
fs.writeFileSync(file, out);
console.log('wrote DEMO_PLANS to js/tutorials.js');
