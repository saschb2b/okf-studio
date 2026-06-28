#!/usr/bin/env node
// okf-validate.mjs - check an Open Knowledge Format (OKF) bundle for conformance.
//
// Hard requirements (OKF v0.1). Any failure is an error and exits non-zero:
//   - every non-reserved .md file opens with a YAML frontmatter block
//   - every such block carries a non-empty `type` field
//   - index.md carries no frontmatter, except the bundle-root index.md, which
//     may carry frontmatter and, if it does, should declare okf_version
//
// Soft guidance (warnings, never fail the bundle, mirroring permissive consumers):
//   - log.md date headings should be ISO 8601 YYYY-MM-DD
//   - cross-links should resolve (a broken link is tolerated, not malformed)
//
// Usage:  node okf-validate.mjs [bundle-dir]      (defaults to the current dir)
// Zero dependencies. Frontmatter is scanned line by line, as gray-matter would
// see it, so no YAML library is required.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, basename, sep } from "node:path";

const root = process.argv[2] || ".";
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const rel = (p) => relative(root, p).split(sep).join("/") || ".";

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".") || e.name === "node_modules") return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

// Raw frontmatter body if the file opens with a --- fenced block, else null.
const frontmatter = (text) => {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // tolerate a BOM
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
};

// Top-level (non-indented) `key:` lookup, matching the spec's flat field use.
const field = (fm, key) => {
  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
  }
  return null;
};

const files = walk(root).filter((f) => f.endsWith(".md"));
let concepts = 0;

for (const file of files) {
  const name = basename(file);
  const text = readFileSync(file, "utf8");
  const fm = frontmatter(text);
  const isRootIndex = rel(file) === "index.md";

  if (name === "index.md") {
    if (fm && !isRootIndex)
      warnings.push(`${rel(file)}: index.md should carry no frontmatter (only the bundle-root index.md may)`);
    if (fm && isRootIndex && field(fm, "okf_version") === null)
      warnings.push(`${rel(file)}: root index.md has frontmatter but does not declare okf_version`);
    continue;
  }

  if (name === "log.md") {
    for (const m of text.matchAll(/^##\s+(.+?)\s*$/gm))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1]))
        warnings.push(`${rel(file)}: log heading "${m[1]}" is not ISO 8601 YYYY-MM-DD`);
    continue;
  }

  // Concept document.
  concepts++;
  if (fm === null) {
    errors.push(`${rel(file)}: missing YAML frontmatter block`);
    continue;
  }
  const type = field(fm, "type");
  if (type === null) errors.push(`${rel(file)}: frontmatter has no 'type' field`);
  else if (type === "") errors.push(`${rel(file)}: 'type' field is empty`);
}

// Soft link check across every markdown file (broken links only warn).
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
    const href = m[1];
    if (/^[a-z]+:/i.test(href)) continue; // external URL
    const target = href.startsWith("/") ? join(root, href.slice(1)) : join(dirname(file), href);
    if (!existsSync(target)) warnings.push(`${rel(file)}: link target not found -> ${href}`);
  }
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(
  `\nOKF v0.1 check of "${root}": ${concepts} concept(s), ` +
    `${errors.length} error(s), ${warnings.length} warning(s). ` +
    (errors.length ? "NOT conformant." : "Conformant.")
);
process.exit(errors.length ? 1 : 0);
