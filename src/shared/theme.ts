// Theming: light/dark application and the deterministic type-color palette.
// A concept's `type` drives its color everywhere (graph, badges, filters).
// Colors are assigned from the type string by the golden-angle sequence so the
// same type gets a stable, learnable color within a bundle — see docs/ux/theming.md.

import type { ThemeMode } from "@/shared/types.ts";

const GOLDEN_ANGLE = 137.5;

/** Where the hue sequence starts, so the first type lands near the accent. */
const BASE_HUE = 250;

/**
 * Perceptual lightness and chroma per theme. OKLab's L is a perceptual scale,
 * so holding it fixed gives every type the same visual weight and the same
 * contrast against the pane behind it. HSL's L is not: `hsl(60 62% 64%)`
 * (yellow) and `hsl(240 62% 64%)` (blue) share a nominal lightness but differ
 * by roughly 3× in the luminance a reader actually sees.
 */
const TONE = {
  dark: { l: 0.76, c: 0.115 },
  light: { l: 0.55, c: 0.13 },
};

export interface TypePalette {
  /** Stable color for a given concept type. */
  color(type: string): string;
  /** The distinct types this palette was built from, sorted. */
  types: string[];
}

/** OKLCH → linear sRGB (Björn Ottosson's matrices). Components may fall
 *  outside 0..1 when the request is outside the sRGB gamut. */
function oklchToLinearSrgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;

  const L = lp * lp * lp;
  const M = mp * mp * mp;
  const S = sp * sp * sp;

  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Linear → gamma-encoded sRGB, as a `#rrggbb` string. */
function toHex(rgb: number[]): string {
  return `#${rgb
    .map((v) => {
      const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, s)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/**
 * OKLCH → `#rrggbb`, reducing chroma (never lightness or hue) until the color
 * fits sRGB. Clamping the channels instead — what a naive conversion does —
 * shifts the hue, which would undo the point of generating hues on an even
 * angular sequence.
 *
 * Hex rather than an `oklch()` string because these colors are handed to a 2D
 * canvas, a WebGL buffer, and inline styles alike; the canvas paths depend on
 * CSS Color 4 parsing that the oldest webview we ship on does not have.
 */
function oklchHex(l: number, c: number, h: number): string {
  let lo = 0;
  let hi = c;
  if (inGamut(oklchToLinearSrgb(l, c, h))) return toHex(oklchToLinearSrgb(l, c, h));
  // 16 halvings resolve chroma far finer than an 8-bit channel can show.
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearSrgb(l, mid, h))) lo = mid;
    else hi = mid;
  }
  return toHex(oklchToLinearSrgb(l, lo, h));
}

/**
 * Build a deterministic type→color map. Types are sorted, then assigned hues by
 * `hue = 250° + i * 137.5° mod 360` at the perceptual lightness/chroma the
 * theme calls for.
 */
export function buildTypePalette(types: string[], dark: boolean): TypePalette {
  const sorted = [...new Set(types)].sort((a, b) => a.localeCompare(b));
  const { l, c } = dark ? TONE.dark : TONE.light;
  const map = new Map<string, string>();
  sorted.forEach((t, i) => {
    map.set(t, oklchHex(l, c, (BASE_HUE + i * GOLDEN_ANGLE) % 360));
  });
  // An untyped concept gets the same lightness with no chroma, so it reads as
  // "no type" rather than as one more color in the sequence.
  const fallback = oklchHex(l, 0, 0);
  return {
    types: sorted,
    color: (t: string) => map.get(t) ?? fallback,
  };
}

/**
 * Resolve the same role variables under BOTH themes at once.
 *
 * `getComputedStyle` only ever sees the theme currently on the root, which is
 * enough for anything that re-reads on a theme switch. It is not enough for a
 * renderer that bakes color into its output once and keeps it — Mermaid writes
 * its palette into the SVG, so a diagram is rendered twice up front and CSS
 * shows the matching copy. That needs the other theme's values while the first
 * one is live.
 *
 * The root's `data-theme` is flipped and restored inside one synchronous block.
 * A style recalc is forced by each read, but no paint can happen until the task
 * yields, so nothing flashes. Values are cached: this walks the whole document's
 * style twice and should happen once per session, not once per diagram.
 *
 * Only pass tokens whose value is a literal color. A custom property is not
 * substituted at computed-value time, so `--focus-ring` comes back as the text
 * "var(--accent)" and `--accent-soft` as an unevaluated `color-mix(…)`, neither
 * of which a color library downstream can parse.
 */
const themeTokenCache = new Map<string, { light: string; dark: string }>();

export function readTokenPairs(names: readonly string[]): Record<string, { light: string; dark: string }> {
  const missing = names.filter((n) => !themeTokenCache.has(n));
  if (missing.length > 0 && typeof document !== "undefined") {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    const readAll = () => {
      const cs = getComputedStyle(root);
      return missing.map((n) => cs.getPropertyValue(n).trim());
    };
    try {
      root.dataset.theme = "light";
      const light = readAll();
      root.dataset.theme = "dark";
      const dark = readAll();
      missing.forEach((n, i) => themeTokenCache.set(n, { light: light[i], dark: dark[i] }));
    } finally {
      if (previous === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous;
    }
  }
  return Object.fromEntries(
    names.map((n) => [n, themeTokenCache.get(n) ?? { light: "", dark: "" }]),
  );
}

/** Resolve "system" to a concrete light/dark using the OS preference. */
export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Apply the theme + reduce-motion preference to the document root. */
export function applyTheme(mode: ThemeMode, reduceMotion: boolean): void {
  if (typeof document === "undefined") return;
  const dark = resolveDark(mode);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.reduceMotion = reduceMotion ? "true" : "false";
}
