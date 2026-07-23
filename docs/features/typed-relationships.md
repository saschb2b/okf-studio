---
type: Feature
title: Typed Relationships
description: Add profile-defined meaning to portable Markdown links, then inspect and filter those connections without hiding unknown annotations.
tags: [feature, relationships, profiles, graph, reader, portability]
timestamp: 2026-07-23T15:15:00Z
---

# User job

A maintainer wants to distinguish evidence, dependency, ownership, supersession, and producer-specific connections without replacing ordinary OKF links with an application-only graph model. A reader wants to see that meaning beside a concept and isolate every connection of one type in the graph.

# Portable annotation

The [Advisory Profile Contract](../reference/advisory-profile-contract.md) defines the optional concept map:

```yaml
relationships:
  com.example.knowledge:
    supports: [features/graph-view]
```

The namespace selects a declared profile and the type selects one relationship definition inside its descriptor. Each target is a bundle concept ID. The concept body still contains an ordinary Markdown link to the target. That prose link remains the portable graph edge for consumers that do not understand the profile; the annotation only adds a label and optional inverse.

# Reader inspection

The Concept Reader shows outgoing and incoming typed relationships in its context rail. Known types use their profile label and inverse. An unknown profile or type remains visible under its authored name with an **Unknown type** marker. Missing targets and annotations without a matching prose link stay visible with exact status markers instead of becoming navigable phantom edges.

Selecting a valid row opens the other concept through the same tab and peek behavior as ordinary relationship rows. The raw `relationships` map also remains in the [Metadata Inspector](metadata-inspector.md).

# Agent context

Create, Revise, Audit, and migration tasks receive a bounded projection of the authored typed edges alongside the selected profile vocabulary. The reviewed context card states how many edges will enter the task. Each projected edge preserves its endpoints, namespace, type, display label, optional inverse, recognition state, target state, and portable-link state so an agent can distinguish supported semantics from producer-specific annotations without treating either as core conformance.

# Graph filter

When the active bundle has portable typed edges, the graph toolbar offers **Filter by relationship type**. Each option names the resolved label, marks unknown types, and shows its annotation count. Selecting one isolates the participating source and target concepts through the existing bounded graph restriction; the active chip clears the filter. The underlying graph still comes from Markdown links.

# Diagnostics and limits

Rust resolves annotations in the grant-checked local profile report. It returns the source, target, namespace, type, label, inverse, recognition state, target state, and portable-link state. It reads at most 64 annotations per concept and 4,096 per report.

Malformed maps, duplicate annotations, unavailable profiles, unknown types, missing targets, and missing prose links produce advisory profile diagnostics. They do not enter core OKF validation, and missing relationship metadata never invalidates or hides an ordinary Markdown link.

Related behavior: [Advisory Profiles](advisory-profiles.md), [Concept Reader](concept-reader.md), [Graph View](graph-view.md), [Validation](validation.md), and [Lineage](../proposals/lineage-and-traversal.md).
