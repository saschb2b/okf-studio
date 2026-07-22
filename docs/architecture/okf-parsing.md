---
type: Reference
title: OKF Parsing
description: How a bundle root is turned into concepts, resolved links, backlinks, and an index tree.
tags: [architecture, parsing, links]
timestamp: 2026-07-22T23:30:48Z
---

# Pipeline

For each [detected bundle root](bundle-detection.md), the [Rust core](tech-stack.md) produces the [data model](data-model.md):

1. **Enumerate** non-reserved `.md` files → each is a concept. Reserved filenames (`index.md`, `log.md`) are handled separately.
2. **Split frontmatter / body.** Parse the leading `---` YAML block (a tolerant subset: scalars, quoted strings, `[a, b]` / block lists, and **indentation-nested maps and lists**). Known keys are surfaced typed; every other top-level key is preserved into `extra` — a scalar as a string, a nested block as an ordered object/array — so an [ODSF](../reference/okf-spec-summary.md) `tokens:` tree survives intact for a design-aware consumer. Missing or malformed frontmatter is tolerated; only a present-but-typeless concept is an [error](../features/validation.md).
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

# Tolerance contract

Per the [spec](../reference/okf-spec-summary.md), the parser never throws on: missing optional fields, unknown `type`, unknown extra frontmatter keys (preserved as-is), broken links, or missing indexes. It records issues for [Validation](../features/validation.md) and keeps going.

This whole pipeline runs in the core, off the UI thread, and is parsed lazily per bundle — see [Performance & Scale](performance.md) for the parsing-cost and incremental-reparse strategy.
