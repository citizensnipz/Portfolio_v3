# Mobile streamed scene

Phones use `radegast-mobile.json`, pointing to `radegast-lod.rad` and its sibling `.radc` chunks. Desktop keeps the original SOG. Streaming is restricted to detected mobile devices (including touch-enabled iPads). `?scene=placeholder` skips both asset formats.

Generated from `radegast.sog` using Spark v2.4.0 `build-lod --quality --rad-chunked`. On Windows the converter needed its main workload moved onto a thread with a 64 MiB stack to avoid a stack overflow after tree construction. This only changes offline tooling, not the website.

Streaming uses a 350,000 splat rendering target and 1,048,576 resident page slots. These are splat limits, not a guarantee of total browser memory use. The original coordinate framing and object-space dissolve modifier are shared with the SOG loader. All RAD/RADC files must be deployed together with the manifest.

Physical iPhone validation is still required; desktop browser checks do not establish iOS stability.

## Local validation (2026-11-05)

- Generated one 10,992-byte RAD header and 99 RADC chunks, totaling 320,805,640 bytes. Largest chunk: 3,426,144 bytes. SH3 retained; the converter removed 125,744 zero-opacity splats and added coarser hierarchy nodes.
- Production build passed; all 14 existing tests passed.
- Desktop Chromium forced-RAD check visually confirmed the full scene and the partially dissolved statue with its particle edge after the environment disappeared.
- Chromium with iPhone user agent, touch, and 390x844 viewport automatically selected RAD, requested 18 distinct chunks during loading and forward/reverse scrolling, and never requested the SOG. No page errors were captured.
- At 70% scroll the environment/ground masks were zero and statue mask was approximately 0.6; at the bottom all were zero; returning to the top restored all three to 1.
- These checks used desktop Chromium, not actual iOS/WebKit. The ready timer records loader initialization, not completion of streamed refinement. Phone stability and final visual quality still require a physical-device check.
- Follow-up publication validation: delayed downloads show the loading overlay within the initial mobile viewport; it hides on the first active streamed splats. Desktop requests SOG only; mobile requests RAD/RADC only. Build and all 14 tests pass.
