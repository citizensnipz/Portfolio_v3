/// <reference lib="webworker" />
import {
  decodeChunk,
  decodePalette,
  integer,
  parseHeader,
  plyHeader,
} from "./decoder";
import type { GpcHeader } from "./decoder";

let reader: ReadableStreamDefaultReader<Uint8Array>;
let pending: Uint8Array = new Uint8Array(0);
let header: GpcHeader;
let palette: Float32Array | undefined;
let index = -1,
  decoded = 0;
async function read(size: number): Promise<Uint8Array> {
  const result = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
    if (!pending.length) {
      const next = await reader.read();
      if (next.done) throw new Error("Truncated GPC response");
      pending = next.value;
    }
    const count = Math.min(pending.length, size - offset);
    result.set(pending.subarray(0, count), offset);
    pending = pending.subarray(count);
    offset += count;
  }
  return result;
}
async function handle(data: { type: string; url?: string }): Promise<void> {
  if (data.type === "open") {
    const response = await fetch(data.url!);
    if (!response.ok || !response.body)
      throw new Error(`GPC request failed: ${response.status}`);
    reader = response.body.getReader();
    const prefix = await read(8);
    if (new TextDecoder().decode(prefix.subarray(0, 4)) !== "GPC2")
      throw new Error("Expected GPC2 asset");
    const length = integer(
      new DataView(prefix.buffer).getUint32(4, true),
      2,
      1_048_576,
    );
    header = parseHeader(await read(length));
    if (header.palette) palette = decodePalette(header.palette);
    self.postMessage({ type: "ready", header });
  } else if (data.type === "next") {
    if (index === -1) {
      index = 0;
      const bytes = plyHeader(header.count, header.degree);
      self.postMessage(
        { type: "data", bytes, decoded },
        { transfer: [bytes.buffer] },
      );
    } else if (index < header.chunks) {
      const prefix = await read(8);
      const length = Number(new DataView(prefix.buffer).getBigUint64(0, true));
      integer(length, 8, header.chunk_size * 62 * 8 + 1_048_576);
      const count = Math.min(header.chunk_size, header.count - decoded);
      const bytes = decodeChunk(
        await read(length),
        count,
        header.degree,
        palette,
      );
      decoded += count;
      index++;
      self.postMessage(
        { type: "data", bytes, decoded },
        { transfer: [bytes.buffer] },
      );
    } else {
      if (
        pending.length ||
        !(await reader.read()).done ||
        decoded !== header.count
      )
        throw new Error("Trailing GPC data or count mismatch");
      self.postMessage({ type: "done" });
      reader.releaseLock();
    }
  }
}
let chain = Promise.resolve();
self.onmessage = (event) => {
  chain = chain
    .then(() => handle(event.data))
    .catch((error) => {
      void reader?.cancel();
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
};
