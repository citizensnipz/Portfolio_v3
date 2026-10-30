# Validation

## SOG as the portfolio default

- The normal homepage requests `radegast-sog.json` and `radegast.sog`, with
  no GPC asset request. Spark reports all 4,997,856 Gaussians in one canvas.
- Local navigation-to-scene-ready measurements on 2026-10-30, with browser
  caching disabled, no network throttling, normal motion, and a 1600px viewport:

  | Server | Scene ready | SOG request duration |
  | --- | ---: | ---: |
  | Vite dev | 3.043 s | 0.352 s |
  | Production preview, run 1 | 3.843 s | 1.450 s |
  | Production preview, run 2 | 3.744 s | 1.371 s |
  | Production preview, run 3 | 3.769 s | 1.362 s |

  The complete 72.59 MB asset was transferred each time. These are localhost
  measurements with a warm filesystem/driver, not hosted-network predictions.
  The marker includes startup, download, decode and scene initialization;
  asynchronous sort, first visible pixels and GPU completion are not measured.
- The page shows its own navigation-to-ready duration in the graphics status.
  Pause/resume and reduced-motion changes preserve that first-load value and
  emit only one `portfolio:scene-load` measure per document.
- The rendered hero was visually checked. Scroll, pause, reduced motion and a
  390px mobile layout worked without overflow. No browser warnings or errors
  were observed. Build and all nine existing tests pass.

## Standard SOG comparison

- Stock splat-transform 3.10.1 encoded the original PLY to a 72,589,052-byte SOG
  v2. ZIP CRC checks passed; metadata retains 4,997,856 Gaussians and SH3.
- The browser's native Spark SOG loader independently loaded all 4,997,856
  splats. Palette GPC and SOG full-scene/detail views have matching orientation,
  framing, dimensions, and renderer settings in one canvas.
- The compact GPC selector also loaded successfully beside SOG. Full-scene and
  detail comparison screenshots are saved locally under `.artifacts/`.
- Nine tests pass. See `sog-comparison.md` for encoder settings and exact sizes.
- Production build passes and both files loaded under
  `/Portfolio_v3/compare.html`. Reset, detail, drag, orbit and reduced-motion
  controls worked; a 390px viewport had no horizontal overflow. Both scenes
  recovered from simulated context loss without downloading the SOG again.
- No browser errors or warnings were observed during these checks.

## Shared-palette / quaternion experiment

- Full asset: 95,471,101 bytes, all 4,997,856 Gaussians. Every chunk was checked
  with the independent Python reference while encoding.
- Nine tests pass, including real-capture Python/browser parity for shared SH
  palette reconstruction and all four smallest-three quaternion modes.
- The dedicated `/compare.html` page renders current and experimental GPCs in
  one canvas using scissor viewports, synchronized cameras, matching dimensions
  and identical rendering settings. The left selector also offers the compact GPC.
- Desktop full-scene and detail views were visually reviewed side by side.
  SH palette color changes remain lossy and have no calibrated image-quality gate.
- Final production comparison loaded under `/Portfolio_v3/compare.html`; reset,
  detail, drag, both baseline selections, and context restoration worked. The
  canvas count stayed one, restoration triggered no GPC downloads, and a settled
  idle sample ran zero application RAF callbacks. A 600px viewport had no overflow.
- No uncaught page errors occurred in these checks. Four WebGL stale-handle
  deletion warnings were observed when replacing scene resources after simulated
  context loss; both views recovered and remained usable. Real-device testing and
  further upstream resource-cache investigation remain useful before deployment.
- See `palette-experiment.md` for source precision, training and file-size details.

## Compact compression trials

- Three additional full files were encoded and independently checked chunk by
  chunk: 119.02 MB, 50.13 MB, and 47.87 MB. The source and default GPC were preserved.
- The 47.87 MB candidate loaded in Chromium with all 4,997,856 splats and was
  visually compared with the conservative version at the same static hero view.
- Eight portfolio tests pass, including a new upstream Python parity fixture
  for 8-bit attributes and uniformly quantized quaternion components.
- Strict TypeScript and production builds pass. Quality is visibly reduced;
  no calibrated multi-view fidelity claim is made. See `compression-trials.md`.

## GPC integration — 2026-10-29

- Encoded all 4,997,856 Gaussians to a 171,628,538-byte GPC2. The upstream
  Python decoder checked all 39 chunks, including their Zstandard checksums.
- Compared the first actual 131,072-splat chunk between browser decoder code
  and pinned upstream Python: all 7,733,248 rendered attributes matched exactly
  (maximum absolute error 0). This is decoder parity, not source-quality scoring.
- Seven automated tests pass: original timeline tests plus independent synthetic
  Python/browser parity, malformed payload/profile rejection, and container/SH layout.
- Production build and strict TypeScript check pass. Spark's lazy chunk is about
  956 kB gzip, substantially larger than the original procedural-only app.
- Chromium rendered the full statue and environment using one canvas; Spark's
  loaded count matched 4,997,856. Desktop and 390×844 mobile viewport were visually
  reviewed. No horizontal mobile overflow was observed.
- Native scroll/final scene fade/reverse scroll and pause work. Context loss and
  restoration recovered without adding a canvas or re-downloading the asset.
- Paused and reduced-motion idle samples each produced zero additional application
  RAF callbacks after sorting settled. Reduced motion retained native `auto` scroll.
- No uncaught page errors occurred in the GPC lifecycle checks. Chromium emitted
  shader signed/unsigned warnings and expected warnings during simulated context loss.
- A cleanup adjustment disposes Spark's old GPU objects while the context is
  lost. The final production context-loss/restore run reported no console errors
  or warnings, retained one canvas and all 4,997,856 splats, and served its manifest
  successfully under `/Portfolio_v3/`.
- A missing GPC asset produced the static fallback while both project cards
  remained accessible. The production `?scene=placeholder` mode also loaded.

Real mobile GPU capacity and Safari/Firefox remain unverified. No claim of
source-to-GPC visual equivalence or a calibrated quality threshold is made.

The optional upstream Python `test_large_io.py` suite was also attempted with
the pinned environment: three cases passed, while three encountered Windows
memory-mapped-file rename/overwrite/cleanup restrictions. That Unix-oriented
suite is not fully green on this machine; the upstream checkout was not modified.
The portfolio's seven tests and the actual full-asset decode checks passed.

## Automated commands

```bash
npm ci
npm test
npm run build
```

The timeline tests cover stage order, endpoint behavior, bounded channels, continuity across all stage boundaries, invalid inputs, and exact state equality when seeking backward. The build runs TypeScript in strict mode before bundling.

## Browser checks

Use `npm run dev` or `npm run preview` and verify:

1. Desktop and mobile: readable copy, no horizontal overflow, one fixed canvas, native scrolling, navigation targets clear the fixed header.
2. Scroll down and back up: surroundings fade, central form remains, lower form fades, upper form fades, and all stages reverse.
3. Pause/resume: idle orbit stops/resumes; scroll stages remain usable.
4. Enable OS/browser reduced motion: camera stays fixed, smooth scrolling is disabled, and the loop stops when no input changes.
5. WebGL2 unavailable: static background appears; About, Projects, native details controls, and Contact remain usable.
6. Disable JavaScript: all document content and section navigation still work.
7. Lose and restore context using the development console:

   ```js
   const gl = document.querySelector("canvas").getContext("webgl2");
   const extension = gl.getExtension("WEBGL_lose_context");
   extension?.loseContext();
   // In a later console command, after the loss event:
   extension?.restoreContext();
   ```

   The status should change and recover; the canvas count must stay one. The extension is browser dependent.

8. Resize and switch tabs: drawing buffer stays at or below 1.5× CSS dimensions, and hidden pages stop rendering.
9. Keyboard: skip link, navigation, motion button, project details, and real contact links show visible focus. Missing LinkedIn/résumé destinations are text placeholders, not fake links.
10. Production: serve `dist/` under both `/` and a repository subpath; check assets and section links. No runtime backend is needed.

## Initial verification — 2026-10-28

- Strict TypeScript and Vite production build passed.
- All four timeline tests passed.
- Chromium desktop (1440×1000) and mobile (390×844) layouts were visually reviewed. No horizontal overflow was observed.
- A single live canvas remained throughout forward and reverse scroll checks, including after simulated WebGL context loss and restoration. No uncaught page errors were observed during these checks.
- Pause control, project anchor navigation, and native expandable project notes worked.
- With reduced motion enabled, CSS scrolling switched to `auto`, the motion control became disabled, and zero additional application animation frames ran during an idle sample.
- At emulated device pixel ratio 3, the drawing buffer stayed at approximately 1.5× CSS dimensions.
- With WebGL2 deliberately unavailable, the static fallback appeared and both project cards and expandable notes remained usable.
- With JavaScript disabled, all four main sections and both project cards remained in the document.
- Paused forward/backward seeking returned a pixel-identical desktop screenshot. Paused mode and progress past the end of the scene produced zero additional animation frames during idle samples.
- The production build loaded with one live canvas and both preview images under `/Portfolio_v3/` using Vite's static preview server.

These are Chromium automation checks, including a simulated context loss and mobile viewport. Real mobile GPUs, Safari/Firefox, and assistive-technology testing remain unverified and are useful before public launch.
