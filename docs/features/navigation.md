---
type: Feature
title: Navigation
description: Move through a bundle by progressive disclosure — the index tree, link following, and back/forward history.
tags: [feature, navigation]
generated: { by: claude/unrecorded, at: 2026-07-29T14:42:58+02:00 }
---

# What it does

Provides the ways to move through a bundle that complement the [graph](graph-view.md): a structured tree, link following, and history.

# Index tree (progressive disclosure)

- The sidebar's **Navigate lens** renders the bundle's `index.md` hierarchy: the root index's sections and links, descending into sub-directory `index.md` files on expand. A [lens switcher](../ux/browsing-layout.md) keeps this separate from the type/tag [filters](search-and-filter.md) so neither crowds the other at scale.
- A root section that points into one indexed folder uses that folder's own authored sections for its visible children. The section remains a link to the folder home. Headings such as **Open and explore**, **Curate connected knowledge**, and **Work with agents** group the concept rows below it. Parent-only entries remain visible at the end. This keeps the sidebar, [treemap, sunburst, and circle packing](viz-views.md) aligned without changing concept ids or paths.
- This mirrors OKF's intended navigation, where an agent or human "decides where to descend without reading every file." When an `index.md` is missing, Studio **synthesizes** one from the directory's concepts (the spec permits this). Studio marks it with a quiet *auto* word (tooltip explains) rather than a badge.
- A directory that holds **no concepts at all** (companion assets like `styles/*.css`, or genuinely empty) still expands. It opens into a one-line note, "No concepts in this folder", per the [report-never-refuse stance](../ux/empty-and-error-states.md). Silently adding zero rows read as a dead click.
- **The tree reveals the active concept.** Select from anywhere, a graph node, the [launcher](command-palette.md), or a [reader](concept-reader.md) link. The tree expands the directory chain leading to that concept and scrolls its row into view, so it always answers "where does this live in the bundle?". It only ever expands. It never re-folds what the user collapsed.
- **An index that links back up does not open a second copy of itself.** Folder indexes routinely end with a "See also" tail pointing at the parent's `index.md`. Studio reads a link to a reserved `index.md` as a directory entry, so parent and child point at each other. A directory row whose folder is already an ancestor of that row keeps its label and still opens the folder home. It loses only its twisty, instead of nesting the ancestor beneath itself. Following those entries blindly made the reveal walk bounce parent to child to parent. The stack overflowed and the window came up blank.
- **Directory rows carry a concept count**, right-aligned and dim. It shows how much bundle lives behind each fold, before descending. The count owns the row's right column alone, so counts line up down the tree whatever the folder names are. The *auto* marker sits beside the folder's name instead, because it describes that name (Studio inferred this index rather than reading an authored one) and does not belong in the numeric column. Sharing the right edge ran the two together as one token, `auto 8`. It also moved the marker between adjacent rows depending on whether that row happened to have a count.
- **Rows that open a folder home all look the same when current.** The bundle root, a folder-door section heading, and a directory row are three ways to reach the same kind of destination. So they share one accent wash. A selected *concept* is a different state and keeps the solid accent fill: a folder location reads as "you are here", a document reads as "selected". Every row also opens with a fixed-width glyph slot (twisty, type dot, or house), so labels start at the same x whatever kind of row it is.
- **The search field says what it does, not how.** The full field syntax (`type:Table`, `tag:revenue`, `degree>5`, `is:orphan`, `has:broken`) lives in the field's tooltip and in [search and filter](search-and-filter.md). A placeholder that spelled it out did not fit the sidebar's default width, so it always rendered clipped mid-word and taught a fragment.
- The sidebar search and [filters](search-and-filter.md) **dim** tree entries they exclude rather than hiding them. Sometimes *nothing* listed in the index survives, because a query can match concepts an index never lists. The tree then says so instead of dead-ending. A quiet notice reports either that nothing matches, or that N concepts match elsewhere. An **Open full search** action opens the [launcher](command-palette.md) seeded with the same query.

# Link following & history

- Clicking any intra-bundle link (in the [reader](concept-reader.md), the index, or the relationship lists) navigates to that concept and recenters the [graph](graph-view.md).
- Back / forward history (with [keyboard shortcuts](../ux/keyboard-shortcuts.md)) retraces the path through the graph, like a browser, and **per tab** (below).
- The [global launcher](command-palette.md) resolves a concept by id, title, or body text and jumps to it.

# Tabs & windows (multi-view)

Reading is no longer one-concept-at-a-time (see the [multi-view proposal](../proposals/multi-view.md) for the design rationale):

- **`Ctrl/Cmd+click` any concept target** to open it in a **new background tab** (add `Shift` to also switch). A target is a reader body link, a rail relationship row, an index-tree row, a graph node, or a launcher result. Middle-click does the same on body links. Each tab owns its **own back/forward history**. A tab strip appears above the reader at two or more tabs and stays out of the way otherwise (see [Browsing Layout](../ux/browsing-layout.md)).
- **Peek before you open.** Dwell on a reader link or rail row, or focus it by keyboard, and a small **peek card** shows its type, title, description, and first lines. You can judge whether a target is worth opening, or worth a tab, without leaving the page. See the [multi-view proposal](../proposals/multi-view.md).
- Plain clicks keep today's behavior exactly: they navigate the **current tab**, and selection stays one shared state per window.
- **Move to new window** (the strip's trailing control, or the launcher action) undocks a tab into its **own OS window**, running the full app on the same bundle. That is the browser tear-off. Windows are independent, and [live reload](live-reload.md) reaches all of them.
- `Ctrl/Cmd+T` opens a new empty tab, `Ctrl/Cmd+W` closes, and `Ctrl+Tab` cycles. Middle-click closes a tab. Switching bundles resets the tabs, and a live reload keeps them.

# Breadcrumb

- The current concept shows its path (e.g. `tables / orders`) as a breadcrumb, each segment linking to the corresponding index level.

Selection is a single shared state: the [sidebar](../ux/browsing-layout.md), graph, and reader always agree on the active concept.
