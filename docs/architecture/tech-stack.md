---
type: Architecture Decision
title: Tech Stack
description: Tauri 2.0 with a Rust core and a React + TypeScript frontend — the chosen stack and the reasoning behind it.
tags: [architecture, decision, tauri, rust, react, typescript]
timestamp: 2026-07-13T19:21:18Z
---

# Decision

Build OKF Studio on **[Tauri 2.0](../reference/tauri-2.md)**: a **Rust core** for filesystem work and a **React + TypeScript frontend** (built with Vite) rendered in the platform's native webview.

# Responsibilities

- **Rust core (`src-tauri/`)** — owns all filesystem access: [bundle detection](bundle-detection.md), [OKF parsing](okf-parsing.md), graph/backlink computation, [validation](../features/validation.md), and the [file watcher](../features/live-reload.md). It exposes a small set of [commands and events](ipc-and-security.md) and hands the frontend ready-to-render JSON ([data model](data-model.md)).
- **Frontend (`src/`)** — owns rendering and interaction: the [graph](../features/graph-view.md), [reader](../features/concept-reader.md), [search/filter](../features/search-and-filter.md), [navigation](../features/navigation.md), and [theming](../ux/theming.md). It holds no filesystem privileges of its own.

# Why Tauri 2.0

- **Cross-platform desktop** from one codebase, with first-class **Windows** and **Linux/Ubuntu** targets (the product requirement), plus macOS for free.
- **Small, fast binaries** using the system webview — no bundled Chromium, unlike Electron. Fits the [self-contained / fast principles](../product/principles.md).
- **Security model** that matches the [Studio trust boundary](ipc-and-security.md): the webview has no direct filesystem or general network access, and typed Rust commands own each explicit operation. External ACP agents run as separate OS processes with their own disclosed access rather than inheriting webview privileges.
- **Rust** gives us fast directory walking, parsing, and file-watching (via mature crates) without a separate runtime — see [Performance & Scale](performance.md) for how this keeps the app fast end to end.

See also: [Testing & Dogfooding](testing.md) for how the core and frontend are verified.

# Frontend stack

- **React 19 + TypeScript, built with Vite.** The frontend is a single-page app loaded in the webview. There is no server, so React Server Components and Server Actions do not apply — this is a client-only SPA. The **React Compiler** is enabled, so components are written without manual `useMemo`/`useCallback`/`React.memo` (lint with `eslint-plugin-react-hooks` v6+ at error before enabling it). How the frontend is organized as a thin client is detailed in [Frontend Architecture](frontend-architecture.md).
- **Components: Base UI (`@base-ui/react`).** Headless, accessible primitives — Dialog, Select, Checkbox, Number Field, Slider, Tooltip, Menu, Scroll Area, and so on — supply behavior, keyboard handling, and ARIA. **Base UI ships no styles**; appearance comes entirely from our [design tokens](../ux/theming.md). This replaces hand-rolled focus traps and native controls for UI conformity and maintenance stability. Migrated across the app: Settings (Dialog / Select / Checkbox / Number Field), the command palette (Dialog + Autocomplete), the top bar (Toolbar + Tooltip), graph controls (Popover + Slider), the sidebar (Collapsible / Toggle / Scroll Area), and the validation/log panels (non-modal Dialog). Primitive styling lives once in `src/components/baseui.css` (token-only).
- **Graph rendering:** start with SVG + a simple force simulation for small bundles; move to **canvas/WebGL** with a Barnes–Hut force approximation for large ones (see [Performance & Scale](performance.md)). The renderer is wrapped in a React component, but its canvas draw loop runs outside React's reconciler so high-frequency frames never trigger re-renders. A hand-rolled renderer keeps it dependency-light, mirroring the reference HTML visualizer; an offline-capable library (e.g. a canvas force-graph) is acceptable.
- **Markdown:** a small, well-audited TypeScript parser (CommonMark), or a hand-rolled renderer, for full control over intra-bundle [link resolution](okf-parsing.md); rendered output is sanitized before display.
- **Syntax highlighting: Shiki** (the VS Code grammar engine), used in its **fine-grained, WASM-free** form — the JS regex engine and a curated grammar set, all lazy dynamic-imported — so it stays offline, CSP-safe, and out of the initial bundle. Powers the [reader](../features/concept-reader.md)'s code blocks; see [Design-System Rendering](../features/design-system-rendering.md).

# Packaging

- Windows: `.msi` and/or NSIS `.exe`. Ubuntu: `.deb` and AppImage. Driven by `tauri build` (see [Tauri 2.0](../reference/tauri-2.md)).
- CI builds per-OS runners; no code signing assumed for v1. Full packaging, versioning, and release details are in [Build & Release](build-and-release.md).
