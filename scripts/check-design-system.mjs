#!/usr/bin/env node
// Keeps design-system/ honest about its three claims.
//
// The bundle is the marketing site's visual language, derived from the desktop
// app's dark theme. "Derived from" is how palettes drift: the app's accent
// moved and the site kept the old one, which is two different blues for one
// product and invisible until someone opens both at once.
//
//   node scripts/check-design-system.mjs
//
// Three checks:
//   1. The roles foundations/color.md declares as tracking the app match
//      src/styles.css. The mapping is read from the concept's own table, so
//      adding a row there is what puts a role under the gate.
//   2. styles/tokens.css is a faithful projection of the foundation
//      frontmatter. The header calls it mechanical; nothing enforced that.
//   3. The ratios in the Contrast table are what the tokens actually produce.
//      The previous table was out by up to 2.5:1 in both directions.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DS = path.join(ROOT, "design-system");
const COLOR_MD = path.join(DS, "foundations", "color.md");

const problems = [];

// --- Contrast ---------------------------------------------------------------

const luminance = (hex) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// --- Read the bundle --------------------------------------------------------

const colorMd = fs.readFileSync(COLOR_MD, "utf8");

/** Every `name: "#value"` under the frontmatter's `tokens.colors`. */
const frontmatter = colorMd.slice(0, colorMd.indexOf("---", 4));
const dsTokens = {};
for (const m of frontmatter.matchAll(/^\s{4}([a-z0-9-]+):\s*"([^"]+)"/gim)) dsTokens[m[1]] = m[2];

/** The app's dark theme, which is what this palette was derived from. */
const appCss = fs.readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");
const readAppBlock = (selector) => {
  const open = appCss.indexOf("{", appCss.indexOf(selector));
  const body = appCss.slice(open, appCss.indexOf("\n}", open)).replace(/\/\*[\s\S]*?\*\//g, "");
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};
const appDark = { ...readAppBlock(":root {"), ...readAppBlock(':root[data-theme="dark"] {') };

// --- 1. Roles that track the app -------------------------------------------

// Rows of the "These track the app" table: | `colors.x` | `--y` |
const tracked = [...colorMd.matchAll(/^\|\s*`colors\.([a-z0-9-]+)`\s*\|\s*`(--[a-z0-9-]+)`\s*\|/gim)];
if (tracked.length === 0) {
  problems.push("no tracked-role table found in foundations/color.md — has the section been renamed?");
}
for (const [, dsName, appName] of tracked) {
  const ours = dsTokens[dsName]?.toLowerCase();
  const theirs = appDark[appName]?.toLowerCase();
  if (!ours) problems.push(`colors.${dsName} is in the tracking table but not in the frontmatter`);
  else if (!theirs) problems.push(`${appName} is in the tracking table but not in src/styles.css`);
  else if (ours !== theirs) {
    problems.push(
      `colors.${dsName} is ${ours} but the app's ${appName} is ${theirs}.\n` +
        `      These are declared to track each other in foundations/color.md.\n` +
        `      Change both, or move the row to the "deliberately differ" table with a reason.`,
    );
  }
}

// --- 2. tokens.css is a faithful projection ---------------------------------

const tokensCss = fs.readFileSync(path.join(DS, "styles", "tokens.css"), "utf8");
for (const [name, value] of Object.entries(dsTokens)) {
  const declared = new RegExp(`--colors-${name}:\\s*([^;]+);`).exec(tokensCss);
  if (!declared) problems.push(`styles/tokens.css is missing --colors-${name}`);
  else if (declared[1].trim().toLowerCase() !== value.toLowerCase()) {
    problems.push(
      `styles/tokens.css has --colors-${name}: ${declared[1].trim()}, ` +
        `frontmatter says ${value}. The projection is mechanical; regenerate it.`,
    );
  }
}

// --- 3. The documented ratios are real --------------------------------------

// Rows of the Contrast table: | `a` on `b` (note) | N.NN:1 |
const PAIR = /^\|\s*`([a-z0-9-]+)`\s+on\s+`([a-z0-9-]+)`[^|]*\|\s*([\d.]+):1\s*\|/gim;
let pairs = 0;
for (const [, fg, bg, claimed] of colorMd.matchAll(PAIR)) {
  const a = dsTokens[fg];
  const b = dsTokens[bg];
  if (!a || !b) {
    problems.push(`contrast table names ${fg}/${bg}, which is not in the frontmatter`);
    continue;
  }
  pairs++;
  const actual = contrast(a, b);
  if (Math.abs(actual - Number(claimed)) > 0.05) {
    problems.push(`contrast table claims ${fg} on ${bg} is ${claimed}:1; it is ${actual.toFixed(2)}:1`);
  }
  if (actual < 4.5) {
    problems.push(`${fg} on ${bg} is ${actual.toFixed(2)}:1, below the 4.5:1 the concept promises`);
  }
}
if (pairs === 0) problems.push("no contrast pairings found in foundations/color.md");

// --- Report -----------------------------------------------------------------

if (problems.length === 0) {
  console.log(
    `design-system: ${tracked.length} role(s) in sync with the app theme, ` +
      `${Object.keys(dsTokens).length} token(s) projected, ${pairs} contrast pairing(s) verified.`,
  );
  process.exit(0);
}
console.error(`\ndesign-system is out of sync (${problems.length}):\n`);
for (const p of problems) console.error(`  - ${p}`);
console.error("");
process.exit(1);
