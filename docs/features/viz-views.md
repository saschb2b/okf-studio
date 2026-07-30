---
type: Feature
title: Visualization Views
description: The graph pane renders one of four visualizations (force-directed graph, treemap, sunburst, or circle packing) with a persisted switcher and shared drill-down.
tags: [feature, visualization, hierarchy, graph]
generated: { by: claude/unrecorded, at: 2026-07-23T22:08:44+02:00 }
---

# What it does

The [graph pane](graph-view.md) is no longer one visualization. A four-way switcher (top-left of the pane, beside the graph's Controls) picks how the pane renders the active bundle:

`Graph`, the force-directed network
: The default: one node per concept, one edge per cross-link. Best for *relationships*, "what connects to what". See [Graph View](graph-view.md).

`Treemap`, nested rectangles
: Hierarchy in 2D. Tile area ∝ content size, so "what's big, what's inside what" reads at a glance. Click a group tile to drill into it.

`Sunburst`, concentric rings
: The same hierarchy in angles and rings. **All** shows every authored generation. Clicking a group re-roots on it, and the center hole returns to the level above.

`Circle packing`, nested circles
: Groups-within-groups as containment. Click a group circle to zoom into it (a smooth scale transition). Click it again to zoom back out a level.

The three space-filling views answer a different question than the graph. They answer **composition and weight** ("where is the bulk of this bundle, how is it organized?") rather than **wiring** ("what cites what?"). Together they make the pane a tool rather than a picture.

# The shared hierarchy

All three space-filling views consume one tree, built per render from the same filtered concept set the graph shows:

- **Structure** starts with concept id paths (`design/color` sits inside the `design` group), with directory labels taken from the bundle's [index nodes](../architecture/data-model.md) when present. Authored index headings can add a semantic generation inside that directory, such as `Features › Open and explore › Graph View`, without changing a concept id or moving its file.
- **Every generation must add meaning.** The index title labels its directory and never becomes a same-name child (`Features › Features`). Empty headings and headings with only one direct concept do not add a ring. Nested concepts retain their physical directory, and cross-directory entries remain references rather than being re-parented for presentation.
- **Authored order is stable.** Semantic groups and their direct concepts follow index order. Undocumented path groups and unclaimed concepts follow deterministically. This keeps the shape steady between sessions and across the treemap, sunburst, and circle-packing views.
- **Size** is the concept body's word count (floored at 1), so tile/arc/circle area means "amount of documented knowledge".
- **Color** is the concept `type` via the same deterministic [type palette](../ux/theming.md) as the graph and badges, so identity follows the entity everywhere. Group shapes stay neutral: structure reads from geometry, not hue.
- **Filters compose**: hidden types and the active tag remove concepts from the tree. A [search query](search-and-filter.md) dims non-matches instead of removing them, so the bundle's shape stays stable while searching.
- **Tolerance**: a bundle whose ids carry no path structure falls back to grouping by `type` (a quiet hint chip says so). A flat single-type bundle still renders one level. Never an error.

# Switching and persistence

- The switcher is an icon segmented control every view renders in the same toolbar spot. `V` cycles the views, and the [command palette](command-palette.md) has a `View: …` action per visualization.
- The toolbar has three regions: per-view controls left, the variant control or breadcrumb centered, the switcher right. Each region lays out independently, so an empty region never shifts the others. That keeps the center **pane**-centered. The cost is a collision once the pane is too narrow for all three. Below roughly 500 CSS pixels of pane width the toolbar becomes a real grid. The pinned pair keeps the top row, and the centered region drops beneath them. The breakpoint is a **container query on the pane**, not the window. A split pane or an open agent panel narrows the pane on its own.
- The choice **persists with the layout**, in the same stored blob as the pane sizes. A user who prefers the treemap gets the treemap on next launch. It never silently resets to the graph. An unknown stored value falls back to it.
- **Drill position survives switching**: the breadcrumb (`Bundle › design › tokens ×`) holds shared state. Drilling into a group in the treemap and switching to sunburst keeps you in that group. Each crumb re-roots. `×` returns to the whole bundle.
- Graph-only chrome (Overview/Focus, link density, defect chips, zoom keys) mounts and unmounts with the graph itself. The other views bring only their breadcrumb.

# Interaction

- **Click a leaf** (a concept) to open it in the [Concept Reader](concept-reader.md), the same shared selection as everywhere else. The selected concept carries an accent ring in the view.
- **Selection focuses the view.** Picking a concept anywhere (sidebar, palette, a reader link) drills the active view to that concept's parent group. That is the graph's recenter-on-select, translated to hierarchies.
- **Click a group** to drill in (treemap and sunburst re-root, circle packing zooms). The centered **breadcrumb** (`All › Design › Tokens`, collapsing a deep trail to `All › … › Tokens`) steps back to any ancestor, and **Alt+↑** drills up one level without reaching for it.
- **All remains complete** in the sunburst. It does not collapse leaves into summary sectors or repeat a parent to fill a ring. Small sectors can omit text, but remain present and inspectable through hover or drill.
- **Hover** for a tooltip card with the name, type, and size as "~N words". The card sits above the chart on its own surface, clamped inside the pane so it never clips at an edge.
- Transitions animate (drill push-in, zoom glide) and respect **reduce motion** ([settings](../ux/settings.md)).

# Labels

Nivo's built-in labels are a fixed 11px. That reads tiny on a big tile and overflows a small one. The views therefore render their own label layers over a shared fitting model (`src/viz/labels.ts`):

- A name renders at the **largest font (10–18px) whose word-wrapped lines fit its shape**. A shape that cannot hold its name stays quiet. The tooltip carries the name, and drilling in reveals more of them, the space-filling twin of the graph's level-of-detail labels.
- **Fill luminance picks the ink**: dark ink on light type colors, light ink on dark. Labels therefore never wash out. Label text wears ink tokens, never the series color.
- The **sunburst rotates each label to its arc**: tangential on wide sectors, radial on thin slivers. The far half flips so nothing reads upside-down. Horizontal text only suits a ring near 12/6 o'clock.
- Labels appear only when their sector can contain them. This follows the area-threshold treatment in the [D3 zoomable sunburst](https://observablehq.com/notebook-kit/ex/d3/zoomable-sunburst). Unlabeled concepts remain available through the tooltip and click target.

# Implementation notes

- The views render with [nivo](https://nivo.rocks) (`@nivo/treemap`, `@nivo/sunburst`, `@nivo/circle-packing`, with [d3-hierarchy partition](https://d3js.org/d3-hierarchy/partition) underneath and react-spring transitions) rather than a bespoke renderer. The partition layout assigns one annular generation per actual tree depth. Studio's job is therefore to give it an honest tree. The nivo chunk (~55 KB gzip, shared by all three) is **lazy-loaded** on first use. The default graph path therefore stays as lean as before, the same pattern as the on-demand GPU renderer.
- The pane host (`VizPane`) owns the tree build, drill state, selection/dim wiring, and chrome. Each view is a pure chart over that contract, and that contract is what lets drill position survive view switches.
- Theme colors cross into nivo as resolved values, because its theme object is plain JS and not CSS-variable-aware. A `data-theme` observer on the document root re-reads them, so they stay in step with theme flips.
- Two nivo quirks are worth knowing. Custom layers receive **un-zoomed** node positions in the circle packing, so Studio re-derives the zoom transform from the root circle's geometry. The themed tooltip container paints no background behind custom tooltips, hence the app-owned tooltip card.
