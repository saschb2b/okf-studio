---
type: Feature
title: Command Palette
description: A Ctrl/Cmd + K palette that jumps to any concept by id or title and runs quick actions, keyboard-only.
tags: [feature, palette, navigation, keyboard]
timestamp: 2026-06-28T12:00:00Z
---

# What it does

A `Ctrl/Cmd + K` palette that jumps to any concept by id or title, and offers quick actions — open folder, fit graph, toggle [log](log-view.md), re-scan (see [keyboard shortcuts](../ux/keyboard-shortcuts.md)). It is the fast way to get anywhere without reaching for the mouse.

# Matching

- **Fuzzy matching** over each concept's id, `title`, and `type`, ranked so the closest match leads.
- Quick actions appear alongside concept results, so the same box launches a command or navigates to a node.

# Keyboard-only

- Open, type, arrow through results, Enter to choose, Escape to dismiss — entirely from the keyboard, honoring the [keyboard-friendly principle](../product/principles.md) and the [accessibility](../ux/accessibility.md) contract.

# Selection drives everything

- Selecting a result drives the **single shared selection**, so the [graph](graph-view.md), [reader](concept-reader.md), and [sidebar](../ux/browsing-layout.md) all sync to it — the same selection model the rest of [Navigation](navigation.md) uses.

# Why it stays fast

- It filters over the already-parsed [data model](../architecture/data-model.md) — no re-scan, no disk read — keeping results instant ([performance](../architecture/performance.md)).

# Not full-text search

- Distinct from [Search & Filter](search-and-filter.md): the palette is a fast **navigator / launcher** that resolves a target by id or title; search narrows the *whole view* by matching body text, type, and tags. Use the palette to go somewhere, search to see less.
