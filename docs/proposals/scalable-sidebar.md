---
type: Proposal
title: Scalable Sidebar & Navigation Lenses
description: Replace the single stacked-scroll sidebar with a lens switcher that separates filtering from navigation and keeps large bundles scannable.
status: proposed
tags: [proposal, sidebar, navigation, ux, information-architecture]
timestamp: 2026-06-28T17:00:00Z
---

# The ask

The left [sidebar](../ux/browsing-layout.md) stacks Types, Tags, Index, and a "Subdirectories" section in one vertical scroll. Each grows with the bundle (15 types, 30+ tags, a long index), so it becomes an unscannable scroll nightmare. Two things are wanted: (1) a **scalable** sidebar so these don't all pile into one scroll; (2) "Index" and "Subdirectories" look like a 1:1 copy but probably serve different reading lenses, so offer a **view toggle** (like the Zed IDE's left-dock icon switcher) instead of mixing them.

# Problem — and a correction

The sidebar fuses three different mental models in one scroll and is missing a fourth:

- **Filter** (Types, Tags) — narrow the whole bundle to a subset; feeds the [graph](../features/graph-view.md) and dims lists. A faceted-search job.
- **Navigate by curation** (the Index) — follow the author's intended path through `index.md` ([progressive disclosure](../features/navigation.md)).
- **Navigate by structure** (a raw directory tree) — *does not exist today*. The [data model](../architecture/data-model.md) carries only `IndexNode[]` (curated or synthesized index), never a filesystem tree.

**Correction to the premise:** "Subdirectories" is **not a separate panel** — it is a `# Subdirectories` section authored *inside* `index.md`, rendered inline as directory-kind entries (see [OKF parsing](../architecture/okf-parsing.md)). In this bundle it repeats the folders the section headings above already linked, hence the "1:1 copy" feeling. So today it is one curated lens duplicating itself, not two lenses. A genuine structural lens is a deliberate addition — and one that runs against the product's positioning *against* a plain file tree ([How It Compares](../product/comparison.md)).

# Recommendation — a lens switcher + filter/navigate split

- **Activity rail (Zed/Obsidian-style):** a thin icon rail swaps the sidebar body between one lens at a time — **Filter** (Types + Tags), **Navigate / Index** (today's tree), and *optionally* **Files** (a real directory tree, derivable frontend-side from `Concept.id` paths with no new IPC). Active-filter state surfaces as a badge on the Filter icon so hiding a lens never hides that a filter is narrowing the graph.
- **Separate filtering from navigation** so they stop competing for one scroll, while preserving the existing "filter dims the tree" coupling via shared state.
- **Collapsible, count-labeled sections** within a lens, each height-capped with its own scroll and a "show more" tail past ~10–15 items.
- **Search-within-panel:** a small filter box atop each long list (and a tree-filter that keeps matches + their ancestors).
- **Virtualize last, carefully:** only if a lens exceeds a few hundred rows — and note the [index tree](../features/navigation.md)'s roving-tabindex focus currently assumes every row is mounted, so virtualization must track the virtual index, not the DOM.
- **De-duplicate** the index's trailing "Subdirectories" section so the curated lens stops reading as a copy of itself.

# Risks & alignment

- **Fast** ([principle](../product/principles.md)): pure frontend derivation over already-parsed data; no new scan/parse.
- **Progressive disclosure**: a switcher that hides lenses is *more* progressive disclosure — provided the default lens is the Index and the active filter stays discoverable (the rail badge).
- **Keyboard-friendly**: the rail and per-lens widgets must be fully keyboard-operable; focus moves predictably on lens switch.
- **Scope**: a real directory-tree lens is a feature addition that conflicts with [positioning](../product/comparison.md) — make it optional and secondary to the curated index, or drop it and just de-duplicate.

# Definition of done (later)

- One lens visible at a time via an activity rail; selection persists; default = Index.
- Filtering and navigation no longer share a scroll; active-filter state visible from any lens.
- Each long list collapsible, count-labeled, height-capped, with a search-within box (ancestors kept for trees).
- The Index lens no longer reads as a self-duplicate.
- Full keyboard operability retained/extended (`[`/`]` collapse; a key to switch lenses).
- No new IPC/parse cost; optional (behind a decision) a derived file-tree lens beside — never inside — the Index.
