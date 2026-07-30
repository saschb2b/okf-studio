---
type: Feature
title: Search & Filter
description: Type filters and tag browsing that persistently narrow the view, plus full-text concept search through the global launcher.
tags: [feature, search, filter]
generated: { by: claude/unrecorded, at: 2026-07-18T06:30:00Z }
---

# What it does

Lets the user narrow a bundle quickly by text, by `type`, or by `tag`.

# Search

- **Full-text concept search** lives in the [global launcher](command-palette.md). The header search field (or `Ctrl/Cmd + K` / `/`) matches each concept's `title`, `description`, `type`, `tags`, and **body text**, case-insensitively. Body matches appear under an *In text* group with a snippet. Enter opens the best match.
- The best matching concept also supplies origin-bound [Native OKF Tasks](native-okf-tasks.md) below the concept results. They use the shared task launcher, and they do not replace Enter's navigation behavior.
- Keeping text lookup in one transient overlay leaves the filters below as a separate, *persistent* narrowing of the view. The two never fight over the same box.

# Faceted query grammar

The sidebar's filter field speaks a small [field grammar](../proposals/faceted-search.md), so filtering goes beyond substring:

- Facets, case-insensitive: `type:Table` (repeat to OR: `type:Table type:View`), `tag:revenue`.
- Numeric comparisons on connectivity: `degree>5`, `links<=2`, `citedBy=0`.
- Computed predicates: `is:orphan` (no links in or out), `has:broken` (broken links).
- Full-text: `"exact phrase"` and bare words. Unknown fields fall back to full-text rather than erroring (the [tolerant-consumer](../product/principles.md) stance).

The field ANDs the terms. It parses to one predicate that the [graph](graph-view.md), the index tree, and a live **result count** (`N of M concepts`, with a Clear) all share: one filter state, one working set. The type/tag facet rails below AND in alongside it. Saved named queries and facet counts that reflect the current result set are the next steps ([proposal](../proposals/faceted-search.md)).

# Type filters

- The **Filter lens** in the [sidebar](../ux/browsing-layout.md) and the [graph legend](../ux/theming.md) both list every `type` present with its color. Clicking a type toggles its concepts in and out of the view. A dot on the lens switcher flags an active filter.
- Because `type` values are open-ended ([the spec](../reference/okf-spec-summary.md) does not enumerate them), Studio builds the filters dynamically from whatever the bundle declares, never from a hard-coded list.

# Tag browsing

- Tags are first-class in OKF but have no dedicated file. Studio **synthesizes** a tag index at load time by scanning frontmatter (as the spec intends).
- Selecting a tag filters the graph and list to concepts carrying it.

All of this is pure frontend filtering over the already-parsed [data model](../architecture/data-model.md), with no re-scan, which keeps it [fast](../product/principles.md). The synthesized tag index and the type→color map are client-side derived state (see [Frontend Architecture](../architecture/frontend-architecture.md) and [Performance & Scale](../architecture/performance.md)).
