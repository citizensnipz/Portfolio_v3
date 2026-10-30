/** Browser decoder for the scalar/Zstandard profile of SplatCompressionCodec.
 * Derived from XR-Capsules/SplatCompressionCodec at
 * 833bf7d36ef4b7cd4b64875a4249cec187dd9b41. Proprietary integration, not MIT.
 * Deliberately rejects other experimental profiles instead of guessing.
 */
import { decompress } from "fzstd";

export interface GpcHeader {
  profile?: string;
  palette?: PaletteDescriptor;
  version: number;
  count: number;
  degree: number;
  chunk_size: number;
  chunks: number;
}
export interface PaletteDescriptor {
  encoding: string;
  count: number;
  width: number;
  step: number;
  data: string;
}
export const PALETTE_PROFILE = "sh-palette-smallest3-v1";
export function decodePalette(p: PaletteDescriptor): Float32Array {
  if (
    p.encoding !== "i16-zstd-base64" ||
    p.width !== 45 ||
    !Number.isFinite(p.step) ||
    p.step <= 0
  )
    throw new Error("Unsupported SH palette");
  integer(p.count, 1, 4096);
  if (typeof p.data !== "string" || p.data.length > 1_048_576)
    throw new Error("Invalid SH palette size");
  const compressed = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
  const raw = decompress(compressed, new Uint8Array(p.count * 45 * 2));
  if (raw.length !== p.count * 45 * 2)
    throw new Error("Invalid SH palette byte count");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return Float32Array.from({ length: p.count * 45 }, (_, i) =>
    Math.fround(view.getInt16(i * 2, true) * Math.fround(p.step)),
  );
}
interface Descriptor {
  name: string;
  dtype: string;
  shape: number[];
  mode: string;
  bytes: number;
  raw: number;
}
interface ChunkHeader {
  algorithm: string;
  meta: {
    n: number;
    step: number;
    rotation_step?: number;
    cfg: Record<string, unknown>;
    sh_predict?: boolean;
    local_streams?: string[];
  };
  streams: Descriptor[];
}
export function integer(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error("Invalid GPC integer or allocation limit");
  return value;
}
export function parseHeader(bytes: Uint8Array): GpcHeader {
  const h = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as GpcHeader;
  if (h.version !== 2) throw new Error("Only GPC2 containers are supported");
  if (h.profile && h.profile !== PALETTE_PROFILE)
    throw new Error("Unsupported GPC profile");
  if (h.profile === PALETTE_PROFILE && !h.palette)
    throw new Error("Missing shared SH palette");
  integer(h.count, 1, 8_000_000);
  integer(h.degree, 0, 3);
  integer(h.chunk_size, 1, 1_048_576);
  if (h.chunks !== Math.ceil(h.count / h.chunk_size))
    throw new Error("Invalid GPC chunk count");
  return h;
}
export function plyHeader(count: number, degree: number): Uint8Array {
  integer(count, 1, 8_000_000);
  integer(degree, 0, 3);
  const rest = 3 * ((degree + 1) ** 2 - 1);
  const names = [
    "x",
    "y",
    "z",
    "f_dc_0",
    "f_dc_1",
    "f_dc_2",
    ...Array.from({ length: rest }, (_, i) => `f_rest_${i}`),
    "opacity",
    "scale_0",
    "scale_1",
    "scale_2",
    "rot_0",
    "rot_1",
    "rot_2",
    "rot_3",
  ];
  return new TextEncoder().encode(
    `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${names.map((n) => `property float ${n}\n`).join("")}end_header\n`,
  );
}
function half(h: number): number {
  const sign = h & 0x8000 ? -1 : 1,
    exponent = (h >> 10) & 31,
    fraction = h & 1023;
  return (
    sign *
    (exponent === 0
      ? fraction * 2 ** -24
      : exponent === 31
        ? fraction
          ? NaN
          : Infinity
        : (1 + fraction / 1024) * 2 ** (exponent - 15))
  );
}
type Numbers =
  | Float32Array
  | Uint32Array
  | Int32Array
  | Uint16Array
  | Int16Array
  | Uint8Array
  | Int8Array;

/** Returns a binary PLY body for one chunk, retaining all SH bands in the file. */
export function decodeChunk(
  blob: Uint8Array,
  expected: number,
  degree: number,
  sharedPalette?: Float32Array,
): Uint8Array {
  integer(expected, 1, 1_048_576);
  integer(degree, 0, 3);
  if (
    blob.byteLength < 8 ||
    new TextDecoder().decode(blob.subarray(0, 4)) !== "GPC1"
  )
    throw new Error("Invalid inner GPC1 chunk");
  const length = integer(
    new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getUint32(
      4,
      true,
    ),
    2,
    1_048_576,
  );
  if (8 + length > blob.length) throw new Error("Truncated GPC metadata");
  const head = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      blob.subarray(8, 8 + length),
    ),
  ) as ChunkHeader;
  const { meta: m } = head;
  const paletteProfile =
    m.cfg.family === "palette" && m.cfg.profile === PALETTE_PROFILE;
  if (
    m.n !== expected ||
    head.algorithm !== "zstd" ||
    (!paletteProfile && m.cfg.family !== "scalar") ||
    m.cfg.geometry !== "q16" ||
    m.sh_predict ||
    m.local_streams?.length ||
    m.cfg.importance
  )
    throw new Error(
      "Unsupported GPC profile: use scalar q16 / Zstandard without prediction or local blocks",
    );
  if (!Number.isFinite(m.step) || m.step <= 0)
    throw new Error("Invalid SH step");
  if (!Array.isArray(head.streams) || head.streams.length > 32)
    throw new Error("Invalid stream directory");
  const streams = new Map<string, { data: Numbers; dtype: string }>();
  let offset = 8 + length;
  for (const d of head.streams) {
    if (
      streams.has(d.name) ||
      !Array.isArray(d.shape) ||
      d.shape.length < 1 ||
      d.shape.length > 2
    )
      throw new Error("Invalid stream shape/name");
    const types: Record<
      string,
      { size: number; make: (buffer: ArrayBuffer) => Numbers }
    > = {
      "<f4": { size: 4, make: (b) => new Float32Array(b) },
      "<u4": { size: 4, make: (b) => new Uint32Array(b) },
      "<i4": { size: 4, make: (b) => new Int32Array(b) },
      "<u2": { size: 2, make: (b) => new Uint16Array(b) },
      "<i2": { size: 2, make: (b) => new Int16Array(b) },
      "<f2": { size: 2, make: (b) => new Uint16Array(b) },
      "|u1": { size: 1, make: (b) => new Uint8Array(b) },
      "|i1": { size: 1, make: (b) => new Int8Array(b) },
    };
    const type = types[d.dtype];
    if (!type || !["shuffle", "raw"].includes(d.mode))
      throw new Error("Unsupported stream type/mode");
    const count = d.shape.reduce(
      (a, b) => a * integer(b, 1, Math.max(expected, 62)),
      1,
    );
    integer(d.raw, 1, expected * 62 * 4);
    if (count * type.size !== d.raw)
      throw new Error("Stream byte size mismatch");
    integer(d.bytes, 1, blob.length - offset);
    const raw = decompress(
      blob.subarray(offset, offset + d.bytes),
      new Uint8Array(d.raw),
    );
    offset += d.bytes;
    if (raw.length !== d.raw)
      throw new Error("Decompressed stream size mismatch");
    let bytes = raw;
    if (d.mode === "shuffle" && type.size > 1) {
      bytes = new Uint8Array(d.raw);
      for (let byte = 0; byte < type.size; byte++)
        for (let i = 0; i < count; i++)
          bytes[i * type.size + byte] = raw[byte * count + i];
    }
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    streams.set(d.name, { data: type.make(buffer), dtype: d.dtype });
  }
  if (offset !== blob.length) throw new Error("Trailing bytes in GPC chunk");
  const get = (name: string, count: number, types?: string[]) => {
    const s = streams.get(name);
    if (!s || s.data.length !== count || (types && !types.includes(s.dtype)))
      throw new Error(`Invalid or missing ${name} stream`);
    return s.data;
  };
  const perChannel = (degree + 1) ** 2 - 1,
    rest = perChannel * 3,
    stride = 14 + rest;
  const result = new Float32Array(expected * stride);
  const f = Math.fround;
  for (const [name, column] of [
    ["position", 0],
    ["dc", 3],
    ["scales", 7 + rest],
  ] as const) {
    if (name === "position" && streams.has("position_exact")) {
      const exact = get("position_exact", expected * 3, ["<f4"]);
      for (let i = 0; i < expected; i++)
        for (let k = 0; k < 3; k++)
          result[i * stride + column + k] = exact[i * 3 + k];
      continue;
    }
    const q = get(name, expected * 3, ["<u4", "<u2", "|u1"]);
    const lo = get(`${name}_lo`, 3, ["<f4"]),
      step = get(`${name}_step`, 3, ["<f4"]);
    for (let i = 0; i < expected; i++)
      for (let k = 0; k < 3; k++)
        result[i * stride + column + k] = f(f(q[i * 3 + k] * step[k]) + lo[k]);
  }
  const fp16Rotation = streams.has("rotation_fp16");
  const rotation = paletteProfile
    ? get("rotation_smallest3", expected * 4, ["|u1"])
    : fp16Rotation
      ? get("rotation_fp16", expected * 4, ["<f2"])
      : get("rotation", expected * 4, ["<u2"]);
  const rotationStep = f(m.rotation_step ?? 0);
  if (
    !paletteProfile &&
    !fp16Rotation &&
    (!Number.isFinite(rotationStep) || rotationStep <= 0 || rotationStep > 1)
  )
    throw new Error("Invalid rotation quantization step");
  const alpha = get("alpha", expected, ["|u1"]);
  const sh = paletteProfile
    ? get("sh_labels", expected, ["<u2"])
    : get("sh_q", expected * 45, ["<i2", "<i4"]);
  if (
    paletteProfile &&
    (!sharedPalette || sharedPalette.length % 45 || !sharedPalette.length)
  )
    throw new Error("Missing shared palette data");
  const step = f(m.step);
  for (let i = 0; i < expected; i++) {
    const row = i * stride;
    if (paletteProfile && sh[i] >= sharedPalette!.length / 45)
      throw new Error("SH palette index out of range");
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < perChannel; k++)
        result[row + 6 + c * perChannel + k] = paletteProfile
          ? sharedPalette![sh[i] * 45 + c * 15 + k]
          : f(sh[i * 45 + c * 15 + k] * step);
    const opacity = Math.min(1 - 1e-7, Math.max(1e-7, alpha[i] / 255));
    result[row + 6 + rest] = Math.log(opacity / (1 - opacity));
    if (paletteProfile) {
      const mode = integer(rotation[i * 4 + 3], 0, 3);
      let kept = 0,
        sum = 0;
      for (let k = 0; k < 4; k++) {
        if (k === mode) continue;
        const value = f(
          f(f(f(rotation[i * 4 + kept++] / f(255)) * 2) - 1) / f(Math.SQRT2),
        );
        result[row + 10 + rest + k] = value;
        sum = f(sum + f(value * value));
      }
      result[row + 10 + rest + mode] = f(Math.sqrt(Math.max(0, f(1 - sum))));
    } else
      for (let k = 0; k < 4; k++)
        result[row + 10 + rest + k] = fp16Rotation
          ? half(rotation[i * 4 + k])
          : f(f(f(rotation[i * 4 + k] * rotationStep) * 2) - 1);
  }
  // Opacity logits can be infinite in source PLY; reconstructed values are clamped.
  if (!result.every(Number.isFinite))
    throw new Error("Nonfinite decoded attributes");
  return new Uint8Array(result.buffer);
}
