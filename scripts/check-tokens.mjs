#!/usr/bin/env node
// Undefined-custom-property gate.
//
// `var(--nope)` with no fallback is invalid at computed-value time: the whole
// declaration is discarded and the property falls back to its initial or
// inherited value. It fails silently — no console warning, no build error, just
// a status color that renders as body text or a focus ring that never draws.
//
// This found 40 of them the first time it ran: --warning (13), --success (10),
// --focus-ring (9), --text-muted (4), and four one-off scale names, none of
// which the theme has ever defined. `--warn`, `--ok`, `--text-dim` do exist,
// and the near-misses read as correct in review.
//
//   node scripts/check-tokens.mjs
//
// `var(--x, fallback)` is deliberate and always allowed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

// Properties set by something other than a CSS declaration. Each needs a reason.
const EXTERNAL = new Map([
  ["--available-height", "Base UI sets it on the popover positioner"],
  ["--available-width", "Base UI sets it on the popover positioner"],
  ["--shiki-light", "Shiki emits it per token into the highlighted markup"],
  ["--shiki-dark", "Shiki emits it per token into the highlighted markup"],
]);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(css|tsx?)$/.test(e.name)) files.push(p);
  }
})(SRC);

const defined = new Set(EXTERNAL.keys());
const used = new Map();

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  // A CSS declaration, a JS setProperty call, or a React inline style object all
  // count as defining the property.
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
  for (const m of src.matchAll(/setProperty\(\s*["'](--[a-z0-9-]+)["']/gi)) defined.add(m[1]);
  for (const m of src.matchAll(/["'](--[a-z0-9-]+)["']\s*:/gi)) defined.add(m[1]);

  src.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
      if (m[2] === ",") continue; // has a fallback; cannot break
      const at = `${path.relative(ROOT, file)}:${i + 1}`;
      const hits = used.get(m[1]) ?? [];
      hits.push(at);
      used.set(m[1], hits);
    }
  });
}

const missing = [...used]
  .filter(([name]) => !defined.has(name))
  .sort((a, b) => b[1].length - a[1].length);

if (missing.length === 0) {
  console.log(`${used.size} custom properties referenced, all defined.`);
  process.exit(0);
}

console.error(`\n${missing.length} undefined custom propert${missing.length > 1 ? "ies" : "y"}:\n`);
for (const [name, locations] of missing) {
  console.error(`  ${name}  (${locations.length} use${locations.length > 1 ? "s" : ""})`);
  for (const l of locations) console.error(`      ${l}`);
}
console.error(
  "\nDefine it in src/styles.css, point it at the token that exists, or give the" +
    "\nvar() a fallback. If something outside CSS sets it, add it to EXTERNAL here.\n",
);
process.exit(1);
