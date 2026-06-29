---
type: UX Flow
title: Browsing Layout
description: The three-pane workspace — sidebar, graph, reader — and how selection keeps them in sync.
tags: [ux, layout]
timestamp: 2026-06-29T15:00:00Z
---

# The three panes

```
┌───────────────┬───────────────────────────┬───────────────────┐
│  SIDEBAR      │        GRAPH               │     READER        │
│               │                           │                   │
│ lens switch   │  force-directed graph     │ type badge        │
│ search box    │  (nodes by type,          │ title / tags      │
│ type filters  │   edges = links)          │ rendered body     │
│ index tree    │  pan · zoom · drag · fit  │ Links to / Cited  │
└───────────────┴───────────────────────────┴───────────────────┘
```

- **Left — Sidebar.** A **lens switcher** (an activity rail) flips between a *Navigate* lens (the [index tree](../features/navigation.md)) and a *Filter* lens (type/tag [filters](../features/search-and-filter.md)), so the two never share one long scroll; a dot on the Filter icon flags an active filter. The search box stays pinned above both lenses. Collapsible. Switching *bundles* lives in the top-left [Bundle Switcher](../features/bundle-switcher.md), not the sidebar.
- **Center — Graph.** The [Graph View](../features/graph-view.md), focused on the selected concept by default.
- **Right — Reader.** The [Concept Reader](../features/concept-reader.md) for the selected concept — a first-class pane, weighted co-equal with the graph. It is a reading surface: a centered, comfortable prose column with a quiet right context rail (outline, relationships, details) that collapses when space is tight (e.g. in split mode, where the graph already supplies relationship context).

# Synced selection

There is one shared "active concept." Selecting it anywhere — a graph node, a sidebar entry, a link in the reader — updates all three panes together. The [graph](../features/graph-view.md) recenters, the sidebar highlights, the reader loads.

# Layout modes

The workspace switches between three layout modes — **split** (default, graph + reader co-equal), **reader-only**, and **graph-only** — via a segmented control in the top bar or [keyboard](keyboard-shortcuts.md) (`Ctrl/Cmd + 1/2/3`, `\` to cycle). In split mode the panes are **resizable** with draggable, keyboard-operable dividers (double-click to reset); the chosen mode and pane sizes persist. The reader keeps a comfortable measure cap so wide prose stays readable.

# Chrome — the custom title bar

The window runs **borderless** (native title-bar decorations are off — see [Theming](theming.md)); the top bar *is* the app's title bar, so the chrome is ours end to end (in the spirit of Zed's custom frame).

- Left to right it holds the [**Bundle Switcher**](../features/bundle-switcher.md) (naming the open bundle and its folder), a **search** field that opens the [global launcher](../features/command-palette.md), the **layout** switch, the reader **"Aa"** controls, a **Log** toggle (renders `log.md` — see [Log View](../features/log-view.md)), the [validation](../features/validation.md) badge, and the **window controls** (minimize · maximize/restore · close) at the far right.
- Empty regions of the bar are a **drag handle** for moving the window (double-click to maximize/restore); interactive controls are excluded from the drag region. Invisible **resize handles** line the window edges and corners, and the window has **slightly rounded corners** (squared when maximized).
- Honors [theming](theming.md) and a [native desktop feel](settings.md) (content-scoped zoom, our own frame), and is fully driveable by [keyboard](keyboard-shortcuts.md).
