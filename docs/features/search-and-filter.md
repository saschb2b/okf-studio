---
type: Feature
title: Search & Filter
description: Type filters and tag browsing that persistently narrow the view, plus full-text concept search through the global launcher.
tags: [feature, search, filter]
timestamp: 2026-07-13T19:42:50Z
---

# What it does

Lets the user narrow a bundle quickly by text, by `type`, or by `tag`.

# Search

- **Full-text concept search** lives in the [global launcher](command-palette.md): the header search field (or `Ctrl/Cmd + K` / `/`) matches each concept's `title`, `description`, `type`, `tags`, and **body text**, case-insensitively, surfacing body matches under an *In text* group with a snippet. Enter opens the best match.
- Keeping text lookup in one transient overlay leaves the filters below as a separate, *persistent* narrowing of the view — the two never fight over the same box.

# Faceted query grammar

The sidebar's filter field speaks a small [field grammar](../proposals/faceted-search.md), so filtering goes beyond substring:

- `type:Table` (repeat to OR: `type:Table type:View`), `tag:revenue` — facets, case-insensitive.
- `degree>5`, `links<=2`, `citedBy=0` — numeric comparisons on connectivity.
- `is:orphan` (no links in or out), `has:broken` (broken links) — computed predicates.
- `"exact phrase"` and bare words — full-text; unknown fields fall back to full-text rather than erroring (the [tolerant-consumer](../product/principles.md) stance).

Terms are ANDed; the field parses to one predicate that the [graph](graph-view.md), the index tree, and a live **result count** (`N of M concepts`, with a Clear) all share — one filter state, one working set. The type/tag facet rails below AND in alongside it. Saved named queries and facet counts that reflect the current result set are the next steps ([proposal](../proposals/faceted-search.md)).

# Type filters

- The **Filter lens** in the [sidebar](../ux/browsing-layout.md) — and the [graph legend](../ux/theming.md) — list every `type` present with its color; clicking a type toggles its concepts in and out of the view, and an active filter is flagged with a dot on the lens switcher.
- Because `type` values are open-ended ([the spec](../reference/okf-spec-summary.md) does not enumerate them), filters are built dynamically from whatever the bundle declares — never a hard-coded list.

# Tag browsing

- Tags are first-class in OKF but have no dedicated file; Studio **synthesizes** a tag index at load time by scanning frontmatter (as the spec intends).
- Selecting a tag filters the graph and list to concepts carrying it.

All of this is pure frontend filtering over the already-parsed [data model](../architecture/data-model.md) — no re-scan, keeping it [fast](../product/principles.md). The synthesized tag index and the type→color map are client-side derived state (see [Frontend Architecture](../architecture/frontend-architecture.md) and [Performance & Scale](../architecture/performance.md)).
