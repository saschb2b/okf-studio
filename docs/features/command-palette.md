---
type: Feature
title: Command Palette
description: A global launcher (Ctrl/Cmd + K or /) that jumps to any concept, searches body text, and runs quick actions — keyboard-only, grouped results.
tags: [feature, palette, launcher, navigation, keyboard, search]
timestamp: 2026-07-23T20:25:48+02:00
---

# What it does

A **global launcher**, opened with `Ctrl/Cmd + K`, with `/`, or by clicking the search field in the top bar, that jumps to any concept, searches concept **body text**, and runs quick actions such as open folder, open [Bundle Home](bundle-home.md), open [Bundle details](metadata-inspector.md), [create a shareable bundle](recipient-projections.md), toggle [log](log-view.md), and re-scan (see [keyboard shortcuts](../ux/keyboard-shortcuts.md)). It is the one fast way to get anywhere without reaching for the mouse, and the app's primary search entry point.

# Matching & grouping

- **Fuzzy matching** over each concept's id, `title`, and `type`, and over each quick action's label, ranked so the closest match leads; with no query it offers a starting set rather than a blank box.
- Results are **grouped** so a long list stays scannable. With no query, **Recent** concepts and **Actions** lead. With a query, matching actions are followed by **Concepts**, origin-bound **OKF tasks**, then **In text** body matches with snippets. The concept stays ahead of its task shortcuts, so Enter opens the best navigation match instead of unexpectedly starting agent work.
- Quick actions appear alongside concept results, so the same box launches a command or navigates to a node.
- **OKF tasks** use the same stable IDs and [context-preview launcher](native-okf-tasks.md) as the reader, graph, validation panel, and source tray. Arrow to one to start cited research, change-impact work, enrichment, or a matching repair without copying a concept path.

# Keyboard-only

- Open, type, arrow through results, Enter to choose, Escape to dismiss — entirely from the keyboard, honoring the [keyboard-friendly principle](../product/principles.md) and the [accessibility](../ux/accessibility.md) contract.

# Selection drives everything

- Selecting a result drives the **single shared selection**, so the [graph](graph-view.md), [reader](concept-reader.md), and [sidebar](../ux/browsing-layout.md) all sync to it — the same selection model the rest of [Navigation](navigation.md) uses.

# Why it stays fast

- It filters over the already-parsed [data model](../architecture/data-model.md) — no re-scan, no disk read — keeping results instant ([performance](../architecture/performance.md)).

# Launcher vs. filters

- The launcher is a **transient overlay** for finding and going to one thing — by id, title, or body text — then it dismisses. [Search & Filter](search-and-filter.md) is the *persistent* surface: type and tag filters in the sidebar's Filter lens that narrow the *whole view* and stay applied. Use the launcher to go somewhere; use filters to keep seeing less.
