---
type: Feature
title: Visualization Views
description: The graph pane renders one of four visualizations (force-directed graph, treemap, sunburst, or circle packing) with a persisted switcher and shared drill-down.
tags: [feature, visualization, hierarchy, graph]
timestamp: 2026-07-08T14:30:00Z
---

# What it does

The [graph pane](graph-view.md) is no longer one visualization. A four-way switcher (top-left of the pane, beside the graph's Controls) picks how the active bundle is rendered:

`Graph`, the force-directed network
: The default: one node per concept, one edge per cross-link. Best for *relationships*, "what connects to what". See [Graph View](graph-view.md).

`Treemap`, nested rectangles
: Hierarchy in 2D. Tile area ∝ content size, so "what's big, what's inside what" reads at a glance. Click a group tile to drill into it.

`Sunburst`, concentric rings
: The same hierarchy in angles and rings: the whole bundle at once when depth is limited. Click a ring segment to re-root on it (an animated push-in); the center hole names the current root and clicks back up a level.

`Circle packing`, nested circles
: Groups-within-groups as containment. Click a group circle to zoom into it (a smooth scale transition); click it again to zoom back out a level.

The three space-filling views answer a different question than the graph: **composition and weight** ("where is the bulk of this bundle, how is it organized?") rather than **wiring** ("what cites what?"). Together they make the pane a tool, not just a picture.

# The shared hierarchy

All three space-filling views consume one tree, built per render from the same filtered concept set the graph shows:

- **Structure** comes from concept id paths (`design/color` sits inside the `design` group), with directory labels taken from the bundle's [index nodes](../architecture/data-model.md) when present, else prettified from the path segment.
- **Size** is the concept body's word count (floored at 1), so tile/arc/circle area means "amount of documented knowledge".
- **Color** is the concept `type` via the same deterministic [type palette](../ux/theming.md) as the graph and badges, so identity follows the entity everywhere. Group shapes stay neutral: structure reads from geometry, not hue.
- **Filters compose**: hidden types and the active tag remove concepts from the tree; a [search query](search-and-filter.md) dims non-matches instead of removing them, so the bundle's shape stays stable while searching.
- **Tolerance**: a bundle whose ids carry no path structure falls back to grouping by `type` (a quiet hint chip says so); a flat single-type bundle still renders one level. Never an error.

# Switching and persistence

- The switcher is an icon segmented control every view renders in the same toolbar spot; `V` cycles the views, and the [command palette](command-palette.md) has a `View: …` action per visualization.
- The choice **persists with the layout** (the same stored blob as the pane sizes), so a user who prefers the treemap gets the treemap on next launch. It never silently resets to the graph; an unknown stored value falls back to it.
- **Drill position survives switching**: the breadcrumb (`Bundle › design › tokens ×`) is shared state, so drilling into a group in the treemap and switching to sunburst keeps you in that group. Each crumb re-roots; `×` returns to the whole bundle.
- Graph-only chrome (Overview/Focus, link density, defect chips, zoom keys) mounts and unmounts with the graph itself; the other views bring only their breadcrumb.

# Interaction

- **Click a leaf** (a concept) to open it in the [Concept Reader](concept-reader.md), the same shared selection as everywhere else; the selected concept carries an accent ring in the view.
- **Selection focuses the view**: picking a concept anywhere (sidebar, palette, a reader link) drills the active view to that concept's parent group, the graph's recenter-on-select translated to hierarchies.
- **Click a group** to drill in (treemap/sunburst re-root; circle packing zooms).
- **Hover** for a tooltip card (name, type, and size as "~N words") on its own elevated surface, clamped inside the pane so it never clips at an edge.
- Transitions animate (drill push-in, zoom glide) and respect **reduce motion** ([settings](../ux/settings.md)).

# Labels

Nivo's built-in labels are a fixed 11px, which reads teeny on a big tile and overflows a small one, so the views render their own label layers over a shared fitting model (`src/viz/labels.ts`):

- A name renders at the **largest font (10–18px) whose word-wrapped lines fit its shape**; a shape that can't hold its name stays quiet (the tooltip carries it, and drilling in reveals more names, the space-filling twin of the graph's level-of-detail labels).
- **Ink is picked by fill luminance** (dark ink on light type colors, light ink on dark), so labels never wash out; label text wears ink tokens, never the series color.
- The **sunburst rotates each label to its arc**, tangential on wide sectors and radial on thin slivers, flipped on the far half so nothing reads upside-down. Horizontal text only suits a ring near 12/6 o'clock.

# Implementation notes

- Rendered with [nivo](https://nivo.rocks) (`@nivo/treemap`, `@nivo/sunburst`, `@nivo/circle-packing`; d3-hierarchy underneath, react-spring transitions) rather than a bespoke renderer: these are solved, polished chart forms, and the interesting work is the shared tree/drill model, not rectangle math. The nivo chunk (~55 KB gzip, shared by all three) is **lazy-loaded** on first use, so the default graph path stays as lean as before, the same pattern as the on-demand GPU renderer.
- The pane host (`VizPane`) owns the tree build, drill state, selection/dim wiring, and chrome; each view is a pure chart over that contract, which is what lets drill position survive view switches.
- Theme colors cross into nivo as resolved values (its theme object is plain JS, not CSS-variable-aware), re-read via a `data-theme` observer on the document root so they stay in step with theme flips.
- Two nivo quirks worth knowing: custom layers receive **un-zoomed** node positions in the circle packing (the zoom transform is re-derived from the root circle's geometry), and the themed tooltip container paints no background behind custom tooltips (hence the app-owned tooltip card).
