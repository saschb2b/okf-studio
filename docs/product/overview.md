---
type: Product
title: OKF Studio overview
description: A local-first desktop workspace for exploring, creating, curating, and querying connected OKF bundles with user-chosen agents.
tags: [product, vision, desktop]
timestamp: 2026-07-18T20:00:00Z
---

# What it is

OKF Studio is a local-first desktop workspace for [Open Knowledge Format](../reference/okf-spec-summary.md) bundles. Open a folder and it finds every bundle inside (see [Folder Autodetect](../features/folder-autodetect.md)), then renders each as an interactive [graph](../features/graph-view.md) and reader. The [Agent Panel](../features/agent-panel.md) connects an external ACP agent or Studio Agent to explicit, bounded context for research, creation, and reviewed knowledge work.

Folder opening remains read-only. Agent processes and network actions start only when the user chooses them. External agents own their authentication, and Studio requires no account.

Studio extends the reference implementation's single-file HTML visualizer with native folder access, multiple bundles, and live reload.

# The one-liner

> Explore connected knowledge with the agents you already use.

# Who it's for

- **Engineers and data practitioners** who keep table documentation, runbooks, and metric definitions in repository-local OKF bundles and want to explore them without a web server or cloud account.
- **Agent / AI builders** who curate agent-readable knowledge and need to see the relationship graph their agents will traverse.
- **Bundle readers** who receive a repository subdirectory or archive and need to understand it quickly.

See [Personas & Use Cases](personas.md) for these audiences as concrete personas with the jobs they hire the app to do, and [How It Compares](comparison.md) for where it sits against PKM tools, static-site generators, and the OKF reference visualizer.

# Why it exists

OKF is markdown with frontmatter, which makes bundles portable but leaves their relationship graph implicit. Studio makes the graph, backlinks, and progressive-disclosure structure visible, then lets an agent query that knowledge, create a bundle from sources, or propose improvements without moving the work into a separate tool. Proposed files remain staged until validation, review, and an explicit Apply or Create action. The reader still honors OKF's [tolerant-consumer contract](../reference/okf-spec-summary.md) and does not reject a real-world bundle for soft issues.

# How it works at a glance

1. Choose a folder ([First Run](../ux/first-run.md)).
2. The [Rust core](../architecture/tech-stack.md) scans it and [detects bundles](../architecture/bundle-detection.md).
3. Each bundle is [parsed](../architecture/okf-parsing.md) into concepts, links, and backlinks.
4. The frontend renders the [graph](../features/graph-view.md) and [reader](../features/concept-reader.md), with [search](../features/search-and-filter.md), [navigation](../features/navigation.md), and [live reload](../features/live-reload.md).
5. When chosen, the [Agent Panel](../features/agent-panel.md) starts a compatible agent and attaches only the active bundle and explicit sources through the [Agent System](../architecture/agent-system.md).
6. Research stays in the thread; proposed bundle changes enter the staged validation and review flow before any filesystem write.

This product is shaped by its [Design Principles](principles.md) and bounded by its [Scope & Non-Goals](scope-and-non-goals.md). Existing OKF Viewer installations upgrade in place under the deliberately stable identifiers documented in [OKF Viewer to OKF Studio](migration-notes.md).
