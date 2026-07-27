---
type: Reference
title: OKF Parsing
description: How a bundle root is turned into concepts, resolved links, backlinks, and an index tree.
tags: [architecture, parsing, links]
generated: { by: claude/unrecorded, at: 2026-07-23T20:30:00Z }
---

# Pipeline

For each [detected bundle root](bundle-detection.md), the [Rust core](tech-stack.md) produces the [data model](data-model.md):

1. **Enumerate** non-reserved `.md` files → each is a concept. Reserved filenames (`index.md`, `log.md`) are handled separately. The root [`.okfignore`](../features/ignore-rules.md) matcher removes excluded files before parsing while retaining children restored by a later negation.
2. **Split frontmatter / body.** Parse the leading `---` YAML block (a tolerant subset: scalars, quoted strings, `[a, b]` / block lists, and **indentation-nested maps and lists**). Concept keys are promoted according to the concept model. The root `index.md` separately promotes only `okf_version` and `odsf_version`; every other parsed root field enters `Bundle.extra`, even when the same name is recognized on concepts. Scalars, nested objects, and arrays therefore survive IPC and agent inventory without changing conformance. Missing or malformed frontmatter is tolerated; only a present-but-typeless concept is an [error](../features/validation.md).
3. **Concept ID = path − `.md`,** relative to the bundle root. `tables/orders.md` → `tables/orders`.
4. **Extract links** with a CommonMark parser, classify, and **resolve**. Inline, full-reference, collapsed-reference, shortcut-reference, autolink, title, angle-destination, balanced-parenthesis, escaped-punctuation, and footnote-definition forms follow the same parser rules. Link-shaped text inside code does not create an edge.
   - Percent-decode the path before scheme, absolute-path, traversal, extension, and target checks. Keep the authored href for display and diagnostics.
   - Bundle-absolute (`/tables/x.md`) → relative to bundle root.
   - Relative (`x.md`, `../d/x.md`) → resolved from the concept's directory, normalizing `.`/`..`.
   - Strip a trailing `#anchor`, drop the `.md`, yielding a target Concept ID.
   - External (`http(s)://`, `mailto:`) → kept as outbound web links, not graph edges.
   - Malformed percent sequences remain literal and continue through normal target lookup rather than stopping bundle parsing.
5. **Build the graph.** An intra-bundle link whose target Concept ID exists becomes a directed edge. A link to a **non-existent** target is preserved for display but produces **no edge** — broken links are tolerated.
6. **Backlinks.** Invert the edge set so each concept knows who [cites it](../features/concept-reader.md).
7. **Index tree.** Parse each `index.md` into sections and links for the [navigation](../features/navigation.md) sidebar; synthesize one for any directory lacking an `index.md`.
8. **Log.** Parse `log.md` (if present) into dated entries for the log view.

# Compatibility report

After parsing, the same pure core can derive a bounded compatibility report without changing the bundle. Each finding carries a stable rule ID, parser/link/index/extension category, exact file, level, and basis. OKF conformance errors and warnings retain their validator meaning. Portability advice, such as replacing a resolved bundle-absolute link with a relative target, remains advisory. Preserved root and concept producer fields are informational and include no repair.

A safe normalization names both the authored target and its relative replacement. The core exposes a repair function that accepts only supported relative-link declarations and matches them back to parser-confirmed inline-link source ranges. It replaces destination bytes in descending source order, so identical text in prose, code, titles, and reference definitions is not changed. Reference-style destinations remain reportable but are not automatically repairable. The native host passes the resulting complete file through [reviewed staging](../features/compatibility-clinic.md#reviewed-normalization) before Apply.

# Attested computations

An OKF v0.2 `type: Attested Computation` concept exists so a consumer can verify that a reported number came from the blessed computation rather than from an agent writing plausible SQL. Studio does the part of that it can do honestly, and reports the rest as unavailable rather than as passed.

It **resolves** the computation from an inline fence under `# Computation` or from a containment-checked `computation` path, and refuses a contract carrying both — which one ran would be a guess. The fence is found under that heading rather than by taking the body's first fence, since a concept may show an example query in its prose.

It **checks the receipt's shape** against the fields `executor.receipt` declares, because an attester cannot inspect evidence a run never returned.

It **checks provenance**: the executed text against the stored computation, canonicalized to ignore comments, repeated whitespace and case. This is the check that catches agent-authored SQL, and it needs no database and no code execution, which is why it belongs in a reader. A stored computation with parameter holes is compared with those holes wildcarded, because binding semantics follow the runtime — Studio compares a shape rather than pretending to know how a runtime binds. The limit is deliberate: a rewrite that only reorders or renames will pass, so this is a provenance check and not a proof of semantic equivalence.

It does **not execute** the executor or the attester. Running arbitrary code out of a bundle is not something a reader should do, and the spec puts the executor outside the bundle for the same reason. It does **not check fidelity** — re-reading the authoritative result by job id, which only the runtime can do — and reports that as `Unavailable`, never `Passed`. A run with an unavailable check is not attested: collapsing those two is how a gate silently stops gating.

A stale definition still attests cleanly. `verified` says the definition matches policy; attestation says one run produced its values correctly. They answer different questions, so staleness warns and does not fail.

# Tolerance contract

Per the [spec](../reference/okf-spec-summary.md), the parser never throws on: missing optional fields, unknown `type`, unknown extra frontmatter keys (preserved as-is), broken links, or missing indexes. It also reads a v0.1 bundle without complaint: `timestamp` still answers "when was this written" when `generated` is absent, and a legacy `# Citations` section is read as `sources`, with no credibility signals invented for entries that carry none. It records issues for [Validation](../features/validation.md) and keeps going.

This whole pipeline runs in the core, off the UI thread, and is parsed lazily per bundle — see [Performance & Scale](performance.md) for the parsing-cost and incremental-reparse strategy.
