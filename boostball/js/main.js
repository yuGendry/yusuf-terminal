// Boot: settings, loadout, renderer, loop.
'use strict';

(function boot() {
  const stored = safeStore('boostball.settings');
  const settings = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), stored || {});
  // make sure every action has a binding list
  for (const a of ACTIONS) {
    if (!Array.isArray(settings.bindings.keys[a.id])) settings.bindings.keys[a.id] = (DEFAULT_KEYS[a.id] || []).slice();
    if (!Array.isArray(settings.bindings.pad[a.id])) settings.bindings.pad[a.id] = (DEFAULT_PAD[a.id] || []).slice();
  }
  const loadout = deepMerge(DEFAULT_LOADOUT, safeStore('boostball.loadout') || {});
  const save = () => { safeStore('boostball.settings', settings); safeStore('boostball.loadout', loadout); };

  const canvas = document.getElementById('game');
  let renderer;
  try {
    renderer = new Renderer(canvas, settings);
  } catch (e) {
    document.getElementById('fatal').classList.remove('hidden');
    document.getElementById('fatal').textContent = 'WebGL is not available in this browser: ' + e.message;
    return;
  }
  renderer.garage = new Garage();
  const input = new Input(settings);
  const sfx = new Sfx(settings);
  const game = new Game(renderer, input, sfx, settings, loadout);
  const ui = new UI(game, input, sfx, settings, loadout, renderer, save);
  window.__bb = { game, ui, renderer, input, settings };

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      input.poll();
      ui.update(dt);
      game.frame(dt);
    } catch (e) {
      console.error(e);
    }
    input.endFrame();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.getElementById('loading').classList.add('hidden');
})();
