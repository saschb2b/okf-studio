import { describe, expect, it } from "vitest";

import { buildTypePalette } from "@/shared/theme.ts";

/** WCAG relative luminance of a `#rrggbb` string. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(hex: string, backdrop: string): number {
  const a = luminance(hex);
  const b = luminance(backdrop);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// The palest dark surface and the darkest light one — the worst case each
// theme's type colors have to survive (--bg-overlay / --bg-sunken).
const WORST = { dark: "#22262e", light: "#edeff3" };

const TYPES = [
  "Concept",
  "Dataset",
  "Guideline",
  "Metric",
  "Pattern",
  "Playbook",
  "Reference",
  "Runbook",
  "Table",
  "View",
];

describe("buildTypePalette", () => {
  it("assigns a stable color per type regardless of input order", () => {
    const a = buildTypePalette(TYPES, true);
    const b = buildTypePalette([...TYPES].reverse(), true);
    for (const t of TYPES) expect(b.color(t)).toBe(a.color(t));
  });

  it("emits sRGB hex, not a CSS color function", () => {
    // The colors are handed to a 2D canvas and a WebGL buffer, neither of which
    // can be relied on to parse oklch() on the oldest webview we ship on.
    const palette = buildTypePalette(TYPES, true);
    for (const t of TYPES) expect(palette.color(t)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives every type the same visual weight", () => {
    // The point of generating in OKLab rather than HSL. The old HSL palette
    // spread these ratios across 4.3–11.8 in dark, so a yellow type shouted and
    // a blue one disappeared; holding perceptual lightness fixed collapses it.
    for (const dark of [true, false]) {
      const palette = buildTypePalette(TYPES, dark);
      const ratios = TYPES.map((t) =>
        contrast(palette.color(t), dark ? WORST.dark : WORST.light),
      );
      const spread = Math.max(...ratios) - Math.min(...ratios);
      expect(spread).toBeLessThan(1.5);
    }
  });

  it("keeps every type color legible as a mark on the worst-case surface", () => {
    // Swatches, dots, and graph nodes are non-text UI: WCAG 1.4.11, so 3:1.
    for (const dark of [true, false]) {
      const palette = buildTypePalette(TYPES, dark);
      for (const t of TYPES) {
        expect(contrast(palette.color(t), dark ? WORST.dark : WORST.light)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("gives distinct types distinct colors", () => {
    const palette = buildTypePalette(TYPES, true);
    expect(new Set(TYPES.map((t) => palette.color(t))).size).toBe(TYPES.length);
  });

  it("falls back to a neutral for an unknown type", () => {
    const palette = buildTypePalette(TYPES, true);
    const fallback = palette.color("not-in-the-bundle");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(fallback.slice(i, i + 2), 16));
    // Chroma-free, so it reads as "no type" rather than as one more color.
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
  });

  it("dedupes and sorts the types it reports", () => {
    const palette = buildTypePalette(["View", "Concept", "View"], true);
    expect(palette.types).toEqual(["Concept", "View"]);
  });
});
