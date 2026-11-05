# Mobile streamed scene

Phones use `radegast-mobile.json`, pointing to `radegast-mobile-sh1.rad` and its sibling `.radc` chunks. Desktop uses the original SOG. Streaming is restricted to detected mobile devices (including touch-enabled iPads). `?scene=placeholder` skips both asset formats.

The original RAD was generated from `radegast.sog` using Spark v2.4.0 `build-lod --quality --rad-chunked`. On Windows the converter needed its main workload moved onto a thread with a 64 MiB stack to avoid a stack overflow after tree construction. The mobile variant reuses the compressed geometry, base color, and LoD columns, with spherical harmonics limited to degree 1. Spark's `--max-sh=1` option can produce degree-1 assets when rebuilding the tree from the original SOG.

Streaming uses an 800,000-splat rendering target and 24 resident pages (1,572,864 slots). Mobile starts with idle motion paused. New chunks, scroll, and direct interaction still trigger renders. The original coordinate framing and object-space dissolve modifier are shared with the SOG loader. All RAD/RADC files must be deployed together with the manifest.

Physical iPhone validation is still required; desktop browser checks do not establish iOS stability.

With Chromium emulating a 402 × 792 phone viewport at 4 MiB/s, the degree-1 variant reached 700,000 active splats in about 12 seconds versus 20 seconds with the original. The first view fetched about 43 MB versus 79 MB. Both tests used a fixed camera and settled at about 724,000 active splats. The lower color degree can change colors with view angle. `?debug=scene` reports completed chunk responses and resident pages separately and refreshes even after rendering goes idle.

## Local validation (2026-11-05)

- Generated one 10,992-byte RAD header and 99 RADC chunks, totaling 320,805,640 bytes. Largest chunk: 3,426,144 bytes. SH3 retained; the converter removed 125,744 zero-opacity splats and added coarser hierarchy nodes.
- Production build passed; all 14 existing tests passed.
- Desktop Chromium forced-RAD check visually confirmed the full scene and the partially dissolved statue with its particle edge after the environment disappeared.
- Chromium with iPhone user agent, touch, and 390x844 viewport automatically selected RAD, requested 18 distinct chunks during loading and forward/reverse scrolling, and never requested the SOG. No page errors were captured.
- At 70% scroll the environment/ground masks were zero and statue mask was approximately 0.6; at the bottom all were zero; returning to the top restored all three to 1.
- These checks used desktop Chromium, not actual iOS/WebKit. The ready timer records loader initialization, not completion of streamed refinement. Phone stability and final visual quality still require a physical-device check.
- Follow-up publication validation: delayed downloads show the loading overlay within the initial mobile viewport; it hides on the first active streamed splats. Desktop requests SOG only; mobile requests RAD/RADC only. Build and all 14 tests pass.

## Detail refinement investigation

The original mobile configuration reached 348,178 active splats against its 350,000 target: streaming was progressing but detail was capped. Increased the target to 600,000 and changed camera cones to 80/100 degrees with peripheral/behind scales 0.1/0.02. The page cache remains 16 pages (1,048,576 splat slots). Chromium phone emulation reached 550,024–555,035 active splats, with 18 unique chunk requests and no page errors. The cache was full, so this remains a bounded quality compromise rather than a promise to load full detail. The dissolve masks still reached the expected partial state. Physical iPhone quality, performance, and memory stability need checking; a higher active count alone does not quantify perceived sharpness.
