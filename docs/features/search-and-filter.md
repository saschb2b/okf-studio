---
type: Feature
title: Search & Filter
description: Full-text search across concepts plus type filters and tag browsing, reflected live in the graph and lists.
tags: [feature, search, filter]
timestamp: 2026-06-28T00:00:00Z
---

# What it does

Lets the user narrow a bundle quickly by text, by `type`, or by `tag`.

# Search

- A single search box matches against each concept's `title`, `description`, `type`, `tags`, and **body text**.
- Matching is incremental and case-insensitive; results update as the user types.
- In the [graph](graph-view.md), non-matches dim; in the [sidebar](navigation.md), the list filters. The first/best match can be focused with Enter.

# Type filters

- The [graph legend](../ux/theming.md) lists every `type` present with its color; clicking a type toggles its concepts in and out of the view.
- Because `type` values are open-ended ([the spec](../reference/okf-spec-summary.md) does not enumerate them), filters are built dynamically from whatever the bundle declares — never a hard-coded list.

# Tag browsing

- Tags are first-class in OKF but have no dedicated file; the viewer **synthesizes** a tag index at load time by scanning frontmatter (as the spec intends).
- Selecting a tag filters the graph and list to concepts carrying it.

All of this is pure frontend filtering over the already-parsed [data model](../architecture/data-model.md) — no re-scan, keeping it [fast](../product/principles.md).
