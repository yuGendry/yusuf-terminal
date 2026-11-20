# NEON COAST

An open-world crime and driving sandbox in one `index.html` (three.js, no build step). You play **Cole Navarro**, new in town with nothing but a bus ticket.

## Run it

Serve the **repository root** (the game borrows the pistol model from `../fps/assets`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/neoncoast/

## The world

Everything is one connected map you can drive across:

| Area | Built from |
| --- | --- |
| **Bayview City**: hilly streets, parks, body shops | `car-driving-simulator-sf` city model |
| **Golden Span Bridge**: extended down to the island | the city's bridge plus a generated deck |
| **Sunport Island**: airport, beach, palms | `Low_Poly_city.usdz` (scaled 14×) |
| **North Causeway → Pine Ridge**: forest | `Pine_Forest_at_Sunset.usdz` (scaled 10×) |
| **Silver Lake**: snowy mountain lake, ruins | `Lakeside_-_Exterior_Scene.usdz` |

Cars come from `generic-passenger-car-pack` (10 models, random paint) and the police cruiser. People come from `citizen-npc-pack`. Those models had no skeleton, so the game rigs them automatically on load and animates them in code (walk, run, aim, punch, swim, fall).

## Play

- **5 story missions**: delivery, a bridge race, a countryside pickup with a 3-star chase, a gang showdown.
- **Wanted level** (1–5 stars): cops chase in cars (pathfinding over the road map), get out and shoot. Break line of sight to lose them, or pay $100 at a body shop (cyan squares on the map) for a respray.
- **12 hidden packages** across all five areas, plus health, armor, weapon and ammo pickups.
- **GPS**: press **M**, click the map to set a waypoint, and a route draws on the minimap while you drive.
- Day/night cycle, traffic, pedestrians, car damage and explosions, autosave after missions.

| Key | Action |
| --- | --- |
| WASD / mouse | move / look (drive with W/S, steer with A/D) |
| Shift / Space | sprint / jump (handbrake in a car) |
| F | enter, exit or steal a car |
| Left / right click | punch or shoot / aim |
| 1 2 3, wheel | fists / pistol / auto pistol |
| R | reload |
| H / C | horn / car camera distance |
| M | map |
| Esc / P | pause |

## Rebuilding the assets

`tools/` has the scripts that turned the uploaded FBX/USDZ files into the compressed GLBs in `assets/`: `usd2glb2.py` (needs `usd-core`) and `build.mjs` (needs `@gltf-transform`, `meshoptimizer`, `sharp`, and `fbx2gltf` for the FBX files).
