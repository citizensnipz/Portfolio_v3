# GPC scene integration

## Delivered asset

`public/scenes/radegast.gpc` is encoded from the supplied `scene.ply` using
XR-Capsules/SplatCompressionCodec commit
`833bf7d36ef4b7cd4b64875a4249cec187dd9b41`.

- Input: 1,179,495,494 bytes.
- Output: 171,628,538 bytes (171.6 MB decimal, 163.7 MiB).
- Compression ratio: approximately 6.87×, 85.4% reduction.
- All 4,997,856 Gaussians and SH degree 3 retained; no decimation or pruning.
- Scalar profile; SH step 0.004; 20-bit positions; 12-bit DC and log scales;
  float16 normalized rotations; 8-bit opacity; Zstandard level 19.
- 39 independent chunks, up to 131,072 Gaussians each.
- SHA-256: `6a1938d0317f45922011f1cbdb1b5ecc9d3108afed10b7898001f9e36e47fab7`.

The approximately 35 MB estimate was not achieved by this conservative profile.
Subsequent precision trials produced a separate 47.87 MB candidate; see
[compression trials](compression-trials.md). Select it with `?quality=compact`.
Reducing the SH precision or changing codec families is a separate quality/size
experiment, not an automatic change to this asset. Compression is lossy; count
preservation does not mean bit-exact preservation of source attributes.

## Browser pipeline

```text
GPC2 HTTP stream
  → module worker: chunk framing, Zstandard decompression, attribute reconstruction
  → bounded, backpressured binary PLY interchange stream (in memory only)
  → Spark's PLY loader: Gaussian GPU packing and SH textures
  → SplatMesh + SparkRenderer sharing the host Three.js WebGLRenderer
```

No server decoder, Python browser runtime, full-scene float32 array, or temporary
PLY download is required. Chunk buffers transfer between threads; Spark requests
each next chunk through a zero-high-water-mark stream. This bounds the adapter's
decoded intermediates, **not the renderer's whole-scene RAM or VRAM**. Spark holds
packed scene arrays, SH textures, sort buffers, and rendering resources for all
five million splats. Initial loading can take tens of seconds or longer, especially
on a phone. GPU packing introduces its own precision limits beyond the GPC codec.

The browser decoder supports only the pinned **GPC2 / scalar / q16 / Zstandard**
profile produced by `scripts/encode-gpc.py`, including exact-position streams,
and the upstream uniformly quantized rotation streams used in compact trials.
Other families, XZ, GPC1 outer files, local blocks and SH prediction fail with an
explicit unsupported-profile error. This is not a universal GPC decoder.

Directory sizes, shapes, allocation limits, chunk counts, truncation, and trailing
bytes are checked. Python validation verifies Zstandard frame checksums. The small
browser fzstd dependency does not verify Zstandard checksums, and the manifest's
SHA-256 is recorded for offline verification rather than rehashed by the browser.
Use trusted, provisioned assets; this is not an arbitrary-file upload service.

## Rendering and lifecycle

The GPC layer attaches to the existing `SceneLayer` boundary. Spark's `onDirty`
callback requests a host animation frame after asynchronous sorting so paused
and reduced-motion views still settle correctly. The host continues to own the
single canvas, camera, scroll timeline, visibility handling, and RAF scheduling.

The source's published camera is stored in `radegast.json` and mapped through
the scene's centered scale and X/Y coordinate flip (180° about Z, matching
PlayCanvas's documented PLY convention). It is independent of decoding.
Change framing there without re-encoding the asset. A bounded 1–99 percentile
estimate is retained in the manifest as a fallback, not used to remove geometry.

The timeline currently applies **only a whole-scene final fade** to GPC content.
No environment erosion, statue segmentation, or bottom-to-top dissolve has been
implemented. `?scene=placeholder` selects the original inexpensive procedural
layer for comparison. A load/decode/render failure preserves the HTML and CSS
fallback. Context restoration recreates Spark's renderer resources while retaining
the decoded source arrays. Disposal terminates GPC decoding and frees layer-owned
GPU resources; Spark also manages its own shared loader worker pool.

## Re-encode on Windows (Git Bash)

Use Python 3.12 or 3.13 with NumPy/SciPy/Zstandard. The upstream CLI imports Unix
`fcntl`, so this project calls its lower-level `PlySource` and `write_gpc` APIs
through a small Windows-compatible wrapper instead of changing upstream code.

```bash
git clone https://github.com/XR-Capsules/SplatCompressionCodec.git .artifacts/codec
git -C .artifacts/codec checkout 833bf7d36ef4b7cd4b64875a4249cec187dd9b41
python -m venv .artifacts/codec-venv
.artifacts/codec-venv/Scripts/python.exe -m pip install numpy==2.3.5 scipy==1.17.0 zstandard==0.25.0
.artifacts/codec-venv/Scripts/python.exe scripts/encode-gpc.py \
  '/d/Personal/Projects/Radegast statue in autumn/scene.ply' \
  --codec .artifacts/codec --output public/scenes/radegast-new.gpc
```

The wrapper refuses to overwrite an existing output, validates the input, encodes
all chunks, independently decodes/checks every chunk, and writes hashes/settings
and framing to a same-named JSON manifest. Update the layer's manifest URL if you
choose another basename. Preserve the authored `camera` and `cameraSource` fields
when replacing a manifest; fresh encoding only supplies generic framing.

The initial encoding used the existing Python environment (NumPy 1.26.4,
SciPy 1.16.1, Zstandard 0.23.0), then decoding was cross-checked with the pinned
environment above. No global Python packages were changed.

## Distribution

The GPC is ignored by Git because of its size; provision it into `public/scenes/`
before building. Vite copies it into `dist/scenes/`. Missing assets give a static
fallback. The decoder integration is proprietary-derived; see `NOTICE.md` before
publishing source. This work does not change GitHub repository visibility, push,
or deploy anything. Making the Git repository private does not conceal decoder
JavaScript delivered by a public website.

The scene is CC BY-NC 4.0. Its attribution and modification notice are included
in the webpage and `public/scenes/ATTRIBUTION.txt`; noncommercial restrictions
continue to apply. Hosting authorization and commercial-use clearance are not
established by this local integration.
