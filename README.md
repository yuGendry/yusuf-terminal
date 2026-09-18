# STITCHWORK

A first-person horror puzzle game set in the abandoned **Hollowhart Puppet
Works**. Built to run in the browser with Three.js, WebGL2 and Rapier physics.
Every model, texture and sound is generated at runtime — the repository ships
no art or audio files.

> It is 1996. Ten years ago the Hollowhart Puppet Works closed overnight when
> 43 employees vanished during the Grand Premiere. Your sister Wren was one of
> the puppeteers. A package arrives with no return address: a porcelain mask,
> and a note in her handwriting.
>
> *They're still performing. Put on the mask. Come find me.*

---

## Running it

Requires Node 18+ and a browser with **WebGL2**.

```bash
npm install
npm run dev      # development server on http://localhost:5173
npm run build    # static site in dist/
npm run preview  # serve the production build
```

`npm run build` produces a fully static site; `dist/` can be hosted anywhere
with no server-side component.

### Development tooling

```bash
npm run smoke     # headless launch check: boots the game, reports errors
npm run playtest  # drives the player through movement, collision and crouch tests
npm run beauty    # renders framed screenshots at a chosen quality preset
```

These use Playwright against a software renderer, so they verify *simulation and
correctness*, not frame rate. They wait on the engine's own clock rather than on
wall-clock time for that reason.

---

## Controls

| Action | Default | Notes |
| --- | --- | --- |
| Move | `W` `A` `S` `D` | |
| Sprint | `Left Shift` | Costs stamina; hold or toggle (Settings → Accessibility) |
| Crouch | `Left Ctrl` | Quieter, slower, fits through vents |
| Jump / vault | `Space` | |
| Interact | `E` | |
| Veilmask on/off | `F` | |
| Swap lens | `Q` / `R`, or scroll | |
| Flashlight | `L` | Found in Chapter 1 |
| Hint | `H` | Three tiers, vague → solution |
| Journal | `J` | Collected notes and clues |
| Pause | `Escape` | |

Every binding is rebindable in **Settings → Controls**.

---

## Current state

This is **Phase 1 of 6**: engine, renderer, post-processing, player controller,
settings and main menu. The chapters themselves are not built yet — selecting
*New Game* drops you into a proving-ground room used to test movement,
collision, lighting and the post stack end to end.

### What works now

**Rendering**
- PBR materials with real-time shadows from spot and directional lights.
- Custom post chain: SSAO → camera-velocity motion blur → bloom → ACES tonemap
  + grade + chromatic aberration + vignette + film grain → SMAA/FXAA.
  It is hand-rolled rather than using `EffectComposer` so the scene's depth
  buffer survives the whole frame for SSAO and motion blur to share.
- Volumetric-looking god rays, and dust motes that are **lit by the room's
  actual practical lights** rather than drawn at constant brightness.
- Flickering practicals with asymmetric filament response.

**Simulation**
- Rapier kinematic character controller: slope limits, auto-step onto stairs,
  ground snapping, and dynamic props that can be shoved.
- Weighty first-person movement with separate acceleration/deceleration, sprint
  stamina with hysteresis, crouch with a headroom check that refuses to stand
  under a low ceiling.
- Camera feel assembled from independent layers — eye height, distance-locked
  head bob, a landing spring, strafe lean and trauma shake — each separately
  disableable for accessibility.
- A noise level the AI will read in a later phase, derived from stance, speed
  and breathing.

**Content generation**
- Procedural textures: aged floorboards, cracked plaster, rusting painted
  steel, theatre velvet, porcelain with craquelure, peeling wallpaper, grubby
  tile, water. Normal maps are Sobel-derived from generated height fields.
- A procedural marionette builder with a real joint hierarchy, carved face
  geometry and live control strings. The same builder produces the menu puppet
  and, with different proportions, the monsters.

**Interface**
- Main menu over a live 3D push through the ruined auditorium. The marionette
  on stage turns to look at the camera if the mouse sits still, and there is a
  Wren easter egg at 60 seconds.
- Complete settings: graphics presets and every individual toggle, resolution
  scale, shadow quality, motion blur/bloom/grain/aberration with intensity
  sliders, FOV, a gamma calibration screen, mouse sensitivity, full key
  rebinding, four audio buses, and accessibility options (subtitles and size,
  reduced flashing, reduced shake, reduced head bob, hold-vs-toggle).
  All persisted to `localStorage` and applied live.
- Save system separating the **profile** (collectibles and unlocked chapters,
  which survive death and new games) from the **save slot** (the resumable run).

### Not built yet

Phases 2–6: the Veilmask and its four lenses, the flashlight, interaction and
hint systems, the procedural score and adaptive music, the five chapters, the
monsters, the endings and the collectibles archive.

---

## Architecture

```
src/
  core/        Engine, PostFX + shaders, Settings, Input, Physics
  player/      PlayerController
  world/       Textures, Materials, Puppet, Atmosphere
  menu/        MenuScene (the live 3D main-menu backdrop)
  ui/          MainMenu, SettingsMenu, HUD, Widgets
  audio/       AudioEngine
  save/        SaveSystem
  chapters/    ChapterData, Sandbox (proving ground)
  util/        EventBus, MathUtil
```

The engine, input, physics and audio are created once and persist for the whole
session; only scenes and level content are torn down between states.

### Notes on two non-obvious decisions

**The post chain does not use `EffectComposer`.** Its ping-pong render targets
share (and its shader passes write to) the attached `DepthTexture`, which
destroys the depth buffer that SSAO and motion blur both need. Owning the
targets directly means the scene renders once into a target that keeps its
depth for the whole frame while colour ping-pongs around it.

**Physics queries must be refreshed after building a level.** Rapier only
rebuilds its broad phase inside `world.step()`, so colliders created during
level construction are invisible to raycasts and to the character controller
until a step has run. A player spawned before that step finds no floor, falls a
frame of gravity into the ground, and stays there — the character controller
prevents *new* penetration but never resolves penetration that already exists.
`Physics.refreshQueries()` is called after every level build, and
`PlayerController.teleport()` additionally settles the capsule onto the floor by
raycast.

---

## Credits and licensing

See [CREDITS.md](CREDITS.md). Everything is original; the only third-party code
is three.js (MIT), Rapier (Apache-2.0), Vite (MIT) and Playwright (Apache-2.0,
development only).
