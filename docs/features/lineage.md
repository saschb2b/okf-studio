---
type: Feature
title: Lineage
description: Trace filtered dependencies and downstream impact across bounded hops, then explain how any two concepts connect.
tags: [feature, graph, traversal, lineage, relationships, reliability]
timestamp: 2026-07-23T16:45:00Z
---

# User job

A reader needs to answer questions that one-hop backlinks cannot: what does this concept depend on, what could it affect, and how does it connect to another concept? The right-docked Lineage panel keeps the active concept in view while presenting a structured traversal for readers who need names and reasons rather than only a graph picture.

# Filters

One control set applies to both lineage trees and path search:

- **Direction** selects upstream dependencies, downstream impact, or both. Upstream follows links from the active concept; downstream follows concepts that cite it.
- **Relationship** selects all relationships, portable Markdown links, or one namespaced type from the active [Advisory Profiles](advisory-profiles.md). Known and unknown relationship types remain selectable.
- **Reliability** selects every state, only current concepts, or concepts that need caution. The state is derived from [Reliability and Lifecycle](reliability-and-lifecycle.md) metadata and remains advisory; it is not an OKF validity judgment.

Portable links remain complete when no profile is declared or a profile report is unavailable. A typed relationship can add a label and inverse to a portable link. Metadata-only or missing-target annotations remain visible as warnings instead of becoming hidden graph authority.

# Traversal states and bounds

Each tree row names the concept, relationship label, and derived reliability state. Incoming rows use the profile's inverse label when one exists. Traversal uses deterministic title and identity ordering with these fixed ceilings:

| Bound | Limit | Visible result |
| --- | --- | --- |
| Depth | 6 hops | The last expanded row says how many relationships were omitted by the depth limit. |
| Distinct expanded concepts | 200 per tree | The row where the budget stops names the omitted count. |
| Relationships from one hub | 40 | The hub says that its local limit was reached and names the omitted count. |
| Path search | 1,000 visited concepts | Search reports the inspected count and asks for narrower filters or a closer target. |

A relationship that returns to an ancestor renders as **Cycle**. A diamond branch already expanded elsewhere renders as **Shown**. These reference leaves do not expand again or inflate the distinct-concept count. A typed relationship whose target is absent renders a disabled **Missing target** row. No cycle, hub, missing target, or budget stop looks like a complete dead end.

# Explained paths

The target picker finds the shortest route under the current direction, relationship, and reliability filters. Each step names whether the traversal followed an outgoing or incoming edge and shows its relationship label, for example `Outgoing · Supports` or `Incoming · Supported by`. If no route matches, the panel says that the result is filter-specific rather than claiming the concepts are globally disconnected.

The path engine uses breadth-first search, keeps the same typed-edge overlay as the trees, and never visits a missing concept. Selecting any real row or path step opens that concept through the workspace's shared navigation.

# Unlinked mentions

The final section retains the existing bounded discovery signal: another concept's complete title appears in the active description or body but is not linked. It uses case-insensitive whole-title matching, excludes short names and existing links, and makes no semantic claim beyond the literal mention.

# Security and failure states

Lineage is a pure frontend derivation over the already parsed, folder-grant-bound `Bundle` and bounded profile report. It performs no filesystem read, network request, agent action, or write. Profile loading and failure are explicit; portable traversal continues. Missing active concepts render an instruction state. Empty filtered sections name the filter result rather than showing an ambiguous blank panel.

# Verification

Pure tests cover upstream and downstream chains, shortest paths, cycle references, diamond reuse, depth, hub and node budgets, typed filters, missing targets, reliability filters, directed path explanations, and exhausted path search. Story states cover the complete filter and path flow, caution-only empty results, and the narrow dock. A full-app journey opens the panel from the status bar, selects a typed relationship, explains a path, changes direction, and verifies the resulting empty state.

Related behavior: [Concept Reader](concept-reader.md), [Typed Relationships](typed-relationships.md), [Graph View](graph-view.md), [Navigation](navigation.md), and the original [Lineage & Traversal proposal](../proposals/lineage-and-traversal.md).
