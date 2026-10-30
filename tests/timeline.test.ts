import assert from "node:assert/strict";
import test from "node:test";
import { sampleTimeline } from "../src/graphics/timeline.ts";

test("the sequence exposes the five future integration stages", () => {
  assert.deepEqual(
    [0, 0.3, 0.5, 0.7, 0.9].map((p) => sampleTimeline(p).stage),
    ["scene", "environment", "isolated", "body", "head"],
  );
  assert.equal(sampleTimeline(0.45).environmentOpacity, 0);
  assert.equal(sampleTimeline(0.58).bodyOpacity, 1);
  assert.equal(sampleTimeline(0.85).bodyOpacity, 0);
  assert.equal(sampleTimeline(0.85).headOpacity, 1);
  assert.equal(sampleTimeline(1).headOpacity, 0);
  assert.equal(sampleTimeline(1).reveal, 1);
});

test("reverse seeking yields exactly the same state and all channels remain bounded", () => {
  const positions = Array.from({ length: 101 }, (_, i) => i / 100);
  const forward = positions.map(sampleTimeline);
  const backward = positions.toReversed().map(sampleTimeline).reverse();
  assert.deepEqual(forward, backward);
  for (const frame of forward) {
    for (const value of Object.values(frame))
      if (typeof value === "number") assert.ok(value >= 0 && value <= 1);
  }
});

test("out-of-range and invalid inputs cannot corrupt render state", () => {
  assert.deepEqual(sampleTimeline(-1), sampleTimeline(0));
  assert.deepEqual(sampleTimeline(2), sampleTimeline(1));
  assert.deepEqual(sampleTimeline(NaN), sampleTimeline(0));
  assert.deepEqual(sampleTimeline(Infinity), sampleTimeline(0));
});

test("spatial stages start and finish in order with overlapping handoffs", () => {
  assert.equal(sampleTimeline(0).upperEnvironment, 1);
  assert.equal(sampleTimeline(0).circleRadius, 1);
  assert.equal(sampleTimeline(0).cylinderLength, 1);
  assert.equal(sampleTimeline(0.18).upperEnvironment, 0.5);
  assert.equal(sampleTimeline(0.16).circleRadius, 1);
  assert.equal(sampleTimeline(0.36).upperEnvironment, 0);
  assert.ok(Math.abs(sampleTimeline(0.4).circleRadius - 0.5) < 1e-12);
  assert.equal(sampleTimeline(0.5).cylinderLength, 1);
  assert.equal(sampleTimeline(0.64).circleRadius, 0);
  assert.equal(sampleTimeline(0.75).cylinderLength, 0.5);
  assert.equal(sampleTimeline(1).upperEnvironment, 0);
  assert.equal(sampleTimeline(1).circleRadius, 0);
  assert.equal(sampleTimeline(1).cylinderLength, 0);
  for (const [p, first, next] of [
    [0.3, "upperEnvironment", "circleRadius"],
    [0.58, "circleRadius", "cylinderLength"],
  ] as const) {
    const frame = sampleTimeline(p);
    assert.ok(frame[first] > 0 && frame[first] < 1);
    assert.ok(frame[next] > 0 && frame[next] < 1);
  }
});

test("spatial stage clocks keep moving forward through both handoffs", () => {
  const channels = ["upperEnvironment", "circleRadius", "cylinderLength"] as const;
  for (let i = 0; i < 1000; i++) {
    const before = sampleTimeline(i / 1000);
    const after = sampleTimeline((i + 1) / 1000);
    const steps = channels.map((key) => before[key] - after[key]);
    assert.ok(steps.every((step) => step >= -1e-12));
    // At least one stage keeps a useful rate through both handoffs and the end.
    assert.ok(Math.max(...steps) >= 0.0019);
  }
});

test("stage boundaries do not introduce abrupt jumps", () => {
  for (const p of [0.16, 0.22, 0.36, 0.45, 0.5, 0.58, 0.64, 0.85]) {
    const before = sampleTimeline(p - 0.00001);
    const after = sampleTimeline(p + 0.00001);
    for (const key of [
      "environmentOpacity",
      "bodyOpacity",
      "headOpacity",
      "bodyScale",
      "reveal",
      "upperEnvironment",
      "circleRadius",
      "cylinderLength",
    ] as const) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.001);
    }
  }
});
