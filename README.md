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

npm run build:single      # one standalone STITCHWORK.html, no server needed
npm run singlefilecheck   # proves that file runs when opened straight off disk
```

### The single-file build

`npm run build:single` folds the entire game into one self-contained HTML file
that plays when you double-click it — no server, no Node, no install. That is
only possible because of two facts about this project that are not true of most
Vite apps: there are no asset files at all (every texture is generated on a
canvas at runtime and every sound is synthesised with the Web Audio API), and
`@dimforge/rapier3d-compat` carries its WebAssembly inlined as base64 inside
its own JavaScript. Both matter because a page loaded from `file://` is an
opaque origin and cannot fetch anything next to it — so the whole game has to
end up inside the one document, which also means the per-chapter dynamic
imports are flattened rather than code-split.

`singlefilecheck` opens the result over `file://`, exactly as Explorer would,
and fails if the page requests anything at all from the disk, if it never
reaches the menu, or if a chapter will not load.

`npm run build` produces a fully static site; `dist/` can be hosted anywhere
with no server-side component.

### Development tooling

```bash
npm run verify       # the checks that catch unplayable builds
npm run smoke        # headless launch check: boots the game, reports errors
npm run playtest     # movement, collision, stairs, ramps, crouch headroom
npm run chaptertest  # drives a chapter's puzzle chain (CHAPTER=2 for the second)
npm run doorcheck    # proves every doorway in every chapter is actually passable
npm run reachcheck   # proves every interactable can be stood next to and seen
npm run walkcheck    # floods each level from the spawn; proves you can get there
npm run leakcheck    # proves a chapter takes its collision with it when it unloads
npm run signcheck    # proves every sign, chart and gauge faces somewhere you can stand
npm run menucheck    # proves the whole front end can be driven without a mouse
npm run controlstest # every control, through real KeyboardEvents
npm run chasetest    # exercises Mister Tangle's rail AI and catch volume
npm run cinetest     # menu → drive → title page → opening → play → ending
npm run tour         # photographs every room in a chapter (CHAPTER=2)
npm run beauty       # renders framed screenshots at a chosen quality preset
npm run portraits    # close-ups of every creature, and the jumpscare frame by frame
```

These use Playwright against a software renderer, so they verify *simulation and
correctness*, not frame rate. They wait on the engine's own clock rather than on
wall-clock time for that reason, and they load with `?nocine=1` so they spend
their budget on the game rather than on the cutscenes.

Six of them exist because of specific bugs that shipped:

- **doorcheck** unlocks and opens every door and every doorless gap in every
  chapter, then fires a grid of rays through it and reports what blocked them.
  Three separate doorways once opened onto solid wall, because an opening in
  one room is not an opening in the room on the other side of it.
- **reachcheck** stands where a player would stand. For each interactable it
  samples positions around the object and asks whether there is floor and
  headroom there, whether the object is within its own declared reach, and
  whether the line to it is clear. Calling `onUse` by label — which every other
  harness does — passes happily on an object walled into the masonry.
- **walkcheck** floods the level from the spawn point and reports anything the
  game needs that the flood never reached, plus whole regions of floor that are
  cut off. It found a chapter whose stair descended into an unbroken wall, a
  chapter whose exit door opened onto the void where the next room was supposed
  to be, and a chase route whose every corner was sealed by its own handrail.
  The other checks cannot see any of that: doorcheck tests declared openings
  one at a time, and reachcheck never asks whether you can get to the place it
  wants you to stand.
- **signcheck** checks the clues nothing else can: the gauges, charts, works
  orders and notices that are read by looking rather than by pressing a key, so
  no harness that drives interactables ever touches them. For each single-sided
  plane it asks whether the face carrying the picture points at floor a player
  can stand on. Chapter 2's kiln gauge was mounted a quarter turn the wrong way
  — the readable side faced into the kiln's own steel — and the number the
  puzzle's whole lesson depends on could not be seen from anywhere in the room.
- **menucheck** drives the front end with real key events. Every screen
  outside gameplay was click-only, which meant a player could rebind their jump
  button with a controller in their hands and then be unable to press Play with
  it. It asserts that exactly one thing is selected on each screen, that the
  selection moves, that Enter opens it and Escape comes back, that the chapter
  art is actually drawn rather than an empty canvas, and that the archive lists
  what has been found and can open it.
- **leakcheck** loads every chapter twice — once clean, once after every other
  chapter — and fails if the collider count drifts. The physics world is shared
  for the whole session, so a chapter that does not remove its collision leaves
  the next one built inside its walls.

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

### Controller

A DualSense — or any gamepad the browser reports as standard — is picked up
automatically. There is nothing to enable and nothing to pair in-game: plug it
in or connect it over Bluetooth and press something.

| Action | Button |
| --- | --- |
| Move | Left stick (analogue: a half-pushed stick walks) |
| Look | Right stick |
| Sprint | `L3` |
| Crouch | `◯` |
| Jump | `✕` |
| Interact | `▢` |
| Veilmask on/off | `△` |
| Swap lens | `L1` / `R1` |
| Flashlight | `R3` |
| Hint | D-pad up |
| Journal | D-pad down |
| Pause | `Options` |

The on-screen prompts follow whichever device you last touched, so a controller
player is never told to press `E` and a keyboard player is never shown a `▢`. A
pad that is merely plugged in does not take the prompts over — only real input
does, so a drifting stick cannot steal them from the keyboard.

Vibration, stick sensitivity and vertical inversion are under
**Settings → Controls → Controller**. The stick has its own sensitivity because
a number that is right for a mouse never is for a thumbstick.

---

## Current state

**Chapters 1 to 4 are playable, end to end.** The lobby, the theatre and the
rigging chase; the workshop, the kiln and the conveyor run; the rehearsal
floor, the costume basement, the crossover, the dressing rooms and the practice
room; the flooded hall, Odile's laboratory, the dye house, the cut stair, the
Threadworks and the lift. Roughly an hour, 24 puzzles, four lenses, four
creatures and seven pursuit beats across 9,000 square metres of walkable floor.

Every chapter is selectable from the start. Chapter Select has never been
locked behind progress: the one thing a new player should not have to do is
finish an hour of game to find out what is in it.

A new game opens on **the drive out**: forty-eight seconds in a car on a wet
road in November 1996, arriving at the factory gates. Each chapter then opens
on its own **title page** — name, epigraph, the score that is about to play,
which lens it grants, how many ticket stubs it hides — which stays up for the
whole of the load, and then on a camera move through the room you are about to
walk into that ends exactly at your own eye. Each chapter closes on one too.
Every cinematic is skippable by holding `Space`, and a skip still runs every
beat, so the world ends up in the state watching would have left it in.
Cutscenes can be turned off entirely in **Settings → Accessibility**.

The score is one tune in five arrangements: a music box in the lobby, struck
wood in the workshop, sung in the rehearsal halls, drowned in the basement, a
theatre organ for the premiere. The chapter change retunes the live oscillators
rather than cutting between tracks.

Chapter 5, *The Grand Premiere*, is not built. It appears in Chapter Select
with its card struck through and says plainly that it does not exist yet.

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

The full solution, and every other puzzle's, is in
[WALKTHROUGH.md](WALKTHROUGH.md).

### Chapter 2 — The Workshop

The Ember lens, a rack of forty carved hands of which exactly one is warm, a
keypad whose code is written in residual heat, and the kiln.

The kiln puzzle is built on real pottery practice. The gauge was last
calibrated in 1984 and reads about 300°C low; the log tells you to fire to
cone 6. A pyrometric cone is a slug of clay formulated to slump at a known
temperature, and potters fire to a cone rather than to a dial precisely because
dials drift. The cones are inside the kiln, and Ember does not merely light
them — it renders the steel shell transparent, so you watch three numbered
cones stand, lean and go over inside a box you cannot open. The climb flattens
out near temperature the way a real firing does, which is what makes the gap
between cone 6 going over and cone 7 going over a decision rather than a
reflex. Trust the gauge instead and you will overfire to nearly 1530°C and
crack everything — recoverable, but you will have to start the firing again.

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

West of the costume floor is **the crossover**: forty feet of everything
nobody would carry upstairs, and the only way to the dressing rooms. The crew
wore a path down the middle of the boards over eleven years of two shows a
night, and that worn strip — which only Echo shows — is the only quiet ground
in the room. Echo is worn on the mask, the mask hums, and the hum is the first
thing Gloam hears. So you look, take it off, walk what you remember, lose it,
stop, and look again. The answer is visible the whole time and looking at it is
what gets you killed.

At the far end, five dressing rooms and **the calls panel** stage management
used to call the company down for beginners. Five buttons, a call sheet of
four rooms, and room 3, which is never called and which fails the whole call.
Run it correctly and "your beginners call" goes out over the one horn still
wired on that floor, twenty-five metres away at the other dead end — and the
thing in the crossover goes to answer it. That is the window to get back.

The practice room holds **the Choir**: porcelain dolls that move only when
unobserved. A doll counts as observed when it is inside the camera frustum,
inside the player's attention cone, *and* not occluded — frustum alone is not
enough, because a doll at the edge of a wide FOV is technically on screen while
nobody is looking at it. Their heads are allowed to turn on screen, which is
far worse than their feet moving. The gramophone by the door holds them still
while it plays, for about twenty-five seconds.

### Chapter 4 — Backstage

The water is the level design: every space is two spaces, one flooded and one
drained, and almost every mechanic is really a question about which of the two
you are standing in. The **dip tank** in the dye house is that idea small
enough to hold in one room — the spool you need is at the bottom of it and the
only tool is the tank's own level. Empty, you can climb in, unclamp the crate
and shut its lid; full, the crate floats to the rim where you can reach it.
Neither state alone is enough, and both failures are visible: flood it with the
lid open and you watch the crate fill and sit down on the bottom.

Setting that spool in the loom brings **the Understudy** down onto the
Threadworks floor, and it walks its rounds — a fixed loop of the room, at its
one unvarying pace, not looking for anybody, while you thread four heads at a
bench in the middle of that loop. Deliberately not a chase: a chase can be
outrun and is therefore a problem with a solution, while a thing crossing the
room on its own business, which will walk through you without ever noticing it
did, is a condition you work around. When the loom takes up and it does start
hunting, that lands as a change in what it is doing rather than as the first
time you have seen it.

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
  crossfade asymmetrically — the chase slams in and bleeds out slowly, and one
  arrangement per chapter on a different instrument.
- A cinematic system: keyframed camera, captions, letterbox, hold-to-skip, and
  an opening and closing shot for every chapter filmed inside the level itself.
- Checkpoints, a jumpscare that frames whatever caught you — it works its face
  out of the creature's own silhouette rather than from a fixed height, because
  a fixed height is wrong for every creature in the game by a different amount
  — and autosave to `localStorage`.
- A front end that can be driven entirely from a controller or the keyboard,
  chapter cards with art drawn at runtime, and an archive that lets you reread
  every note, tape and ticket stub you have found.
- Full DualSense support: analogue movement, per-device prompt glyphs, rumble,
  and its own sensitivity and inversion settings.

### Not built yet

Chapter 5, hiding spots, and the endings. Everything else described above is
in and checked by the suite.

## Architecture

```
src/
  core/        Engine, PostFX + shaders, Settings, Input, Physics,
               Interaction, Game (a play session)
  player/      PlayerController, Flashlight
  mask/        Veilmask
  ai/          MisterTangle (rail network + the AI bound to it)
  puzzles/     PuzzleSystem (state + the three-tier hint ladder)
  world/       Textures, Materials, Puppet, Atmosphere, LevelKit, EchoGhost
  menu/        MenuScene (the live 3D main-menu backdrop)
  cinematics/  Cinematic (the timeline), IntroDrive + IntroSequence (the drive
               out), ChapterCinematics (per-chapter openings and endings)
  ui/          MainMenu, SettingsMenu, HUD, MaskOverlay, Reader, ChapterScreen
  audio/       AudioEngine, GameSounds, MusicEngine
  save/        SaveSystem
  chapters/    ChapterData, StoryContent, Chapter1-3, Sandbox (chapter 0, the
               movement proving ground; not reachable from the menu)
  util/        EventBus, MathUtil
```

Chapters are dynamically imported, so the menu does not pay for level code.

The engine, input, physics and audio are created once and persist for the whole
session; only scenes and level content are torn down between states.

### Notes on four non-obvious decisions

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

**Cinematic cameras interpolate between keyframes rather than along a spline.**
A spline is the obvious choice and it is wrong here. Shot lists hold a pose
across two keyframes, and they cut between a subject 30cm from the lens and one
40 metres away. Any Catmull-Rom through points spaced like that swings wide
between the two identical poses, because its tangents are set by the far-away
neighbours — so the camera drifts off the subject in the middle of its own
shot. Centripetal parameterisation does not rescue it either: two coincident
control points degenerate its knot spacing and it falls back to the same
behaviour. Interpolating between the two bracketing keyframes cannot do that,
and because every easing curve here has zero derivative at both ends the
motion still settles into each mark smoothly.

**Wall textures are tiled by geometry, not by material.** A box face's UVs run
0..1 whatever its size, so a shared material gives a 22-metre wall and the
1.5-metre pier between two doors the same number of texture repeats. `box()`
takes a `tile` option that rescales the geometry's UVs to a fixed world size
and divides out whatever repeat the material already carries, which keeps the
material library shared and the texel density constant.

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
