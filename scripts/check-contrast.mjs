#!/usr/bin/env node
// Contrast gate for the app theme.
//
// docs/ux/theming.md claims every text-carrying color role clears WCAG AA (4.5:1)
// against every surface it can land on, in both themes. That claim used to be
// checked by hand, once, and then drifted. This reads the token blocks straight
// out of src/styles.css and re-derives it.
//
//   node scripts/check-contrast.mjs          # fail on any AA violation
//   node scripts/check-contrast.mjs --all    # also print the passing pairs
//
// Only solid tokens are compared directly; the translucent state fills
// (--ghost-hover, --ghost-active) are composited over each surface first,
// because that is what a reader actually sees behind a hovered row.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = path.join(ROOT, "src", "styles.css");

// --- Color ------------------------------------------------------------------

/** #rgb / #rrggbb -> [r, g, b] in 0..255. */
function parseHex(hex) {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** rgba(r, g, b, a) -> [r, g, b, a]; a defaults to 1. */
function parseRgba(value) {
  const nums = value.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return null;
  return [+nums[0], +nums[1], +nums[2], nums.length > 3 ? +nums[3] : 1];
}

function parseColor(value) {
  const v = value.trim();
  if (v.startsWith("#")) return [...parseHex(v), 1];
  if (v.startsWith("rgb")) return parseRgba(v);
  return null;
}

/** Source-over composite of a translucent color onto an opaque backdrop. */
function over([r, g, b, a], [br, bg, bb]) {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]) {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// --- Token extraction -------------------------------------------------------

/** Pull `--name: value;` pairs out of the rule whose selector matches. */
function readBlock(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`no ${selector} block in ${CSS}`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open, close);
  const tokens = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

const css = fs.readFileSync(CSS, "utf8");
const light = readBlock(css, ":root {");
const dark = { ...light, ...readBlock(css, ':root[data-theme="dark"] {') };

// --- The pairings the theme promises ----------------------------------------

// Surfaces any text can end up on. --el-* are here because a hovered control
// keeps its label, and the state fill is the surface at that moment.
const SURFACES = ["--bg-sunken", "--bg", "--bg-elev", "--bg-overlay", "--el-hover", "--el-active"];

// Translucent fills composite onto every surface, so each produces its own set.
const GHOSTS = ["--ghost-hover", "--ghost-active"];

// Roles that carry text and therefore owe 4.5:1 everywhere they can appear.
const INK = ["--text", "--text-dim", "--accent", "--error", "--warn", "--ok"];

// Fills that carry a label of their own.
const ON_FILL = [
  ["--accent-contrast", "--accent"],
  ["--accent-contrast", "--accent-hover"],
  ["--accent-contrast", "--accent-active"],
  ["--accent-contrast", "--error"], // .btn.danger, .win-close
  ["--accent-contrast", "--error-hover"],
  ["--accent-contrast", "--error-active"],
];

const AA = 4.5;

function check(themeName, tokens) {
  const failures = [];
  const passes = [];

  const backdrops = [];
  for (const s of SURFACES) {
    const c = parseColor(tokens[s]);
    if (!c) throw new Error(`${themeName}: ${s} is not a literal color (${tokens[s]})`);
    backdrops.push([s, c]);
  }
  for (const g of GHOSTS) {
    const c = parseColor(tokens[g]);
    if (!c) throw new Error(`${themeName}: ${g} is not a literal color (${tokens[g]})`);
    // A ghost fill only ever sits on a real surface; check the worst case, which
    // is the surface closest in tone to the ink.
    for (const [name, base] of backdrops.slice(0, 4)) {
      backdrops.push([`${g} on ${name}`, over(c, base)]);
    }
  }

  for (const ink of INK) {
    const fg = parseColor(tokens[ink]);
    if (!fg) throw new Error(`${themeName}: ${ink} is not a literal color (${tokens[ink]})`);
    for (const [name, bg] of backdrops) {
      const ratio = contrast(fg, bg);
      (ratio >= AA ? passes : failures).push([`${ink} on ${name}`, ratio]);
    }
  }

  for (const [ink, fill] of ON_FILL) {
    const ratio = contrast(parseColor(tokens[ink]), parseColor(tokens[fill]));
    (ratio >= AA ? passes : failures).push([`${ink} on ${fill}`, ratio]);
  }

  return { failures, passes };
}

const showAll = process.argv.includes("--all");
let failed = 0;

for (const [name, tokens] of [
  ["light", light],
  ["dark", dark],
]) {
  const { failures, passes } = check(name, tokens);
  console.log(`\n${name}: ${passes.length} pass, ${failures.length} below ${AA}:1`);
  for (const [pair, ratio] of failures) {
    console.log(`  FAIL  ${ratio.toFixed(2)}  ${pair}`);
  }
  if (showAll) {
    for (const [pair, ratio] of passes) console.log(`  ok    ${ratio.toFixed(2)}  ${pair}`);
  }
  failed += failures.length;
}

if (failed > 0) {
  console.error(`\n${failed} pairing(s) below WCAG AA. Adjust src/styles.css.`);
  process.exit(1);
}
console.log("\nAll text-carrying roles clear WCAG AA on every surface.");
