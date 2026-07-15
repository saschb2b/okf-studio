// Label legibility for the hierarchy views, per the dataviz ground rules:
// a label renders only when it FITS its mark (never clipped, never spilling
// into a neighbor — the tooltip and drill-down carry what doesn't fit), and
// its ink is picked by the fill's luminance (light fills get dark ink, dark
// fills light ink) so text never washes out on a bright type color. This is
// the space-filling twin of the graph's level-of-detail labels: zoom/drill in
// and more names appear.

import type { VizColors } from "@/viz/nivoTheme.ts";

/** Chart label font size (matches nivoTheme's labels.text). */
export const LABEL_FONT_PX = 11;

// Average glyph width as an em fraction for the UI sans at weight 600.
// Deliberately generous: over-estimating hides a borderline label rather than
// letting it spill out of its shape.
const AVG_CHAR_EM = 0.66;

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
  opts?: { maxFont?: number; minFont?: number; maxLines?: number },
): FittedLabel | null {
  const maxFont = opts?.maxFont ?? 18;
  const minFont = opts?.minFont ?? 10;
  const maxLines = opts?.maxLines ?? 3;
  for (let fontSize = maxFont; fontSize >= minFont; fontSize--) {
    const maxChars = Math.floor(w / (fontSize * AVG_CHAR_EM));
    if (maxChars < 4) continue;
    const lines = wrapWords(text, maxChars, maxLines);
    if (!lines) continue;
    if (lines.length * fontSize * LINE_HEIGHT <= h) return { lines, fontSize };
  }
  return null;
}

/** Greedy word wrap; null when a word alone overflows or lines run out. */
function wrapWords(
  text: string,
  maxChars: number,
  maxLines: number,
): string[] | null {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (word.length > maxChars) return null;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= maxChars) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
      if (lines.length >= maxLines) return null;
    }
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/**
 * Readable ink for a label sitting ON a colored fill. The type palette emits
 * `hsl(H S% L%)`, so the L component decides: light fills (L ≥ 60 — every
 * palette color in dark mode) get the theme's dark ink, dark fills its light
 * ink. Both inks are role tokens (`bg` is the dark surface in dark mode and
 * the light one in light mode), so the pick stays theme-reactive. Labels on
 * neutral surfaces (parent bands, breadcrumbs) use `colors.text` directly.
 */
export function inkOn(fill: string, colors: VizColors, dark: boolean): string {
  const m = /hsl\(\s*[\d.]+[\s,]+[\d.]+%[\s,]+([\d.]+)%/.exec(fill);
  if (!m) return colors.text;
  const lightFill = parseFloat(m[1]) >= 60;
  const darkInk = dark ? colors.bg : colors.text;
  const lightInk = dark ? colors.text : colors.bg;
  return lightFill ? darkInk : lightInk;
}
