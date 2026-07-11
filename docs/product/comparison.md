---
type: Reference
title: How It Compares
description: Where OKF Studio sits relative to the OKF reference visualizer, PKM tools, static-site generators, and a plain file tree.
tags: [product, comparison, positioning]
timestamp: 2026-07-11T04:45:00Z
---

# The short version

OKF Studio is a native, offline desktop app that autodetects every [OKF](../reference/okf-spec-summary.md) bundle in a folder and renders each as an interactive [concept graph](../features/graph-view.md) with backlinks, tolerant [validation](../features/validation.md), and [live reload](../features/live-reload.md). Several adjacent tools overlap with parts of that, but none cover all of it. This concept positions the product against them; the reasoning behind the boundaries lives in [Design Principles](principles.md) and [Scope & Non-Goals](scope-and-non-goals.md).

# At a glance

| Capability | OKF Studio | OKF reference visualizer | PKM (Obsidian / Notion) | SSG (MkDocs / Hugo) | File tree / editor preview |
| --- | --- | --- | --- | --- | --- |
| OKF-aware (type, frontmatter, conformance) | Yes | Yes | No | No | No |
| Autodetect many bundles in a folder | Yes | No (one file) | No | No | No |
| Force-directed concept graph + backlinks | Yes | Yes | Partial (links, not OKF types) | No | No |
| Tolerant conformance view | Yes | Partial | No | No | No |
| Live local reload, no build/serve step | Yes | No | Partial | No | Partial |
| Native offline desktop | Yes | Browser (single file) | App / cloud | Static output | Editor |

# Versus the OKF reference visualizer

The OKF reference implementation ships a single-file HTML [visualizer](../reference/okf-reference-visualizer.md): open one bundle in a browser and see its graph. OKF Studio is the native counterpart — it [autodetects many bundles](../features/folder-autodetect.md) across a folder, runs as an installed offline desktop app, and [reloads live](../features/live-reload.md) as files change. The reference visualizer is the right tool for a quick one-bundle look in any browser; OKF Studio is the right tool for working across a folder of bundles over a whole session.

# Versus PKM tools (Obsidian, Notion)

Personal-knowledge tools render markdown and frontmatter and, in Obsidian's case, draw a link graph. But they are not OKF-aware: there is no [type](../reference/okf-spec-summary.md)-colored concept graph, no conformance view, and no notion of a bundle's `index.md` navigation model. They are built for note-taking in their own vault format, not for reading any conformant bundle from any producer. OKF Studio targets the format, not a vault.

# Versus static-site generators (MkDocs, Hugo)

SSGs publish documentation beautifully, but they require a build-and-serve step, produce a static site rather than an interactive [graph](../features/graph-view.md), and offer no live local reload of an arbitrary folder of bundles. They answer "publish these docs for others"; OKF Studio answers "let me explore these bundles right now, offline, with no build."

# Versus a plain file tree or editor preview

A file tree plus an editor's markdown preview shows the files and renders one at a time — but it hides the implicit relationship graph entirely. The links that make a bundle a *graph* stay invisible, and there is no [validation](../features/validation.md) of `type` fields or cross-links. This is the baseline OKF Studio exists to replace.

# What OKF Studio uniquely offers

- [Folder autodetect](../features/folder-autodetect.md) of many bundles at once.
- A native, fully **offline** desktop experience.
- The force-directed [concept graph](../features/graph-view.md) with "cited by" backlinks.
- Tolerant [validation](../features/validation.md) that surfaces issues without refusing the bundle.
- [Live reload](../features/live-reload.md) with no build or serve step.
