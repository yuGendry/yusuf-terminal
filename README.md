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
npm run smoke        # headless launch check: boots the game, reports errors
npm run playtest     # movement, collision, stairs, ramps, crouch headroom
npm run chaptertest  # drives a chapter's puzzle chain (CHAPTER=2 for the second)
npm run chasetest    # exercises Mister Tangle's rail AI and catch volume
npm run beauty       # renders framed screenshots at a chosen quality preset
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
| Jump | `Space` | With coyote time and an input buffer |
| Interact | `E` | |
| Veilmask on/off | `F` | |
| Swap lens | `Q` / `R`, or scroll | |
| Flashlight | `L` | Found in the Chapter 1 ticket office |
| Hint | `H` | Three tiers, vague → solution; also in the pause menu |
| Journal | `J` | Not implemented yet |
| Pause | `Escape` | |

Every binding is rebindable in **Settings → Controls**.

---

## Current state

**Chapters 1, 2 and 3 are playable.** You can start a new game and
play through the lobby, the theatre, the rigging chase, the workshop, the kiln,
the conveyor run, the rehearsal floor, the costume basement and the practice
room — roughly 45 minutes, three puzzles per chapter, three lenses, three
monsters.

Chapters 4 and 5 are not built. Finishing Chapter 3 unlocks Chapter 4 in the
menu and then says plainly that it does not exist yet.

### The Veilmask

Press **F** to wear it. It reveals a second version of the room, and it costs.

- **Strain** rises while it is on, faster for the more expensive lenses and
  faster still when you are out of breath. At maximum it tears itself off and
  blinds you for a few seconds, then refuses to go back on for another seven.
- **It hums.** Quietly, rising with Strain — and that hum is what Mister Tangle
  is listening for. Wearing the mask near him is how you get caught.
- **Hallucinations** start around 35% Strain: whispers, footsteps behind you,
  someone saying your name, figures at the edge of vision that are gone when
  you look at them. None of them can hurt you and none of them replaces a real
  threat cue, so you can never die from trusting the wrong one. They are routed
  through the same 3D panner as real sounds, so they are genuinely
  indistinguishable by ear.
- Cracks spread through the porcelain as you use it, drawn as real SVG paths
  that stroke themselves in.

**Threadlight** (Ch. 1) shows the threads — which breaker feeds which circuit,
which slider is wired to which lamp, and the rails Mister Tangle is bound to.
**Ember** (Ch. 2) shows what is warm: a carved hand somebody was holding, the
four keys of a code in the order they were pressed, the cones inside a kiln.

### Chapter 1 — Curtain Call

Three puzzles that teach in order: one solved with your eyes (a bent bar in the
ticket grille), one impossible without the lens (three unlabelled breakers,
only one of which feeds the stage), and one where the lens gives you
information but you still have to think (six sliders scrambled against six
spotlights, with a rehearsal poster showing which marks must be lit).

Then the rigging run: Mister Tangle drops from the fly loft and you cross the
catwalks to a fire door.

### Chapter 2 — The Workshop

The Ember lens, a rack of forty carved hands of which exactly one is warm, a
keypad whose code is written in residual heat, and the kiln.

The kiln puzzle is built on real pottery practice. The gauge was last
calibrated in 1984 and reads about 300°C low; the log tells you to fire to
cone 6. A pyrometric cone is a slug of clay formulated to slump at a known
temperature, and potters fire to a cone rather than to a dial precisely because
dials drift. The cones are inside the kiln, so Ember is the only way to watch
them. Trust the gauge and you will overfire to nearly 1530°C and crack
everything — recoverable, but you will have to start the firing again.

### Chapter 3 — Rehearsal

The Echo lens shows what happened in a room. Ghosts are recordings, not
characters: they walk a fixed path, perform at fixed times, and loop. They
cannot see you and never react — which is what makes the lens read as looking
at the past, and what lets a ghost be a fair clue, because it does the same
thing every time you watch it.

Three chalk marks on the rehearsal floor, and a rehearsal that never finished.
Watch her walk them, then walk them yourself in the same order.

Then the basement, and **Gloam**: blind, many-armed, hunting entirely by sound.
It never tests line of sight, not once. It only ever moves toward a *sound
event* — a position and a loudness — and it goes where the sound was, not where
you are. Crouch and it cannot hear you. Stop moving and it loses you. Wear the
mask and you are simply telling it where to come.

The practice room holds **the Choir**: porcelain dolls that move only when
unobserved. A doll counts as observed when it is inside the camera frustum,
inside the player's attention cone, *and* not occluded — frustum alone is not
enough, because a doll at the edge of a wide FOV is technically on screen while
nobody is looking at it. Their heads are allowed to turn on screen, which is
far worse than their feet moving. The gramophone by the door holds them still
while it plays, for about twenty-five seconds.

### Mister Tangle

He hangs from the fly rails and **can only go where the rail goes**. He does
not pathfind through rooms; he pathfinds through a graph of rail nodes, and
drops his arms at whatever is underneath. Threadlight makes that graph visible,
which turns every room into a map of where you are safe.

His swipe is a cylinder hanging under his point on the rail, not a test against
his hands — the limbs are procedurally animated, so testing them made being
caught depend on the phase of a sine wave, and the same spot would kill on one
attempt and not the next. Step out from under the rail and he has not got you.

### Everything else built

- Interaction with hold-to-use, occlusion checks and lens requirements.
- A hint system with three tiers per puzzle (points at the clue → explains the
  mechanism → gives the answer), released on a timer so pressing **H** once
  does not hand over the solution.
- Notes, ticket stubs and VHS tapes, with a full-screen reader; the tapes play
  as animated slideshows with tracking bars, timecode burn-in and glitch frames.
- A procedural score: the *Hollowhart Lullaby*, a slow waltz in D harmonic
  minor on a synthesised music box, with ambient/tension/chase layers that
  crossfade asymmetrically — the chase slams in and bleeds out slowly.
- Checkpoints, death with restraint (no jump-scare sting; the picture just
  closes in), and autosave to `localStorage`.

### Not built yet

Chapters 3–5, the Choir, Gloam, the Understudy, the Echo and Hollow lenses
(defined but not yet unlockable), hiding spots, the endings, and the
collectibles archive.

## Architecture

```
src/
  core/        Engine, PostFX + shaders, Settings, Input, Physics,
               Interaction, Game (a play session)
  player/      PlayerController, Flashlight
  mask/        Veilmask
  ai/          MisterTangle (rail network + the AI bound to it)
  puzzles/     PuzzleSystem (state + the three-tier hint ladder)
  world/       Textures, Materials, Puppet, Atmosphere, LevelKit
  menu/        MenuScene (the live 3D main-menu backdrop)
  ui/          MainMenu, SettingsMenu, HUD, MaskOverlay, Reader, Widgets
  audio/       AudioEngine, GameSounds, MusicEngine
  save/        SaveSystem
  chapters/    ChapterData, StoryContent, Chapter1, Chapter2, Sandbox
  util/        EventBus, MathUtil
```

Chapters are dynamically imported, so the menu does not pay for level code.

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

**A checkpoint must never sit inside the trigger it precedes.** Putting the
chase checkpoint inside the chase trigger meant a death respawned the player
into a chase already in progress, directly underneath Mister Tangle, where they
died again on his next swing — an unescapable loop. Chase checkpoints are set
several metres earlier, and `level.onRespawn()` re-arms the trigger, despawns
the enemy and resets the lighting so the player gets a clean run at it. Puzzle
progress is deliberately *not* reset; re-solving the lighting board after every
death would be busywork, not tension.

**Lens visibility is a tag, not a render layer.** Level geometry declares
`userData.lensOnly`, `userData.hiddenBy` or `userData.maskOnly`, and the mask
toggles `.visible` on a state change rather than per frame. Objects record the
level's own intended visibility the first time they are seen, so a door that is
hidden for its own reasons is not revealed by putting the mask on.

---

## Credits and licensing

See [CREDITS.md](CREDITS.md). Everything is original; the only third-party code
is three.js (MIT), Rapier (Apache-2.0), Vite (MIT) and Playwright (Apache-2.0,
development only).
