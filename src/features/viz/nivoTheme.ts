// Bridge from the app's CSS role variables to a nivo theme object. Nivo's
// theme is plain JS (its canvas variants can't resolve `var(--x)`), so the
// variables are resolved at this boundary once per theme change and passed
// down to every chart. Text wears text tokens, never the series color.

import type { PartialTheme } from "@nivo/theming";

export interface VizColors {
  text: string;
  textDim: string;
  bg: string;
  bgElev: string;
  border: string;
  accent: string;
}

/** Resolve the role variables the visualizations need from the document root. */
export function readVizColors(): VizColors {
  if (typeof document === "undefined") {
    return {
      text: "#111",
      textDim: "#777",
      bg: "#fff",
      bgElev: "#f5f5f5",
      border: "#ddd",
      accent: "#2f6df6",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    text: v("--text", "#111"),
    textDim: v("--text-dim", "#777"),
    bg: v("--bg", "#fff"),
    bgElev: v("--bg-elev", "#f5f5f5"),
    border: v("--border", "#ddd"),
    accent: v("--accent", "#2f6df6"),
  };
}

/** Nivo theme from the resolved role colors — chart text matches the app
 *  chrome. Tooltips are NOT themed here: the views render their own
 *  <VizTooltip> card (a real elevated surface), because nivo's theme container
 *  didn't reliably paint a background behind custom tooltips. */
export function nivoTheme(c: VizColors): PartialTheme {
  return {
    text: {
      fontFamily: "inherit",
      fontSize: 11,
      fill: c.text,
    },
    labels: {
      text: { fontSize: 11, fontWeight: 600 },
    },
  };
}
