---
type: Architecture Decision
title: Tech Stack
description: Tauri 2.0 with a Rust core and a web frontend — the chosen stack and the reasoning behind it.
tags: [architecture, decision, tauri, rust]
timestamp: 2026-06-28T12:00:00Z
---

# Decision

Build OKF Viewer on **[Tauri 2.0](../reference/tauri-2.md)**: a **Rust core** for filesystem work and a **web frontend** (HTML/CSS/JS) rendered in the platform's native webview.

# Responsibilities

- **Rust core (`src-tauri/`)** — owns all filesystem access: [bundle detection](bundle-detection.md), [OKF parsing](okf-parsing.md), graph/backlink computation, [validation](../features/validation.md), and the [file watcher](../features/live-reload.md). It exposes a small set of [commands and events](ipc-and-security.md) and hands the frontend ready-to-render JSON ([data model](data-model.md)).
- **Frontend (`src/`)** — owns rendering and interaction: the [graph](../features/graph-view.md), [reader](../features/concept-reader.md), [search/filter](../features/search-and-filter.md), [navigation](../features/navigation.md), and [theming](../ux/theming.md). It holds no filesystem privileges of its own.

# Why Tauri 2.0

- **Cross-platform desktop** from one codebase, with first-class **Windows** and **Linux/Ubuntu** targets (the product requirement), plus macOS for free.
- **Small, fast binaries** using the system webview — no bundled Chromium, unlike Electron. Fits the [self-contained / fast principles](../product/principles.md).
- **Security model** that matches our [read-only, scoped](ipc-and-security.md) needs: explicit capabilities/permissions, no ambient filesystem or network access.
- **Rust** gives us fast directory walking, parsing, and file-watching (via mature crates) without a separate runtime — see [Performance & Scale](performance.md) for how this keeps the app fast end to end.

See also: [Testing & Dogfooding](testing.md) for how the core and frontend are verified.

# Frontend framework (recommended, not yet locked)

- A lightweight reactive framework — **Svelte** (or SolidJS) is preferred for small bundle size and speed; **React** is acceptable if the implementer prefers its ecosystem. How the frontend is organized as a thin client is detailed in [Frontend Architecture](frontend-architecture.md).
- **Graph rendering:** start with SVG + a simple force simulation for small bundles; move to **canvas/WebGL** with a Barnes–Hut force approximation for large ones. A hand-rolled renderer keeps it dependency-light, mirroring the reference HTML visualizer; a library (e.g. a canvas force-graph) is acceptable if it stays offline.
- **Markdown:** a small, well-audited parser, or a hand-rolled renderer for full control over intra-bundle [link resolution](okf-parsing.md).

# Packaging

- Windows: `.msi` and/or NSIS `.exe`. Ubuntu: `.deb` and AppImage. Driven by `tauri build` (see [Tauri 2.0](../reference/tauri-2.md)).
- CI builds per-OS runners; no code signing assumed for v1. Full packaging, versioning, and release details are in [Build & Release](build-and-release.md).
