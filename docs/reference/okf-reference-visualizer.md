---
type: Reference
title: OKF Reference HTML Visualizer
description: Google's single self-contained HTML consumer that renders any OKF bundle as a force-directed graph — the reference implementation OKF Studio is the native desktop counterpart to.
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

The OKF reference repository ships a **consumer**: a single, self-contained HTML file that renders any OKF [bundle](../reference/okf-spec-summary.md) in a browser. It is the canonical demonstration that an OKF bundle is portable knowledge — point it at a bundle and the same concept files OKF Studio reads come to life with no build step. This is a dated snapshot for implementers; the canonical artifact is in the `resource` above.

# What it does

- **Force-directed graph** — concepts become nodes, laid out by a physics simulation so clusters emerge from the link structure.
- **Type-colored nodes** — each node is colored by its `type`, making the shape of the knowledge legible at a glance.
- **Cross-link edges** — every markdown link from one concept to another is drawn as an edge.
- **"Cited by" backlinks** — for a selected concept, the reverse links (who points *at* it) are listed.
- **Search** — find concepts by title or text.
- **Type filters** — show or hide concepts by `type`.

These are exactly the primitives OKF Studio reuses in its [Graph View](../features/graph-view.md) and [Concept Reader](../features/concept-reader.md).

# Relationship to OKF Studio

OKF Studio is the **native desktop counterpart** to this visualizer — same core idea, expanded:

- **Multi-bundle** — it autodetects every bundle under a chosen folder, not one bundle at a time.
- **Folder-aware** — you point it at a directory; detection and the [bundle browser](../features/folder-autodetect.md) do the rest.
- **Live-reloading** — edits to files on disk reflect in the app, where the HTML file is a static snapshot.
- **Offline-native** — a Tauri desktop app over the system webview, not a page loaded in a browser.
- **Tolerant validation surfaced in-app** — conformance issues are shown, never fatal.

See [Overview](../product/overview.md) for the product, and [Comparison](../product/comparison.md) for the side-by-side against this visualizer and other readers.

# Constraints

The reference visualizer is deliberately minimal:

- **Single bundle** at a time — no folder of bundles.
- **Single HTML file** — the whole consumer is one document.
- **Browser-based** — it runs as a web page, not a desktop app.
- **No live reload** — it renders a static snapshot; re-open to see changes.

# Significance

That a tiny, independent HTML file can faithfully render a bundle authored by an entirely separate producer is the proof of OKF's **producer/consumer independence**: the format, not any one tool, carries the meaning. OKF Studio and this visualizer reading the same bundles is that principle in practice.
