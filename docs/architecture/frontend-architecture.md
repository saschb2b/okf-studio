---
type: Architecture Decision
title: Frontend Architecture
description: How the React + TypeScript frontend is organized as a thin client over the Rust command and event surface.
tags: [architecture, decision, frontend, state, react, typescript]
generated: { by: claude/unrecorded, at: 2026-07-23T21:24:41+02:00 }
---

# Decision

The web frontend is a **thin client**. It owns rendering and interaction; it owns no filesystem privileges. Everything it draws is derived from JSON the [Rust core](tech-stack.md) hands across the [command/event surface](ipc-and-security.md). This keeps the [rendering-vs-filesystem boundary](ipc-and-security.md) sharp: the frontend never reads a file, only the [data model](data-model.md) the core produces.

# Single source of truth for the active concept

The three panes — sidebar, [graph](../features/graph-view.md), and [reader](../features/concept-reader.md) — must always agree on what is selected. There is therefore **one** piece of authoritative selection state: the active Concept ID. Selecting in any pane writes that one value; all three read from it. This is what keeps the [browsing layout](../ux/browsing-layout.md) coherent — clicking a graph node scrolls the reader and highlights the sidebar entry without any pane holding its own competing notion of "current." [Navigation](../features/navigation.md) history is a stack of these IDs, so back/forward is just replaying selection state.

# Derived state, computed on the client

The core hands over `concepts` and dictates no presentation; the frontend **derives** everything visual from that data ([data model](data-model.md)):

- The **type → color** map — a deterministic palette keyed by each concept's `type` (see [Theming](../ux/theming.md)).
- The **edge list** — flattened from `concepts[].links` into `{source, target}` pairs for the graph.
- The **tag index** — synthesized by inverting `concepts[].tags` into tag → concept lists, powering tag [filters](../features/search-and-filter.md).

These are pure functions of the bundle data, so they recompute only when the bundle changes, not on every render — the React Compiler handles that memoization (see below).

# Component decomposition

Components mirror the three panes: a **sidebar** (indexes, concept list, search results), a **graph** (renderer plus interaction layer), and a **reader** (rendered markdown with backlinks). Each subscribes to the shared active-concept state and to the derived stores; none reaches into another's internals.

The frontend is organized **domain-first**: `src/features/<domain>/` is the top-level unit, and each domain holds its own `components/` folder beside the logic (hooks, model derivations, ACP calls) that belongs to it. This keeps a feature's UI and its supporting code colocated rather than scattering them across a global `components/` tree and a parallel utilities tree. The domains are:

- **`agent/`**: the ACP client: connection, catalog, install, threads, local models, custom profiles, plus the agent-panel components and the staged-write review previews.
- **`git/`**: repository snapshot and diff stores, the Git panel, its focus contract, and the dedicated read-only diff workspace.
- **`viz/`**: visualization: the graph engine (`graph/` — backbone, community, force simulation, render model), the chart helpers (hierarchy, labels, Nivo theme), and every graph/chart component.
- **`reader/`**: the concept reader, reader preferences, contextual language and resource controls, lineage panel, and peek card, plus lineage derivation.
- **`bundle/`**: the working Bundle Home, bundle details, sharing, and the demand-loaded Connections workspace, plus bundle browsing and the open-from-URL flow (with its network-free `remoteSource` URL parser).
- **`navigation/`**: the sidebar shell and its index tree, tag browser, and type filters.
- **`shell/`**: the window frame and global overlays (top bar, status bar, activity bar, tabs, command palette, settings, validation/log panels).

Cross-cutting code lives in **`src/shared/`**: the [IPC surface](ipc-and-security.md) (`ipc`), the client `store`, the shared `types`, the model derivations used by every domain (`query`, `selectors`, `odsf`), the `theme`/type-color palette, the content-`render/` pipeline (markdown, math, mermaid, highlighting), the `platform/` host integration (native behaviors, window controls, updater), and the shared `styles/` (`baseui.css`, `chrome.css`). Each component's own stylesheet and test sit beside it. Only the composition root stays at the `src/` top level: `App`, `main`, `keys`, and the cross-cutting integration tests.

Imports use the **`@/` path alias** (`@/*` → `src/*`, configured in `tsconfig.json` and Vite's `resolve.alias`) rather than relative `../../` chains, so a module's import paths are independent of where its file lives — moving a file between folders does not touch its imports.

# In-place patching on bundle-changed

When a `bundle-changed` event arrives ([Live Reload](../features/live-reload.md)), the frontend **patches state in place** rather than rebuilding the bundle from scratch. The changed concept's record is replaced, derived stores update for just the affected entries, and the graph keeps existing node positions — only affected nodes resettle, so the layout does not jump. Selection and scroll are retained when the active concept still exists.

Git state follows the same invalidation principle without sharing the bundle model. `git-state-changed` identifies the active bundle whose repository may have changed; the external Git store requests a fresh Rust-owned snapshot while the panel preserves its tab, draft, and scroll. The diff store replaces the main workspace only for a selected file, all-changes view, or commit, then returns to the existing workspace without changing concept selection. See [Git Integration Architecture](git-integration.md).

# Built on React 19 + TypeScript

The frontend is **React 19 with TypeScript**, built with Vite (see [Tech Stack](tech-stack.md)). The pieces above map onto React directly:

- **State** lives in a small client store — React Context with a reducer, or a minimal store such as Zustand — holding the active Concept ID and the loaded [`Bundle`](data-model.md) in one place, dependency-light per the bundle's ethos. Panes subscribe; none owns competing state.
- **Derived values are auto-memoized.** With the **React Compiler** enabled, the type→color map, edge list, and tag index are computed in render and memoized by the compiler — no hand-written `useMemo`/`useCallback`/`React.memo`. Manual memoization is reserved only for the cases the compiler cannot see: referential identity handed to non-React consumers (the canvas renderer), genuinely expensive non-render work, and effect-dependency stability.
- **React 19 idioms.** `ref` is a normal prop (no `forwardRef`); the core's command promises are read with `use()` where it fits rather than `useEffect` + state; the app mounts with `createRoot` from `react-dom/client`. With no server, RSC and Server Actions do not apply.
- **Accessible components via Base UI.** Headless primitives from `@base-ui/react` (Dialog, Select, Checkbox, Number Field, Slider, Tooltip, Menu, …) provide focus management, keyboard navigation, and ARIA; their appearance is supplied entirely by our [design tokens](../ux/theming.md). This replaces hand-rolled focus traps and native form controls with one consistent, maintained foundation, migrated component-by-component.
- **Typed end to end.** The [data model](data-model.md) interfaces are the shared TypeScript types: the JSON the [IPC surface](ipc-and-security.md) returns is typed from the command boundary through to the components.
- **In-place patching** uses the Concept ID as the React `key`, so a `bundle-changed` update replaces one concept's data without remounting the graph — node components keep their identity and positions ([Live Reload](../features/live-reload.md)).

The contract remains the data shape and the [IPC surface](ipc-and-security.md); React is how this app realizes it.
