---
type: Proposal
title: Bundle Overview and Health (superseded)
description: The original inventory-dashboard proposal, superseded by a working Home for activity, resumption, attention, and repository changes.
tags: [proposal, ux, orientation, overview]
generated: { by: claude/unrecorded, at: 2026-07-23T20:25:48+02:00 }
---

# Status

Superseded by [Bundle Home](../features/bundle-home.md). The original implementation shipped as an orientation dashboard, then became redundant. Bundle identity moved to Bundle details, and the graph, filter, validation, and Git surfaces matured. The record below preserves the earlier rationale.

# Problem

Opening a bundle drops you at the root concept next to a force-directed [graph](../features/graph-view.md). For a bundle you don't know, that answers neither "what's in here?" nor "where do I start?". Data catalogs never open on a raw graph. They open on a landing page that summarizes the asset. See [Deep Knowledge Diving](deep-knowledge-diving.md), stage 1.

# What it is

An **Overview**: a peer of the graph and reader that summarizes the open bundle and links straight into it. It is the default landing for a freshly opened bundle. The graph and reader stay one click away, and remain the home once you've oriented.

Sections, each a compact card, every item a link that selects the concept (or applies a filter):

- **At a glance**: concept count, distinct [types](../ux/theming.md), tag count, `okf_version`/confidence, last-updated (newest concept `timestamp`).
- **Composition**: type distribution as a small bar/treemap, each type a filter into the [faceted view](faceted-search.md).
- **Hubs**: the most-connected concepts (highest `degree`), the natural entry points.
- **Loose ends**: **orphans** (no links in or out) and near-orphans, the concepts the graph buries.
- **Health**: [validation](../features/validation.md) issue counts, **broken links**, and **staleness** (oldest `timestamp`s), so a bundle's rough edges are visible before you trust it.
- **Recently changed** *(optional)*: newest concepts by `timestamp`. Pairs later with a [live-reload](../features/live-reload.md) change feed.

# Why it's cheap

Everything here already exists on the [data model](../architecture/data-model.md): `degree`, `type`, `tags`, `timestamp`, `links`/`citedBy`, `brokenLinks`, and bundle `issues`. The view is a read-side aggregation over the parsed bundle, with no new backend and no new IPC. It is pure derived state, computed in the frontend.

# UX shape

- A third layout target next to the graph and reader (or a panel the sidebar's Index lens can toggle to). Reachable from the [command palette](../features/command-palette.md) and a shortcut.
- Report-never-refuse: an empty or one-concept bundle still renders, saying so plainly.
- Keyboard-first: every card's items are focusable links. Numbers and arrows move through them.
- Respects [reduce-motion](../ux/accessibility.md). The distribution chart follows the type [palette](../ux/theming.md) (see the [dataviz](../ux/theming.md) discipline for color).

# Non-goals

Not analytics-for-analytics' sake: every number is a **door** (a link or filter), not a vanity metric. No time-series, no external data. It summarizes what the bundle already says about itself.
