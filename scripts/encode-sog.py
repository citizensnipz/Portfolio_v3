"""Encode the original capture as standard SOG, then verify and write its manifest."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--verify-only", action="store_true", help="Verify an existing output without re-encoding")
args = parser.parse_args()
source = Path("D:/Personal/Projects/Radegast statue in autumn/scene.ply")
output = Path("public/scenes/radegast.sog")
cli = Path(".artifacts/sog-tool/node_modules/@playcanvas/splat-transform/bin/cli.mjs")
command = [
    "node", "--max-old-space-size=8192", str(cli),
    "-g", "0", "--gpu-backend", "d3d12", "--max-workers", "0", "--no-tty",
    "-i", "20", "--webp-effort", "9", str(source), str(output),
]
start = time.perf_counter()
if not args.verify_only:
    if output.exists():
        raise SystemExit("Output already exists; refusing to overwrite")
    print("Command:", json.dumps(command), flush=True)
    with Path(".artifacts/sog-encode.log").open("w", encoding="utf-8") as log:
        log.write(json.dumps(command) + "\n")
        log.flush()
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              encoding="utf-8", errors="replace", bufsize=1) as process:
            for line in process.stdout:
                print(line.rstrip(), flush=True)
                log.write(line)
                log.flush()
            result = process.wait()
    if result:
        raise SystemExit(f"Encoder failed with exit code {result}; see .artifacts/sog-encode.log")

with zipfile.ZipFile(output) as archive:
    bad = archive.testzip()
    if bad:
        raise ValueError(f"Corrupt SOG archive member: {bad}")
    metadata = json.loads(archive.read("meta.json"))
    if metadata["count"] != 4997856 or metadata.get("shN", {}).get("bands") != 3:
        raise ValueError("SOG count/SH bands mismatch")
    members = {item.filename: item.file_size for item in archive.infolist()}
manifest = json.loads(Path("public/scenes/radegast.json").read_text(encoding="utf-8-sig"))
if manifest["url"] != "radegast.gpc":
    raise ValueError("Expected original GPC manifest as the source of shared framing")
with output.open("rb") as encoded:
    digest = hashlib.file_digest(encoded, "sha256").hexdigest()
manifest.update(
    url=output.name, format="sog", bytes=output.stat().st_size, sha256=digest,
    config=dict(encoder="@playcanvas/splat-transform", version="3.10.1", iterations=20,
                webpEffort=9, gpu=0, backend="d3d12", workers=0),
    archiveMembers=members,
)
manifest.pop("codecRevision", None)
manifest.pop("elapsedSeconds", None)
if not args.verify_only:
    manifest["elapsedSeconds"] = time.perf_counter() - start
output.with_name("radegast-sog.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps(manifest, indent=2), flush=True)
