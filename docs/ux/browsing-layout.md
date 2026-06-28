---
type: UX Flow
title: Browsing Layout
description: The three-pane workspace — sidebar, graph, reader — and how selection keeps them in sync.
tags: [ux, layout]
timestamp: 2026-06-28T12:00:00Z
---

# The three panes

```
┌───────────────┬───────────────────────────┬───────────────────┐
│  SIDEBAR      │        GRAPH               │     READER        │
│               │                           │                   │
│ bundle switch │  force-directed graph     │ type badge        │
│ search box    │  (nodes by type,          │ title / tags      │
│ type filters  │   edges = links)          │ rendered body     │
│ index tree    │  pan · zoom · drag · fit  │ Links to / Cited  │
└───────────────┴───────────────────────────┴───────────────────┘
```

- **Left — Sidebar.** The [Bundle Browser](../features/bundle-browser.md) (when multiple bundles), the [search box and type/tag filters](../features/search-and-filter.md), and the [index tree](../features/navigation.md). Collapsible.
- **Center — Graph.** The [Graph View](../features/graph-view.md); the visual hero of the app.
- **Right — Reader.** The [Concept Reader](../features/concept-reader.md) for the selected concept, including its [backlinks](../features/concept-reader.md). Collapsible.

# Synced selection

There is one shared "active concept." Selecting it anywhere — a graph node, a sidebar entry, a link in the reader — updates all three panes together. The [graph](../features/graph-view.md) recenters, the sidebar highlights, the reader loads.

# Chrome

- A top bar holds **Open Folder…**, the current folder/bundle name, **Fit**, a **Log** toggle (renders `log.md` — see [Log View](../features/log-view.md)), and the [validation](../features/validation.md) badge.
- Panes are resizable and individually collapsible so the graph or the reader can take the full width.
- Honors [theming](theming.md) and is fully driveable by [keyboard](keyboard-shortcuts.md).
