---
type: Architecture Decision
title: Performance & Scale
description: How the "Fast" principle is achieved end to end, from the bounded directory walk to interactive graph rendering.
tags: [architecture, decision, performance, scale]
generated: { by: claude/unrecorded, at: 2026-06-29T18:00:00Z }
---

# Decision

The [Fast principle](../product/principles.md) is a budget. A bundle of a few hundred concepts must render an interactive graph in **well under a second**, and switching bundles must feel instant. Every stage carries part of that budget: scan, parse, compute, render. The app does not retrofit speed at the end.

# Bounded scan

[Bundle detection](bundle-detection.md) walks the chosen folder depth-first, bounded by a maximum depth and an ignore list (`.git`, `node_modules`, `target`, `dist`, `build`, `.venv`). A large monorepo therefore costs a shallow, pruned traversal, not a full tree crawl. Detection only re-runs on structural changes, not on every keystroke in an editor.

# Heavy work in the core, off the UI thread

The [Rust core](tech-stack.md) does all filesystem and CPU work: directory walking, [OKF parsing](okf-parsing.md), graph construction, and backlink inversion. The webview does none of it. Commands resolve on a worker, so the UI thread stays responsive while the core reads a bundle. The frontend only ever receives ready-to-render JSON ([data model](data-model.md)). It does no filesystem or parsing work.

# Lazy parsing with per-bundle caching

A folder may contain many bundles, but the core parses only the active one. It parses a bundle the first time you open it and **caches the result keyed by root**. Re-selecting a bundle in the [Bundle Switcher](../features/bundle-switcher.md) serves the cached `Bundle` immediately, so switching is instant and costs no re-parse. Detection lists roots cheaply, because it only needs to find one typed concept per candidate. The core holds back the expensive full parse until you open a root.

# Incremental updates on live reload

[Live Reload](../features/live-reload.md) never re-parses a whole bundle for a single edit. A changed concept file re-parses **only that concept**. Backlinks recompute **incrementally**: the core diffs that concept's outbound links against the previous edge set, so only affected `citedBy` lists change. The core also **debounces** watch events. A burst of writes, such as a bulk edit or a `git checkout`, collapses into one coherent update instead of a storm of re-renders.

# Graph rendering strategy

The [graph](../features/graph-view.md) renders on a **canvas**. Node positions and the force simulation stay out of React's render path, where a requestAnimationFrame loop mutates refs and repaints. Scale comes from:

- **Barnes–Hut quad-tree repulsion**: the quad-tree approximates the many-body force per cell, with accuracy set by a theta threshold. That reduces the O(n²) step toward **O(n log n)**, so thousands of nodes stay interactive. Each body carries a **degree-weighted** mass, and link attraction uses ForceAtlas2's **LinLog** model, a gentle log pull rather than Hooke. Hubs therefore spread their neighbours and clusters separate into a neat distribution, with no separate community-detection pass and no central tangle.
- **Collision**: a short-range pass over the same spatial structure keeps nodes from overlapping without scanning every pair.
- **A cooling schedule**: every force scales by a decaying `alpha`. The loop stops once the layout settles, so an idle graph costs nothing. A hard velocity cap keeps the simulation numerically stable instead of letting it explode.
- **Level-of-detail labels**: only dots when zoomed out. Labels fade in past a zoom threshold, and for the selection or hover, so text never dominates the frame.

# Client-side filtering and virtualized lists

[Search and filter](../features/search-and-filter.md) operate **purely on the client** over the already-parsed [data model](data-model.md), with no round-trip to the core. Type toggles, text matching, and tag filters run in memory over `concepts`, so results are instant. Sidebar lists (concepts, indexes, search results) are **virtualized**: the DOM holds only the visible rows, which keeps a large bundle's lists scrollable without layout cost. The [React Compiler](frontend-architecture.md) auto-memoizes re-renders, so a filter change repaints only the rows that changed. The code needs no hand-tuned `useMemo` or `memo`.

# Budget

A few-hundred-concept bundle scans, parses once, and renders interactively in well under a second. Later bundle switches and filter operations are effectively instantaneous. Larger bundles degrade gracefully into the canvas and Barnes–Hut path instead of stalling. Fixtures described in [Testing & Dogfooding](testing.md) exercise performance.
