---
type: Proposal
title: Faceted Query Bar
description: Structured filtering over a bundle — field queries like `type:Table tag:revenue degree>5` and facet rails with counts — that filter the graph and reader live.
tags: [proposal, search, filter, facets]
generated: { by: claude/unrecorded, at: 2026-07-04T19:00:00Z }
---

# Problem

[Search & Filter](../features/search-and-filter.md) today is fuzzy match on title/id/type plus full-text on body, with per-type hide toggles. That finds *a* concept well. It does not answer "show me every `Table` tagged `revenue` with more than five links", the browse-by-facet motion that data catalogs build on. See [Deep Knowledge Diving](deep-knowledge-diving.md), stage 2.

# What it is

A **query bar** with a small, discoverable field grammar, plus **facet rails** that show the values present and their counts. Together they narrow the bundle to a working set that the [graph](../features/graph-view.md), reader, and index all reflect at once.

## The grammar

Space-separated terms, ANDed. Bare words are full-text. Fields map to the [data model](../architecture/data-model.md):

- `type:Table`: concept type (repeat to OR: `type:Table type:View`).
- `tag:revenue`: a tag.
- `degree>5`, `links>2`, `citedBy=0`: numeric comparisons on connectivity (`citedBy=0` is the orphan or leaf query).
- `has:brokenLinks`, `is:orphan`: computed predicates.
- `"exact phrase"`: quoted full-text.

Unknown fields fall back to full-text rather than erroring, which is the [tolerant-consumer](../product/principles.md) stance. The bar autocompletes field names and known values.

## The facet rails

A quiet side rail lists the **Types** and **Tags** present in the current result set. Each value shows a count and toggles its term in the query. Clicking a type in the [overview](bundle-overview.md)'s composition chart drops you here pre-filtered. This is the visible, browsable face of the same query.

# How it filters

One filter state drives the whole workspace, extending today's `hiddenTypes` and `activeTag`. The graph renders only matching nodes and their induced edges, the index tree dims non-matches, and a result count shows. It composes with the [command palette](../features/command-palette.md) rather than replacing it. The palette stays the keyboard jump-to-concept.

# Saved views

A named query is a **saved view** (the roadmap's "saved filters"): persisted per bundle, restorable in a click. This is where a dive's setup becomes reusable.

# Why it fits

It generalizes existing state (type filters, tag filter) into one coherent model, reuses the parsed fields, and needs no backend. It is the browse layer catalogs assume and we lack. It is also the entry point for a [tabular lens](deep-knowledge-diving.md) later, which is the same result set as rows.
