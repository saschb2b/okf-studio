---
type: Feature
title: Graph View
description: A force-directed graph of a bundle's concepts — nodes colored by type, edges from cross-links — that the user pans, zooms, and explores.
tags: [feature, graph, core, visualization]
timestamp: 2026-06-28T00:00:00Z
---

# What it does

The center of the workspace renders the active bundle as an interactive **force-directed graph**: one node per concept, one edge per cross-link. This makes the relationship structure — implicit in the markdown links — visible and navigable.

# Visual encoding

- **Node = concept.** Color is determined by its `type` via a deterministic palette (see [Theming](../ux/theming.md)); the legend doubles as a [type filter](search-and-filter.md).
- **Node size** scales with degree (how connected a concept is), so hubs stand out.
- **Edge = cross-link** between concepts. Direction is available (A links to B), and selecting a node highlights its incident edges plus its neighbors.
- **Label** shows the concept `title`; labels fade at distance and sharpen on hover/selection.

# Interaction

- Pan (drag background), zoom (wheel), drag nodes to reposition, **Fit** to reframe — all via [keyboard shortcuts](../ux/keyboard-shortcuts.md) too.
- Click a node to open it in the [Concept Reader](concept-reader.md) and recenter on it.
- Hidden types (toggled in the legend) drop out of the layout; [search](search-and-filter.md) dims non-matches.

# Implementation notes

- Graph data (nodes, edges, backlinks) is computed in the [Rust core](../architecture/okf-parsing.md) from the [data model](../architecture/data-model.md) and handed to the frontend as JSON.
- The layout/render runs in the frontend. For hundreds of nodes a simple force simulation suffices; for larger bundles, prefer a canvas/WebGL renderer and a quad-tree (Barnes–Hut) force approximation to honor the [fast principle](../product/principles.md).
- Broken cross-links simply do not produce edges — they are [tolerated](validation.md), not errors.
