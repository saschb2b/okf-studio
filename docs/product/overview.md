---
type: Product
title: OKF Studio — Overview
description: A local-first desktop workspace for exploring connected OKF bundles with optional agent assistance.
tags: [product, vision, desktop]
timestamp: 2026-07-12T00:00:00Z
---

# What it is

OKF Studio is a local-first desktop workspace for [Open Knowledge Format](../reference/okf-spec-summary.md) bundles. Open a folder and it finds every bundle inside (see [Folder Autodetect](../features/folder-autodetect.md)), then renders each as an interactive [graph](../features/graph-view.md) and reader. The optional [Agent Panel](../features/agent-panel.md) connects a compatible ACP agent to the active bundle with explicit, bounded context for research and proposed knowledge work.

Folder opening remains read-only. Agent processes and network actions start only when the user chooses them. External agents own their authentication, and Studio requires no account.

It is the desktop counterpart to the single-file HTML visualizer that ships with the OKF reference implementation — but native, multi-bundle, folder-aware, and live-reloading.

# The one-liner

> Explore connected knowledge with the agents you already use.

# Who it's for

- **Engineers and data folks** who keep OKF bundles in their repos (table docs, runbooks, metric definitions) and want to explore them without a web server or a cloud account.
- **Agent / AI builders** who curate agent-readable knowledge and need to see the relationship graph their agents will traverse.
- **Anyone handed a bundle** (a `.tar`, a repo subdirectory) who wants to understand it quickly.

See [Personas & Use Cases](personas.md) for these audiences as concrete personas with the jobs they hire the app to do, and [How It Compares](comparison.md) for where it sits against PKM tools, static-site generators, and the OKF reference visualizer.

# Why it exists

OKF is markdown with frontmatter, which makes bundles portable but leaves their relationship graph implicit. Studio makes the graph, backlinks, and progressive-disclosure structure visible, then lets an agent research that same scoped knowledge without moving it into a separate tool. The reader still honors OKF's [tolerant-consumer contract](../reference/okf-spec-summary.md) and does not reject a real-world bundle for soft issues.

# How it works at a glance

1. Choose a folder ([First Run](../ux/first-run.md)).
2. The [Rust core](../architecture/tech-stack.md) scans it and [detects bundles](../architecture/bundle-detection.md).
3. Each bundle is [parsed](../architecture/okf-parsing.md) into concepts, links, and backlinks.
4. The frontend renders the [graph](../features/graph-view.md) + [reader](../features/concept-reader.md), with [search](../features/search-and-filter.md), [navigation](../features/navigation.md), and [live reload](../features/live-reload.md).
5. When chosen, the [Agent Panel](../features/agent-panel.md) starts a compatible agent and attaches only the active bundle and explicit sources through the [Agent System](../architecture/agent-system.md).

This product is shaped by its [Design Principles](principles.md) and bounded by its [Scope & Non-Goals](scope-and-non-goals.md).
