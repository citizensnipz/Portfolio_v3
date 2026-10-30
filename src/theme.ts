export type RGB = [number, number, number];
export const DEFAULT_THEME = "#c4d5a5";
export const THEME_STORAGE_KEY = "portfolio-theme-v1";

export const BASE_TONES = {
  background: "#111411", text: "#eceee6", muted: "#a2a99e",
  accent: DEFAULT_THEME, line: "#cad7ba", underline: "#80916a",
  glow: "#293326", decor: "#a7bd80", mesh: "#b9cc91",
  border: "#859178", soft: "#c1caba", dim: "#8b9883",
  label: "#c4cbbb", note: "#969f8f", chip: "#c4ccbc",
  surface: "#1b2119", bright: "#cbd6c3", highlight: "#bac6af",
  pending: "#b4bbaa", small: "#8c9685",
} as const;

export function normalizeHex(value: string): string | undefined {
  const hex = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex].map(c => c + c).join("").toLowerCase()}`;
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
}

export function hexToRgb(hex: string): RGB {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

export function rgbToHex(rgb: RGB): string {
  return `#${rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

export function rgbToHsv(rgb: RGB): RGB {
  const [r, g, b] = rgb.map(c => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) h = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [((h * 60) % 360 + 360) % 360, max ? delta / max : 0, max];
}

export function hsvToRgb([h, s, v]: RGB): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

const defaultHsv = rgbToHsv(hexToRgb(DEFAULT_THEME));

/** Preserve each authored tone's brightness and variation, rotating the palette together. */
export function tintColor(base: string, seed: string): RGB {
  if (seed === DEFAULT_THEME) return hexToRgb(base);
  const [h, s, v] = rgbToHsv(hexToRgb(base));
  const [seedH, seedS] = rgbToHsv(hexToRgb(seed));
  return hsvToRgb([(h + seedH - defaultHsv[0] + 360) % 360, Math.min(1, s * seedS / defaultHsv[1]), v]);
}

export function contrast(a: RGB, b: RGB): number {
  const luminance = (rgb: RGB) => rgb.map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function createTheme(seed: string) {
  const color = normalizeHex(seed) ?? DEFAULT_THEME;
  const tones = Object.fromEntries(Object.entries(BASE_TONES).map(([name, hex]) => [name, tintColor(hex, color)])) as Record<keyof typeof BASE_TONES, RGB>;
  tones.accent = hexToRgb(color);
  // Saturated blue/red and dark selections still need readable text and controls.
  for (const name of Object.keys(tones) as (keyof typeof BASE_TONES)[]) {
    if (["background", "surface", "glow", "border", "decor", "mesh", "line"].includes(name)) continue;
    while (contrast(tones[name], tones.surface) < 4.5) {
      tones[name] = tones[name].map(c => Math.min(255, c + 2)) as RGB;
    }
  }
  const [h, s] = rgbToHsv(hexToRgb(color));
  return { color, tones, rotation: h - defaultHsv[0], saturation: s / defaultHsv[1] };
}

export type Theme = ReturnType<typeof createTheme>;
let current = createTheme(DEFAULT_THEME);
const listeners = new Set<(theme: Theme) => void>();
export function setTheme(color: string): void {
  current = createTheme(color);
  listeners.forEach(listener => listener(current));
}
export function subscribeTheme(listener: (theme: Theme) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}
