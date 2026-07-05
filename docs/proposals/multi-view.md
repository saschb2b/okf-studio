---
type: Proposal
title: Multi-View — Tabs & Windows
description: Break the one-concept-at-a-time limit — reader tabs with per-tab history, browser-standard modifier clicks, and undocking a tab into its own OS window.
tags: [proposal, ux, navigation, tabs, windows]
timestamp: 2026-07-06T12:00:00Z
---

# Problem

The viewer holds exactly one concept at a time. Selection is a single shared state — the [sidebar](../ux/browsing-layout.md), [graph](../features/graph-view.md), and [reader](../features/concept-reader.md) all follow `activeConceptId` — and [history](../features/navigation.md) is one back/forward stack. That makes the read loop *click, read, dive deeper*, and nothing else:

- **No comparison.** Two table docs, a runbook and the metric it references, a component and its foundation — reading them together means bouncing back and forth and holding one side in your head. The [deep-diving survey](deep-knowledge-diving.md) already names "pin-two side-by-side compare" as an unserved analyze-stage need.
- **No reference-keeping.** Following a link chain loses your anchor; Alt+← retraces it linearly, but you can't keep a concept *open* while you wander.
- **No multi-monitor.** A desktop app on a big or second display can show exactly one document.

Each [persona](../product/personas.md) hits this: the data engineer diffing two table docs, the agent builder auditing a hub concept while walking its citations, the newcomer keeping the root overview at hand while descending.

# Research — the patterns worth borrowing

The request frames it well: evolve the way browsers did, from single page to tabs to tear-off windows. What the established multi-view UIs agree on:

- **Web browsers** (the shared muscle memory): `Ctrl/Cmd+click` opens a link in a **background** tab; `Shift` variants foreground it; middle-click does the same; `Ctrl+T`/`Ctrl+W`/`Ctrl+Tab` create, close, cycle; each tab owns its **own history**; dragging a tab out of the strip **tears it off** into a full window of the same app — not a stripped-down viewer.
- **VS Code / Zed**: tabs live *above the document pane*, not the window; the explorer and search stay shared context beside them. A quiet strip, not browser chrome.
- **Obsidian** (the closest product: local markdown, link graph): added tabs (v1.0) and *Move to new window* — the popped-out note is a full workspace window on the same vault. Its lesson: in a knowledge graph, tabs are for *divergent trails*, windows for *screen real estate*.
- **Arc / Edge split view**: in-window side-by-side. Valuable, but it's a second step — it needs tabs to exist first (a split is "two tabs shown at once"), and our split-mode grid (graph | reader) already fills the width budget on typical windows.

# Design

## Tabs in the reader

The reader pane grows a quiet **tab strip** (the VS Code placement — above the document, inside the pane). Each tab is an open concept with **its own back/forward history**. The strip only appears at two or more tabs: a single-tab session looks exactly like today, and the app never grows chrome you didn't ask for.

- **The active tab is the active concept.** Selection stays a single shared state per window: the graph recenters, the sidebar highlights, the reader shows the active tab. Switching tabs *is* a selection change. Plain-clicking anywhere (graph node, tree row, reader link, launcher) navigates the **current tab**, exactly like a browser's current tab navigating — nothing about the existing loop changes.
- **`Ctrl/Cmd+click` opens in a new background tab** — on reader body links, the reader rail's relationship rows, index-tree rows, and graph nodes (both renderers). Add `Shift` to also switch to it. Middle-click works where the platform delivers it.
- **Tab anatomy:** the concept's type dot + title, a close ×, middle-click to close. Overflow scrolls. **Drag a tab sideways to reorder** — the live swap (a tab trades places once the pointer crosses a neighbor's midpoint), pointer-based rather than HTML5 drag-and-drop, which webviews deliver unreliably and which drags a ghost image around.
- **Keyboard:** `Ctrl/Cmd+T` new tab — it opens *empty and active*, and deliberately does **not** auto-open the launcher (owner feedback: a dialog popping up unasked reads as a glitch; the empty state already points at the graph, sidebar, and launcher). `Ctrl/Cmd+W` close, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle. `Alt+←/→` stay per-tab.
- **Middle-click closes a tab** (the VS Code gesture), handled as press+release on the tab rather than `auxclick`, which scrollable strips and webviews deliver unreliably.
- **Bundle switch** resets tabs (a new bundle is a new browsing context); [live reload](../features/live-reload.md) of the same bundle keeps them, dropping only tabs whose concept vanished.

## Undocking — a tab into its own window

*Move to new window* (a strip affordance + a [launcher](../features/command-palette.md) action) opens the concept in a **new OS window of the same app** — the browser tear-off model, and Obsidian's. The new window is not a stripped viewer: it boots the full app on the same bundle, landed on that concept in reader-only layout, and can do everything the main window can (switch layout, open its own tabs, dive). It's how two concepts land on two monitors, or a spec stays open beside the graph you're exploring.

- Windows are **independent**: each has its own selection, tabs, and layout. No cross-window selection sync — that's the point of a second window.
- The bundle stays **read-only and file-backed**, so windows can't conflict; live reload's change events broadcast to every window.
- Off-desktop (browser dev/tests) it degrades to `window.open` with the same boot parameters.

## What stays single

One graph, one sidebar, one launcher per window — tabs multiply *documents*, not workspaces. No in-window split-reader for now (revisit if tab usage shows comparison demand outgrowing pop-out windows), and no tab persistence across restarts (sessions are cheap to rebuild in a read-only viewer). Drag-to-reorder was initially deferred here, then added on owner feedback — it's imported muscle memory like the rest of the gestures, and the tab model made it a one-action change.

# Why this shape

It's the smallest design that serves comparison, reference-keeping, and multi-monitor at once, and it spends no novelty budget: every gesture is imported muscle memory from the browser, on the exact surface (links in a document) where users already expect it. It holds the [principles](../product/principles.md) — keyboard-first, offline, read-only — and the quiet-chrome stance: zero visual change until the second tab exists.
