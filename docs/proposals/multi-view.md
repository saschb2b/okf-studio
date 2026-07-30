---
type: Proposal
title: Multi-View: Tabs and Windows
description: Break the one-concept-at-a-time limit: reader tabs with per-tab history, browser-standard modifier clicks, and undocking a tab into its own OS window.
tags: [proposal, ux, navigation, tabs, windows]
generated: { by: claude/unrecorded, at: 2026-07-06T12:00:00Z }
---

# Problem

The viewer holds exactly one concept at a time. Selection is a single shared state: the [sidebar](../ux/browsing-layout.md), [graph](../features/graph-view.md), and [reader](../features/concept-reader.md) all follow `activeConceptId`. [History](../features/navigation.md) is one back/forward stack. That makes the read loop *click, read, dive deeper*, and nothing else:

- **No comparison.** Take two table docs, a runbook and the metric it references, or a component and its foundation. Reading them together means bouncing back and forth and holding one side in your head. The [deep-diving survey](deep-knowledge-diving.md) already names "pin-two side-by-side compare" as an unserved analyze-stage need.
- **No reference-keeping.** Following a link chain loses your anchor. Alt+← retraces it linearly, but you can't keep a concept *open* while you wander.
- **No multi-monitor.** A desktop app on a big or second display can show exactly one document.

Every [persona](../product/personas.md) hits this. The data engineer diffs two table docs. The agent builder audits a hub concept while walking its citations. The newcomer keeps the root overview at hand while descending.

# Research: the patterns worth borrowing

The request frames it well: evolve the way browsers did, from single page to tabs to tear-off windows. What the established multi-view UIs agree on:

- **Web browsers** (the shared muscle memory). `Ctrl/Cmd+click` opens a link in a **background** tab, and `Shift` variants foreground it. Middle-click does the same. `Ctrl+T`/`Ctrl+W`/`Ctrl+Tab` create, close, and cycle. Each tab owns its **own history**. Dragging a tab out of the strip **tears it off** into a full window of the same app, not a stripped-down viewer.
- **VS Code / Zed**. Tabs live *above the document pane*, not the window. The explorer and search stay shared context beside them. A quiet strip, not browser chrome.
- **Obsidian** (the closest product: local markdown, link graph). It added tabs (v1.0) and *Move to new window*, where the popped-out note is a full workspace window on the same vault. Its lesson: in a knowledge graph, tabs are for *divergent trails*, windows for *screen real estate*.
- **Arc / Edge split view**: in-window side-by-side. Valuable, but it's a second step. It needs tabs to exist first, because a split is "two tabs shown at once". Our split-mode grid (graph | reader) already fills the width budget on typical windows.

# Design

## Tabs in the reader

The reader pane grows a quiet **tab strip** (the VS Code placement: above the document, inside the pane). Each tab is an open concept with **its own back/forward history**. The strip only appears at two or more tabs. A single-tab session looks exactly like today, and the app never grows chrome you didn't ask for.

- **The active tab is the active concept.** Selection stays a single shared state per window: the graph recenters, the sidebar highlights, the reader shows the active tab. Switching tabs *is* a selection change. Plain-clicking anywhere (graph node, tree row, reader link, launcher) navigates the **current tab**, exactly like a browser's current tab. Nothing about the existing loop changes.
- **`Ctrl/Cmd+click` opens in a new background tab**: on reader body links, the reader rail's relationship rows, index-tree rows, and graph nodes (both renderers). Add `Shift` to also switch to it. Middle-click works where the platform delivers it.
- **Tab anatomy:** the concept's type dot + title, a close ×, middle-click to close. Overflow scrolls. **Drag a tab sideways to reorder**, with a live swap: a tab trades places once the pointer crosses a neighbor's midpoint. The strip uses pointer events rather than HTML5 drag-and-drop, which webviews deliver unreliably and which drags a ghost image around.
- **Keyboard:** `Ctrl/Cmd+T` opens a new tab. The tab opens *empty and active*, and deliberately does **not** auto-open the launcher. Owner feedback: a dialog popping up unasked reads as a glitch, and the empty state already points at the graph, sidebar, and launcher. Close is `Ctrl/Cmd+W`, and `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle. `Alt+←/→` stay per-tab.
- **Middle-click closes a tab** (the VS Code gesture), handled as press+release on the tab rather than `auxclick`, which scrollable strips and webviews deliver unreliably.
- **Bundle switch** resets tabs, since a new bundle is a new browsing context. [Live reload](../features/live-reload.md) of the same bundle keeps them, dropping only tabs whose concept vanished.

## Peek before you open

Tabs answer "keep this open". The **peek card** answers the question *before* that one: "is this worth opening at all?" (owner request). Dwell on a concept link, a reader body link or a rail relationship row, for ~450 ms, or focus it by keyboard. A small card then previews the target: its type (palette dot), title, description, and the first lines of prose. A quiet hint teaches the open-in-tab gesture.

This is the Wikipedia page-preview / Obsidian hover-card pattern. It is trivial here because the viewer already parses the whole bundle in memory, so the peek is instant and offline.

- The card is **non-interactive** (`pointer-events: none`): it can never trap the pointer, so there are no hover-persistence states. It dismisses on leave, click, scroll, Escape, or navigation.
- The peek reduces the markdown body to a plain-text excerpt (`plainExcerpt`). It drops code fences and tables and keeps link text, because a glimpse wants prose, not markup.
- Concept links lose their native `title` tooltip, because the card supersedes it and the two would race. The index tree keeps its existing description tooltips instead of a second peek surface. Its rows already answer "what is this?".

## Undocking a tab into its own window

*Move to new window* (a strip affordance plus a [launcher](../features/command-palette.md) action) opens the concept in a **new OS window of the same app**. That is the browser tear-off model, and Obsidian's. The new window is not a stripped viewer. It boots the full app on the same bundle, landed on that concept in reader-only layout. It can do everything the main window can: switch layout, open its own tabs, dive. It's how two concepts land on two monitors, or a spec stays open beside the graph you're exploring.

- Windows are **independent**: each has its own selection, tabs, and layout. There is no cross-window selection sync, which is the point of a second window.
- The bundle stays **read-only and file-backed**, so windows can't conflict. Live reload's change events broadcast to every window.
- Off-desktop (browser dev/tests) it degrades to `window.open` with the same boot parameters.

## What stays single

One graph, one sidebar, one launcher per window. Tabs multiply *documents*, not workspaces. There is no in-window split-reader for now. We revisit that if tab usage shows comparison demand outgrowing pop-out windows. There is no tab persistence across restarts either, because sessions are cheap to rebuild in a read-only viewer.

Drag-to-reorder started out deferred here, then landed on owner feedback. It's imported muscle memory like the rest of the gestures, and the tab model made it a one-action change.

# Why this shape

It's the smallest design that serves comparison, reference-keeping, and multi-monitor at once, and it spends no novelty budget. Every gesture carries over muscle memory from the browser, on the exact surface (links in a document) where users already expect it. It holds the [principles](../product/principles.md) (keyboard-first, offline, read-only) and the quiet-chrome stance: zero visual change until the second tab exists.
