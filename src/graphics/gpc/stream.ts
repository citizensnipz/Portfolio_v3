import type { GpcHeader } from "./decoder";
import { plyHeader } from "./decoder";

export async function openGpcStream(
  url: string,
  signal: AbortSignal,
  onProgress: (decoded: number, total: number) => void,
) {
  const worker = new Worker(new URL("./decode.worker.ts", import.meta.url), {
    type: "module",
  });
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let rejectReady: (error: Error) => void = () => {};
  let closed = false;
  let resolvePull: (() => void) | undefined;
  const stop = () => {
    worker.terminate();
    signal.removeEventListener("abort", abort);
  };
  const fail = (error: Error) => {
    if (closed) return;
    closed = true;
    rejectReady(error);
    controller?.error(error);
    resolvePull?.();
    stop();
  };
  const abort = () =>
    fail(new DOMException("GPC loading cancelled", "AbortError"));
  signal.addEventListener("abort", abort, { once: true });
  const ready = new Promise<GpcHeader>((resolve, reject) => {
    rejectReady = reject;
    worker.onerror = (event) =>
      fail(new Error(event.message || "GPC worker failed"));
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.type === "ready") resolve(data.header);
      else if (data.type === "error") fail(new Error(data.message));
      else if (data.type === "data") {
        controller?.enqueue(data.bytes);
        onProgress(data.decoded, total);
        resolvePull?.();
      } else if (data.type === "done") {
        closed = true;
        controller?.close();
        resolvePull?.();
        stop();
      }
    };
  });
  let total = 0;
  if (signal.aborted) abort();
  else worker.postMessage({ type: "open", url });
  const header = await ready;
  total = header.count;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(c) {
        controller = c;
      },
      pull() {
        return new Promise<void>((resolve) => {
          resolvePull = resolve;
          worker.postMessage({ type: "next" });
        });
      },
      cancel() {
        closed = true;
        stop();
      },
    },
    { highWaterMark: 0 },
  );
  const streamLength =
    plyHeader(header.count, header.degree).length +
    header.count * (14 + 3 * ((header.degree + 1) ** 2 - 1)) * 4;
  return { stream, streamLength, header, cancel: abort };
}
