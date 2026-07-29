---
type: Architecture Decision
title: Performance & Scale
description: How the "Fast" principle is achieved end to end, from the bounded directory walk to interactive graph rendering.
tags: [architecture, decision, performance, scale]
generated: { by: claude/unrecorded, at: 2026-06-29T18:00:00Z }
---

# Decision

The [Fast principle](../product/principles.md) is a budget, not an aspiration: a bundle of a few hundred concepts must render an interactive graph in **well under a second**, and switching bundles must feel instant. Performance is engineered at every stage — scan, parse, compute, render — rather than retrofitted.

# Bounded scan

[Bundle detection](bundle-detection.md) walks the chosen folder depth-first, bounded by a maximum depth and an ignore list (`.git`, `node_modules`, `target`, `dist`, `build`, `.venv`). Pointing the app at a large monorepo therefore costs a shallow, pruned traversal — not a full tree crawl. Detection only re-runs on structural changes, not on every keystroke in an editor.

# Heavy work in the core, off the UI thread

All filesystem and CPU work — directory walking, [OKF parsing](okf-parsing.md), graph construction, and backlink inversion — runs in the [Rust core](tech-stack.md), never in the webview. Commands resolve on a worker, so the UI thread is free to stay responsive while a bundle is read. The frontend only ever receives ready-to-render JSON ([data model](data-model.md)); it does no filesystem or parsing work.

# Lazy parsing with per-bundle caching

A folder may contain many bundles, but only the active one needs to be parsed. The core parses a bundle the first time it is opened and **caches the result keyed by root**. Re-selecting a bundle in the [Bundle Switcher](../features/bundle-switcher.md) serves the cached `Bundle` immediately — switching is instant, with no re-parse. Detection lists roots cheaply (it only needs to find one typed concept per candidate); the expensive full parse is deferred until a root is actually opened.

# Incremental updates on live reload

[Live Reload](../features/live-reload.md) never re-parses a whole bundle for a single edit. A changed concept file re-parses **only that concept**; backlinks recompute **incrementally** by diffing that concept's outbound links against the previous edge set, so only affected `citedBy` lists change. Watch events are **debounced** so a burst of writes — a bulk edit, a `git checkout` — collapses into one coherent update rather than a storm of re-renders.

# Graph rendering strategy

The [graph](../features/graph-view.md) renders on a **canvas**, with node positions and the force simulation kept out of React's render path (a requestAnimationFrame loop mutates refs and repaints). Scale comes from:

- **Barnes–Hut quad-tree repulsion**: the many-body force is approximated per cell (accuracy set by a theta threshold), reducing the O(n²) step toward **O(n log n)**, so thousands of nodes stay interactive. Each body's mass is **degree-weighted** and link attraction uses ForceAtlas2's **LinLog** model (a gentle log pull, not Hooke) so hubs spread their neighbours and clusters separate into a neat distribution — no separate community-detection pass, and no central tangle.
- **Collision**: a short-range pass over the same spatial structure keeps nodes from overlapping without scanning every pair.
- **A cooling schedule**: every force scales by a decaying `alpha`; the loop stops once the layout settles (an idle graph costs nothing), and a hard velocity cap keeps it numerically stable instead of exploding.
- **Level-of-detail labels**: only dots when zoomed out; labels fade in past a threshold and for the selection/hover, so text never dominates the frame.

# Client-side filtering and virtualized lists

[Search and filter](../features/search-and-filter.md) operate **purely on the client** over the already-parsed [data model](data-model.md) — no round-trip to the core. Type toggles, text matching, and tag filters are in-memory operations over `concepts`, so results are instant. Sidebar lists (concepts, indexes, search results) are **virtualized**: only visible rows are realized in the DOM, keeping a large bundle's lists scrollable without layout cost. Re-renders are auto-memoized by the [React Compiler](frontend-architecture.md), so a filter change repaints only the rows that actually changed — no hand-tuned `useMemo`/`memo`.

# Budget

Taken together: a few-hundred-concept bundle scans, parses once, and renders interactively in well under a second; subsequent bundle switches and filter operations are effectively instantaneous. Larger bundles degrade gracefully into the canvas/Barnes–Hut path rather than stalling. Performance is exercised by fixtures described in [Testing & Dogfooding](testing.md).
