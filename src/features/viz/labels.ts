// Label legibility for the hierarchy views, per the dataviz ground rules:
// a label renders only when it FITS its mark (never clipped, never spilling
// into a neighbor — the tooltip and drill-down carry what doesn't fit), and
// its ink is picked by the fill's luminance (light fills get dark ink, dark
// fills light ink) so text never washes out on a bright type color. This is
// the space-filling twin of the graph's level-of-detail labels: zoom/drill in
// and more names appear.

import type { VizColors } from "@/features/viz/nivoTheme.ts";
import type { VizLabelSize } from "@/shared/types.ts";

/** Font multiplier per label-size setting. */
export const LABEL_SCALE: Record<VizLabelSize, number> = {
  smaller: 0.8,
  default: 1,
  larger: 1.3,
};

/** Chart label font size (matches nivoTheme's labels.text). */
export const LABEL_FONT_PX = 11;

// Average glyph width as an em fraction for the UI sans at weight 600.
// Deliberately generous: over-estimating hides a borderline label rather than
// letting it spill out of its shape.
const AVG_CHAR_EM = 0.6;

/** Estimated rendered width of a chart label, px. */
export function labelWidth(text: string, fontSize = LABEL_FONT_PX): number {
  return text.length * fontSize * AVG_CHAR_EM;
}

/** Does `text` fit in `available` px with breathing room on both sides? */
export function labelFits(text: string, available: number, pad = 10): boolean {
  return labelWidth(text) + pad <= available;
}

/** A label solved for its shape: word-wrapped lines at the largest font that fits. */
export interface FittedLabel {
  lines: string[];
  fontSize: number;
}

const LINE_HEIGHT = 1.2;

/**
 * Fit `text` into a w×h box: walk font sizes from `maxFont` down, word-wrap
 * greedily at each size, and return the first (largest) size whose wrapped
 * lines fit both axes — so a big tile gets a big, readable, horizontal label
 * and a small one gets a smaller label or none. Returns null when even
 * `minFont` over `maxLines` can't hold it (the tooltip carries the name; a
 * label is never clipped).
 */
export function fitLabel(
  text: string,
  w: number,
  h: number,
  opts?: {
    maxFont?: number;
    minFont?: number;
    maxLines?: number;
    /** Multiplies the font range, from LABEL_SCALE. */
    scale?: number;
  },
): FittedLabel | null {
  const scale = opts?.scale ?? 1;
  const maxFont = Math.round((opts?.maxFont ?? 14) * scale);
  const minFont = Math.round((opts?.minFont ?? 5) * scale);
  const maxLines = opts?.maxLines ?? 4;
  for (let fontSize = maxFont; fontSize >= minFont; fontSize--) {
    const maxChars = Math.floor(w / (fontSize * AVG_CHAR_EM));
    if (maxChars < 4) continue;
    const lines = wrapWords(text, maxChars, maxLines);
    if (!lines) continue;
    if (lines.length * fontSize * LINE_HEIGHT <= h) return { lines, fontSize };
  }
  return null;
}

/**
 * Split into wrap units: words, further cut after `-`, `_`, `/` and `.` so a
 * slug like `use-restaurant-platform-api` can break at its separators. A unit
 * that ends in a separator glues to the next one with no space.
 */
function tokens(text: string): { t: string; glue: boolean }[] {
  const out: { t: string; glue: boolean }[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const parts = word.match(/[^-_/.]+[-_/.]*|[-_/.]+/g) ?? [word];
    parts.forEach((t, i) => out.push({ t, glue: i > 0 }));
  }
  return out;
}

/** Greedy wrap at spaces and separators, hard-splitting an oversized unit; null when lines run out. */
function wrapWords(
  text: string,
  maxChars: number,
  maxLines: number,
): string[] | null {
  const lines: string[] = [];
  let cur = "";
  const push = (): boolean => {
    lines.push(cur);
    cur = "";
    return lines.length < maxLines;
  };
  for (const { t, glue } of tokens(text)) {
    let rest = t;
    let sep = cur && !glue ? 1 : 0;
    while (cur.length + sep + rest.length > maxChars) {
      if (cur) {
        if (!push()) return null;
        sep = 0;
        continue;
      }
      // Oversized unit alone on a line: hard-split it.
      cur = rest.slice(0, maxChars);
      rest = rest.slice(maxChars);
      if (!push()) return null;
    }
    cur = cur ? cur + (sep ? " " : "") + rest : rest;
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/**
 * Readable ink for a label sitting ON a colored fill. The type palette emits
 * `#rrggbb`, so the decision is made on the fill's actual relative luminance
 * rather than on a nominal lightness component: HSL's L said `hsl(60 62% 64%)`
 * and `hsl(240 62% 64%)` were equally light, and they are not.
 *
 * The 0.45 threshold is where white and black ink cross over in WCAG contrast
 * terms — above it a fill takes dark ink, below it light. Both inks are role
 * tokens (`bg` is the dark surface in dark mode and the light one in light
 * mode), so the pick stays theme-reactive. Labels on neutral surfaces (parent
 * bands, breadcrumbs) use `colors.text` directly.
 */
export function inkOn(fill: string, colors: VizColors, dark: boolean): string {
  const y = relativeLuminance(fill);
  if (y === null) return colors.text;
  const darkInk = dark ? colors.bg : colors.text;
  const lightInk = dark ? colors.text : colors.bg;
  return y >= 0.45 ? darkInk : lightInk;
}

/** WCAG relative luminance of a `#rgb`/`#rrggbb` fill, or null if unparseable. */
function relativeLuminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/(.)/g, "$1$1") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
