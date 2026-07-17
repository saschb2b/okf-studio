// Theming: light/dark application and the deterministic type-color palette.
// A concept's `type` drives its color everywhere (graph, badges, filters).
// Colors are assigned from the type string by the golden-angle sequence so the
// same type gets a stable, learnable color within a bundle — see docs/ux/theming.md.

import type { ThemeMode } from "@/shared/types.ts";

const GOLDEN_ANGLE = 137.5;

export interface TypePalette {
  /** Stable color for a given concept type. */
  color(type: string): string;
  /** The distinct types this palette was built from, sorted. */
  types: string[];
}

/**
 * Build a deterministic type→color map. Types are sorted, then assigned hues by
 * `hue = i * 137.5° mod 360` at saturation/lightness tuned per theme.
 */
export function buildTypePalette(types: string[], dark: boolean): TypePalette {
  const sorted = [...new Set(types)].sort((a, b) => a.localeCompare(b));
  const sat = dark ? 62 : 64;
  const light = dark ? 64 : 44;
  const map = new Map<string, string>();
  sorted.forEach((t, i) => {
    const hue = Math.round((i * GOLDEN_ANGLE) % 360);
    map.set(t, `hsl(${hue} ${sat}% ${light}%)`);
  });
  const fallback = dark ? "hsl(0 0% 60%)" : "hsl(0 0% 45%)";
  return {
    types: sorted,
    color: (t: string) => map.get(t) ?? fallback,
  };
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
