---
type: Architecture Decision
title: Frontend Architecture
description: How the web frontend is organized as a thin client over the Rust command and event surface.
tags: [architecture, decision, frontend, state]
timestamp: 2026-06-28T12:00:00Z
---

# Decision

The web frontend is a **thin client**. It owns rendering and interaction; it owns no filesystem privileges. Everything it draws is derived from JSON the [Rust core](tech-stack.md) hands across the [command/event surface](ipc-and-security.md). This keeps the [rendering-vs-filesystem boundary](ipc-and-security.md) sharp: the frontend never reads a file, only the [data model](data-model.md) the core produces.

# Single source of truth for the active concept

The three panes — sidebar, [graph](../features/graph-view.md), and [reader](../features/concept-reader.md) — must always agree on what is selected. There is therefore **one** piece of authoritative selection state: the active Concept ID. Selecting in any pane writes that one value; all three read from it. This is what keeps the [browsing layout](../ux/browsing-layout.md) coherent — clicking a graph node scrolls the reader and highlights the sidebar entry without any pane holding its own competing notion of "current." [Navigation](../features/navigation.md) history is a stack of these IDs, so back/forward is just replaying selection state.

# Derived state, computed on the client

The core hands over `concepts` and dictates no presentation; the frontend **derives** everything visual from that data ([data model](data-model.md)):

- The **type → color** map — a deterministic palette keyed by each concept's `type` (see [Theming](../ux/theming.md)).
- The **edge list** — flattened from `concepts[].links` into `{source, target}` pairs for the graph.
- The **tag index** — synthesized by inverting `concepts[].tags` into tag → concept lists, powering tag [filters](../features/search-and-filter.md).

These are computed once per bundle load and memoized, not recomputed per render.

# Component decomposition

Components mirror the three panes: a **sidebar** (indexes, concept list, search results), a **graph** (renderer plus interaction layer), and a **reader** (rendered markdown with backlinks). Each subscribes to the shared active-concept state and to the derived stores; none reaches into another's internals.

# In-place patching on bundle-changed

When a `bundle-changed` event arrives ([Live Reload](../features/live-reload.md)), the frontend **patches state in place** rather than rebuilding the bundle from scratch. The changed concept's record is replaced, derived stores update for just the affected entries, and the graph keeps existing node positions — only affected nodes resettle, so the layout does not jump. Selection and scroll are retained when the active concept still exists.

# Framework-agnostic

This architecture — one source of truth, derived stores, three components, in-place patching — depends on no specific framework. **Svelte** or **SolidJS** is preferred for small bundle size and fine-grained reactivity; **React** is acceptable if the implementer prefers its ecosystem (see [Tech Stack](tech-stack.md)). The contract is the data shape and the [IPC surface](ipc-and-security.md), not the rendering library.
