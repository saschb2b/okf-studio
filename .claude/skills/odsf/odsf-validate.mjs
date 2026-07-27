#!/usr/bin/env node
// odsf-validate.mjs - check an Open Design System Format (ODSF) bundle for conformance.
//
// ODSF is a profile of OKF, so this runs the full OKF v0.2 check and then the ODSF additions.
//
// Hard requirements (errors, exit non-zero):
//   OKF  - every non-reserved .md file opens with a YAML frontmatter block carrying a
//          non-empty `type`; index.md carries no frontmatter except the bundle-root one.
//   ODSF - the bundle-root index.md declares `odsf_version`.
//
// Soft guidance (warnings, never fail the bundle, mirroring permissive consumers):
//   OKF  - log.md date headings should be ISO 8601 YYYY-MM-DD; cross-links should resolve;
//          `sources` entries carry `resource`; `generated` carries `by`; identity fields
//          follow the actor convention; `stale_after` is an absolute YYYY-MM-DD.
//   ODSF - root should also declare okf_version; companion assets referenced by a concept
//          (in `examples` frontmatter or body links) should exist; `{group.name}` token
//          references should resolve; a bundle should contain only .md, .html, and .css files.
//
// `status` accepts OKF v0.2's draft|stable|deprecated plus ODSF's own `experimental`
// extension (spec section 3), which OKF-only consumers see as an unknown value and tolerate.
//
// The v0.2 provenance findings are gated only under --strict on a bundle whose root
// declares `okf_version: "0.2"`, so an ODSF bundle still on the v0.1 container stays clean.
//
// Usage:  node odsf-validate.mjs [bundle-dir] [--strict]   (defaults to the current dir)
// Zero dependencies. Frontmatter is scanned structurally, no YAML library required.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, basename, sep, extname } from "node:path";

const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const root = argv.find((a) => !a.startsWith("--")) || ".";
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const provenance = []; // OKF v0.2 producer findings; gated by --strict on a v0.2 container
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

// `{ by: x, at: y }` -> { by, at }. Values may contain colons (times).
const flowPairs = (s) => {
  const m = s.match(/^\{([\s\S]*)\}$/);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(",")) {
    const i = part.indexOf(":");
    if (i !== -1) out[part.slice(0, i).trim()] = unquote(part.slice(i + 1));
  }
  return out;
};

// Normalize a frontmatter key to a list of objects. A bare mapping becomes a
// one-element list, which OKF v0.2 section 11 requires consumers to do for `verified`.
const entriesOf = (fm, key) => {
  const inline = field(fm, key);
  if (inline) {
    if (inline.startsWith("{")) return [flowPairs(inline)].filter(Boolean);
    return [];
  }
  const lines = block(fm, key);
  if (!lines.length) return [];
  const kv = (ls) => {
    const o = {};
    for (const l of ls) {
      const t = l.replace(/^\s*-\s*/, "").trim();
      const i = t.indexOf(":");
      if (i !== -1) o[t.slice(0, i).trim()] = unquote(t.slice(i + 1));
    }
    return o;
  };
  if (!lines.some((l) => /^\s*-/.test(l))) return [kv(lines)];
  const items = [];
  let cur = null;
  for (const l of lines) {
    if (/^\s*-/.test(l)) items.push((cur = [l]));
    else if (cur) cur.push(l);
  }
  return items.map((it) => {
    const first = it[0].replace(/^\s*-\s*/, "");
    return first.startsWith("{") ? flowPairs(first) || {} : kv(it);
  });
};

// Section 7 names three forms, but OKF's own `sources` example uses a fourth prefix
// (`author: team:ga4-docs`), so any `<label>:<id>` passes. What this catches is the
// bare identifier that silently fails to raise the trust tier.
const ACTOR = /^(?:[a-z][\w.-]*:\S+|[^\s/]+\/[^\s/]+)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// OKF v0.2's set plus ODSF's `experimental` extension (spec section 3).
const STATUS = new Set(["draft", "stable", "deprecated", "experimental"]);

const files = walk(root);
const mdFiles = files.filter((f) => f.endsWith(".md"));
const definedTokens = new Set();
let concepts = 0;
let stale = 0;
let rootDeclaresOdsf = false;
let okfVersion = null;
const today = new Date().toISOString().slice(0, 10);

// The container version decides whether the v0.2 provenance rules are gated, so read
// the root index before the concepts those rules govern.
const rootIdx = mdFiles.find((f) => rel(f) === "index.md");
if (rootIdx) {
  const fm = frontmatter(readFileSync(rootIdx, "utf8"));
  if (fm) okfVersion = field(fm, "okf_version") ? unquote(field(fm, "okf_version")) : null;
}
const v2 = okfVersion === "0.2";

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

  // --- OKF v0.2 provenance, trust, and lifecycle (inherited unchanged) ---
  const at = rel(file);
  if (v2 && field(fm, "timestamp") !== null)
    provenance.push(`${at}: legacy 'timestamp' (v0.2 records it as 'generated: { by, at }')`);
  if (v2 && /^#\s+Citations\s*$/m.test(text))
    provenance.push(`${at}: legacy '# Citations' body section (v0.2 moves provenance to 'sources')`);

  entriesOf(fm, "sources").forEach((s, i) => {
    if (!s.resource) provenance.push(`${at}: sources[${i}] has no 'resource' (required within an entry)`);
    if (s.author && !ACTOR.test(s.author))
      warnings.push(`${at}: sources[${i}].author "${s.author}" is not an actor (producer/version, human:id, process:id)`);
    if (s.last_modified && !ISO_DATE.test(s.last_modified))
      warnings.push(`${at}: sources[${i}].last_modified "${s.last_modified}" is not YYYY-MM-DD`);
  });

  if (field(fm, "generated") !== null || block(fm, "generated").length) {
    const g = entriesOf(fm, "generated")[0] || {};
    if (!g.by) provenance.push(`${at}: 'generated' has no 'by' (required within generated)`);
    else if (!ACTOR.test(g.by))
      warnings.push(`${at}: generated.by "${g.by}" is not an actor (producer/version, human:id, process:id)`);
    if (!g.at) warnings.push(`${at}: 'generated' has no 'at' datetime`);
  }
  entriesOf(fm, "verified").forEach((v, i) => {
    if (!v.by) warnings.push(`${at}: verified[${i}] has no 'by'`);
    else if (!ACTOR.test(v.by))
      warnings.push(`${at}: verified[${i}].by "${v.by}" is not an actor (producer/version, human:id, process:id)`);
    if (!v.at) warnings.push(`${at}: verified[${i}] has no 'at' datetime`);
  });

  const status = field(fm, "status");
  if (status !== null && !STATUS.has(unquote(status)))
    provenance.push(`${at}: status "${unquote(status)}" is not draft|stable|deprecated|experimental`);
  const staleAfter = field(fm, "stale_after");
  if (staleAfter !== null) {
    if (!ISO_DATE.test(unquote(staleAfter)))
      warnings.push(`${at}: stale_after "${unquote(staleAfter)}" is not an absolute YYYY-MM-DD date`);
    else if (today >= unquote(staleAfter)) stale++;
  }

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

const gateProvenance = strict && v2;
for (const w of warnings) console.warn(`warn  ${w}`);
for (const p of provenance) console.warn(`${gateProvenance ? "gate " : "warn "} ${p}`);
for (const e of errors) console.error(`error ${e}`);

const gateFailed = gateProvenance && provenance.length > 0;
console.log(
  `\nODSF v0.2 check of "${root}" (okf ${okfVersion || "undeclared"}): ${concepts} concept(s), ` +
    `${definedTokens.size} token path(s), ${errors.length} error(s), ` +
    `${warnings.length + provenance.length} warning(s), ${stale} stale${strict ? " [--strict]" : ""}. ` +
    (errors.length ? "NOT conformant." : gateFailed ? "Conformant, but the producer gate failed." : "Conformant.")
);
process.exit(errors.length || gateFailed ? 1 : 0);
