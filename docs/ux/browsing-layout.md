---
type: UX Flow
title: Browsing Layout
description: The three-pane workspace — sidebar, graph, reader — and how selection keeps them in sync.
tags: [ux, layout]
timestamp: 2026-07-11T05:10:00Z
---

# The three panes

```
┌────┬─────────────┬───────────────────────────┬───────────────────┐
│ ▤  │  SIDEBAR    │        GRAPH               │     READER        │
│ ⚲  │ search box   │  force-directed graph     │ type badge        │
│    │ index tree   │  (nodes by type,          │ title / tags      │
│    │  or filters  │   edges = links)          │ rendered body     │
│ ⌨  │             │  pan · zoom · drag · fit   │ Links to / Cited  │
│ ⚙  │             │                            │                   │
└────┴─────────────┴───────────────────────────┴───────────────────┘
```

- **Far left — Activity Bar.** A persistent vertical icon rail (the VS Code / Zed pattern) that stays put whether or not the sidebar is open. Its **top** holds the **view switchers** — *Navigate* (the [index tree](../features/navigation.md)) and *Filter* (type/tag [filters](../features/search-and-filter.md)); clicking a view opens the sidebar to that lens, and clicking the active view collapses the sidebar (a dot on the Filter icon flags an active filter even while hidden). Its **foot** pins the app's **global actions** — **Keyboard shortcuts** and **[Settings](settings.md)** (`Ctrl/Cmd + ,`) — where native desktop apps put "Manage"-style entries, rather than floating a gear in the title bar.
- **Sidebar.** The active lens's content — the [index tree](../features/navigation.md) or the type/tag [filters](../features/search-and-filter.md) — under a pinned **search box**, so navigation and filtering never share one long scroll. Collapsible (toggled from the Activity Bar). Switching *bundles* lives in the top-left [Bundle Switcher](../features/bundle-switcher.md), not here.
- **Center — Graph.** The [Graph View](../features/graph-view.md), focused on the selected concept by default.
- **Right — Reader.** The [Concept Reader](../features/concept-reader.md) for the selected concept — a first-class pane, weighted co-equal with the graph. It is a reading surface: a centered, comfortable prose column with a quiet right context rail (outline, relationships, details) that collapses when space is tight (e.g. in split mode, where the graph already supplies relationship context). A **tab strip** sits sticky above the document when two or more concepts are open ([multi-view](../proposals/multi-view.md)): each tab shows its concept's type dot + title, closes by × or middle-click, **drags sideways to reorder** (live swap at the neighbor's midpoint), and the strip's trailing control undocks the active tab into its own window. Below two tabs the strip does not exist — a single-document session carries no extra chrome.

# Synced selection

There is one shared "active concept" **per window.** Selecting it anywhere — a graph node, a sidebar entry, a link in the reader — updates all three panes together. The [graph](../features/graph-view.md) recenters, the sidebar highlights, the reader loads. With [tabs](../features/navigation.md) open, the active tab *is* the selection (switching tabs is a selection change), and `Ctrl/Cmd+click` opens in a background tab instead of moving the selection.

# Pop-out windows

A tab can undock into its **own OS window** — the browser tear-off, for a second monitor or a reference kept beside the main workspace. The new window runs the full app on the same bundle: it boots reader-only with the sidebar tucked away (a "document window"), but has all the chrome and can grow back into a full workspace. Windows are independent — no cross-window selection sync — and the bundle stays read-only, so they cannot conflict; [live reload](../features/live-reload.md) broadcasts to every window. See the [multi-view proposal](../proposals/multi-view.md).

# Layout modes

The workspace switches between three layout modes — **split** (default, graph + reader co-equal), **reader-only**, and **graph-only** — via a segmented control in the top bar or [keyboard](keyboard-shortcuts.md) (`Ctrl/Cmd + 1/2/3`, `\` to cycle). In split mode the panes are **resizable** with draggable, keyboard-operable dividers (double-click to reset); the chosen mode and pane sizes persist. The reader keeps a comfortable measure cap so wide prose stays readable.

# Chrome — the custom title bar

The window runs **borderless** (native title-bar decorations are off — see [Theming](theming.md)); the top bar *is* the app's title bar, so the chrome is ours end to end (in the spirit of Zed's custom frame).

- It is laid out in three zones (the VS Code command-center pattern). **Left:** the [**Bundle Switcher**](../features/bundle-switcher.md) (naming the open bundle and its folder). **Center — window-centered:** the **back/forward** history controls immediately left of a prominent **search** field that opens the [global launcher](../features/command-palette.md); search is a primary feature, so it gets a generous, responsive width and stays centered to the window regardless of the side content; when the window gets too narrow to afford both, the search field shrinks rather than letting the side zones overlap it (the same rule keeps the graph's centered mode toggle clear of its Controls button). **Right:** the **layout** switch and the **window controls** (minimize · maximize/restore · close) at the far right. The title bar keeps only frequent, primary controls — app-level actions (Settings, shortcuts) live in the Activity Bar, the validation indicator and the low-frequency **Log** toggle in the status bar (below), and the reader **"Aa"** reading preferences with the content in the [reader](../features/concept-reader.md) itself.
- Empty regions of the bar are a **drag handle** for moving the window (double-click to maximize/restore); interactive controls are excluded from the drag region. Invisible **resize handles** line the window edges and corners, and the window has **slightly rounded corners** (squared when maximized).
- Honors [theming](theming.md) and a [native desktop feel](settings.md) (content-scoped zoom, our own frame), and is fully driveable by [keyboard](keyboard-shortcuts.md).

# Chrome — the status bar

The final control at the bottom-right is the [Agent Panel](../features/agent-panel.md) opener. It remains present without an open bundle and toggles the right-docked agent workspace.

A thin **status bar** spans the bottom of the window (the VS Code pattern). It carries ambient status and low-frequency toggles: the [validation](../features/validation.md) **issue indicator** at the left, and at the right a **Log** toggle (opens the change-log panel — see [Log View](../features/log-view.md)) plus quiet bundle context (concept count, and the bundle's **format version** — `OKF x.y`, prefixed with `ODSF x.y` for a [design-system bundle](../features/design-system-rendering.md) — a read-only property of the data). Its urgency is deliberately **inverted from a badge** — conformance is the expected baseline, so it reads *quietly* (dim, no colour); colour and weight are reserved for the exception (amber for warnings, red for errors), so the eye is only drawn when there is something to act on. The indicator opens the [Validation](../features/validation.md) panel.
