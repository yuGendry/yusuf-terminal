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

## Difficulty

Pick it on the title screen, or change it in the pause menu.

| | Easy | Normal | Hard | Nightmare |
| --- | --- | --- | --- | --- |
| One battery lasts | 15 min | 9 min | 5.5 min | 4 min |
| Spare batteries at start | 3 | 1 | 0 | 0 |
| Creature speed | slower | normal | faster | fastest |
| Hold light on it to blind it | 0.9 s | 1.5 s | 2.3 s | doesn't work |
| It forgets you | quickly | normal | slowly | very slowly |

## How to get away

- **Break line of sight.** It goes to where it last saw you, then searches. Turn corners, then turn your light off and crouch.
- **Blind it.** Hold your flashlight steady on its face and it will be blinded for a few seconds. **Burst** (right click) stuns it instantly.
- **Lure it.** Throw a spare battery **[T]** down another hall. It runs to the noise, even mid-chase if it can't see you.
- **Safe rooms.** Your room and the stalls. On Monday at 03:00 only the stalls are safe.

## Controls

| Key | Action |
| --- | --- |
| WASD / mouse | move / look |
| Shift | sprint (loud) |
| C / Ctrl | crouch (quiet) |
| F | flashlight |
| R | swap battery |
| Right mouse / Q | light burst: stuns the creature instantly (costs charge, has a cooldown) |
| T | throw a spare battery as a lure (pick it up again afterwards) |
| H | hint + waypoint to your current objective |
| E | interact |
| J | journal |
| Esc | pause |
| F2 | enter creator code |

The pause menu has **Screen effects** (Smooth by default, or Intense with screen warping and shake), a **Head bob** slider, and a **Hints** toggle.

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

---

# HOLLOW PINES (`forest/`)

A survival horror in a huge forest, in one `forest/index.html` (three.js, no build step). Open http://localhost:8000/forest/ with the same local server as above.

## The story

Your car left the old logging road last night. You wake at dawn in Blackwood Forest. There is one trail through it, and the old loggers swore nothing that lives between the trees will ever set foot on it.

1. Take your flashlight from the wrecked car.
2. Follow the trail almost a kilometre to the Ranger Cabin. Use the radio and take the (empty) flare gun.
3. Prepare the signal, in any order:
   - the **tower key**, still on the missing ranger's body at the **Chapel Ruins** (north-west)
   - **fuel** for the tower's generator from the **Logging Camp** (west)
   - **flare shells** from the **Hunter's Shack** (south-east)
4. Survive 3 nights (2 on Easy).
5. When the patrol flies on the last dawn, get to the **Lookout Tower** (far north-east) and fire the flare.

- **Mornings (05:30 to 10:00) are safe everywhere.** Nothing hunts. Forage then.
- **The Grin (the bear):** the trail is safe. Leave it and a threat meter fills (faster at night, faster when you run, slower when you crouch). You hear twigs snap, then breathing, then it comes crashing through the trees. Run back to the trail: it stops at the edge, paces and stares, then leaves. If it catches you, it's over: it knocks you down and its grinning face drops onto yours (driven by the model's own jumpscare animation and camera bone).
- **The Mimic (the chameleon):** comes at night, anywhere. It's camouflaged (refractive, see-through, shimmering), not invisible, and it's dark and matte, so it doesn't light up in your beam. Look straight at it and it shows itself and freezes; look away and it creeps closer. Hold your flashlight on it to make it scream and flee.
- **Food only grows off the trail:** berries, mushrooms (never the purple glowing ones, they make you hallucinate) and the backpacks of lost hikers (canned food, batteries, bandages). Hunger drains all the time; food respawns every dawn.
- **The last night brings a storm:** rain, thunder, and lightning that lights everything up, including whatever is standing next to you.
- 12 journal pages, left by the missing ranger, the logging foreman, the hunter and others, tell you what the creatures are. Every built place (cabin, camps, chapel, shack, boathouse) is safe from the Grin. If you die, you can retry from the last dawn.

## Controls

| Key | Action |
| --- | --- |
| WASD / mouse | move / look |
| Shift | run |
| C / Ctrl | crouch (quieter) |
| E | interact / pick up / read |
| F | flashlight |
| R | swap batteries |
| Q | eat canned food |
| H | use bandage |
| M (hold) | map |
| J | re-read journal pages |
| Esc | pause |

## The world

- **The supplied forest map copied 169 times (13 x 13) into a forest about 1.3 x 1.3 km**, with an outer ring of copies for the horizon. Each copy is rotated, and every tree gets its own random scale and rotation so the copies don't look repeated. The trees stand on new terrain with valleys and ridges. Only the forest near you is built: tiles stream in and out as you move, so the huge map still runs smoothly.
- **A network of trails** (about 4.5 km) links the crash site, Ranger Cabin, Logging Camp, Chapel Ruins and graveyard, Lake Merrow and its boathouse, the Old Campsite, the Hunter's Shack and the Lookout Tower. Trees are cleared off the trails, they're dirt with wheel ruts, reflective posts mark them, and signposts stand at the junctions. You can walk anywhere there isn't a tree or deep water.
- The map (hold M) shows every place, the lake and pulsing rings around your current objectives; the compass shows objectives and anything nearby.
- Opening cutscene (aerial flyover, the trail, the Grin in the trees, the Mimic at night, the crash) told by a nature-documentary narrator (your browser's built-in speech voice, picking a British male voice when one is installed), with a skippable letterbox, an animated 3D title screen, and an ending sequence.
- **Visuals:** a full day/night cycle (sunrise, golden hour, moonlit nights) with sky, clouds, stars, moon, fog and shadows that follow the player. Sun and moon shafts stream through the trees, and leaves glow when the sun is behind them. The flashlight is the supplied tactical flashlight model, with its tail-button press animation, a glowing lens, a beam pattern and moving shadows on medium and high. Wind sways the trees and a GPU grass field. Fireflies, mist, pollen, rain, lightning, a volumetric flashlight beam, bloom, film grain, chromatic aberration, fear and damage effects, hallucinations.
- **Audio:** all generated live with Web Audio: wind, birds, crickets, owls, footsteps (different on the trail and in the leaves), heartbeat, 3D creature growls, roars, clicks and shrieks, thunder, rain, and dynamic music that turns into chase music.
- **Settings:** graphics quality (low / medium / high), difficulty (Easy / Normal / Nightmare), mouse sensitivity, volume, invert Y.

`forest/assets/` holds the converted models. The forest is converted from OBJ to meshopt GLB. The bear GLB keeps its 8 animations, with textures shrunk to WebP. The chameleon was a 600k-vertex FBX with no rig: it's converted to GLB, simplified to about 80k vertices and animated in a shader (crawl, tail and tongue).
