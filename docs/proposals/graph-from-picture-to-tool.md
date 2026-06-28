---
type: Proposal
title: Graph View — From Picture to Tool
description: Default the graph to a focused neighborhood of the selected concept, surface orphans and broken links, and let search isolate a subgraph.
status: proposed
tags: [proposal, graph, visualization, ux]
timestamp: 2026-06-28T17:00:00Z
---

# The ask

Exploring the node [graph](../features/graph-view.md) is a good first iteration, but right now it is more "look grandma, a nice picture of my structure" than a useful tool. Brainstorm tighter, concrete use cases that make the graph genuinely useful, and evaluate the changes each needs.

# Problem

The global force-directed graph answers one shallow question — "what does the whole thing look like?" — and past ~100 nodes it is a hairball whose only honest signal is gross clustering. It does **not** answer the questions a knowledge worker actually has: *what relates to this? what's orphaned or broken? how do these two connect? what's the spine?* Notably, the graph today **hides the very defects** the [agent-builder and maintainer personas](../product/personas.md) open it to find — a [broken link](../features/validation.md) produces no edge (invisible), and an orphan is just a lonely dot.

Enabling fact: the [data model](../architecture/data-model.md) already carries `links`, `citedBy`, `brokenLinks`, `degree`, `type`, `tags`, and bundle `issues`. So almost every use case below is a **frontend-only** selector over data that already crosses the IPC boundary — no Rust changes.

# Recommendation — shift the default to a focused graph

When a concept is selected (the normal reading state, since selection is shared across panes), the graph should default to a **focused neighborhood** of that concept (depth 1–2 via BFS over the existing adjacency). The global graph becomes an explicit **Overview** mode — kept for the newcomer's first-contact "grasp the shape" moment, and the fallback when nothing is selected — but not the resting state. This aligns the graph with [progressive disclosure](../product/principles.md) and makes the worst-case performance path opt-in.

# Prioritized use cases

| Use case | Value | Change needed | Value/effort |
| --- | --- | --- | --- |
| **Local / ego focus graph + depth control** | "What relates to this?" — the #1 job | BFS over existing `neighbors`; reuse the sim; depth state + mode toggle | very high / low |
| **Orphan + broken-link surfacing** | The maintainer/agent-builder's stated job | Badge `degree===0`/empty `citedBy`; warning marker + ghost stub edges for `brokenLinks`; a count chip that isolates the set | very high / low |
| **Search → isolate subgraph** | "Find a foothold, then show only it + connections" | Extend existing `matchesQuery`/`filteredConceptIds` to restrict the rendered set | high / low |
| **Type / tag lensing → subgraph** | "Show only metrics and the tables they touch" | Turn the legend toggle into a positive "isolate this type + 1-hop" | high / low |
| **Shortest path between two concepts** | "How do these connect?" | BFS over `neighbors`; a second pinned-target selection; path highlight | high / medium |
| **Directional ego (links-to vs cited-by)** | Upstream blast radius vs downstream deps | Partition the ego BFS; arrowheads | medium-high / medium |
| **Centrality / "spine"** | "What's the backbone?" | `degree` is free; betweenness = one Brandes pass per bundle | medium / medium |
| **Pin / compare** | Keep 2–3 concepts on screen while exploring | Pinned set as extra BFS roots | medium / medium |

# Nail first

1. **Local focus graph with depth control** (the keystone reframe).
2. **Orphan + broken-link surfacing** (highest value/effort; the data is parsed and currently discarded visually).
3. **Search → isolate subgraph** (small extension that completes a "narrow to what I care about" loop).

Ship these three as *one* coherent interaction model (selection drives a focused, defect-annotated subgraph that search/type refine), not eight separate toggles.

# Risks & alignment

- **Tolerant consumer**: orphan/broken-link surfacing must *report, never reject* — badges and counts in the [validation](../features/validation.md) severity language, never errors.
- **Disorientation**: switching a force layout makes nodes jump. Reuse the existing position cache so entering/leaving focus animates from kept positions rather than re-spawning (the single biggest trap).
- **Don't strand the newcomer**: no-selection → Overview, and a permanent, discoverable Overview toggle.
- **Fast**: focus mode renders a tiny node set regardless of bundle size (see [Performance & Scale](../architecture/performance.md)); betweenness (later) is once per bundle.

# Definition of done (first slice)

- Selecting a concept renders a focused subgraph (depth 1 default, 1/2/3 control) with an Overview toggle; no selection → Overview.
- Mode/depth changes animate from preserved positions (no re-spawn).
- Orphans marked; `brokenLinks` shown as warning + ghost stub; a count chip isolates the set.
- Search can isolate matches + neighbors into the rendered set.
- New actions have keyboard shortcuts; behavior stays read-only and tolerant.
- No core/Rust changes required for this slice.
