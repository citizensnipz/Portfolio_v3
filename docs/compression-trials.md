# Radegast compression trials

All sizes below are complete, encoded files, measured in decimal MB. No splats
were pruned, merged, or decimated. All files have 4,997,856 Gaussians. Every full
candidate was independently decoded and checked using the upstream Python codec.

| Candidate | SH step | Color / scales | Positions | Rotation | Spatial ordering | Bytes | MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Existing conservative | 0.004 | 12 / 12 bits | 20 bits | float16 | Within each chunk | 171,628,538 | 171.63 |
| Color/scales reduction | 0.128 | 8 / 8 bits | 20 bits | float16 | Within each chunk | 119,015,425 | 119.02 |
| Aggressive trial | 0.512 | 8 / 8 bits | 8 bits | 4 bits/component | Global then chunked | 50,134,768 | 50.13 |
| Compact candidate | 0.64 | 8 / 8 bits | 8 bits | 4 bits/component | Global then chunked | 47,868,974 | **47.87** |

The compact candidate is 24.64× smaller than the original 1.18 GB PLY, and 72.1%
smaller than the conservative GPC. Its SHA-256 is
`66fb8b7cbe94cf1091eb99803fc6b6fd0cb756eae495abd67e0eb147d40e2e1c`.
It is delivered as `public/scenes/radegast-compact.gpc`; the conservative asset
remains the default and is preserved without modification.

## Tradeoffs

This target required geometry precision reductions as well as color changes.
Positions are quantized within each spatial chunk; quaternion components use
only 16 levels each and are renormalized by the renderer. The spatial reorder
groups nearby Gaussians before the codec's existing per-chunk Morton ordering;
it does not remove any geometry or add a new container format.

The SH step is 160× the conservative setting. A full decoded scan found **99.38%
of higher-order SH coefficients are zero** in this candidate. The channel layout
remains SH3, but almost all directional color variation is discarded. It must not
be described as preserving the original appearance or as lossless compression.

The compact version was rendered successfully in Chromium with the full Gaussian
count. A matched 1440×1000 reduced-motion hero view was captured for the compact
and conservative versions. The overall scene remains recognizable, but there is
visible quantization/noise in surfaces and foliage. This is an inspection
candidate, not a quality-approved replacement. No multi-view PSNR/SSIM or original
capture-image evaluation was performed.

## Inspect locally

```bash
npm run dev
```

- Default `/`: conservative 171.6 MB scene.
- `/?quality=compact`: 47.87 MB candidate.
- `/?scene=placeholder`: procedural scene.

The GPC files are ignored by Git. Vite includes locally provisioned assets in
the build. The browser decoder now supports upstream uniformly quantized
rotations in addition to float16, with an independent Python parity test.

## Reproduce

`scripts/benchmark-gpc.py` uses the pinned upstream codec in `.artifacts/codec`.
Without `--full`, it screens three 131,072-splat chunks with Zstandard level 9.
Those estimates were used for selection only; none of the table's sizes are
sample extrapolations. Full encodes use level 19 and validate all decoded chunks.

```bash
.artifacts/codec-venv/Scripts/python.exe scripts/benchmark-gpc.py --spatial
.artifacts/codec-venv/Scripts/python.exe scripts/benchmark-gpc.py --full color8-sh0.128
.artifacts/codec-venv/Scripts/python.exe scripts/benchmark-gpc.py --spatial --full p8-r4-sh0.64
```

Completed trial outputs are retained in `.artifacts/compression-trials/`. The
script refuses to overwrite them. The cached spatial index is specific to the
supplied input PLY; use a fresh output/cache directory for another source.
