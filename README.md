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
