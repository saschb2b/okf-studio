---
type: Feature
title: Graph View
description: A force-directed graph of a bundle's concepts — nodes colored by type, edges from cross-links — that the user pans, zooms, and explores.
tags: [feature, graph, core, visualization]
timestamp: 2026-07-05T14:00:00Z
---

# What it does

The center of the workspace renders the active bundle as an interactive **force-directed graph**: one node per concept, one edge per cross-link. This makes the relationship structure — implicit in the markdown links — visible and navigable.

# Visual encoding

- **Node = concept.** Color comes from one of two modes (a Controls toggle): by `type` via the deterministic palette (the default-ish semantic coloring; the legend doubles as a [type filter](search-and-filter.md)), or by **detected cluster** — **Louvain** community detection groups densely-interlinked concepts and gives each community a unified color, so emergent clusters read at a glance.
- **Node size** scales with degree (how connected a concept is), so hubs stand out.
- **Edge = cross-link** between concepts. Each edge draws in its **source (citing) node's color** — Gephi's convention, following the active color mode — so hub fans and cluster membership read from the wiring, not just the dots. Selecting or hovering a node accents its incident edges and adds an **arrowhead at each cited end** (reciprocal links show both), so citation direction appears exactly where the user is looking while the overview stays clean. A richly cross-linked bundle is dense enough that drawing *every* link reads as a hairball, so by default the graph draws a **structural backbone** — each concept's most significant edges — rather than all of them; a Controls *Links* setting trades readability for completeness. See [Implementation notes](#implementation-notes).
- **Label** shows the concept `title`, **sized by the node's importance** (hubs get larger labels). Labels are **level-of-detail** in the dataviz sense: each node's reveal threshold scales with its size, so zooming out sheds leaf labels first and keeps the hubs as a labeled map; overlapping labels are **collision-culled by priority** (selection/hover context first, then bigger nodes) instead of smearing. The selected node, its neighbors, and the hovered node are always labeled.

# Interaction

- Pan (drag background), zoom (wheel), drag nodes to reposition, **click** to open a concept, **Fit** to reframe — all via [keyboard shortcuts](../ux/keyboard-shortcuts.md) too (`+`/`−` zoom, `F` fits). Switching the focus/isolate set reframes the new subgraph **immediately** from its cached positions (and again once the layout settles), so it never sits half out of view while the simulation runs.
- **Double-click a node to explore** — expand-on-click ([Neo4j Bloom's](../proposals/lineage-and-traversal.md) core interaction): the graph restricts to that concept and its neighbors, and each further double-click **pulls in another node's neighbors**, so you build a neighborhood outward a hop at a time instead of starting from the whole hairball. Cached positions mean the newly-revealed nodes animate in from where they were rather than re-spawning. An `Exploring N · exit` chip shows the set size and returns to the full graph; **Overview**/**Focus** also exit it. This is the incremental, additive complement to Focus mode's fixed-depth ego view.
- **Fit and the zoom buttons glide** rather than teleport: a short ease-out where the point under the viewport center travels linearly and scale interpolates geometrically, so the step reads as movement through the graph. Direct input — wheel, pan — interrupts the glide and takes over; **reduce motion** ([settings](../ux/settings.md)) makes every transition instant.
- Click a node to open it in the [Concept Reader](concept-reader.md) and recenter on it.
- **Selecting** a node keeps the whole graph bright but rings it and accents its links, so the open concept's connections stand out without hiding the rest. **Hovering** a node dims everything except it and its neighbors, to trace one neighborhood at a time. Either way structure stays readable in a dense graph.
- Hidden types (toggled in the legend) drop out of the layout; [search](search-and-filter.md) dims non-matches.

# Controls

A collapsible controls panel (top-left of the graph, in the spirit of Obsidian's graph view) tunes the view without leaving it. Every control sits under a **titled section with a one-line description**, uses a **plain-language label**, and — for sliders — shows its **live value** and a short hint of what it does, so the panel *teaches* rather than just labels (it scrolls when it outgrows the viewport):

- **Renderer** — *Canvas* (the default) or *GPU* (WebGL, for very large graphs). The canvas renderer carries the full control set, level-of-detail labels, and defect markers. See [Implementation notes](#implementation-notes).
- **Connections** — the [link density](#visual-encoding) (*Key* / *Balanced* / *All*): how many edges are drawn, from each concept's strongest few to every cross-link. A live hint names what the current choice does.
- **Color** — color nodes by detected **cluster** (Louvain community) or by concept **type**.
- **Appearance** — *node size*, *link thickness*, *link opacity*, and *label visibility* (how early titles appear as you zoom in).
- **Layout** — fine-tune the forces in plain terms: *spacing* (how hard nodes push apart), *link length*, *link pull*, *gravity*, and *cluster pull* (how strongly each detected community gathers around its own center **and pushes apart from other communities**). Adjusting one gently reheats the layout so it re-settles.

A **Reset to defaults** restores the tuned starting point. The graph **auto-fits** the viewport once a fresh layout settles, and a **collision** pass keeps nodes from overlapping, so clusters read as distinct blobs rather than a tangle.

# Focus mode

By default the graph shows a **focused neighborhood** of the selected concept — that concept plus its neighbors out to an adjustable **depth** (1–3 hops over links and backlinks) — rather than the whole bundle, so it answers "what relates to *this*?" instead of presenting a hairball. An **Overview / Focus** toggle switches to the full graph (Overview is the default when nothing is selected), and a depth stepper sets the hop count. Toggling reuses cached node positions so the layout animates rather than jumps.

# Surfacing defects

The graph makes conformance problems visible instead of hiding them: **orphans** (concepts with no links in or out) get a marked ring, concepts with **broken links** get a warning marker, and a count chip (`N orphans · M broken`) isolates that set on click. This stays [tolerant](validation.md) — defects are surfaced, never rejected, and use the same severity language as [Validation](validation.md).

# Implementation notes

- Graph data (nodes, edges, backlinks) is computed in the [Rust core](../architecture/okf-parsing.md) from the [data model](../architecture/data-model.md) and handed to the frontend as JSON.
- The default layout/render runs in the frontend on a **canvas**, with positions and the simulation kept out of React's render path. Repulsion uses a **Barnes–Hut quad-tree** (O(n log n)), **weighted by node degree** (a ForceAtlas2-style body mass) so hubs and dense clusters claim more space and separate emergently, while a **LinLog link attraction** (a gentle logarithmic pull that doesn't tighten with distance) keeps connected clusters from collapsing into a central tangle — together a neat, untangled distribution — and a **collision** pass prevents overlap, so the view scales from tens to thousands of nodes; a cooling schedule settles the layout and then the loop idles. On top of the emergent structure, a **cluster force** makes the geometry *agree with* the detected communities that also drive the default coloring, in two passes: **gravity** (cosmos.gl's point-clustering idea) pulls each node gently toward its **Louvain community's centroid** for tighter blobs, and **separation** gives each community a soft circular bubble (radius ∝ √members) and pushes overlapping bubbles apart, so distinct communities settle into distinct regions instead of interleaving — the clean auto-clustering that otherwise needed a manual wiggle. Both fade as the layout cools and ride the single *Cluster pull* control. See [Performance & Scale](../architecture/performance.md) for the full strategy and the [fast principle](../product/principles.md) it serves.
- **Interaction stays cheap regardless of size.** A trackpad zoom fires a flood of wheel events; rather than redraw synchronously on each (which backs up the main thread and reads as a freeze, worst on the slower WebKitGTK webview), wheel and pan **coalesce to at most one redraw per animation frame**. And the label pass — the priciest part of a frame, being O(labels²) collision-culling plus text layout — **skips any node outside the viewport**, so zooming into one cluster of a large graph only ever lays out the handful of on-screen labels, not all of them.
- A bundle's cross-links are deliberately rich (good for navigation), which makes the raw graph **dense** — our docs bundle averages ~14 edges per node — and no force layout can untangle a graph that near-complete. So the view draws a **backbone**, not every edge: each edge is weighted by how much it reveals structure (mutual links, shared neighborhoods, shared tags), each concept keeps only its strongest few (a weighted **k-nearest-neighbor** graph), and a **maximum spanning forest** is overlaid so pruning never disconnects the graph. This is the established *edge-filtering / backbone-extraction* approach for dense networks; we use weighted top-k rather than the disparity filter ([Serrano et al., 2009](https://www.pnas.org/doi/10.1073/pnas.0808904106)) because our near-binary edge weights make that filter degenerate. The *Links* control (Key / Balanced / All) sets how many edges per concept survive; **communities and focus neighborhoods are still computed on the full link graph**, so cluster colors and "what relates to this" stay complete regardless of the density setting.
- An optional **GPU renderer** (cosmos.gl) runs the same force model entirely on the graphics card via WebGL, scaling to graphs far larger than the canvas path comfortably handles. It keeps the essentials — community coloring, degree-scaled node sizes, click-to-open, hover highlight, [focus mode](#focus-mode), an HTML label overlay for the selected and hovered concepts, and Fit — and is **loaded on demand** (its WebGL bundle downloads only when selected, so the default path stays lean) and **degrades gracefully to the canvas renderer** if WebGL is unavailable in the host webview. The canvas renderer stays the default and the more fully-featured of the two.
- Broken cross-links simply do not produce edges — they are [tolerated](validation.md), not errors.
