"""Windows-compatible wrapper around the pinned upstream bounded-memory encoder.

The upstream source lives in an ignored checkout; no encoder is vendored here.
"""
import argparse
import json
from pathlib import Path
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("input", type=Path)
parser.add_argument("--codec", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.codec.resolve() / "src"))
from large_io import PlySource, write_gpc, decode_gpc, sha256_file

if args.output.exists():
    raise SystemExit("Output exists; choose a different filename to preserve it.")
source = PlySource(args.input)
cfg = {"family": "scalar", "geometry": "q16", "posbits": 20,
       "dc_bits": 12, "shape_bits": 12, "rotation_format": "fp16",
       "step": .004, "compressor": "zstd", "level": 19}
start = time.perf_counter()
progress = lambda message: print(message, flush=True)
frame = source.inspect(131072, progress)
write_gpc(args.output, source, cfg, 131072, progress)
decode_gpc(args.output, progress=progress)  # checksums and every decoded chunk
metadata = {"url": args.output.name, "codecRevision": "833bf7d36ef4b7cd4b64875a4249cec187dd9b41",
            "bytes": args.output.stat().st_size, "sourceBytes": args.input.stat().st_size,
            "sha256": sha256_file(args.output), "sourceSha256": sha256_file(args.input),
            "elapsedSeconds": time.perf_counter() - start, "config": cfg, **frame}
args.output.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps(metadata, indent=2), flush=True)
