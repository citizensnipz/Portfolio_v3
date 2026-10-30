import test from "node:test";
import assert from "node:assert/strict";
import { BASE_TONES, DEFAULT_THEME, contrast, createTheme, hexToRgb, hsvToRgb, normalizeHex, rgbToHsv, tintColor } from "../src/theme.ts";

test("extreme and saturated visitor colors retain readable text and accents", () => {
  for (const seed of ["#000000", "#ffffff", "#0000ff", "#ff0000", "#00ff00", "#ff00ff", "#101010"]) {
    const { tones } = createTheme(seed);
    for (const name of ["accent", "text", "muted", "soft", "dim", "note", "small"] as const) {
      assert.ok(contrast(tones[name], tones.surface) >= 4.5, `${seed}: ${name}`);
    }
  }
});

test("default keeps the authored accent and background; malformed saved colors fall back", () => {
  const theme = createTheme(DEFAULT_THEME);
  assert.deepEqual(theme.tones.accent, hexToRgb(DEFAULT_THEME));
  assert.deepEqual(theme.tones.background, tintColor(BASE_TONES.background, DEFAULT_THEME));
  assert.equal(createTheme("not-a-color").color, DEFAULT_THEME);
  assert.equal(normalizeHex(" #AbC "), "#aabbcc");
  assert.equal(normalizeHex("#12345z"), undefined);
});

test("wheel conversions retain RGB values, including gray and black", () => {
  for (const hex of [DEFAULT_THEME, "#000000", "#808080", "#ffffff", "#568bff", "#ff0000", "#00ff00", "#0000ff"]) {
    const rgb = hexToRgb(hex);
    assert.deepEqual(hsvToRgb(rgbToHsv(rgb)), rgb);
  }
});
