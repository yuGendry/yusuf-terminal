# Boostball Arena

A browser rocket-car soccer game built with Three.js. It recreates Soccar physics (car, ball, jumps, dodges, wall driving, flip resets, pinches, wavedashes, flicks) in plain HTML and JavaScript.

**Play:** open `dist/boostball.html` in a browser. It's a single file. Three.js and the fonts load from CDNs. You can also open `index.html` from a local web server, for example `npx serve boostball`.

## Modes
- **Exhibition** 1v1, 2v2 or 3v3 against bots. There are three bot levels: Rookie, Pro and All-Star. Bots pick the earliest reachable ball-prediction moment, curve in lined up with the goal, time their arrival, finish with dodges / jump shots / aerials, cross balls from the corners, rotate back when on the wrong side, defend shots on their net and back out when stuck. Matches include kickoffs, a 5:00 clock, overtime, demolitions, a scoreboard (Tab) and a results screen with MVP.
- **Heatseeker** 1v1 and 2v2. After each touch the ball homes toward the opponent's goal and gets faster with every hit.
- **Free Play** has unlimited boost and ball tools: reset, lob to me, air-dribble pop, ball on roof (V), wall shot, freeze ball and reset car.
- **Training packs**: Striker, Aerial, Goalie and Air Dribble. Each pack has 10 seeded shots that stay frozen until you move.
- **Kickoff practice**, solo or against a bot.
- **Mutators**: gravity, ball size, ball max speed, bounciness, boost amount, game speed, demolitions and match length.

## Physics (120 Hz fixed step, Unreal units)
| | value |
|---|---|
| Arena | 8192 × 10240 × 2044 uu, 45° corners, curved floor/wall/ceiling transitions |
| Goal | 1786 × 642.775 × 880 uu |
| Gravity | −650 uu/s² |
| Ball | radius 91.25, mass 30, max speed 6000, restitution 0.6, drag −0.0305, max spin 6 rad/s |
| Car | mass 180, max speed 2300, supersonic 2200, max angular velocity 5.5 rad/s |
| Throttle | 1600 → 160 uu/s² up to 1400 uu/s, braking 3500, coasting 525, air throttle 66.7 |
| Boost | 991.7 uu/s² on the ground, 1058.3 in the air, 33.3 boost/s, 0.1 s minimum |
| Jump | 291.7 impulse, then 1458.3 uu/s² while held, for up to 0.2 s |
| Double jump / dodge | within 1.25 s, or at any time after driving off a surface or after a flip reset |
| Dodge | 500 uu/s impulse, scaled for side and back dodges by speed; flip cancel; Z-velocity damping |
| Air control | roll 36.08, pitch 12.15, yaw 8.92 rad/s²; damping −4.47 / −2.80 / −1.89 |
| Steering | speed-based curvature table, powerslide |
| Sticky force | 0.5 g, plus extra on walls, so cars drive up walls and fall off the ceiling |
| Car–ball | rigid-body impulse plus the extra "Psyonix" impulse (scale 0.65 → 0.30 by relative speed) |
| Bumps and demos | bump velocity curves; a supersonic hit demolishes, with a 3 s respawn |
| Boost pads | standard 34-pad layout: 6 big pads (100 boost, 10 s) and 28 small pads (12 boost, 4 s) |
| Hitboxes | Octane, Dominus, Plank, Breakout, Hybrid and Merc, with their real dimensions and offsets |

Gameplay tuning on top of the measured constants:
- **Ball bounces:** Coulomb friction (μ 0.35) limited to what a rolling sphere can lose, so glancing wall/floor bounces keep 70–80% of their speed along the surface, and ground balls roll far instead of dying.
- **Touches:** the extra "Psyonix" impulse is only softened for resting contacts (under 150 uu/s of relative speed), so the ball can sit on your roof; overlap is resolved with a little separating speed so a pushed ball rolls off your nose instead of gluing to it.
- **Grounded cars:** a ball can't lever a car off its wheels, and a ball wedged under the car squirts out instead of pinning it.
- **Dribbling:** car contacts treat the ball as 2× harder to spin, so it rides the roof a bit better.
- **Flicks:** the extra impulse re-applies every other tick while touching, which gives flicks their pop.
- **Pinches:** a ball squeezed between a car and the floor, wall or ceiling shoots out of the gap at up to max ball speed.
- **Wavedash / zap dash:** landing mid-dodge stops the flip rotation and keeps the dodge speed.
- **Heatseeker:** the ball waits at center until the first touch, then homes toward the goal of the team that didn't touch it. Hitting that goal's backboard, crossbar or posts sends it back toward the other goal.
- **Speed flips:** after a dodge is cancelled (hold the stick against the flip), air roll and yaw act on the leftover rotation, so a diagonal flip + cancel + counter air roll lands flat at supersonic speed.

Flip resets: when 3 or more wheels touch the ball, your flip comes back. The HUD shows **FLIP (RESET)**. Landing on the ceiling with your wheels also restores your flip.

## Controls
Keyboard: W/S throttle (also pitch in the air), A/D steer, Space/RMB jump, Shift/LMB boost, C powerslide or air roll, Q/E air roll left/right, F ball cam, Tab scoreboard, Esc pause.

Controller (standard mapping): RT/LT throttle, left stick, A jump, B boost, X powerslide or air roll, LB/RB air roll left/right, Y ball cam, Start pause. LT/L2 is also bound to **Air Roll**: on the ground it reverses, in the air it's a free air roll where the stick picks the direction. Keyboard: X is a free air roll. You can navigate all menus with a controller.

You can rebind everything under **Settings → Bindings**. Settings also include deadzones, sensitivities, the camera (FOV, distance, height, angle, stiffness, swivel, transition, ball cam toggle or hold), video and audio.

## Graphics and assets
- Car models: [Kenney Toy Car Kit](https://kenney.nl/assets/toy-car-kit) (CC0), fitted to each body's real hitbox so what you see is what collides. Settings → Video → Show Hitboxes draws the boxes.
- Grass: [ambientCG Grass004](https://ambientcg.com/view?id=Grass004) (CC0), tiled over the painted pitch.
- Reflections from a baked night-stadium environment, plus bloom (toggle in Settings → Video).
- Raw files live in `assets/`; `node build.js` packs them into `js/assets.js` and the single-file `dist/boostball.html`.

## Code layout
- `js/core.js`: constants, curves, hitboxes
- `js/arena.js`: analytic arena collision and the boost pad and kickoff layouts
- `js/physics.js`: ball, car, suspension, driving, jumps, flips, air control and collisions
- `js/ai.js`: bots (ball prediction, rotation, shots, aerials, kickoffs, recovery)
- `js/models.js`: loads the embedded models/textures and fits cars to hitboxes
- `js/render.js`: stadium, arena meshes, car models, particles, bloom and garage showroom
- `js/game.js`: modes, match flow, camera and HUD
- `js/ui.js`: menus, garage, settings and rebinding
- `js/input.js`, `js/audio.js`, `js/main.js`

Run `node build.js` to regenerate `js/assets.js` and `dist/boostball.html` after editing the source or assets.
