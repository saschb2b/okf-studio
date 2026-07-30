---
type: Architecture Decision
title: Frontend Architecture
description: How the React + TypeScript frontend is organized as a thin client over the Rust command and event surface.
tags: [architecture, decision, frontend, state, react, typescript]
generated: { by: claude/unrecorded, at: 2026-07-23T21:24:41+02:00 }
---

# Decision

The web frontend is a **thin client**. It owns rendering and interaction. It holds no filesystem privileges. It draws everything from JSON the [Rust core](tech-stack.md) hands across the [command/event surface](ipc-and-security.md). This keeps the [rendering-vs-filesystem boundary](ipc-and-security.md) sharp: the frontend never reads a file, only the [data model](data-model.md) the core produces.

# Single source of truth for the active concept

The three panes (sidebar, [graph](../features/graph-view.md), and [reader](../features/concept-reader.md)) must always agree on the selection. So **one** piece of authoritative selection state carries it: the active Concept ID. A selection in any pane writes that one value, and all three read from it. This keeps the [browsing layout](../ux/browsing-layout.md) coherent. A click on a graph node scrolls the reader and highlights the sidebar entry. No pane holds its own competing notion of a "current" concept. [Navigation](../features/navigation.md) history is a stack of these IDs, so back and forward replay selection state.

# Derived state, computed on the client

The core hands over `concepts` and dictates no presentation. The frontend **derives** everything visual from that data ([data model](data-model.md)):

- The **type → color** map, a deterministic palette keyed by each concept's `type` (see [Theming](../ux/theming.md)).
- The **edge list**, flattened from `concepts[].links` into `{source, target}` pairs for the graph.
- The **tag index**, built by inverting `concepts[].tags` into tag → concept lists, which feeds the tag [filters](../features/search-and-filter.md).

These are pure functions of the bundle data, so they recompute only when the bundle changes rather than on every render. The React Compiler handles that memoization (see below).

# Component decomposition

Components mirror the three panes: a **sidebar** (indexes, concept list, search results), a **graph** (renderer plus interaction layer), and a **reader** (rendered markdown with backlinks). Each subscribes to the shared active-concept state and to the derived stores. None reaches into another's internals.

The frontend organizes code **domain-first**. `src/features/<domain>/` is the top-level unit. Each domain holds its own `components/` folder beside the logic (hooks, model derivations, ACP calls) that belongs to it. This keeps a feature's UI and its supporting code colocated rather than scattering them across a global `components/` tree and a parallel utilities tree. The domains are:

- **`agent/`**: the ACP client: connection, catalog, install, threads, local models, custom profiles, plus the agent-panel components and the staged-write review previews.
- **`git/`**: repository snapshot and diff stores, the Git panel, its focus contract, and the dedicated read-only diff workspace.
- **`viz/`**: visualization: the graph engine (`graph/`: backbone, community, force simulation, render model), the chart helpers (hierarchy, labels, Nivo theme), and every graph/chart component.
- **`reader/`**: the concept reader, reader preferences, contextual language and resource controls, lineage panel, and peek card, plus lineage derivation.
- **`bundle/`**: the working Bundle Home, bundle details, sharing, and the demand-loaded Connections workspace, plus bundle browsing and the open-from-URL flow (with its network-free `remoteSource` URL parser).
- **`navigation/`**: the sidebar shell and its index tree, tag browser, and type filters.
- **`shell/`**: the window frame and global overlays (top bar, status bar, activity bar, tabs, command palette, settings, validation/log panels).

Cross-cutting code lives in **`src/shared/`**. It holds the [IPC surface](ipc-and-security.md) (`ipc`), the client `store`, the shared `types`, and the model derivations every domain uses (`query`, `selectors`, `odsf`). It also holds the `theme`/type-color palette, the content-`render/` pipeline (markdown, math, mermaid, highlighting), the `platform/` host integration (native behaviors, window controls, updater), and the shared `styles/` (`baseui.css`, `chrome.css`). Each component's own stylesheet and test sit beside it. Only the composition root stays at the `src/` top level: `App`, `main`, `keys`, and the cross-cutting integration tests.

Imports use the **`@/` path alias** (`@/*` → `src/*`, configured in `tsconfig.json` and Vite's `resolve.alias`) rather than relative `../../` chains. A module's import paths then do not depend on where its file lives, so moving a file between folders does not touch its imports.

# In-place patching on bundle-changed

When a `bundle-changed` event arrives ([Live Reload](../features/live-reload.md)), the frontend **patches state in place** rather than rebuilding the bundle from scratch. The frontend replaces the changed concept's record, updates derived stores for just the affected entries, and keeps the existing node positions in the graph. Only affected nodes resettle, so the layout does not jump. The frontend keeps selection and scroll when the active concept still exists.

Git state follows the same invalidation principle without sharing the bundle model. `git-state-changed` identifies the active bundle whose repository may have changed. The external Git store then requests a fresh Rust-owned snapshot, and the panel preserves its tab, draft, and scroll. The diff store replaces the main workspace only for a selected file, all-changes view, or commit. It then returns to the existing workspace without changing concept selection. See [Git Integration Architecture](git-integration.md).

# Built on React 19 + TypeScript

The frontend is **React 19 with TypeScript**, built with Vite (see [Tech Stack](tech-stack.md)). The pieces above map onto React directly:

- **State** lives in a small client store (React Context with a reducer, or a minimal store such as Zustand). That store holds the active Concept ID and the loaded [`Bundle`](data-model.md) in one place, dependency-light per the bundle's ethos. Panes subscribe to it, and none owns competing state.
- **Derived values are auto-memoized.** With the **React Compiler** enabled, render computes the type→color map, edge list, and tag index, and the compiler memoizes them. Nothing hand-writes `useMemo`, `useCallback`, or `React.memo`. Manual memoization covers only the cases the compiler cannot see: referential identity handed to non-React consumers (the canvas renderer), genuinely expensive non-render work, and effect-dependency stability.
- **React 19 idioms.** `ref` is a normal prop, with no `forwardRef`. Components read the core's command promises with `use()` where it fits rather than with `useEffect` plus state. The app mounts with `createRoot` from `react-dom/client`. With no server, RSC and Server Actions do not apply.
- **Accessible components via Base UI.** Headless primitives from `@base-ui/react` (Dialog, Select, Checkbox, Number Field, Slider, Tooltip, Menu, …) provide focus management, keyboard navigation, and ARIA. Our [design tokens](../ux/theming.md) supply their appearance in full. These primitives replace hand-rolled focus traps and native form controls with one consistent, maintained foundation, and the migration runs component by component.
- **Typed end to end.** The [data model](data-model.md) interfaces are the shared TypeScript types. Those types cover the JSON the [IPC surface](ipc-and-security.md) returns, from the command boundary through to the components.
- **In-place patching** uses the Concept ID as the React `key`. A `bundle-changed` update then replaces one concept's data without remounting the graph, so node components keep their identity and positions ([Live Reload](../features/live-reload.md)).

The contract remains the data shape and the [IPC surface](ipc-and-security.md). React is how this app realizes it.
