---
type: Feature
title: Graph View
description: A force-directed graph of a bundle's concepts — nodes colored by type, edges from cross-links — that the user pans, zooms, and explores.
tags: [feature, graph, core, visualization]
timestamp: 2026-06-29T17:00:00Z
---

# What it does

The center of the workspace renders the active bundle as an interactive **force-directed graph**: one node per concept, one edge per cross-link. This makes the relationship structure — implicit in the markdown links — visible and navigable.

# Visual encoding

- **Node = concept.** Color is determined by its `type` via a deterministic palette (see [Theming](../ux/theming.md)); the legend doubles as a [type filter](search-and-filter.md).
- **Node size** scales with degree (how connected a concept is), so hubs stand out.
- **Edge = cross-link** between concepts. Direction is available (A links to B), and selecting a node highlights its incident edges plus its neighbors.
- **Label** shows the concept `title`. Labels are **level-of-detail**: when zoomed out only dots show; labels fade in past an adjustable zoom threshold, and are always shown for the selected node, its neighbors, and the hovered node — so a large graph stays legible instead of becoming a wall of text.

# Interaction

- Pan (drag background), zoom (wheel), drag nodes to reposition, **Fit** to reframe — all via [keyboard shortcuts](../ux/keyboard-shortcuts.md) too.
- Click a node to open it in the [Concept Reader](concept-reader.md) and recenter on it.
- **Selecting** a node keeps the whole graph bright but rings it and accents its links, so the open concept's connections stand out without hiding the rest. **Hovering** a node dims everything except it and its neighbors, to trace one neighborhood at a time. Either way structure stays readable in a dense graph.
- Hidden types (toggled in the legend) drop out of the layout; [search](search-and-filter.md) dims non-matches.

# Controls

A collapsible controls panel (top-left of the graph, in the spirit of Obsidian's graph view) tunes the layout without leaving the view:

- **Forces** — *repel* (node spacing), *link distance*, *link force*, and *center* gravity. Adjusting a force gently reheats the layout so it re-settles.
- **Display** — *node size*, *link thickness*, *link opacity*, and the *label* fade threshold.

The graph **auto-fits** the viewport once a fresh layout settles, and a **collision** pass keeps nodes from overlapping, so clusters read as distinct blobs rather than a tangle.

# Focus mode

By default the graph shows a **focused neighborhood** of the selected concept — that concept plus its neighbors out to an adjustable **depth** (1–3 hops over links and backlinks) — rather than the whole bundle, so it answers "what relates to *this*?" instead of presenting a hairball. An **Overview / Focus** toggle switches to the full graph (Overview is the default when nothing is selected), and a depth stepper sets the hop count. Toggling reuses cached node positions so the layout animates rather than jumps.

# Surfacing defects

The graph makes conformance problems visible instead of hiding them: **orphans** (concepts with no links in or out) get a marked ring, concepts with **broken links** get a warning marker, and a count chip (`N orphans · M broken`) isolates that set on click. This stays [tolerant](validation.md) — defects are surfaced, never rejected, and use the same severity language as [Validation](validation.md).

# Implementation notes

- Graph data (nodes, edges, backlinks) is computed in the [Rust core](../architecture/okf-parsing.md) from the [data model](../architecture/data-model.md) and handed to the frontend as JSON.
- The layout/render runs in the frontend on a **canvas**, with positions and the simulation kept out of React's render path. Repulsion uses a **Barnes–Hut quad-tree** (O(n log n)), **weighted by node degree** (a ForceAtlas2-style body mass) so hubs and dense clusters claim more space and separate emergently — no separate clustering pass — and a **collision** pass prevents overlap, so the view scales from tens to thousands of nodes; a cooling schedule settles the layout and then the loop idles. See [Performance & Scale](../architecture/performance.md) for the full strategy and the [fast principle](../product/principles.md) it serves.
- Broken cross-links simply do not produce edges — they are [tolerated](validation.md), not errors.
