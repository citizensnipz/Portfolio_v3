# Graphics architecture

Current SOG/GPC behavior: [sequential spatial masks](spatial-masks.md) supersede
the whole-scene fade described below. Scroll now spans the entire document, with
upper-environment removal over 0–36%, ground removal over 16–64%, and statue
removal over 50–100%. Overlapping, constant-rate stage clocks connect the
reversible GPU particle breakup into one continuous action. The five-stage
table below describes the retained procedural placeholder.

The original foundation architecture below remains the basis for the app. The
current GPC layer and its supported codec profile are documented in
[GPC integration](gpc-integration.md). `GraphicsContext` now also supplies
`invalidate()` for asynchronous sort completion and `configureCamera()` for
authored scene poses. The procedural five-stage visuals remain available via
`?scene=placeholder`; the GPC layer currently uses only the final whole-scene fade.

## Ownership and data flow

`index.html` owns all content. `main.ts` owns DOM controls and the scroll tracker, then dynamically imports the graphics engine. There is no rendering code in the UI module.

```text
Native window scroll + layout resize
                ↓
        ScrollProgress (0–1)
                ↓
       GraphicsEngine scheduling
                ↓
      sampleTimeline(progress)
          ↙             ↘
     CameraRig        SceneLayer
          ↘             ↙
       One Three.js WebGLRenderer
```

`ScrollProgress` measures the sequence from the document top to the projects section entering the lower half of the viewport. A body `ResizeObserver` and window resize listener update the range. Its passive scroll handler reads `scrollY` without measuring element layout. The engine coalesces changes in one animation frame. Browser scroll restoration and anchor jumps sample their actual position, with no accumulated animation state.

## Timeline

`sampleTimeline` is a pure function with clamped progress and smoothstep interpolation. It allocates a small frame object; the procedural GPU buffers stay unchanged. Seeking backward produces exactly the same frame. Boundary values are continuous. Invalid nonfinite inputs return the opening frame.

| Progress  | Stage         | Current placeholder                          | Future artistic intent           |
| --------- | ------------- | -------------------------------------------- | -------------------------------- |
| 0–0.22    | `scene`       | Whole point sculpture and surroundings       | Full scene, slow orbit           |
| 0.22–0.45 | `environment` | Ground rings and distant points fade         | Environment erodes toward statue |
| 0.45–0.58 | `isolated`    | Central form holds                           | Isolated statue                  |
| 0.58–0.85 | `body`        | Lower stem uniformly fades and gently scales | Statue dissolves bottom to top   |
| 0.85–1    | `head`        | Upper knot fades; projects enter viewport    | Remaining head disappears        |

These are group opacity and scale transitions. **No erosion, spatial clipping, Gaussian processing, or bottom-to-top dissolve is implemented.** Projects are always in the document, independent of the timeline or WebGL availability.

Camera orbit from scroll is deterministic. A separate, bounded sinusoidal idle orbit supplies gentle motion when stationary; it does not feed into timeline state. Pause freezes the idle clock. Reduced motion removes both idle and scroll-driven camera movement, preserving only scroll-sampled opacity/scale states. There is no damping lag or pointer orbit control to conflict with native page scrolling.

## Future renderer boundary

`SceneLayer` is the integration seam. The host creates the single canvas and WebGL2 context and owns all scheduling. A layer receives the renderer, scene, camera, and an abort signal, and implements:

- `initialize(context)`: attach resources; asynchronous asset setup is allowed. Honor `context.signal`, including before attaching resources after asynchronous work.
- `update(frame)`: apply the full current timeline state; do not rely on a particular update order or forward-only playback.
- `resize(viewport)`: respond to CSS dimensions and the capped pixel ratio.
- `contextLost()`: suspend or invalidate any layer-owned GPU state. Avoid GL calls while lost.
- `contextRestored(context)`: rebuild layer-specific GPU resources before the host resumes. The Three.js layer simply relies on Three.js resource restoration.
- Optional `beforeRender(context)`: perform a custom pass into the shared context. The host then renders the Three.js scene. Restore GL state and coordinate framebuffer clearing/composition; use `renderer.resetState()` as appropriate if integrating raw GL.
- `dispose()`: release geometry, materials, workers, textures, fetches, and owned resources. Cleanup must tolerate incomplete initialization and repeated calls.

`main.ts` uses the shared Gaussian layer with the SOG manifest by default,
the original GPC manifest for `?scene=gpc`, and the compact GPC manifest for
`?quality=compact`. `PlaceholderLayer` remains available for `?scene=placeholder`.
The shared layer retains its historical `GpcSceneLayer` name and supports
both GPC decoding and Spark's native SOG loader. The interface itself still has no GPC binary assumptions;
format-specific code lives in the adapter. Before integrating another raw-GL
renderer, explicitly design pass order/clearing and context state compatibility.

The codec-derived browser implementation was added under the user's explicit
authorization in the GPC phase. It is proprietary-derived code, not part of the
original scaffold's license recommendation. Encoder sources remain in an ignored
local checkout; no credentials are embedded. See `NOTICE.md` and the integration
guide for decoder distribution and scene attribution.

## Lifecycle

Initialization requests WebGL2 directly on the sole canvas (no probe canvas). No WebGL1 fallback is attempted. Errors leave semantic HTML in place and show a procedural CSS static background.

The engine owns one RAF request at a time. It runs continuously only while the visible sequence has idle motion enabled. Paused/reduced-motion modes draw on demand. Progress 1 draws the cleared final state once, then stops. Visibility changes suspend and resume without advancing the idle clock by the hidden duration.

The host cancels RAF on context loss and displays the static visual. Three.js registers its restore listener before the adapter hook; after the layer restores, dimensions and the current progress are reapplied. A restoration failure falls back to static graphics. Window/body observers, DOM listeners, media-query listeners, GPU resources, and the canvas are cleaned up on disposal. Vite hot replacement disposes the previous instance. Back/forward-cache navigation retains the instance; visibility changes suspend it.
