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

/**
 * The light theme's literal values, for the one case that cannot read them: no
 * document (SSR, a Node unit test). Kept in one place and named after the token
 * it stands in for, so a chart never renders in a color the app does not use.
 * If you change a role in styles.css, change its twin here.
 */
export const VIZ_FALLBACK = {
  text: "#191c22",
  textDim: "#596170",
  bg: "#f6f7fa",
  bgElev: "#ffffff",
  border: "#d4d9e1",
  accent: "#1a56d0",
  warn: "#7d5800",
} satisfies VizColors & { warn: string };

/** Resolve the role variables the visualizations need from the document root. */
export function readVizColors(): VizColors {
  if (typeof document === "undefined") return { ...VIZ_FALLBACK };
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    text: v("--text", VIZ_FALLBACK.text),
    textDim: v("--text-dim", VIZ_FALLBACK.textDim),
    bg: v("--bg", VIZ_FALLBACK.bg),
    bgElev: v("--bg-elev", VIZ_FALLBACK.bgElev),
    border: v("--border", VIZ_FALLBACK.border),
    accent: v("--accent", VIZ_FALLBACK.accent),
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
