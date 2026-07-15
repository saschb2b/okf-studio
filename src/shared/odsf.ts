// Design-system (ODSF) artifact logic — the pure, testable layer the reader's
// rich-artifact rendering is built on. ODSF is an OKF *profile*: its design
// tokens live in a concept's `tokens` frontmatter (preserved into `extra` as a
// nested object by the core's indentation-aware parser) and its examples in
// `examples`. None of this is OKF-mandated, so everything here feature-detects
// and tolerates absence — a plain OKF bundle simply has no tokens/examples and
// renders unchanged. See docs/features/design-system-rendering.md.

import type { Bundle, Concept } from "@/shared/types.ts";

/** A token value is a leaf string, or a map of sub-properties (composite). */
export type TokenValue = string | { [key: string]: TokenValue };
/** A token group ("colors", "spacing", …) maps token names to values. */
export type TokenGroup = Record<string, TokenValue>;
/** The `tokens` tree: group name → its tokens. */
export type TokenTree = Record<string, TokenGroup>;

/** How a foundation's tokens should be visualized, derived from its `type`. */
export type TokenVizKind =
  | "color"
  | "typography"
  | "spacing"
  | "shape"
  | "elevation"
  | "motion"
  | "table";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A concept's `tokens` tree, if it declares a non-empty one (else null). */
export function conceptTokens(concept: Concept): TokenTree | null {
  const raw = concept.extra.tokens;
  if (!isRecord(raw)) return null;
  const groups: TokenTree = {};
  for (const [group, value] of Object.entries(raw)) {
    if (isRecord(value)) groups[group] = value as TokenGroup;
  }
  return Object.keys(groups).length > 0 ? groups : null;
}

/** Companion example asset paths a concept declares (`examples` frontmatter). */
export function conceptExamples(concept: Concept): string[] {
  const raw = concept.extra.examples;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string" && raw) return [raw];
  return [];
}

/** Lifecycle status (`stable` / `experimental` / `deprecated`), if declared. */
export function conceptStatus(concept: Concept): string | null {
  const raw = concept.extra.status;
  return typeof raw === "string" && raw ? raw : null;
}

/** Platforms/surfaces a concept governs (`applies_to`), if declared. */
export function conceptAppliesTo(concept: Concept): string[] {
  const raw = concept.extra.applies_to;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string" && raw) return [raw];
  return [];
}

/** True when a concept carries anything the design-system renderer surfaces. */
export function hasDesignArtifacts(concept: Concept): boolean {
  return conceptTokens(concept) !== null || conceptExamples(concept).length > 0;
}

/**
 * Flatten one concept's `tokens` into dotted leaf keys, e.g.
 * `colors.primary` → "#fff", `typography.body.fontSize` → "16px". Composite
 * (object) tokens contribute their leaves, not the object itself.
 */
function flattenInto(node: TokenValue, prefix: string, into: Record<string, string>): void {
  if (typeof node === "string") {
    into[prefix] = node;
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    flattenInto(value, prefix ? `${prefix}.${key}` : key, into);
  }
}

/**
 * A bundle-wide map of `group.name(.sub)` → leaf value, built from every
 * concept's foundation tokens. This is what `{group.name}` references resolve
 * against. Component tokens are included too, but references almost always point
 * at foundation tokens.
 */
export function buildTokenIndex(bundle: Bundle | null): Record<string, string> {
  const index: Record<string, string> = {};
  if (!bundle) return index;
  for (const concept of bundle.concepts) {
    const tokens = conceptTokens(concept);
    if (!tokens) continue;
    for (const [group, members] of Object.entries(tokens)) {
      flattenInto(members, group, index);
    }
  }
  return index;
}

const REF_RE = /\{([a-zA-Z0-9_.-]+)\}/g;

/**
 * Resolve `{group.name}` references in a token value against the bundle index.
 * An unresolved reference is left verbatim (tolerated, like a broken link).
 */
export function resolveTokenRefs(value: string, index: Record<string, string>): string {
  return value.replace(REF_RE, (whole, path: string) => index[path] ?? whole);
}

/** Map a concept `type` to how its tokens should be visualized. */
export function tokenVizKind(type: string): TokenVizKind {
  const t = type.toLowerCase();
  if (t.includes("color")) return "color";
  if (t.includes("typograph")) return "typography";
  if (t.includes("spacing")) return "spacing";
  if (t.includes("shape")) return "shape";
  if (t.includes("elevation")) return "elevation";
  if (t.includes("motion")) return "motion";
  return "table";
}

/** The role an example asset plays, from its filename suffix. */
export type ExampleKind = "do" | "dont" | "example";

export function exampleKind(path: string): ExampleKind {
  if (/\.dont\./i.test(path)) return "dont";
  if (/\.do\./i.test(path)) return "do";
  return "example";
}

/** True when a resolved value reads as a CSS color (for swatches/dots). */
export function isColorValue(v: string): boolean {
  return /^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/i.test(v.trim());
}

/**
 * Perceived lightness of a `#rgb`/`#rrggbb`(`aa`) color, 0–255, for choosing
 * legible ink over a swatch. Non-hex (named/functional) colors default to light.
 */
export function colorLuminance(value: string): number {
  const hex = value.trim().replace(/^#/, "");
  let r: number, g: number, b: number;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6 || hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return 255; // unknown form → treat as light, use dark ink
  }
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Whether dark ink is legible on `value` (a light background). */
export function prefersDarkInk(value: string): boolean {
  return colorLuminance(value) > 150;
}
