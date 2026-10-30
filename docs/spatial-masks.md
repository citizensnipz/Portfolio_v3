# Sequential scroll masks

The SOG and GPC renderer share three exclusive GPU disintegration stages. The source assets and decoding
pipeline are unchanged. `src/graphics/gpc/spatial-masks.ts` owns the modifier and
the authored statue bounds, in original capture coordinates (up is **-Y** before
the existing 180-degree Z rotation).

- At 0–36% of full-document scroll, the upper environment dissolves high-to-low.
- At 16–64%, the remaining ground dissolves radially inward toward the statue.
- At 50–100%, the statue dissolves bottom-to-top, ending at page bottom.
- Animation windows overlap so incoming breakup starts while outgoing dust is
  still visible. Spatial group membership stays exclusive. Linear stage clocks
  avoid a separate ease-to-stop and restart at each handoff; the per-particle
  morph and fade still use smooth easing.
- Membership in the statue mask is tested against its **original full cylinder**.
  These splats are never controlled by the circle, even after the moving bottom
  plane has passed them. Outside the cylinder, height above the fitted ground
  plane selects the upper-environment stage; everything else belongs to the ground.
- All three stages start at 100% and reverse without
  resetting or reloading. Explicit zero cases hide every splat, including splats
  on the circle axis or cylinder top plane. No final whole-scene fade is applied.

The fitted source-space ground plane is `y = 0.04126x - 0.05523z + 3.1313`,
with 0.28 source units of surface tolerance. It was estimated from ground-height
modes in 2-unit XZ cells near the statue, excluding the pedestal; 59 of 61 usable
cells agreed within 0.25 units. This is a local geometric approximation, not tree
or sky segmentation. Distant terrain may deviate from the extrapolated plane.

Within each stage, original position determines an activation threshold. Coherent
spatial noise and stable per-splat index hashing roughen the edge. Splats contract
to rounded dust, curl upward/outward, briefly tint pale green, then shrink and fade.
Only a sparse subset persists through the dust tail to avoid a dense fog. Particle
age and motion are functions of scroll alone; scrolling backward reconstructs the
original scene exactly. Stage membership never uses the displaced position.
The final 22% of each stage can contain particle tails, all completed by its end.
Upper height and radial ordering use logarithmic spacing so far outliers do not
consume most of the scroll interval. Reduced motion keeps the dissolve but removes
drift, particle morphing and color shimmer.

The authored base is `[-2, 2.65, 5.4]`, radius `2`, height `5.05`. The pedestal is
included. Bounds were fitted against the rendered capture and original PLY
coordinates; this is a geometric selection, not semantic statue segmentation.
Future changes to the scene require refitting these constants. Large Gaussian
footprints can extend past a mask boundary because membership uses splat centers.

Scroll range is `document.documentElement.scrollHeight - window.innerHeight`;
layout/viewport changes remeasure it. `canvas.dataset.upperEnvironment`,
`canvas.dataset.circleRadius` and `canvas.dataset.cylinderLength` expose normalized
remaining stage values for inspection (not literal per-splat opacity or distance).
Projects/contact backdrops are translucent for SOG/GPC so the full-page sequence
remains visible behind content. The procedural placeholder retains its previous
visual stages, now sampled over the full page too. Above 700px, the project heading,
intro and vertically stacked cards use the left 48% of the content area. The right
side remains clear for the statue. Mobile cards retain their previous layout;
only camera framing changes, lifting the scene by 14.5% of viewport height.

The GPU modifier is constructed once; scrolling changes three stage uniforms and marks
the mesh dirty. The original packed splats remain intact and all resources follow
the existing context-restoration lifecycle. This is a visual effect, not a memory
or FPS optimization.

Validation (2026-10-30): production build and all 11 automated tests pass,
including continuous stage-clock movement through the overlapping handoffs.
The browser compiled and rendered the modifier without console errors. A GPU
readback fixture checked eight representative positions across seven forward and
reverse stage states, including points far above/below the ground, cylinder
boundaries, statue protection, and the all-hidden endpoint; all outputs matched.
Visual inspection confirmed the upper-environment particle breakup, retained
ground after stage one, and the statue's upward disintegration.
Desktop verification at 1440×900 confirmed a single 606.6px project column on the
left with the statue clear on the right. At 390×844 the original full-width
327px mobile card column remains, the statue is raised, and neither viewport
has horizontal overflow.
