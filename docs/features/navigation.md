---
type: Feature
title: Navigation
description: Move through a bundle by progressive disclosure — the index tree, link following, and back/forward history.
tags: [feature, navigation]
timestamp: 2026-07-06T12:00:00Z
---

# What it does

Provides the ways to move through a bundle that complement the [graph](graph-view.md): a structured tree, link following, and history.

# Index tree (progressive disclosure)

- The sidebar's **Navigate lens** renders the bundle's `index.md` hierarchy: the root index's sections and links, descending into sub-directory `index.md` files on expand. A [lens switcher](../ux/browsing-layout.md) keeps this separate from the type/tag [filters](search-and-filter.md) so neither crowds the other at scale.
- This mirrors OKF's intended navigation — an agent or human "decides where to descend without reading every file." When an `index.md` is missing, the viewer **synthesizes** one from the directory's concepts (the spec permits this), marked with a quiet *auto* word (tooltip explains) rather than a badge.
- A directory that holds **no concepts at all** (companion assets like `styles/*.css`, or genuinely empty) still expands — into a one-line note, "No concepts in this folder", per the [report-never-refuse stance](../ux/empty-and-error-states.md). Silently adding zero rows read as a dead click.
- **The tree reveals the active concept**: a selection made anywhere — a graph node, the [launcher](command-palette.md), a [reader](concept-reader.md) link — expands the directory chain leading to it and scrolls its row into view, so the tree always answers "where does this live in the bundle?". It only ever expands; it never re-folds what the user collapsed.
- **Directory rows carry a concept count**, right-aligned and dim — how much bundle lives behind each fold, before descending.
- The sidebar search and [filters](search-and-filter.md) **dim** tree entries they exclude rather than hiding them. When *nothing* listed in the index survives — a query can match concepts an index never lists — the tree says so instead of dead-ending: a quiet notice reports either that nothing matches, or that N concepts match elsewhere, with an **Open full search** action that opens the [launcher](command-palette.md) seeded with the same query.

# Link following & history

- Clicking any intra-bundle link (in the [reader](concept-reader.md), the index, or the relationship lists) navigates to that concept and recenters the [graph](graph-view.md).
- Back / forward history (with [keyboard shortcuts](../ux/keyboard-shortcuts.md)) retraces the path through the graph, like a browser — **per tab** (below).
- The [global launcher](command-palette.md) resolves a concept by id, title, or body text and jumps to it.

# Tabs & windows (multi-view)

Reading is no longer one-concept-at-a-time (see the [multi-view proposal](../proposals/multi-view.md) for the design rationale):

- **`Ctrl/Cmd+click` any concept target** — a reader body link, a rail relationship row, an index-tree row, a graph node, a launcher result — to open it in a **new background tab** (add `Shift` to also switch); middle-click does the same on body links. Each tab owns its **own back/forward history**. A tab strip appears above the reader at two or more tabs and stays out of the way otherwise (see [Browsing Layout](../ux/browsing-layout.md)).
- Plain clicks keep today's behavior exactly: they navigate the **current tab**, and selection stays one shared state per window.
- **Move to new window** (the strip's trailing control, or the launcher action) undocks a tab into its **own OS window** running the full app on the same bundle — the browser tear-off. Windows are independent; [live reload](live-reload.md) reaches all of them.
- `Ctrl/Cmd+T` opens a new empty tab, `Ctrl/Cmd+W` closes, `Ctrl+Tab` cycles; middle-click closes a tab. Switching bundles resets the tabs; a live reload keeps them.

# Breadcrumb

- The current concept shows its path (e.g. `tables / orders`) as a breadcrumb, each segment linking to the corresponding index level.

Selection is a single shared state: the [sidebar](../ux/browsing-layout.md), graph, and reader always agree on the active concept.
