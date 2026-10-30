import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeChunk,
  decodePalette,
  parseHeader,
  plyHeader,
} from "../src/graphics/gpc/decoder.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./gpc-fixture.json", import.meta.url), "utf8"),
);
const bytes = new Uint8Array(Buffer.from(fixture.base64, "base64"));
test("Shared SH palette and smallest-three rotations match independent Python decoding", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./gpc-fixture-palette.json", import.meta.url),
      "utf8",
    ),
  );
  const bytes = new Uint8Array(Buffer.from(fixture.base64, "base64"));
  const palette = decodePalette(fixture.palette);
  const decoded = decodeChunk(bytes, fixture.count, fixture.degree, palette);
  const actual = new Float32Array(decoded.buffer);
  assert.equal(actual.length, fixture.expected.length);
  for (let i = 0; i < actual.length; i++)
    assert.ok(
      Math.abs(actual[i] - fixture.expected[i]) < 2e-6,
      `palette attribute ${i}: ${actual[i]} vs ${fixture.expected[i]}`,
    );
  assert.throws(
    () => decodeChunk(bytes, fixture.count, fixture.degree),
    /Missing shared palette/,
  );
  assert.throws(() => decodePalette({ ...fixture.palette, width: 44 }));
  assert.throws(() => decodePalette({ ...fixture.palette, count: 999999999 }));
});
test("Compact 8-bit attributes and quantized rotations match upstream Python decoding", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./gpc-fixture-compact.json", import.meta.url),
      "utf8",
    ),
  );
  const bytes = new Uint8Array(Buffer.from(fixture.base64, "base64"));
  const body = decodeChunk(bytes, fixture.count, fixture.degree);
  const result = new Float32Array(body.buffer);
  assert.equal(result.length, fixture.expected.length);
  for (let i = 0; i < result.length; i++)
    assert.ok(
      Math.abs(result[i] - fixture.expected[i]) < 2e-6,
      `attribute ${i}`,
    );
});
test("GPC browser decoder matches independent upstream Python decoding, including all SH3 bands", () => {
  const body = decodeChunk(bytes, fixture.count, fixture.degree);
  const result = new Float32Array(body.buffer);
  assert.equal(result.length, fixture.expected.length);
  for (let i = 0; i < result.length; i++)
    assert.ok(
      Math.abs(result[i] - fixture.expected[i]) < 2e-6,
      `attribute ${i}: ${result[i]} vs ${fixture.expected[i]}`,
    );
});
test("GPC corruption and profile mismatch fail explicitly", () => {
  assert.throws(() =>
    decodeChunk(bytes.subarray(0, bytes.length - 1), fixture.count, 3),
  );
  assert.throws(() => decodeChunk(bytes, fixture.count + 1, 3));
  const invalid = bytes.slice();
  invalid[0] = 0;
  assert.throws(() => decodeChunk(invalid, fixture.count, 3));
  const invalidProfile = bytes.slice();
  const text = new TextDecoder().decode(
    invalidProfile.subarray(
      8,
      8 + new DataView(invalidProfile.buffer).getUint32(4, true),
    ),
  );
  invalidProfile.set(
    new TextEncoder().encode(text.replace("scalar", "foobar")),
    8,
  );
  assert.throws(
    () => decodeChunk(invalidProfile, fixture.count, 3),
    /Unsupported GPC profile/,
  );
});
test("GPC outer metadata and PLY interchange preserve count and SH degree", () => {
  const header = { version: 2, count: 7, degree: 3, chunk_size: 4, chunks: 2 };
  assert.deepEqual(
    parseHeader(new TextEncoder().encode(JSON.stringify(header))),
    header,
  );
  assert.throws(() =>
    parseHeader(
      new TextEncoder().encode(JSON.stringify({ ...header, chunks: 1 })),
    ),
  );
  const text = new TextDecoder().decode(plyHeader(7, 3));
  assert.match(text, /element vertex 7/);
  assert.match(text, /f_rest_44/);
  assert.doesNotMatch(new TextDecoder().decode(plyHeader(7, 0)), /f_rest_/);
});
