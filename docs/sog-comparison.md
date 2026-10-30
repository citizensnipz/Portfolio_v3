# Standard SOG comparison

The original `scene.ply` was encoded directly to bundled **SOG v2** using the
stock PlayCanvas `@playcanvas/splat-transform` CLI **3.10.1**. It was not
transcoded from a lossy GPC. The original PLY and all GPC variants are preserved.

## Measured output

| File                   |          Bytes | Decimal MB |
| ---------------------- | -------------: | ---------: |
| Original PLY           |  1,179,495,494 |   1,179.50 |
| Conservative GPC       |    171,628,538 |     171.63 |
| Palette GPC            |     95,471,101 |      95.47 |
| **Standard SOG**       | **72,589,052** |  **72.59** |
| Aggressive compact GPC |     47,868,974 |      47.87 |

The SOG is **69.23 MiB**, **16.25 times smaller than the PLY**, and **23.97% smaller
than the palette GPC**. It is **51.64% larger than the aggressive compact GPC**.
These are measured file sizes, not an equal-quality benchmark or a general
ranking of the formats.

All **4,997,856 Gaussians** and **three SH bands** remain. No pruning, decimation,
scene crop, or SH-band removal was applied. The SOG uses the encoder's standard
lossy attribute quantization, a **65,536-entry SH palette**, **20 clustering
iterations**, and lossless WebP encoding at **effort 9**. The palette GPC uses
4,096 SH vectors and different attribute precision; see `palette-experiment.md`.
Preserving SH bands does not mean preserving their original coefficients exactly.

The completed stock GPU encode took **3 minutes 32 seconds** on the local
NVIDIA GeForce RTX 5070 using D3D12 and no worker pool. The CLI reports binary
size units as `69.2MB`; this documentation consistently uses decimal MB.

SHA-256:
`cd2d4fb006c2f62e8862d58c8d164df540715e402f24560fc35ce22d90708a88`

Archive members, before ZIP headers:

| Data                     |      Bytes |
| ------------------------ | ---------: |
| Position textures        | 15,060,604 |
| Quaternion texture       | 15,670,458 |
| Scale texture            | 13,391,360 |
| DC color/opacity texture | 17,277,476 |
| SH centroids             |  2,472,956 |
| SH labels                |  8,699,626 |
| Metadata                 |     15,624 |

## Inspect locally

Run `npm run dev` and open **`/compare.html`** on the printed origin. The default
is palette GPC on the left and SOG on the right. Choose **Compact** on the left
for the earlier 47.87 MB encoding, or **Conservative** for the original GPC.
Choose **Palette GPC** on the right to reproduce the earlier GPC-only comparison.

Drag either viewport, zoom, select **Statue detail**, or reset the camera. There
is one Three.js canvas, one shared camera, and identical Spark rendering
settings. SOG loads through Spark's existing native `PCSOGSZIP` support;
the GPC path continues to use its separate decoder. No new runtime dependency
was added. The normal portfolio now defaults to SOG; `/?scene=gpc` restores
the conservative GPC and `/?quality=compact` selects the compact GPC.

`public/scenes/radegast-sog.json` records the file hash, exact size, encoder
settings and shared framing. The actual `.sog` is ignored by Git and must be
provisioned separately, as with the GPCs. Scene attribution and noncommercial
terms remain in `NOTICE.md` and on the comparison page.

## Reproduce

In Git Bash, from the repository root:

```bash
npm install --prefix .artifacts/sog-tool --no-audit --no-fund @playcanvas/splat-transform@3.10.1
python scripts/encode-sog.py
```

The script points to the supplied original PLY and refuses to overwrite an
existing SOG. It runs the equivalent of:

```bash
node --max-old-space-size=8192 \
  .artifacts/sog-tool/node_modules/@playcanvas/splat-transform/bin/cli.mjs \
  -g 0 --gpu-backend d3d12 --max-workers 0 --no-tty \
  -i 20 --webp-effort 9 \
  'D:/Personal/Projects/Radegast statue in autumn/scene.ply' \
  public/scenes/radegast.sog
```

GPU index 0 is specific to this machine; use the tool's `--list-gpus` on another
machine. The CPU option is `-g cpu`, but full-scene SH clustering is much slower.
The GPU encode may stay quiet while it computes before printing `Writing`.
Clustering uses randomized initialization; another encode can differ in bytes
and appearance even with the same settings.

To check an existing output and regenerate only its separate manifest:

```bash
python scripts/encode-sog.py --verify-only
```

Verification checks ZIP CRCs, Gaussian count, SH bands and the file hash. The
default GPC manifest supplies shared camera/framing and is never overwritten.
