---
type: Feature
title: Navigation
description: Move through a bundle by progressive disclosure — the index tree, link following, and back/forward history.
tags: [feature, navigation]
timestamp: 2026-06-28T12:00:00Z
---

# What it does

Provides the ways to move through a bundle that complement the [graph](graph-view.md): a structured tree, link following, and history.

# Index tree (progressive disclosure)

- The sidebar renders the bundle's `index.md` hierarchy: the root index's sections and links, descending into sub-directory `index.md` files on expand.
- This mirrors OKF's intended navigation — an agent or human "decides where to descend without reading every file." When an `index.md` is missing, the viewer **synthesizes** one from the directory's concepts (the spec permits this).

# Link following & history

- Clicking any intra-bundle link (in the [reader](concept-reader.md), the index, or the relationship lists) navigates to that concept and recenters the [graph](graph-view.md).
- Back / forward history (with [keyboard shortcuts](../ux/keyboard-shortcuts.md)) retraces the path through the graph, like a browser.
- A "jump to concept" [command palette](command-palette.md) resolves a concept by id or title.

# Breadcrumb

- The current concept shows its path (e.g. `tables / orders`) as a breadcrumb, each segment linking to the corresponding index level.

Selection is a single shared state: the [sidebar](../ux/browsing-layout.md), graph, and reader always agree on the active concept.
