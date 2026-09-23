# THE LAST TRAIN — Chapter One: *The Call*

A first-person horror game that runs in the browser. No build step, no install,
no internet connection required.

> 2:14 a.m. You are asleep. The phone is ringing.

## Play

Open `index.html` in a browser (Chrome, Edge or Firefox). That's it.

If you prefer a local server (recommended on Safari):

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

## Controls

| Key | Action |
| --- | --- |
| `E` | Wake up · interact · pick things up |
| `W A S D` | Move |
| `Shift` | Run |
| `Space` | Jump |
| `Mouse` | Look (click the screen to capture the pointer) |
| `Esc` | Pause / release the pointer |

## Chapter One — *The Call*

1. **Main menu** — the last train idles at a rainswept platform.
2. **The dark** — you wake to a ringing phone. `E` to open your eyes.
3. **The flat** — you sit up, stretch, stand. Controls are handed over.
4. **The call** — answer it. Something on the line wants to meet you at the train station.
5. **Leaving** — the lights die. Get to the front door.

## Chapter Two — *The Station*

Runs straight on from chapter one, or from **Continue** on the menu.

1. **Ardwick Row** — a city street at 2 a.m., rain, parked cars, nobody. A payphone
   on the corner rings as you pass; you can answer it.
2. **The crossing** — the lights ahead go out one at a time, and something is
   standing in the last of them.
3. **The underpass** — the strip lights die behind you and the footsteps
   following you are not yours.
4. **The plaza** — Central Station, its clock stopped at 2:14.
5. **The concourse** — empty ticket hall, a suitcase nobody came back for, and a
   departure board that starts to come apart as you read it.
6. **Platform 1** — the 02:14 is waiting with its doors open.

Chapter Three is not built yet — chapter two ends as the doors close.

## What's in the box

```
index.html           the entire game: world, audio, UI, story beats
lib/three.bundle.js  three.js r161 + postprocessing (MIT), bundled for offline play
```

Every asset is generated at runtime — the wallpaper, floorboards, brick, the
rain, the TV static, the phone screen, and every sound (the ringtone, footsteps,
the train horn, the voice on the line) is synthesized in code with canvas and
the WebAudio API. There are no image or audio files to lose.

## Settings

Mouse sensitivity, FOV, brightness, volume, head bob, invert-Y, film grain,
bloom and subtitles. They persist in `localStorage`.

## Poking at it

`index.html?skipintro=1` drops you straight into the flat with the phone
already ringing, and `index.html?chapter2=1` starts on the street outside the
block — both save replaying earlier beats while you edit.

`window.LASTTRAIN` exposes `{ GAME, PL, WORLD, S, Audio, camera, scene, armsTo, POSE }` in the
console, which is the quickest way to teleport (`LASTTRAIN.PL.pos.set(9, 0, -3)`),
jump phases, or re-trigger a beat while editing.

Useful anchors inside `index.html`:

| Section | What it does |
| --- | --- |
| `AUDIO` | every synthesized sound |
| `PROCEDURAL TEXTURES` | canvas-drawn materials |
| `MENU SCENE` | the station, the train, the skyline |
| `APARTMENT` | the flat's geometry, lights and props |
| `PLAYER` | movement, collision, head bob |
| `SEQUENCE: …` | the wake-up, the call, and leaving |
| `CHAPTER TWO — THE CITY` | streets, buildings, underpass, station, platform |
| `SEQUENCE: CHAPTER TWO` | the walk's scripted beats and the ending |
| `PER-FRAME — CHAPTER TWO` | lamps, triggers, rain cover, the figure |

The apartment footprint is `x[-6, 11] × z[-7, 1]` with the partition wall at
`x = 0`; colliders are plain `THREE.Box3`s pushed by the `box()` helper, so new
furniture is solid automatically. The city's layout is written out in the
comment above `buildCity()` — the street runs along +x, Station Road runs to
−z, and the platform sits at `z ≈ -104` with the track bed at `y = -1.2`.

Chapter two draws forty-odd street lamps but only ever has five real point
lights: each frame the nearest lit lamps lend their position to a small pool of
lights (`updateCity`), because a shader that evaluates forty point lights per
fragment is what kills a scene like this.
