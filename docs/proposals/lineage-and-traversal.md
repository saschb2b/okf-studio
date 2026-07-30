---
type: Proposal
title: Lineage & Traversal
description: Turn the graph from a picture into a tool — expand neighbors incrementally, trace upstream/downstream lineage, highlight the path between two concepts, and surface unlinked mentions.
tags: [proposal, graph, traversal, lineage]
generated: { by: claude/unrecorded, at: 2026-07-05T12:00:00Z }
---

# Problem

Following relationships is shallow: [focus mode](../features/graph-view.md) shows a concept's ego neighborhood, and the [reader](../features/concept-reader.md) lists one level of backlinks. Deep diving is multi-hop: "what does this depend on, transitively?", "what breaks if this changes?", "how do these two connect?". This is the third and meatiest step in [Deep Knowledge Diving](deep-knowledge-diving.md), and it follows [overview](bundle-overview.md) and [faceted search](faceted-search.md).

# The pieces (in order of value)

## Expand-on-click *(shipped)*
Start from one concept and add its neighbors a hop at a time. You build the view you want instead of loading the whole graph. This is Neo4j Bloom's core interaction. **Double-click a node** in the [graph](../features/graph-view.md) to restrict to it and its neighbors, then double-click any node to grow the set outward. It reuses the graph's existing restrict-set machinery (the same cached-position path as focus/isolate), so revealed nodes animate in rather than re-spawn. An `Exploring N · exit` chip returns to the full graph. The difference from Focus mode is that it is *incremental and additive* rather than a fixed-depth ego view.

## Upstream / downstream lineage
Pick a concept and get two collapsible trees: what it links to (upstream) and what cites it (downstream), transitively. For a `datasets → tables → metrics → joins` catalog this is the feature. Both directions already exist as edges (`links` and `citedBy` on the [data model](../architecture/data-model.md)). The traversal stays bounded and guards against cycles, and it renders both as a tree and as a graph highlight.

## Path between two concepts
Select A and B, highlight the shortest path (the roadmap's shortest-path, made visual). Answers "how does user activity connect to revenue?" in one gesture. BFS over the undirected link set, drawn on the graph with the intermediate concepts named.

## Unlinked mentions
OKF-flavored discovery: concepts whose text names another concept's title without linking it (Obsidian's pattern). The reader shows them as "N unlinked mentions". This turns the [tolerant-consumer](../product/principles.md) stance into a feature. The graph is only as complete as its authors' links, and this finds what they missed.

# UX shape

- Traversals are **bounded and cycle-safe** (a hop cap, visited-set), so a dense bundle stays [fast](../product/principles.md).
- Everything is **read-only and derived**: no bundle mutation, no new backend. The parser already reads the edges.
- Lineage and paths render in **both** places: a structured tree in a panel and a highlight over the [graph](../features/graph-view.md), so list- and graph-thinkers both get it.
- A dbt-style selector in the [query bar](faceted-search.md) (`+concept`, `concept+2`) is a natural power-user surface once the traversals exist.

# Why later

Nothing here has to ship first. This is still the largest of the three, and it benefits from the [faceted](faceted-search.md) result-set model (scope a traversal to a filtered subgraph) and the [overview](bundle-overview.md)'s hub/orphan framing (where to start a trace). Build 1 and 2, then this.
