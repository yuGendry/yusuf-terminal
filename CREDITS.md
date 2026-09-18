# Credits

**STITCHWORK** is an original work. The Hollowhart Puppet Works, Madame Odile
Hollowhart, Wren, the Veilmask, Mister Tangle, the Choir, Gloam and the
Understudy are original characters and settings created for this game. No
characters, names, designs, story elements or assets from any existing game are
used.

## Assets

There are no asset files in this project. Everything the player sees and hears
is produced at runtime:

- **Geometry** is constructed from Three.js primitives and procedural
  generators (`src/world/Puppet.js`, `src/chapters/*`).
- **Textures** are rasterised into `<canvas>` elements on load — wood grain,
  plaster, rust, velvet, porcelain craquelure, wallpaper, tile and water
  (`src/world/Textures.js`). Normal maps are derived from the generated height
  fields with a Sobel filter.
- **Audio** is synthesised with the Web Audio API (`src/audio/`). No audio
  files are shipped.

No CC0 or third-party art, audio or model assets are included. If any are added
later, they will be listed here with their source and licence.

## Third-party software

| Package | Licence | Use |
| --- | --- | --- |
| [three.js](https://threejs.org) | MIT | WebGL renderer, math, scene graph, post-processing helpers (`UnrealBloomPass`, `SMAAPass`, `FXAAShader`) |
| [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`) | Apache-2.0 | Rigid-body physics and the kinematic character controller, compiled to WebAssembly |
| [Vite](https://vitejs.dev) | MIT | Development server and production bundler |
| [Playwright](https://playwright.dev) | Apache-2.0 | Headless smoke and playtest harness (development only; not shipped) |

## Typography

Served by Google Fonts under the SIL Open Font License 1.1:

- **Special Elite** — title treatment
- **Cormorant Garamond** — interface and subtitles
- **IBM Plex Mono** — labels, readouts and captions

The game degrades to system serif/monospace stacks if Google Fonts is
unreachable.

## Shaders

The post-processing shaders in `src/core/shaders/` were written for this
project. They use two widely published techniques with their standard
references:

- ACES filmic tonemapping — Krzysztof Narkowicz's curve fit.
- Depth-reprojection motion blur — the standard velocity-from-depth approach
  described in *GPU Gems 3*, chapter 27.
