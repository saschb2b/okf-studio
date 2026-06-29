---
type: Feature
title: Command Palette
description: A global launcher (Ctrl/Cmd + K or /) that jumps to any concept, searches body text, and runs quick actions — keyboard-only, grouped results.
tags: [feature, palette, launcher, navigation, keyboard, search]
timestamp: 2026-06-29T10:00:00Z
---

# What it does

A **global launcher** — opened with `Ctrl/Cmd + K`, with `/`, or by clicking the search field in the top bar — that jumps to any concept, searches concept **body text**, and runs quick actions (open folder, fit graph, toggle [log](log-view.md), re-scan; see [keyboard shortcuts](../ux/keyboard-shortcuts.md)). It is the one fast way to get anywhere without reaching for the mouse, and the app's primary search entry point.

# Matching & grouping

- **Fuzzy matching** over each concept's id, `title`, and `type`, ranked so the closest match leads; with no query it offers a starting set rather than a blank box.
- Results are **grouped** so a long list stays scannable: **Recent** (recently visited concepts), **Concepts** (id / title / type matches), **In text** (full-text body matches, each with the matching snippet), and **Actions** (the quick commands).
- Quick actions appear alongside concept results, so the same box launches a command or navigates to a node.

# Keyboard-only

- Open, type, arrow through results, Enter to choose, Escape to dismiss — entirely from the keyboard, honoring the [keyboard-friendly principle](../product/principles.md) and the [accessibility](../ux/accessibility.md) contract.

# Selection drives everything

- Selecting a result drives the **single shared selection**, so the [graph](graph-view.md), [reader](concept-reader.md), and [sidebar](../ux/browsing-layout.md) all sync to it — the same selection model the rest of [Navigation](navigation.md) uses.

# Why it stays fast

- It filters over the already-parsed [data model](../architecture/data-model.md) — no re-scan, no disk read — keeping results instant ([performance](../architecture/performance.md)).

# Launcher vs. filters

- The launcher is a **transient overlay** for finding and going to one thing — by id, title, or body text — then it dismisses. [Search & Filter](search-and-filter.md) is the *persistent* surface: type and tag filters in the sidebar's Filter lens that narrow the *whole view* and stay applied. Use the launcher to go somewhere; use filters to keep seeing less.
