#!/usr/bin/env node
// okf-validate.mjs - check an Open Knowledge Format (OKF) bundle for conformance
// and, as a producer gate, for graph connectivity.
//
// Hard requirements (OKF v0.1). Any failure is an error and exits non-zero:
//   - every non-reserved .md file opens with a YAML frontmatter block
//   - every such block carries a non-empty `type` field
//   - index.md carries no frontmatter, except the bundle-root index.md, which
//     may carry frontmatter and, if it does, should declare okf_version
//
// Soft guidance (warnings; never fail the bundle by default, mirroring the
// permissive consumer the spec requires):
//   - log.md date headings should be ISO 8601 YYYY-MM-DD
//   - every concept-to-concept link should resolve to a real concept
//   - every concept should be reachable: no orphans (degree 0)
//
// A concept graph is how an agent traverses a bundle. A *broken link* points at a
// target that is not a concept -- a missing file, or a reserved index.md / log.md
// (navigation, not a graph node) -- so following it dead-ends. An *orphan* is a
// concept nothing links to and that links to nothing, so an agent can neither
// reach it from its neighbors nor leave it: its context is stranded. Consumers
// tolerate both, so by default they only warn. Pass --strict to fail on them:
// that is the producer gate the creation checklist in commands.md requires
// before an export is called done.
//
// Usage:  node okf-validate.mjs [bundle-dir] [--strict]
// Zero dependencies. Frontmatter is scanned line by line, as gray-matter would
// see it, so no YAML library is required.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, basename, sep } from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const root = args.find((a) => !a.startsWith("--")) || ".";
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const connectivity = []; // broken links + orphans; gated by --strict
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

const isReservedName = (name) => name === "index.md" || name === "log.md";

const files = walk(root).filter((f) => f.endsWith(".md"));
const conceptIds = new Set(); // path minus .md, for every concept (non-reserved) file
const conceptFiles = []; // the concept files, to walk their bodies for links
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
  conceptFiles.push(file);
  conceptIds.add(rel(file).replace(/\.md$/, ""));
  if (fm === null) {
    errors.push(`${rel(file)}: missing YAML frontmatter block`);
    continue;
  }
  const type = field(fm, "type");
  if (type === null) errors.push(`${rel(file)}: frontmatter has no 'type' field`);
  else if (type === "") errors.push(`${rel(file)}: 'type' field is empty`);
}

// Resolve a link href (relative to the concept it is in) to a bundle concept id,
// mirroring how a consumer builds the graph: absolute `/a/b.md` from the root,
// relative from the concept's own directory, `.md` and any #anchor stripped.
const resolveId = (href, fromRel) => {
  const path = href.split("#")[0].split("?")[0];
  if (!path) return null;
  const base = path.startsWith("/") ? path.slice(1) : `${dirname(fromRel)}/${path}`;
  const parts = [];
  for (const seg of base.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const norm = parts.join("/");
  return norm ? norm.replace(/\.md$/, "") : null;
};

// Build the concept graph from concept bodies only (index/log links are
// navigation, not graph edges). Undirected: a link makes both ends reachable.
const linked = new Set();
for (const file of conceptFiles) {
  const fromRel = rel(file);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
    const href = m[1];
    if (/^[a-z]+:/i.test(href)) continue; // external URL
    const id = resolveId(href, fromRel);
    if (id && conceptIds.has(id) && id !== fromRel.replace(/\.md$/, "")) {
      linked.add(fromRel.replace(/\.md$/, ""));
      linked.add(id);
    } else {
      const targetRel = href.startsWith("/") ? href.slice(1) : resolveId(href, fromRel) + ".md";
      const reserved = isReservedName(basename(targetRel));
      const why = reserved
        ? "reserved index.md/log.md is navigation, not a concept"
        : "no such concept";
      connectivity.push(`${fromRel}: broken concept link -> ${href} (${why})`);
    }
  }
}

// Orphans: concepts touched by no concept-to-concept link, in or out.
const orphans = [...conceptIds].filter((id) => !linked.has(id)).sort();
if (concepts > 1) {
  for (const id of orphans) connectivity.push(`${id}.md: orphan (no concept links in or out)`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const c of connectivity) console.warn(`${strict ? "gate " : "warn "} ${c}`);
for (const e of errors) console.error(`error ${e}`);

const brokenCount = connectivity.filter((c) => c.includes("broken concept link")).length;
const gateFailed = strict && connectivity.length > 0;
console.log(
  `\nOKF v0.1 check of "${root}": ${concepts} concept(s), ${errors.length} error(s), ` +
    `${warnings.length} warning(s); ${brokenCount} broken link(s), ${orphans.length} orphan(s)` +
    `${strict ? " [--strict]" : ""}. ` +
    (errors.length ? "NOT conformant." : gateFailed ? "Conformant, but the connectivity gate failed." : "Conformant.")
);
process.exit(errors.length || gateFailed ? 1 : 0);
