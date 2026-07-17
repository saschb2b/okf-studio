---
type: Reference
title: How It Compares
description: Where OKF Studio sits relative to the OKF reference visualizer, PKM tools, static-site generators, editors, and agent chat surfaces.
tags: [product, comparison, positioning]
timestamp: 2026-07-13T18:51:16Z
---

# The short version

OKF Studio is a native, offline-capable desktop workspace that autodetects [OKF](../reference/okf-spec-summary.md) bundles, renders their relationship graph, and connects user-chosen agents to bounded context and reviewed writes. Its product boundary is the combination of OKF-aware exploration, creation, research, and transactional review. The reasoning behind that boundary lives in [Design Principles](principles.md) and [Scope & Non-Goals](scope-and-non-goals.md).

# At a glance

| Capability | OKF Studio | OKF reference visualizer | PKM (Obsidian / Notion) | SSG (MkDocs / Hugo) | File tree / editor preview |
| --- | --- | --- | --- | --- | --- |
| OKF-aware (type, frontmatter, conformance) | Yes | Yes | No | No | No |
| Autodetect many bundles in a folder | Yes | No (one file) | No | No | No |
| Force-directed concept graph + backlinks | Yes | Yes | Partial (links, not OKF types) | No | No |
| Tolerant conformance view | Yes | Partial | No | No | No |
| Live local reload, no build/serve step | Yes | No | Partial | No | Partial |
| Native offline desktop | Yes | Browser (single file) | App / cloud | Static output | Editor |
| User-chosen agent connections | ACP, compatible endpoints, local models | No | Product-specific | No | Editor-specific |
| Reviewed OKF creation and enhancement | Staging, validation, diff, apply | No | General note editing | Source editing | Direct file editing |

# Versus the OKF reference visualizer

The OKF reference implementation ships a single-file HTML [visualizer](../reference/okf-reference-visualizer.md): open one bundle in a browser and see its graph. OKF Studio is the native counterpart — it [autodetects many bundles](../features/folder-autodetect.md) across a folder, runs as an installed offline desktop app, and [reloads live](../features/live-reload.md) as files change. The reference visualizer is the right tool for a quick one-bundle look in any browser; OKF Studio is the right tool for working across a folder of bundles over a whole session.

# Versus PKM tools (Obsidian, Notion)

Personal-knowledge tools render markdown and frontmatter and, in Obsidian's case, draw a link graph. But they are not OKF-aware: there is no [type](../reference/okf-spec-summary.md)-colored concept graph, no conformance view, and no notion of a bundle's `index.md` navigation model. They are built for note-taking in their own vault format, not for reading any conformant bundle from any producer. OKF Studio targets the format, not a vault.

# Versus static-site generators (MkDocs, Hugo)

SSGs publish documentation beautifully, but they require a build-and-serve step, produce a static site rather than an interactive [graph](../features/graph-view.md), and offer no live local reload of an arbitrary folder of bundles. They answer "publish these docs for others"; OKF Studio answers "let me explore these bundles right now, offline, with no build."

# Versus a plain file tree or editor preview

A file tree plus an editor's markdown preview shows the files and renders one at a time — but it hides the implicit relationship graph entirely. The links that make a bundle a *graph* stay invisible, and there is no [validation](../features/validation.md) of `type` fields or cross-links. This is the baseline OKF Studio exists to replace.

# Versus a standalone agent chat

A standalone agent can read files and produce text, but the host usually owns the context, permissions, transcript shape, and write behavior. Studio keeps the bundle graph and reader beside the thread, supplies the canonical OKF skill and closed tools where the connection supports them, and routes proposals through visible staging, conformance validation, hunk review, and transactional apply. The user can change the connected agent without changing that workspace contract.

# What OKF Studio uniquely offers

- [Folder autodetect](../features/folder-autodetect.md) of many bundles at once.
- A native desktop workspace whose local read and review loop remains fully offline.
- The force-directed [concept graph](../features/graph-view.md) with "cited by" backlinks.
- Tolerant [validation](../features/validation.md) that surfaces issues without refusing the bundle.
- [Live reload](../features/live-reload.md) with no build or serve step.
- Replaceable external and local agent connections in one docked workspace.
- Source-backed creation, cited research, and reviewed enhancement through the same OKF-aware tools.
