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
