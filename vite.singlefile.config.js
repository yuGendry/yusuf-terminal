/**
 * vite.singlefile.config.js — the double-click build.
 *
 * Produces one self-contained `STITCHWORK.html` that runs straight off the
 * disk with no server, no Node and no install: you download it and open it.
 *
 * This is only possible because of two facts about this project that are not
 * true of most Vite apps:
 *
 *   - There are no asset files. Every texture is generated on a canvas at
 *     runtime and every sound is synthesised with the Web Audio API, so there
 *     is nothing for the page to fetch.
 *   - `@dimforge/rapier3d-compat` carries its WebAssembly inlined as base64
 *     inside its own JavaScript, so physics needs no `.wasm` fetch either.
 *
 * Both matter because a page opened from `file://` cannot fetch anything
 * next to it — the browser treats every sibling file as a cross-origin
 * request and refuses. Inline scripts are fine; it is external ones that are
 * blocked. So the whole game has to end up inside the one document, which
 * also means dynamic imports have to be flattened rather than code-split.
 *
 * The one thing it still reaches for is the Google Fonts stylesheet, over
 * https, which works offline-less but degrades to the fallback stack rather
 * than failing.
 */
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // One file means one chunk: the per-chapter dynamic imports have to be
        // folded in rather than split out.
        inlineDynamicImports: true,
      },
    },
  },
});
