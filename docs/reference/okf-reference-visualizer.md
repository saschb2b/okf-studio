---
type: Reference
title: OKF Reference HTML Visualizer
description: Google's single self-contained HTML consumer that renders any OKF bundle as a force-directed graph: the reference implementation OKF Studio is the native desktop counterpart to.
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
tags: [reference, okf, visualizer, consumer, external]
generated: { by: claude/unrecorded, at: 2026-07-11T04:45:00Z }
sources:
  - resource: "https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf"
    title: OKF reference repository (okf subdirectory)
  - resource: ../reference/okf-spec-summary.md
    title: OKF Spec Summary
---

# Summary

The OKF reference repository ships a consumer: a single, self-contained HTML file that renders any OKF [bundle](../reference/okf-spec-summary.md) in a browser. It shows that an OKF bundle is portable knowledge. Point it at a bundle and the same concept files OKF Studio reads come to life, with no build step. This page is a dated snapshot for implementers, and the `resource` field holds the canonical artifact.

# What it does

- **Force-directed graph**: concepts become nodes, laid out by a physics simulation so clusters emerge from the link structure.
- **Type-colored nodes**: each node takes its color from its `type`, which makes the shape of the knowledge legible at a glance.
- **Cross-link edges**: every markdown link from one concept to another becomes an edge.
- **"Cited by" backlinks**: a selected concept lists its reverse links, meaning who points *at* it.
- **Search**: find concepts by title or text.
- **Type filters**: show or hide concepts by `type`.

These are exactly the primitives OKF Studio reuses in its [Graph View](../features/graph-view.md) and [Concept Reader](../features/concept-reader.md).

# Relationship to OKF Studio

OKF Studio is the native desktop counterpart to this visualizer. Same core idea, expanded. The visualizer is deliberately minimal, and each of its limits is where Studio goes further.

| | Reference visualizer | OKF Studio |
|---|---|---|
| Scope | one bundle at a time | autodetects every bundle under a chosen folder |
| Input | a bundle you open directly | a directory, where detection and the [bundle browser](../features/folder-autodetect.md) do the rest |
| Freshness | a static snapshot, so re-open it to see changes | edits on disk reflect in the app |
| Runtime | a web page, and the whole consumer is one HTML document | a Tauri desktop app over the system webview |

Studio also surfaces conformance issues in the app and never treats them as fatal.

See [Overview](../product/overview.md) for the product, and [Comparison](../product/comparison.md) for the side-by-side against this visualizer and other readers.

# Why it matters

A tiny, independent HTML file renders a bundle that an entirely separate producer authored. That is the proof of OKF's producer and consumer independence: the format carries the meaning, not any one tool. OKF Studio and this visualizer read the same bundles, which is that principle in practice.
