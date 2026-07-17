---
type: Feature
title: Log View
description: Render a bundle's reserved log.md as a readable, date-grouped timeline of changes, newest first.
tags: [feature, log, timeline, history]
timestamp: 2026-07-13T19:42:50Z
---

# What it does

Renders a bundle's `log.md` — a [reserved OKF file](../reference/okf-spec-summary.md): a dated change history kept newest-first — as a readable timeline instead of raw markdown. It answers "what changed, and when" without leaving Studio. Directory-level `log.md` files are surfaced too, where a sub-bundle keeps its own history.

# Opening it

- Toggled from the **Log** control in the [status bar](../ux/browsing-layout.md) (a low-frequency view, so it lives there rather than in the title bar) and the `L` [keyboard shortcut](../ux/keyboard-shortcuts.md).
- It is a peer panel to the [reader](concept-reader.md) and [graph](graph-view.md), not a concept node — `log.md` is reserved, so it never appears as a concept in the [glossary](../reference/glossary.md) sense.

# Timeline

- The [Rust core](../architecture/okf-parsing.md) parses `log.md` into dated entries — the `log: LogEntry[]` shape in the [data model](../architecture/data-model.md).
- Entries render **grouped by their ISO `YYYY-MM-DD` date**, newest group first. Each group is a small date heading over a **timeline**: entries hang off a hairline rail, one dot per entry, and **each entry renders separately** as its own block (joined, consecutive lines would merge into one markdown paragraph blob).
- The dot takes the entry's **conventional kind color** — the log convention leads each entry with `**Creation**` / `**Update**` / `**Fix**` / `**Deprecation**`, mapped to the ok / accent / warn / error roles — so a scan of the rail shows *what kind* of change happened when; an unconventional lead falls back to a neutral dot. This is the one place those roles color the log: the entry text stays plain.
- Entry **links behave like the [reader's](concept-reader.md)**: a log line naming the concepts it changed is navigation, so a concept or section link drives the shared selection (the panel stays open, the reader updates behind it), an external link opens in the system browser with the same outbound cues, and no click ever navigates the webview itself away from the app.
- A date heading that is not ISO `YYYY-MM-DD` still renders, but is surfaced as a **non-blocking warning** by [Validation](validation.md) — reported, never fatal.

# Empty state

- When a bundle has no `log.md`, the view shows a calm [empty state](../ux/empty-and-error-states.md) explaining the file is optional, rather than an error — consistent with the tolerant-consumer stance.
