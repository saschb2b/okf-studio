---
type: Architecture Decision
title: Tech Stack
description: Tauri 2.0 with a Rust core and a React + TypeScript frontend: the chosen stack and the reasoning behind it.
tags: [architecture, decision, tauri, rust, react, typescript]
generated: { by: claude/unrecorded, at: 2026-07-29T01:45:00+02:00 }
---

# Decision

Build OKF Studio on **[Tauri 2.0](../reference/tauri-2.md)**. A **Rust core** does the filesystem work. A **React + TypeScript frontend** (built with Vite) renders in the platform's native webview.

# Responsibilities

- **Rust core (`src-tauri/`)**: owns all filesystem access: [bundle detection](bundle-detection.md), [OKF parsing](okf-parsing.md), graph/backlink computation, [validation](../features/validation.md), and the [file watcher](../features/live-reload.md). It exposes a small set of [commands and events](ipc-and-security.md) and hands the frontend ready-to-render JSON ([data model](data-model.md)).
- **Frontend (`src/`)**: owns rendering and interaction: the [graph](../features/graph-view.md), [reader](../features/concept-reader.md), [search/filter](../features/search-and-filter.md), [navigation](../features/navigation.md), and [theming](../ux/theming.md). It holds no filesystem privileges of its own.

# Why Tauri 2.0

- **Cross-platform desktop** from one codebase, with **Windows** and **Linux/Ubuntu** as the primary targets (the product requirement), plus macOS for free.
- **Small, fast binaries** using the system webview, with no bundled Chromium (unlike Electron). Fits the [self-contained / fast principles](../product/principles.md).
- **Security model** that matches the [Studio trust boundary](ipc-and-security.md): the webview has no direct filesystem or general network access. Typed Rust commands own each explicit operation. External ACP agents run as separate OS processes with their own disclosed access rather than inheriting webview privileges.
- **Rust** gives us fast directory walking, parsing, and file-watching (via mature crates) without a separate runtime. See [Performance and Scale](performance.md) for how this keeps the app fast end to end.

See also: [Testing and Dogfooding](testing.md) for how we verify the core and the frontend.

# Frontend stack

- **React 19 + TypeScript, built with Vite.** The frontend is a single-page app that the webview loads. There is no server, so React Server Components and Server Actions do not apply. This is a client-only SPA. The build enables the **React Compiler**, so we write components without manual `useMemo`/`useCallback`/`React.memo` (lint with `eslint-plugin-react-hooks` v6+ at error before enabling it). [Frontend Architecture](frontend-architecture.md) covers the thin-client structure.
- **TypeScript 7 checks the code. TypeScript 5 lints it.** `pnpm typecheck` and `pnpm build` run the native TypeScript 7 compiler, which is roughly an order of magnitude faster than the JavaScript one. The type-aware ESLint stack and the editor language service stay on TypeScript 5. TypeScript 7 replaced the classic compiler API with a narrower `unstable/*` surface, and `typescript-eslint` still declares `typescript >=4.8.4 <6.1.0`. Pointing the lint stack at 7 breaks it rather than slowing it down. The two resolve side by side through the `typescript-7` npm alias, and the scripts invoke the compiler by path, since both packages now claim `node_modules/.bin/tsc`. The alias and the TypeScript 5 dependency both go once `typescript-eslint` supports 7.
- **Components: Base UI (`@base-ui/react`).** Headless, accessible primitives supply behavior, keyboard handling, and ARIA. They cover Dialog, Select, Checkbox, Number Field, Slider, Tooltip, Menu, Scroll Area, and more. **Base UI ships no styles**. Appearance comes entirely from our [design tokens](../ux/theming.md). This replaces hand-rolled focus traps and native controls for UI conformity and maintenance stability. The migration covers Settings (Dialog, Select, Checkbox, Number Field), the command palette (Dialog and Autocomplete), and the top bar (Toolbar and Tooltip). It also covers graph controls (Popover and Slider), the sidebar (Collapsible, Toggle, Scroll Area), and the validation and log panels (non-modal Dialog). Primitive styling lives once in `src/shared/styles/baseui.css` (token-only).
- **Graph rendering:** start with SVG + a simple force simulation for small bundles. Move to **canvas/WebGL** with a Barnes–Hut force approximation for large ones (see [Performance and Scale](performance.md)). A React component wraps the renderer, but its canvas draw loop runs outside React's reconciler, so high-frequency frames never trigger re-renders. A hand-rolled renderer keeps it dependency-light, mirroring the reference HTML visualizer. An offline-capable library (e.g. a canvas force-graph) is acceptable.
- **Markdown:** the Rust core extracts graph links with `pulldown-cmark`. The frontend renders the same source with `marked`, adding extensions for footnotes, emoji, and definition lists. DOMPurify then sanitizes the result. A shared [compatibility corpus](testing.md#golden-tests-for-link-and-backlink-resolution) keeps graph targets and reader navigation aligned.
- **Syntax highlighting: Shiki**, the VS Code grammar engine. Studio uses its **fine-grained, WASM-free** form: the JS regex engine and a curated grammar set, all lazy dynamic-imported. It therefore stays offline, CSP-safe, and out of the initial bundle. It powers the [reader](../features/concept-reader.md)'s code blocks. See [Design-System Rendering](../features/design-system-rendering.md).

# Packaging

- Windows: `.msi` and/or NSIS `.exe`. Ubuntu: `.deb` and AppImage. Driven by `tauri build` (see [Tauri 2.0](../reference/tauri-2.md)).
- CI builds per-OS runners. We assume no code signing for v1. [Build and Release](build-and-release.md) has the full packaging, versioning, and release details.
