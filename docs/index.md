---
okf_version: "0.1"
---

# OKF Viewer — Product Knowledge Bundle

**OKF Viewer** is a cross-platform desktop app (Windows + Ubuntu) that you point at a folder; it **autodetects the [Open Knowledge Format](reference/okf-spec-summary.md) (OKF) bundles inside** and renders each as an interactive graph of interconnected concept documents. It is built with [Tauri 2.0](reference/tauri-2.md) — a Rust core plus the system webview.

This bundle is the product's source of truth: what it does ([features](features/)), how it feels ([UX](ux/)), and how it is built ([architecture](architecture/)). It also doubles as the app's **built-in sample bundle** — the viewer dogfoods itself by rendering this very directory.

# Product

* [Overview](product/overview.md) - What OKF Viewer is, who it's for, and the one-line pitch.
* [Personas & Use Cases](product/personas.md) - Who it's for, as concrete personas and the jobs they hire it to do.
* [How It Compares](product/comparison.md) - OKF Viewer vs. the reference visualizer, PKM tools, static-site generators, and a file tree.
* [Design Principles](product/principles.md) - The non-negotiables: local-first, vendor-neutral, tolerant, read-only, fast.
* [Scope & Non-Goals](product/scope-and-non-goals.md) - What ships in v1, what comes later, what we will not build.

# Features

* [Folder Autodetect](features/folder-autodetect.md) - Point at a folder; find every OKF bundle inside it.
* [Bundle Switcher](features/bundle-switcher.md) - Top-left switcher for the open bundle, sibling bundles in the folder, and recently-opened bundles.
* [Graph View](features/graph-view.md) - Force-directed graph of concepts, colored by type, linked by cross-references.
* [Concept Reader](features/concept-reader.md) - Rendered markdown with frontmatter, citations, and clickable links.
* [Search & Filter](features/search-and-filter.md) - Full-text search, type filters, and tag browsing.
* [Navigation](features/navigation.md) - Progressive disclosure from index.md, link following, and history.
* [Command Palette](features/command-palette.md) - Jump to any concept and run quick actions from the keyboard.
* [Validation](features/validation.md) - Surface OKF conformance errors and warnings without refusing the bundle.
* [Live Reload](features/live-reload.md) - Watch the folder and refresh the graph as files change.
* [Log View](features/log-view.md) - Render a bundle's log.md as a dated, newest-first change timeline.

# UX

* [First Run](ux/first-run.md) - From empty state to a rendered bundle in two clicks.
* [Empty & Error States](ux/empty-and-error-states.md) - Every no-content, loading, and failure state, and how to recover.
* [Browsing Layout](ux/browsing-layout.md) - The three-pane workspace: sidebar, graph, reader.
* [Keyboard Shortcuts](ux/keyboard-shortcuts.md) - Keys for power users.
* [Theming](ux/theming.md) - Light/dark and the type-color palette.
* [Accessibility](ux/accessibility.md) - Keyboard operability, focus, screen-reader semantics, contrast, and motion.
* [Settings & Preferences](ux/settings.md) - Theme, recent folders, scan tuning, motion, and reset.

# Architecture

* [Tech Stack](architecture/tech-stack.md) - Tauri 2.0, the Rust core, the frontend, and why.
* [Bundle Detection](architecture/bundle-detection.md) - The algorithm that finds OKF bundles in a folder.
* [OKF Parsing](architecture/okf-parsing.md) - How concepts, links, and indexes are parsed.
* [Data Model](architecture/data-model.md) - Bundle, Concept, and Graph shapes shared across the IPC boundary.
* [Frontend Architecture](architecture/frontend-architecture.md) - The frontend as a thin client over the Rust command/event surface.
* [IPC & Security](architecture/ipc-and-security.md) - Tauri commands and the read-only, scoped capability model.
* [Performance & Scale](architecture/performance.md) - How the app stays fast, from the bounded scan to graph rendering.
* [Testing & Dogfooding](architecture/testing.md) - The test strategy — unit tests, golden link tests, validator parity, and fixtures.
* [Build & Release](architecture/build-and-release.md) - Building, per-OS packaging, versioning, and shipping — offline.

# Reference

* [OKF Spec Summary](reference/okf-spec-summary.md) - The v0.1 rules the viewer must honor.
* [OKF Reference HTML Visualizer](reference/okf-reference-visualizer.md) - Google's single-file HTML consumer — the reference this app is the desktop counterpart to.
* [OKF Sample Bundles](reference/okf-sample-bundles.md) - The GA4, Stack Overflow, and Bitcoin bundles used as additional fixtures.
* [Tauri 2.0](reference/tauri-2.md) - Key facts about the framework and its plugins.
* [Glossary](reference/glossary.md) - Terms used across this bundle.

# Proposals

* [Deep Knowledge Diving](proposals/deep-knowledge-diving.md) - Where the viewer is thin for going deep, and the big-data patterns worth borrowing.
* [Bundle Overview & Health](proposals/bundle-overview.md) - A landing view that orients you in a bundle before you dive.
* [Faceted Query Bar](proposals/faceted-search.md) - Structured field queries and facet rails that filter the workspace live.
* [Lineage & Traversal](proposals/lineage-and-traversal.md) - Expand-on-click, upstream/downstream lineage, path-between, and unlinked mentions.

# Subdirectories

* [Product](product/) - Vision, audience, principles, and scope.
* [Features](features/) - One concept per user-facing capability.
* [UX](ux/) - Flows, layout, shortcuts, theming, accessibility, settings.
* [Architecture](architecture/) - How it is built.
* [Reference](reference/) - External specs, the OKF ecosystem, and a glossary.
* [Proposals](proposals/) - Design directions not yet built.
