# Shared SH palette and smallest-three GPC experiment

## Measured result

| File                           |       Bytes | MB (decimal) |     Count |
| ------------------------------ | ----------: | -----------: | --------: |
| Current default `radegast.gpc` | 171,628,538 |       171.63 | 4,997,856 |
| New `radegast-palette.gpc`     |  95,471,101 |    **95.47** | 4,997,856 |
| Earlier compact trial          |  47,868,974 |        47.87 | 4,997,856 |

The new experimental profile is **44.37% smaller** than the conservative GPC,
or 12.35× smaller than the original PLY. It is larger than the earlier compact
trial, which reduced geometry precision and rounded almost all SH coefficients
to zero. The two new strategies alone did not reach 50 MB at the conservative
geometry settings.

## What changed

- One shared palette of 4,096 full SH3 vectors. A deterministic sample of 131,072
  source Gaussians trains a three-level 16-way hierarchical k-means tree, eight
  iterations per node. Every source Gaussian is assigned to one leaf by tree
  traversal. This is approximate hierarchical vector quantization, not exhaustive
  nearest-centroid assignment or an implementation of PlayCanvas's encoder.
- Palette coefficients are quantized at step 0.004, stored as int16, and compressed
  once with Zstandard. The shared palette has 189,836 compressed bytes and is
  embedded as base64 in the outer JSON header. This overhead is included in size.
- Every Gaussian stores one uint16 SH palette index rather than 45 separately
  quantized coefficients. Compressed label streams total **6.34 MB**.
- Normalize each quaternion, omit its largest-magnitude component after sign
  canonicalization, and quantize the remaining three components to 8 bits each
  over `[-1/sqrt(2), +1/sqrt(2)]`. Store three bytes plus a mode byte; reconstruct
  the positive omitted component from the unit-length constraint. Compressed
  rotation streams total **18.13 MB** versus **30.98 MB** previously.

Positions remain 20-bit, base color and log scales 12-bit, and opacity 8-bit.
Gaussian counts, original chunk ranges and per-chunk Morton ordering are retained.
The older file and new file were encoded using different installed NumPy versions;
matching precision settings do not imply bit-identical quantization of every
geometry value. No pruning, decimation or additional spatial reordering was used.

## Profile and compatibility

This is a local experimental extension named `sh-palette-smallest3-v1`, carried
inside GPC2 with a shared palette in the outer header. Inner chunks use the
existing GPC1 stream directory with new `sh_labels` and `rotation_smallest3`
streams. The upstream checkout remains unchanged. Its stock decoder does **not**
support this extension; the project Python reference and browser adapter do.
It remains a self-contained file with no external palette dependency.

Source: `scripts/palette-codec.py`. Codec foundation revision:
`833bf7d36ef4b7cd4b64875a4249cec187dd9b41`. Decoder changes are isolated in
`src/graphics/gpc/decoder.ts` and the module worker. Older scalar files still load.

## Validation and appearance

- All 39 chunks were independently reconstructed with the Python reference,
  checked for finite values/count, and evaluated against source attributes.
- Full-scene SH coefficient RMSE: **0.0446503**. This is attribute error, not image
  PSNR, and must not be interpreted as a perceptual quality score.
- Maximum measured source-to-decoded rotation angular error: **0.4467°**.
- A cross-language fixture covers the shared palette and all four smallest-three
  modes using the real capture; nine portfolio tests pass. The fixture is derived
  from the same CC BY-NC scene and inherits its attribution requirements.
- Browser comparison loads all 4,997,856 Gaussians per side in one WebGL2 canvas.
  Both sides use the same camera, view size, renderer settings and no idle motion.
- No claim of equivalence at all viewpoints is made. Palette assignment is lossy
  and can change directional color and highlights. Geometry detail is retained
  much better than in the aggressive compact trial in the inspected views.

SHA-256:
`b31beba7efd3f1c6d4fb79cf2ffb80d0cb49cbc1e7504a29741e2c4b623ef0cf`.

## Side-by-side viewer

Run `npm run dev`, then open **`/compare.html`** on the printed local origin.
The page now defaults to palette GPC versus SOG. To reproduce the original
GPC-only comparison, choose a baseline on the left and **Palette GPC** on the right.

- Left: current conservative GPC by default; dropdown also offers the compact trial.
- Right: new palette/smallest-three GPC.
- Drag either view to orbit both; scroll over the viewer to zoom both.
- **Reset view** restores the authored camera; **Statue detail** moves closer.
- **Start orbit** enables a synchronized slow orbit; reduced motion disables it.
- Native page scrolling remains available outside the viewer. On small screens,
  the two views stay side by side and can be inspected in landscape orientation.

The viewer owns one WebGLRenderer with two scissored views and separate scene
resources, rendering on demand. It retains two complete decoded scenes, so it
uses more RAM/VRAM than the portfolio and is intended for desktop comparison.
Visibility changes suspend rendering; layer/controls/worker resources are cleaned
up on disposal. The portfolio remains on its original default file.

The comparison is included in Vite's production build as a second static HTML
entry and supports repository-subpath hosting. GPC binaries remain ignored by Git.
No deployment, repository visibility change, or upstream codec modification is
performed. Existing proprietary code and CC BY-NC scene notices still apply.

## Reproduce

Use the existing pinned codec checkout and Python virtual environment:

```bash
.artifacts/codec-venv/Scripts/python.exe scripts/palette-codec.py
.artifacts/codec-venv/Scripts/python.exe scripts/palette-codec.py --fixture
npm test
npm run build
```

The encoder refuses to overwrite an existing result. Training cache is under
`.artifacts/palette-experiment/tree.npz`, specific to the supplied scene and seed;
use a fresh cache/output when changing the source or training design. Encoding
took about 208 seconds excluding initial palette training on this machine.
