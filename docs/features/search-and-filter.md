---
type: Feature
title: Search & Filter
description: Type filters and tag browsing that persistently narrow the view, plus full-text concept search through the global launcher.
tags: [feature, search, filter]
timestamp: 2026-06-29T10:00:00Z
---

# What it does

Lets the user narrow a bundle quickly by text, by `type`, or by `tag`.

# Search

- **Full-text concept search** lives in the [global launcher](command-palette.md): the header search field (or `Ctrl/Cmd + K` / `/`) matches each concept's `title`, `description`, `type`, `tags`, and **body text**, case-insensitively, surfacing body matches under an *In text* group with a snippet. Enter opens the best match.
- Keeping text lookup in one transient overlay leaves the filters below as a separate, *persistent* narrowing of the view — the two never fight over the same box.

# Type filters

- The **Filter lens** in the [sidebar](../ux/browsing-layout.md) — and the [graph legend](../ux/theming.md) — list every `type` present with its color; clicking a type toggles its concepts in and out of the view, and an active filter is flagged with a dot on the lens switcher.
- Because `type` values are open-ended ([the spec](../reference/okf-spec-summary.md) does not enumerate them), filters are built dynamically from whatever the bundle declares — never a hard-coded list.

# Tag browsing

- Tags are first-class in OKF but have no dedicated file; the viewer **synthesizes** a tag index at load time by scanning frontmatter (as the spec intends).
- Selecting a tag filters the graph and list to concepts carrying it.

All of this is pure frontend filtering over the already-parsed [data model](../architecture/data-model.md) — no re-scan, keeping it [fast](../product/principles.md). The synthesized tag index and the type→color map are client-side derived state (see [Frontend Architecture](../architecture/frontend-architecture.md) and [Performance & Scale](../architecture/performance.md)).
