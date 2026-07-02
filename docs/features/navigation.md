---
type: Feature
title: Navigation
description: Move through a bundle by progressive disclosure — the index tree, link following, and back/forward history.
tags: [feature, navigation]
timestamp: 2026-07-02T08:40:00Z
---

# What it does

Provides the ways to move through a bundle that complement the [graph](graph-view.md): a structured tree, link following, and history.

# Index tree (progressive disclosure)

- The sidebar's **Navigate lens** renders the bundle's `index.md` hierarchy: the root index's sections and links, descending into sub-directory `index.md` files on expand. A [lens switcher](../ux/browsing-layout.md) keeps this separate from the type/tag [filters](search-and-filter.md) so neither crowds the other at scale.
- This mirrors OKF's intended navigation — an agent or human "decides where to descend without reading every file." When an `index.md` is missing, the viewer **synthesizes** one from the directory's concepts (the spec permits this), marked with a quiet *auto* word (tooltip explains) rather than a badge.
- **The tree reveals the active concept**: a selection made anywhere — a graph node, the [launcher](command-palette.md), a [reader](concept-reader.md) link — expands the directory chain leading to it and scrolls its row into view, so the tree always answers "where does this live in the bundle?". It only ever expands; it never re-folds what the user collapsed.
- **Directory rows carry a concept count**, right-aligned and dim — how much bundle lives behind each fold, before descending.
- The sidebar search and [filters](search-and-filter.md) **dim** tree entries they exclude rather than hiding them. When *nothing* listed in the index survives — a query can match concepts an index never lists — the tree says so instead of dead-ending: a quiet notice reports either that nothing matches, or that N concepts match elsewhere, with an **Open full search** action that opens the [launcher](command-palette.md) seeded with the same query.

# Link following & history

- Clicking any intra-bundle link (in the [reader](concept-reader.md), the index, or the relationship lists) navigates to that concept and recenters the [graph](graph-view.md).
- Back / forward history (with [keyboard shortcuts](../ux/keyboard-shortcuts.md)) retraces the path through the graph, like a browser.
- The [global launcher](command-palette.md) resolves a concept by id, title, or body text and jumps to it.

# Breadcrumb

- The current concept shows its path (e.g. `tables / orders`) as a breadcrumb, each segment linking to the corresponding index level.

Selection is a single shared state: the [sidebar](../ux/browsing-layout.md), graph, and reader always agree on the active concept.
