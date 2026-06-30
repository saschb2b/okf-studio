---
type: Product
title: OKF Viewer — Overview
description: A cross-platform desktop app that points at a folder and renders the OKF bundles inside as interactive concept graphs.
tags: [product, vision, desktop]
timestamp: 2026-06-28T12:00:00Z
---

# What it is

OKF Viewer is a small, fast, **offline desktop application** for reading [Open Knowledge Format](../reference/okf-spec-summary.md) bundles. You point it at a folder on disk; it finds every OKF bundle inside (see [Folder Autodetect](../features/folder-autodetect.md)) and renders each as an interactive [graph](../features/graph-view.md) of interconnected concept documents you can browse, search, and read.

It is the desktop counterpart to the single-file HTML visualizer that ships with the OKF reference implementation — but native, multi-bundle, folder-aware, and live-reloading.

# The one-liner

> Point it at a folder. Read your knowledge as a graph.

# Who it's for

- **Engineers and data folks** who keep OKF bundles in their repos (table docs, runbooks, metric definitions) and want to explore them without a web server or a cloud account.
- **Agent / AI builders** who curate agent-readable knowledge and need to see the relationship graph their agents will traverse.
- **Anyone handed a bundle** (a `.tar`, a repo subdirectory) who wants to understand it quickly.

See [Personas & Use Cases](personas.md) for these audiences as concrete personas with the jobs they hire the app to do, and [How It Compares](comparison.md) for where it sits against PKM tools, static-site generators, and the OKF reference visualizer.

# Why it exists

OKF is just markdown files with frontmatter, which makes bundles trivial to produce but hard to *experience* — the relationship graph is implicit in the links, and a file tree hides it. A dedicated viewer makes the graph, the backlinks, and the progressive-disclosure structure visible and navigable, while honoring OKF's [tolerant-consumer contract](../reference/okf-spec-summary.md) so it never refuses a real-world bundle.

# How it works at a glance

1. Choose a folder ([First Run](../ux/first-run.md)).
2. The [Rust core](../architecture/tech-stack.md) scans it and [detects bundles](../architecture/bundle-detection.md).
3. Each bundle is [parsed](../architecture/okf-parsing.md) into concepts, links, and backlinks.
4. The frontend renders the [graph](../features/graph-view.md) + [reader](../features/concept-reader.md), with [search](../features/search-and-filter.md), [navigation](../features/navigation.md), and [live reload](../features/live-reload.md).

This product is shaped by its [Design Principles](principles.md) and bounded by its [Scope & Non-Goals](scope-and-non-goals.md).
