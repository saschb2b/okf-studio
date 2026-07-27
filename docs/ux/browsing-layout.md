---
type: UX Flow
title: Browsing Layout
description: The three-pane workspace — sidebar, graph, reader — and how selection keeps them in sync.
tags: [ux, layout]
generated: { by: claude/unrecorded, at: 2026-07-24T12:00:00Z }
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

- **Far left — Activity Bar.** A persistent vertical icon rail (the VS Code / Zed pattern) that stays put whether or not the sidebar is open. Its **top** opens [**Bundle Home**](../features/bundle-home.md), then holds the **view switchers** — *Navigate* (the [index tree](../features/navigation.md)) and *Filter* (type/tag [filters](../features/search-and-filter.md)); clicking a view opens the sidebar to that lens, and clicking the active view collapses the sidebar (a dot on the Filter icon flags an active filter even while hidden). Its **foot** pins the app's **global actions** — **Keyboard shortcuts** and **[Settings](settings.md)** (`Ctrl/Cmd + ,`) — where native desktop apps put "Manage"-style entries, rather than floating a gear in the title bar. When a new release is available, the Settings gear carries a small warning-colored dot (announced once with a brief ping, then still) that leads to the [Updates category](settings.md); visiting it clears the dot for that version.
- **Sidebar.** The active lens's content — the [index tree](../features/navigation.md) or the type/tag [filters](../features/search-and-filter.md) — under a pinned **search box**, so navigation and filtering never share one long scroll. Collapsible (toggled from the Activity Bar). Switching *bundles* lives in the top-left [Bundle Switcher](../features/bundle-switcher.md), not here.
- **Center — Graph.** The [Graph View](../features/graph-view.md), focused on the selected concept by default.
- **Right — Reader.** The [Concept Reader](../features/concept-reader.md) for the selected concept — a first-class pane, weighted co-equal with the graph. It is a reading surface: a centered, comfortable prose column with a quiet right context rail (outline, relationships, details) that collapses when space is tight (e.g. in split mode, where the graph already supplies relationship context). A **tab strip** sits sticky above the document when two or more concepts are open ([multi-view](../proposals/multi-view.md)): each tab shows its concept's type dot + title, closes by × or middle-click, **drags sideways to reorder** (live swap at the neighbor's midpoint), and the strip's trailing control undocks the active tab into its own window. Below two tabs the strip does not exist — a single-document session carries no extra chrome.

# Synced selection

There is one shared "active concept" **per window.** Selecting it anywhere — a graph node, a sidebar entry, a link in the reader — updates all three panes together. The [graph](../features/graph-view.md) recenters, the sidebar highlights, the reader loads. With [tabs](../features/navigation.md) open, the active tab *is* the selection (switching tabs is a selection change), and `Ctrl/Cmd+click` opens in a background tab instead of moving the selection.

# Pop-out windows

A tab can undock into its **own OS window** — the browser tear-off, for a second monitor or a reference kept beside the main workspace. The new window runs the full app on the same bundle: it boots reader-only with the sidebar tucked away (a "document window"), but has all the chrome and can grow back into a full workspace. Windows are independent — no cross-window selection sync — while [live reload](../features/live-reload.md) broadcasts to every window. If two windows stage changes against the same bundle, transaction base and revision checks let the first valid apply proceed and reject the stale transaction instead of silently overwriting it. See the [multi-view proposal](../proposals/multi-view.md).

# Layout modes

The workspace switches between three layout modes — **split** (default, graph + reader co-equal), **reader-only**, and **graph-only** — via a segmented control in the top bar or [keyboard](keyboard-shortcuts.md) (`Ctrl/Cmd + 1/2/3`, `\` to cycle). In split mode the panes are **resizable** with draggable, keyboard-operable dividers (double-click to reset); the chosen mode and pane sizes persist. The reader keeps a comfortable measure cap so wide prose stays readable.

# Chrome — the custom title bar

The window runs **borderless** (native title-bar decorations are off — see [Theming](theming.md)); the top bar *is* the app's title bar, so the chrome is ours end to end (in the spirit of Zed's custom frame).

- It is laid out in three zones (the VS Code command-center pattern). **Left:** the [**Bundle Switcher**](../features/bundle-switcher.md), which names the open bundle and its folder, followed by two compact bundle actions: [**Create shareable bundle**](../features/recipient-projections.md) and **Bundle details**. The Info action carries a small [conformance](../features/validation.md) mark and opens one organized place for identity, format, size, status, root [metadata](../features/metadata-inspector.md), a compact [Connections](../features/interoperability-lab.md) summary, [ignore rules](../features/ignore-rules.md), and [advisory profiles](../features/advisory-profiles.md). Operational connection work opens in its own scrollable dialog. Both title-bar actions remain reachable from every topic and layout. **Center — window-centered:** the **back/forward** history controls immediately left of a prominent **search** field that opens the [global launcher](../features/command-palette.md); search is a primary feature, so it gets a generous, responsive width and stays centered to the window regardless of the side content; when the window gets too narrow to afford both, the search field shrinks rather than letting the side zones overlap it (the same rule keeps the graph's centered mode toggle clear of its Controls button). **Right:** the **layout** switch and the **window controls** (minimize · maximize/restore · close) at the far right. App-level actions (Settings, shortcuts) live in the Activity Bar, the low-frequency **Log** toggle stays in the status bar, and the reader **"Aa"** reading preferences stay with the content in the [reader](../features/concept-reader.md).
- Empty regions of the bar are a **drag handle** for moving the window (double-click to maximize/restore); interactive controls are excluded from the drag region. Invisible **resize handles** line the window edges and corners, and the window has **slightly rounded corners** (squared when maximized).
- Honors [theming](theming.md) and a [native desktop feel](settings.md) (content-scoped zoom, our own frame), and is fully driveable by [keyboard](keyboard-shortcuts.md).

# Chrome — the status bar

The right side ends with the [Agent Panel](../features/agent-panel.md) opener. It remains present without an open bundle and toggles the right-docked agent workspace. When a bundle is open, the same region also carries [Integrated Git](git-workflow.md): its opener shows the current branch and ahead/behind counts when available. Git and Agent are mutually exclusive docks, preserving one main workspace and one auxiliary panel.

A thin **status bar** spans the bottom of the window (the VS Code pattern). It is now reserved for persistent workspace-panel controls: Git, Lineage, Log, and Agent. Bundle size, format, and conformance no longer repeat there because the title bar's adjacent Share and Info actions provide a clearer bundle-level home. The same **Bundle details** dialog remains available from the [command palette](../features/command-palette.md).
