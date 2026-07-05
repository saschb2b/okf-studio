---
type: Proposal
title: Deep Knowledge Diving
description: Where the viewer is thin for going deep into a bundle, and the data-catalog and graph-explorer patterns worth borrowing — framed as the stages of a dive.
tags: [proposal, roadmap, ux, graph, search]
timestamp: 2026-07-04T19:00:00Z
---

# Why this exists

The viewer renders and lets you navigate a bundle well: a [graph](../features/graph-view.md), a [reader](../features/concept-reader.md) with backlinks, an index tree, a [command palette](../features/command-palette.md), fuzzy + full-text [search](../features/search-and-filter.md). What it is thin at is *going deep* — orienting in an unfamiliar bundle, tracing relationships more than one hop, and making sense of the whole.

The sample bundles are data catalogs (BigQuery datasets, tables, metrics, joins), so the tools that already solved deep-diving are close at hand: data catalogs (DataHub, Amundsen, Dataplex), graph explorers (Neo4j Bloom, Gephi), lineage tools (dbt docs), and query UIs (Kibana, Splunk). This proposal maps our gaps to those patterns as the five stages of a dive, and recommends an order.

Everything here holds the [principles](../product/principles.md): offline, read-only, tolerant, keyboard-first, and **not tied to one bundle schema** — so type-aware ideas ride the profile mechanism (as [ODSF](../features/design-system-rendering.md) does for design systems), never a hardcoded ontology.

# The five stages of a dive

## 1. Orient — what's here, where do I start?
A fresh bundle drops you at the root concept beside a dense graph. Catalogs open on a landing page instead.
- **Borrow from:** dataset landing pages (Amundsen/DataHub), repo insights, Gephi centrality.
- **Do:** a [bundle overview and health page](bundle-overview.md) — type distribution, top hubs, orphans, broken links, staleness, largest clusters. Turns "N nodes" into "here are the few that matter and the ones that are broken." Cheap: it's all derivable from data we already compute (degree, types, backlinks, [issues](../features/validation.md)).

## 2. Find — structured search, not just fuzzy
Search is fuzzy title/id/type plus full-text. Catalogs filter by facet.
- **Borrow from:** Kibana/Splunk query bars, DataHub faceted search, GitHub search qualifiers.
- **Do:** a [faceted query bar](faceted-search.md) — `type:Table tag:revenue degree>5` — with facet rails showing counts, filtering graph and reader live. The natural superset of the roadmap's tag-browsing + saved filters.

## 3. Traverse — follow relationships far
Focus mode shows the ego neighborhood; backlinks show one level. Deep diving is multi-hop.
- **Borrow from:** dbt DAG selectors (`+model+`), Neo4j Bloom incremental expand, lineage up/downstream panes.
- **Do:** [lineage and traversal](lineage-and-traversal.md) — expand-neighbors on click, upstream/downstream trees, path-between two concepts, and OKF-flavored *unlinked mentions*. This is the heart of the dive and turns the graph from a picture into a tool.

## 4. Analyze — a second lens, and comparison
Graph-thinkers are served; list-thinkers and comparers are not.
- **Borrow from:** DataGrip/DBeaver object browsers, catalog result grids, schema diff.
- **Do (later):** a tabular lens (every concept a sortable/filterable row), pin-two side-by-side compare, and a change feed off [live reload](../features/live-reload.md) + [log](../features/log-view.md).

## 5. Capture — keep and share the dive
Read-only shouldn't mean leaving empty-handed.
- **Borrow from:** Kibana saved searches, Metabase collections, notebook publishing.
- **Do (later):** a saveable dive trail, bookmarks/collections that filter the graph, and file-based share (static-HTML export, deep-link) — never cloud, per the [non-goals](../product/scope-and-non-goals.md).

# The bigger bet: type-aware aspects

A `Table` renders as generic markdown today; a catalog renders an entity page (schema, lineage, queries, owners). We already have the mechanism to do this without assuming a schema: a **profile**, the way [ODSF](../features/design-system-rendering.md) profiles OKF for design systems. A data-catalog profile could render a `Table`'s columns as a table and a `Metric`'s formula with dependency chips, driven by frontmatter conventions and falling back to plain markdown. Highest ceiling, biggest design commitment — prototype against the `stackoverflow` bundle before committing.

# Recommended order

1. [Bundle overview and health page](bundle-overview.md) — smallest, fixes the cold "where do I start", reuses computed data.
2. [Faceted query bar](faceted-search.md) — catalog-grade browse; folds in planned tag/saved-filter work.
3. [Lineage and traversal](lineage-and-traversal.md) — the actual deep-diving; the graph's next evolution.

1 and 2 are cheap and reuse existing data; 3 is the meatier bet and should follow. The aspect-profile play is a separate, larger track.
