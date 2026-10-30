# Graphics engineering portfolio

A static portfolio built with Vite, TypeScript, vanilla HTML/CSS, and Three.js. The fixed WebGL2 canvas loads a SOG Gaussian scene through Spark, behind a normally scrolling, accessible document. The GPC decoder remains available for comparison.

**Current default: standard SOG.** The 72.59 MB SOG retains all 4,997,856 Gaussians and SH3. Actual erosion effects remain unimplemented. The project-card illustrations are original SVG placeholders. See [SOG comparison](docs/sog-comparison.md) and [GPC integration](docs/gpc-integration.md) for encoding, supported profiles, asset size, memory limits, and source/asset notices.

## Run locally

Use Node.js **22.18+ LTS** (Vite also supports 22.12+; earlier Node 22 versions print an experimental warning for the test runner). In Git Bash:

```bash
cd /d/Personal/Projects/Portfolio_v3
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.

The default asset is `public/scenes/radegast.sog`, with framing/settings in
`public/scenes/radegast-sog.json`. Large SOG/GPC files are ignored by Git;
provision them separately in a fresh checkout. Use `/?scene=gpc` for the original
conservative GPC, or `/?scene=placeholder` for the original procedural scene.
A missing asset shows the static fallback.

The graphics status shows navigation-to-scene-ready time after each page load.
This includes app startup, download, decode and scene initialization; it is not
a first-visible-pixel or GPU completion measurement. The same duration is
available as `performance.getEntriesByName('portfolio:scene-load')[0].duration`
in milliseconds. Context restoration and pause/resume retain the original time.

An optional **47.87 MB** aggressively quantized version is available at
`/?quality=compact`. The default remains SOG. See
[compression trials](docs/compression-trials.md) for measured sizes and quality
tradeoffs, including substantial loss of directional color detail.

Open **`/compare.html`** for synchronized side-by-side inspection of the
**95.47 MB palette GPC** and a **72.59 MB standard SOG** encoded from the original PLY.
The left dropdown also includes the conservative and compact GPCs; the right
dropdown can restore the earlier palette comparison. Both views share one
camera and the same renderer. See [SOG comparison](docs/sog-comparison.md) and
[GPC experiment results](docs/palette-experiment.md).

```bash
npm test          # Timeline contracts and upstream Python/browser decoder parity
npm run build    # Strict TypeScript validation + production build
npm run preview  # Serve dist locally
```

## Content editing

All portfolio copy and links live in `index.html`; no CMS or JavaScript is needed to read the page.

- Replace **Your Name**, the page title, description, introduction, and footer.
- GitHub uses the supplied repository owner's public profile, `citizensnipz`. Confirm the desired profile before publishing.
- LinkedIn navigation currently leads to the contact section. Replace it with your real profile URL; replace the contact placeholder span with an anchor.
- Replace `you@example.com` and its `mailto:` URL. Replace the résumé placeholder with an anchor to your own PDF in `public/`.
- Fill in Musubi Motion and GaussMark descriptions, categories, technical highlights, roles, and project notes. The copy makes no claims about completed features or professional achievements.
- Replace the two SVG project illustrations with your own images. Keep meaningful `alt` text, intrinsic width/height, and lazy loading. A video can use `<video controls playsinline preload="none" poster="…">`; supply captions if speech is relevant, and avoid autoplay.
- Add optional repository, demo, and write-up anchors inside each project's notes. Do not leave dead `href="#"` links.

## Structure

```text
index.html                     Semantic portfolio content and navigation
public/                        Favicon and original SVG project placeholders
src/main.ts                    UI setup, lazy graphics import, cleanup
src/style.css                  Base visual design
src/responsive.css             Mobile layouts and reduced-motion styles
src/ui/scroll-progress.ts      Passive scroll progress and layout measurement
src/graphics/engine.ts         One renderer, lifecycle, scheduling, context recovery
src/graphics/camera-rig.ts     Camera composition and controlled orbit
src/graphics/timeline.ts       Pure, reversible 0–1 animation state
src/graphics/placeholder.ts    Procedural point geometry and visual transitions
src/graphics/gpc/              GPC worker decoder, stream bridge, and Spark layer
src/graphics/scene-layer.ts    Future renderer integration contract
tests/timeline.test.ts         Deterministic timeline tests
docs/architecture.md           Lifecycle, stage mapping, and integration guidance
docs/validation.md             Reproducible browser checks and validation notes
```

## Performance and accessibility

One transparent canvas and one Three.js WebGLRenderer, shared with Spark. The Gaussian scene retains five million splats and uses textures, sorting workers and GPU buffers; compressed download size is not a RAM/VRAM estimate. The optional original procedural layer uses roughly 18,000 points and four draw calls. Device pixel ratio is capped at 1.5. HTML loads separately from optional graphics code.

Native scrolling is never intercepted. CSS smooth scrolling is disabled with `prefers-reduced-motion`; the camera becomes static and frames render on scroll/resize changes only. The pause control stops idle motion while scroll continues to select the visual stage. Rendering stops while the page is hidden and after the graphics sequence has disappeared. WebGL2 unavailability or a rendering error uses a CSS background. A lost context suspends rendering and a restored context redraws the current progress. HTML content stays usable throughout.

## Static deployment

Run `npm ci && npm run build`, then upload **`dist/`** to any static host. `base: './'` supports root and repository-subpath hosting, including GitHub Pages. This is a single document using section hashes; no server routes, rewrites, environment variables, or backend are required. No deployment workflow is enabled and no deployment is performed by this foundation.

## License recommendation

**MIT is recommended for the original portfolio scaffold**, once the repository owner confirms they have the right to license its contents. No `LICENSE` grant is supplied automatically. A public repository alone does not grant permission to reuse its source. Before publishing for reuse, add an MIT license with the actual copyright holder and year, or choose another license appropriate to your plans.

This recommendation covers only original scaffold code you have rights to license. It excludes the proprietary-derived GPC adapter and the CC BY-NC 4.0 Radegast scene. See [NOTICE.md](NOTICE.md). The encoder checkout remains ignored; the browser decoder is now part of this source tree and of the delivered website. Dependencies retain their own licenses; preserve applicable notices in any redistribution. No repository visibility changes or publication were performed.
