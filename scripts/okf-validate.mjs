#!/usr/bin/env node
// okf-validate.mjs - check an Open Knowledge Format (OKF) bundle for conformance
// and, as a producer gate, for graph connectivity and v0.2 provenance hygiene.
//
// Hard requirements (OKF v0.2 section 11). Any failure is an error and exits non-zero:
//   - every non-reserved .md file opens with a YAML frontmatter block
//   - every such block carries a non-empty `type` field
//   - index.md carries no frontmatter, except the bundle-root index.md, which
//     may carry frontmatter and, if it does, should declare okf_version
//
// Everything v0.2 added is optional, so none of it can be an error. It is checked
// as soft guidance, and gated only when the bundle declares `okf_version: "0.2"`
// and --strict is passed. A v0.1 bundle stays valid: the spec keeps it consumable
// under documented fallbacks, so `timestamp` and `# Citations` are only flagged
// once a bundle has declared that it targets v0.2.
//
// Soft guidance (warnings; never fail the bundle by default, mirroring the
// permissive consumer the spec requires):
//   - log.md date headings should be ISO 8601 YYYY-MM-DD
//   - every concept-to-concept link should resolve to a real concept
//   - every concept should be reachable: no orphans (degree 0)
//   - `sources` entries carry `resource`; `generated` carries `by`
//   - identity fields follow the actor convention (section 7)
//   - `status` is draft|stable|deprecated; `stale_after` is YYYY-MM-DD
//   - an Attested Computation declares `runtime` and supplies a computation
//   - a footnote label resolves to a `sources` entry id, once ids are in use
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
// Zero dependencies. Frontmatter is scanned structurally rather than with a YAML
// library, which is enough for the flat-plus-one-level shapes the spec defines.

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
const provenance = []; // v0.2 producer findings; gated by --strict on a v0.2 bundle
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

const unquote = (v) => v.trim().replace(/^["']|["']$/g, "").trim();

// Top-level frontmatter entries. Each is the scalar or flow value on the key's
// own line (`inline`) plus any indented or dashed lines beneath it (`block`).
const parseTop = (fm) => {
  const out = new Map();
  let cur = null;
  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^[\s-]/.test(line)) {
      if (cur) cur.block.push(line);
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    cur = { inline: line.slice(idx + 1).trim(), block: [] };
    out.set(line.slice(0, idx).trim(), cur);
  }
  return out;
};

// `{ by: x, at: y }` -> { by: "x", at: "y" }. Values may contain colons (times).
const flowPairs = (s) => {
  const m = s.match(/^\{([\s\S]*)\}$/);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(",")) {
    const i = part.indexOf(":");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = unquote(part.slice(i + 1));
  }
  return out;
};

const kvPairs = (lines) => {
  const out = {};
  for (const line of lines) {
    const t = line.replace(/^\s*-\s*/, "").trim();
    const i = t.indexOf(":");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = unquote(t.slice(i + 1));
  }
  return out;
};

// Normalize a node to a list of objects. A bare mapping becomes a one-element
// list, which section 11 requires consumers to do for `verified`.
const asList = (node) => {
  if (!node) return [];
  if (node.inline) {
    if (node.inline.startsWith("{")) return [flowPairs(node.inline)].filter(Boolean);
    if (node.inline.startsWith("[")) {
      const inner = node.inline.slice(1, -1);
      const maps = inner.match(/\{[^}]*\}/g);
      if (maps) return maps.map(flowPairs).filter(Boolean);
      return inner
        .split(",")
        .map((s) => unquote(s))
        .filter(Boolean)
        .map((s) => ({ _scalar: s }));
    }
    return [{ _scalar: unquote(node.inline) }];
  }
  const lines = node.block.filter((l) => l.trim());
  if (!lines.length) return [];
  if (!lines.some((l) => /^\s*-/.test(l))) return [kvPairs(lines)];
  const items = [];
  let cur = null;
  for (const l of lines) {
    if (/^\s*-/.test(l)) items.push((cur = [l]));
    else if (cur) cur.push(l);
  }
  return items.map((it) => {
    const first = it[0].replace(/^\s*-\s*/, "");
    return first.startsWith("{") ? flowPairs(first) || {} : kvPairs(it);
  });
};

// Section 7 names three forms, but the spec's own `sources` example uses a
// fourth prefix (`author: team:ga4-docs`), so any `<label>:<id>` is accepted.
// What this actually catches is the bare identifier -- an unprefixed human id
// that silently fails to raise the trust tier, which is the mistake worth
// flagging. `human:` remains the only prefix consumers key off.
const ACTOR = /^(?:[a-z][\w.-]*:\S+|[^\s/]+\/[^\s/]+)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = new Set(["draft", "stable", "deprecated"]);
const isReservedName = (name) => name === "index.md" || name === "log.md";

const files = walk(root).filter((f) => f.endsWith(".md"));
const conceptIds = new Set(); // path minus .md, for every concept (non-reserved) file
const conceptFiles = []; // the concept files, to walk their bodies for links
let concepts = 0;
let declared = null; // okf_version from the bundle-root index.md
let stale = 0;
const today = new Date().toISOString().slice(0, 10);

// Pass 1: the root index alone, so the declared version is known before the
// concepts that its value governs are checked.
const rootIndex = files.find((f) => rel(f) === "index.md");
if (rootIndex) {
  const fm = frontmatter(readFileSync(rootIndex, "utf8"));
  if (fm) {
    const v = parseTop(fm).get("okf_version");
    declared = v ? unquote(v.inline) : null;
    if (declared === null)
      warnings.push(`index.md: root index.md has frontmatter but does not declare okf_version`);
  }
}
const v2 = declared === "0.2";

for (const file of files) {
  const name = basename(file);
  const text = readFileSync(file, "utf8");
  const fm = frontmatter(text);
  const isRootIndex = rel(file) === "index.md";

  if (name === "index.md") {
    if (fm && !isRootIndex)
      warnings.push(`${rel(file)}: index.md should carry no frontmatter (only the bundle-root index.md may)`);
    continue;
  }

  if (name === "log.md") {
    for (const m of text.matchAll(/^##\s+(.+?)\s*$/gm))
      if (!ISO_DATE.test(m[1]))
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

  const top = parseTop(fm);
  const scalar = (k) => (top.has(k) ? unquote(top.get(k).inline) : null);
  const at = rel(file);

  const type = scalar("type");
  if (type === null) errors.push(`${at}: frontmatter has no 'type' field`);
  else if (type === "") errors.push(`${at}: 'type' field is empty`);

  // --- v0.1 leftovers, flagged only once a bundle claims v0.2 -----------------
  if (v2 && top.has("timestamp"))
    provenance.push(`${at}: legacy 'timestamp' (v0.2 records it as 'generated: { by, at }')`);
  if (v2 && /^#\s+Citations\s*$/m.test(text))
    provenance.push(`${at}: legacy '# Citations' body section (v0.2 moves provenance to the 'sources' frontmatter family)`);

  // --- provenance: sources ---------------------------------------------------
  const sources = asList(top.get("sources"));
  const sourceIds = new Set();
  sources.forEach((s, i) => {
    if (!s || s._scalar !== undefined) {
      provenance.push(`${at}: sources[${i}] is a bare scalar; each entry needs at least 'resource'`);
      return;
    }
    if (!s.resource) provenance.push(`${at}: sources[${i}] has no 'resource' (required within an entry)`);
    if (s.id) sourceIds.add(s.id);
    if (s.author && !ACTOR.test(s.author))
      warnings.push(`${at}: sources[${i}].author "${s.author}" is not an actor (producer/version, human:id, process:id)`);
    if (s.last_modified && !ISO_DATE.test(s.last_modified))
      warnings.push(`${at}: sources[${i}].last_modified "${s.last_modified}" is not YYYY-MM-DD`);
    if (s.usage_count && !top.has("usage_window"))
      warnings.push(`${at}: sources[${i}].usage_count has no sibling 'usage_window' to frame it`);
  });

  // Footnote labels are the keyed attribution mechanism. Only meaningful once
  // the concept actually uses source ids, so plain footnotes stay unbothered.
  if (sourceIds.size) {
    const body = text.slice(text.indexOf("\n---", 3) + 4);
    for (const m of body.matchAll(/\[\^([^\]]+)\]/g))
      if (!sourceIds.has(m[1]))
        warnings.push(`${at}: footnote [^${m[1]}] matches no 'sources' entry id`);
  }

  // --- trust: generated, verified -------------------------------------------
  if (top.has("generated")) {
    const g = asList(top.get("generated"))[0] || {};
    if (!g.by) provenance.push(`${at}: 'generated' has no 'by' (required within generated)`);
    else if (!ACTOR.test(g.by))
      warnings.push(`${at}: generated.by "${g.by}" is not an actor (producer/version, human:id, process:id)`);
    if (!g.at) warnings.push(`${at}: 'generated' has no 'at' datetime`);
  }
  asList(top.get("verified")).forEach((v, i) => {
    if (!v || v._scalar !== undefined) {
      warnings.push(`${at}: verified[${i}] is a bare scalar; each event needs 'by' and 'at'`);
      return;
    }
    if (!v.by) warnings.push(`${at}: verified[${i}] has no 'by'`);
    else if (!ACTOR.test(v.by))
      warnings.push(`${at}: verified[${i}].by "${v.by}" is not an actor (producer/version, human:id, process:id)`);
    if (!v.at) warnings.push(`${at}: verified[${i}] has no 'at' datetime`);
  });

  // --- lifecycle: status, stale_after ---------------------------------------
  const status = scalar("status");
  if (status !== null && !STATUS.has(status))
    provenance.push(`${at}: status "${status}" is not draft|stable|deprecated`);
  const staleAfter = scalar("stale_after");
  if (staleAfter !== null) {
    if (!ISO_DATE.test(staleAfter))
      warnings.push(`${at}: stale_after "${staleAfter}" is not an absolute YYYY-MM-DD date`);
    else if (today >= staleAfter) stale++;
  }

  // --- attested computations -------------------------------------------------
  if (type === "Attested Computation") {
    if (!scalar("runtime")) provenance.push(`${at}: Attested Computation has no 'runtime' (required)`);
    if (!top.has("computation") && !/^#\s+Computation\s*$/m.test(text))
      provenance.push(`${at}: Attested Computation supplies no computation (set 'computation' or add a '# Computation' fence)`);
    if (!top.has("executor")) warnings.push(`${at}: Attested Computation has no 'executor'`);
    if (!top.has("attester")) warnings.push(`${at}: Attested Computation has no 'attester'`);
    asList(top.get("parameters")).forEach((p, i) => {
      if (p && p._scalar === undefined && !p.name)
        warnings.push(`${at}: parameters[${i}] has no 'name'`);
    });
  }
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

// A v0.1 bundle is consumable as-is, so its provenance gaps are informational.
const gateProvenance = strict && v2;
for (const w of warnings) console.warn(`warn  ${w}`);
for (const p of provenance) console.warn(`${gateProvenance ? "gate " : "warn "} ${p}`);
for (const c of connectivity) console.warn(`${strict ? "gate " : "warn "} ${c}`);
for (const e of errors) console.error(`error ${e}`);

const brokenCount = connectivity.filter((c) => c.includes("broken concept link")).length;
const gateFailed = (strict && connectivity.length > 0) || (gateProvenance && provenance.length > 0);
const targets = declared ? `v${declared}` : "no declared version";
console.log(
  `\nOKF v0.2 check of "${root}" (${targets}): ${concepts} concept(s), ${errors.length} error(s), ` +
    `${warnings.length + provenance.length} warning(s); ${brokenCount} broken link(s), ` +
    `${orphans.length} orphan(s), ${stale} stale${strict ? " [--strict]" : ""}. ` +
    (errors.length
      ? "NOT conformant."
      : gateFailed
        ? "Conformant, but the producer gate failed."
        : "Conformant.")
);
process.exit(errors.length || gateFailed ? 1 : 0);
