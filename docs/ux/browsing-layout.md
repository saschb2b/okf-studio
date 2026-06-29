---
type: UX Flow
title: Browsing Layout
description: The three-pane workspace — sidebar, graph, reader — and how selection keeps them in sync.
tags: [ux, layout]
timestamp: 2026-06-29T10:00:00Z
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

- **Left — Sidebar.** A **lens switcher** (an activity rail) flips between a *Navigate* lens (the [Bundle Browser](../features/bundle-browser.md) + the [index tree](../features/navigation.md)) and a *Filter* lens (type/tag [filters](../features/search-and-filter.md)), so the two never share one long scroll; a dot on the Filter icon flags an active filter. The search box stays pinned above both lenses. Collapsible.
- **Center — Graph.** The [Graph View](../features/graph-view.md), focused on the selected concept by default.
- **Right — Reader.** The [Concept Reader](../features/concept-reader.md) for the selected concept, including its [backlinks](../features/concept-reader.md) — a first-class pane, weighted co-equal with the graph, not a runt.

# Synced selection

There is one shared "active concept." Selecting it anywhere — a graph node, a sidebar entry, a link in the reader — updates all three panes together. The [graph](../features/graph-view.md) recenters, the sidebar highlights, the reader loads.

# Layout modes

The workspace switches between three layout modes — **split** (default, graph + reader co-equal), **reader-only**, and **graph-only** — via a segmented control in the top bar or [keyboard](keyboard-shortcuts.md) (`Ctrl/Cmd + 1/2/3`, `\` to cycle). In split mode the panes are **resizable** with draggable, keyboard-operable dividers (double-click to reset); the chosen mode and pane sizes persist. The reader keeps a comfortable measure cap so wide prose stays readable.

# Chrome

- A top bar holds **Open Folder…**, the current folder/bundle name, a **search** field that opens the [global launcher](../features/command-palette.md), the **layout** switch, a **Log** toggle (renders `log.md` — see [Log View](../features/log-view.md)), and the [validation](../features/validation.md) badge.
- Honors [theming](theming.md) and a [native desktop feel](settings.md) (content-scoped zoom, not browser page-zoom), and is fully driveable by [keyboard](keyboard-shortcuts.md).
