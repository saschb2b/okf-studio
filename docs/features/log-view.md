---
type: Feature
title: Log View
description: Render a bundle's reserved log.md as a readable, date-grouped timeline of changes, newest first.
tags: [feature, log, timeline, history]
timestamp: 2026-06-28T12:00:00Z
---

# What it does

Renders a bundle's `log.md` — a [reserved OKF file](../reference/okf-spec-summary.md): a dated change history kept newest-first — as a readable timeline instead of raw markdown. It answers "what changed, and when" without leaving the viewer. Directory-level `log.md` files are surfaced too, where a sub-bundle keeps its own history.

# Opening it

- Toggled from the top bar's **Log** control (see [Browsing Layout](../ux/browsing-layout.md)) and the `L` [keyboard shortcut](../ux/keyboard-shortcuts.md).
- It is a peer panel to the [reader](concept-reader.md) and [graph](graph-view.md), not a concept node — `log.md` is reserved, so it never appears as a concept in the [glossary](../reference/glossary.md) sense.

# Timeline

- The [Rust core](../architecture/okf-parsing.md) parses `log.md` into dated entries — the `log: LogEntry[]` shape in the [data model](../architecture/data-model.md).
- Entries render **grouped by their ISO `YYYY-MM-DD` date**, newest group first, each group a heading over its change lines.
- A date heading that is not ISO `YYYY-MM-DD` still renders, but is surfaced as a **non-blocking warning** by [Validation](validation.md) — reported, never fatal.

# Empty state

- When a bundle has no `log.md`, the view shows a calm [empty state](../ux/empty-and-error-states.md) explaining the file is optional, rather than an error — consistent with the tolerant-consumer stance.
