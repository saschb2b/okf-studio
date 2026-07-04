---
type: Proposal
title: Lineage & Traversal
description: Turn the graph from a picture into a tool — expand neighbors incrementally, trace upstream/downstream lineage, highlight the path between two concepts, and surface unlinked mentions.
tags: [proposal, graph, traversal, lineage]
timestamp: 2026-07-04T19:00:00Z
---

# Problem

Following relationships is shallow: [focus mode](../features/graph-view.md) shows a concept's ego neighborhood, and the [reader](../features/concept-reader.md) lists one level of backlinks. Deep diving is multi-hop — "what does this depend on, transitively?", "what breaks if this changes?", "how do these two connect?". This is the third and meatiest step in [Deep Knowledge Diving](deep-knowledge-diving.md), and it follows [overview](bundle-overview.md) and [faceted search](faceted-search.md).

# The pieces (in order of value)

## Expand-on-click
Start from one concept and pull in its neighbors a hop at a time, building the view you want instead of loading the whole graph. Neo4j Bloom's core interaction. Cheap given the existing focus machinery; the difference is *incremental and additive* rather than a fixed-depth ego view.

## Upstream / downstream lineage
Pick a concept and get two collapsible trees — what it links to (upstream) and what cites it (downstream), transitively. For a `datasets → tables → metrics → joins` catalog this is the feature. Both directions already exist as edges (`links` and `citedBy` on the [data model](../architecture/data-model.md)); this is a bounded traversal with cycle-guarding, rendered as a tree and as a graph highlight.

## Path between two concepts
Select A and B, highlight the shortest path (the roadmap's shortest-path, made visual). Answers "how does user activity connect to revenue?" in one gesture. BFS over the undirected link set, drawn on the graph with the intermediate concepts named.

## Unlinked mentions
OKF-flavored discovery: concepts whose text names another concept's title without linking it (Obsidian's pattern). Surfaced in the reader as "N unlinked mentions", it turns the [tolerant-consumer](../product/principles.md) stance into a feature — the graph is only as complete as its authors' links, and this finds what they missed.

# UX shape

- Traversals are **bounded and cycle-safe** (a hop cap, visited-set), so a dense bundle stays [fast](../product/principles.md).
- Everything is **read-only and derived** — no bundle mutation, no new backend; edges are already parsed.
- Lineage and paths render in **both** places: a structured tree in a panel and a highlight over the [graph](../features/graph-view.md), so list- and graph-thinkers both get it.
- A dbt-style selector in the [query bar](faceted-search.md) (`+concept`, `concept+2`) is a natural power-user surface once the traversals exist.

# Why later

It depends on nothing here being built first, but it is the largest of the three and benefits from the [faceted](faceted-search.md) result-set model (scope a traversal to a filtered subgraph) and the [overview](bundle-overview.md)'s hub/orphan framing (where to start a trace). Build 1 and 2, then this.
