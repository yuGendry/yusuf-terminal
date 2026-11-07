# LEVEL 0: THE HUM

A first-person horror survival game in the backrooms, in one `index.html` (three.js, no build step).

## Run it

Browsers block ES modules and model loading from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. GitHub Pages works too: enable it for this branch and open the page.

## The story

You were the night auditor at Hallow & Sons. You blinked, and woke up in a yellow room that never ends.

1. Pick up the flashlight that's lying on the floor, still on.
2. Search the old chest in your room for batteries.
3. Find the breaker panel in the Long Hall, then find 3 fuses and restore the power.
4. Survive. Read the 6 notes left by the last survivor to learn what the creature really is.

- **Safe rooms:** the creature cannot enter **your room** or **the stalls**, but it will wait at the door and watch you.
- **Monday, 03:00:** once a week the hum stops. Your room loses its protection and the creature hunts you until 04:00. The stalls stay safe.
- **Every midnight** the fuses blow and the lights die. **Every dawn** the chests refill.
- It gets a little faster every day. How long can you last?

## Controls

| Key | Action |
| --- | --- |
| WASD / mouse | move / look |
| Shift | sprint (loud) |
| C / Ctrl | crouch (quiet) |
| F | flashlight |
| R | swap battery |
| Right mouse / Q | light burst: stuns the creature, costs 20% battery |
| E | interact |
| J | journal |
| Esc | pause |
| F2 | enter creator code |

## Creator mode

Click **Creator mode** on the title screen, or press **F2** in game, and enter the passcode.

- You are invisible to the creature. You can fly with no-clip (**V**) and change your speed.
- **TAB** switches between looking and the mouse cursor. Click any object to move, rotate or scale it with a gizmo (**1/2/3**), tint it, or delete it (**Del**). **G** grabs the object you're aiming at.
- Spawn chests, batteries, fuses, lamps, crates and wall blocks. Collision rebuilds automatically.
- Control the creature (freeze, summon, stun, speed, sight), the clock (jump to Monday 02:58), power per room, brightness and fog.
- Your edits are saved in the browser and also appear in normal games. Use **Reset all edits** to clear them.

## Assets

`assets/` holds optimised versions of the supplied models: backrooms map, creeping shadow creature, tactical flashlight, animated chest and first-person arms. Textures are converted to WebP/JPEG and meshes are meshopt-compressed. All sound is generated live with the Web Audio API.

---

# PISTOL PANIC (`fps/`)

A neon arena shooter: you against up to 11 emotional bots, pistols only. Everything is in `fps/index.html` (three.js, no build step).

Open http://localhost:8000/fps/ with the same local server as above.

- **One gun for everyone:** a Beretta 92 held in animated first-person arms, with fire, two reloads (tactical, and empty with slide rack) and an inspect animation, all cut from the supplied model's take.
- **Bullets are the only pickups.** Glowing cartridges around the map give +15 rounds and respawn after 10 s. Now and then a **golden round** spawns: whoever grabs it kills anything with their next hit.
- **Bots with feelings:** the NPC's 4 heads (neutral, shocked, angry, furious) swap live with the bot's mood. They react when they spot you, get hit, take a headshot, run out of ammo, get a kill (they cheer) or hold a grudge against whoever killed them last. Each one also shows emoji and speech bubbles and has a little synthesized voice.
- **Bot AI:** A* navigation on a grid baked from the map, sight and hearing, reaction time, aim that settles over time, strafing, crouching, hopping, retreating when hurt, hunting ammo, and a pistol whip when they're out of bullets. Bodies are animated procedurally (walk/run cycles, two-handed aim, crouch, jump, flinch, cheer, panic, fall).
- **Movement:** sprint, jump, crouch, power slide (sprint + C, and you can jump out of it), air control, coyote time.
- **Visuals:** synthwave sky with a striped sun, neon horizon mountains, an animated glowing floor grid, emissive trims on the walls, holographic crates, shadows, bloom, chromatic aberration, tracers, sparks, bullet holes, ejected brass, muzzle light.
- **Ranked ladder:** Bronze, Silver, Gold, Platinum, Diamond, Master and Grandmaster (each with divisions III, II and I), then Legend. Your rank sets bot skill: Bronze III bots play like Easy and Legend bots play like Insane. Past Legend the bots get faster and deadlier still: quicker reactions, tighter aim, more headshots and more damage. You earn or lose RP from where you place, your kills and whether you win; matches with more bots pay more. Leaving a ranked match early costs 20 RP. Your rank is saved in the browser. **Casual** lets you pick the difficulty yourself and doesn't touch RP.
- **Last Stand mode:** one life each, no respawns. The last one alive wins. If you go down you can spectate the survivors (Space or click to switch, Enter for results). Your placement is locked in when you're eliminated.
- Deathmatch with kill and time limits, kill feed, multi-kill and spree announcer, radar, hit markers, damage numbers and direction, scoreboard, end-of-match stats, procedural synthwave music.

| Key | Action |
| --- | --- |
| WASD / mouse | move / look |
| Left click | shoot (hold for rapid fire, spread blooms) |
| Right click | aim down sights |
| Space | jump |
| C | crouch, or power slide while sprinting |
| Shift | sprint |
| R | reload |
| V | pistol whip (one-hit from behind) |
| F | inspect pistol |
| Tab | scoreboard |
| M | music on/off |
| Esc | pause |

`fps/assets/` holds the converted models: the arena (FBX to meshopt GLB, scaled to metres), the arms and Beretta, and the NPC, plus the textures packed into WebP (colour, normal and AO/roughness/metal).
