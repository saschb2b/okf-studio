#!/usr/bin/env node
// odsf-validate.mjs - check an Open Design System Format (ODSF) bundle for conformance.
//
// ODSF is a profile of OKF, so this runs the full OKF v0.1 check and then the ODSF additions.
//
// Hard requirements (errors, exit non-zero):
//   OKF  - every non-reserved .md file opens with a YAML frontmatter block carrying a
//          non-empty `type`; index.md carries no frontmatter except the bundle-root one.
//   ODSF - the bundle-root index.md declares `odsf_version`.
//
// Soft guidance (warnings, never fail the bundle, mirroring permissive consumers):
//   OKF  - log.md date headings should be ISO 8601 YYYY-MM-DD; cross-links should resolve.
//   ODSF - root should also declare okf_version; companion assets referenced by a concept
//          (in `examples` frontmatter or body links) should exist; `{group.name}` token
//          references should resolve; a bundle should contain only .md, .html, and .css files.
//
// Usage:  node odsf-validate.mjs [bundle-dir]      (defaults to the current dir)
// Zero dependencies. Frontmatter is scanned line by line, no YAML library required.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, basename, sep, extname } from "node:path";

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

// The lines of an indented block under a top-level `key:` (e.g. `tokens:` or `examples:`),
// up to the next non-indented line. Returns [] if the key is absent.
const block = (fm, key) => {
  const lines = fm.split(/\r?\n/);
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (!inside) {
      if (new RegExp(`^${key}\\s*:`).test(line)) inside = true;
      continue;
    }
    if (line.trim() === "") continue;
    if (/^\s/.test(line)) out.push(line);
    else break; // back to top level
  }
  return out;
};

const unquote = (s) => s.replace(/^['"]|['"]$/g, "").trim();

// Collect every dotted token path defined under a `tokens:` block, by indentation.
// `tokens:\n  colors:\n    primary: "#fff"` yields paths "colors" and "colors.primary".
const collectTokenPaths = (fm, into) => {
  const lines = block(fm, "tokens");
  const stack = []; // [{ indent, key }]
  for (const raw of lines) {
    const indent = raw.length - raw.trimStart().length;
    const m = raw.trim().match(/^([^:#-][^:]*?)\s*:/);
    if (!m) continue; // list item or comment, not a mapping key
    const keyName = m[1].trim();
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ indent, key: keyName });
    into.add(stack.map((s) => s.key).join("."));
  }
};

// Asset paths a concept declares under `examples:` (block list or inline list).
const declaredExamples = (fm) => {
  const out = [];
  const inline = field(fm, "examples");
  if (inline && inline.startsWith("[")) {
    for (const part of inline.replace(/^\[|\]$/g, "").split(",")) {
      const v = unquote(part);
      if (v) out.push(v);
    }
  }
  for (const line of block(fm, "examples")) {
    const m = line.trim().match(/^-\s*(.+)$/);
    if (m) out.push(unquote(m[1]));
  }
  return out;
};

const files = walk(root);
const mdFiles = files.filter((f) => f.endsWith(".md"));
const definedTokens = new Set();
let concepts = 0;
let rootDeclaresOdsf = false;

// --- Pass 1: concepts, reserved files, and the ODSF version declaration. ---
for (const file of mdFiles) {
  const name = basename(file);
  const text = readFileSync(file, "utf8");
  const fm = frontmatter(text);
  const isRootIndex = rel(file) === "index.md";

  if (name === "index.md") {
    if (fm && !isRootIndex)
      warnings.push(`${rel(file)}: index.md should carry no frontmatter (only the bundle-root index.md may)`);
    if (isRootIndex && fm) {
      if (field(fm, "odsf_version") !== null) rootDeclaresOdsf = true;
      if (field(fm, "okf_version") === null)
        warnings.push(`${rel(file)}: root index.md should also declare okf_version (ODSF is an OKF profile)`);
    }
    continue;
  }

  if (name === "log.md") {
    for (const m of text.matchAll(/^##\s+(.+?)\s*$/gm))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1]))
        warnings.push(`${rel(file)}: log heading "${m[1]}" is not ISO 8601 YYYY-MM-DD`);
    continue;
  }

  // Concept document (OKF hard requirement).
  concepts++;
  if (fm === null) {
    errors.push(`${rel(file)}: missing YAML frontmatter block`);
    continue;
  }
  const type = field(fm, "type");
  if (type === null) errors.push(`${rel(file)}: frontmatter has no 'type' field`);
  else if (type === "") errors.push(`${rel(file)}: 'type' field is empty`);

  collectTokenPaths(fm, definedTokens);

  // Declared example assets should exist (ODSF soft guidance).
  for (const href of declaredExamples(fm)) {
    if (/^[a-z]+:/i.test(href)) continue; // external URL
    const target = href.startsWith("/") ? join(root, href.slice(1)) : join(dirname(file), href);
    if (!existsSync(target))
      warnings.push(`${rel(file)}: declared example asset not found -> ${href}`);
  }
}

// ODSF hard requirement: the bundle must announce itself.
if (!rootDeclaresOdsf)
  errors.push(`index.md: bundle-root index.md must declare odsf_version (ODSF conformance)`);

// --- Pass 2: link and asset existence across markdown and HTML (broken targets warn). ---
const linkTargets = (text, exts) => {
  const hits = [];
  // markdown links ](path) and HTML href/src="path"
  const re = new RegExp(`(?:\\]\\(|(?:href|src)\\s*=\\s*["'])([^)"'\\s#]+\\.(?:${exts}))`, "gi");
  for (const m of text.matchAll(re)) hits.push(m[1]);
  return hits;
};

for (const file of [...mdFiles, ...files.filter((f) => f.endsWith(".html"))]) {
  const text = readFileSync(file, "utf8");
  for (const href of linkTargets(text, "md|html|css")) {
    if (/^[a-z]+:/i.test(href)) continue; // external URL
    const target = href.startsWith("/") ? join(root, href.slice(1)) : join(dirname(file), href);
    if (!existsSync(target)) warnings.push(`${rel(file)}: link target not found -> ${href}`);
  }
}

// --- Pass 3: unresolved {group.name} token references (best-effort lint). ---
for (const file of mdFiles) {
  const fm = frontmatter(readFileSync(file, "utf8"));
  if (!fm) continue;
  for (const m of fm.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)) {
    if (!definedTokens.has(m[1]))
      warnings.push(`${rel(file)}: token reference {${m[1]}} does not resolve to a defined token`);
  }
}

// --- Pass 4: bundle should be text-only (.md/.html/.css). ---
for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (![".md", ".html", ".css"].includes(ext))
    warnings.push(`${rel(file)}: unexpected file type "${ext || "(none)"}" (ODSF bundles SHOULD contain only .md, .html, .css)`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(
  `\nODSF v0.1 check of "${root}": ${concepts} concept(s), ` +
    `${definedTokens.size} token path(s), ${errors.length} error(s), ${warnings.length} warning(s). ` +
    (errors.length ? "NOT conformant." : "Conformant.")
);
process.exit(errors.length ? 1 : 0);
