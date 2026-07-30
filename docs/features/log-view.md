---
type: Feature
title: Log View
description: Render a bundle's reserved log.md as a readable, date-grouped timeline of changes, newest first.
tags: [feature, log, timeline, history]
generated: { by: claude/unrecorded, at: 2026-07-13T19:42:50Z }
---

# What it does

Renders a bundle's `log.md` as a readable timeline instead of raw markdown. That file is a [reserved OKF file](../reference/okf-spec-summary.md), a dated change history kept newest-first. The view answers "what changed, and when" without leaving Studio. Studio renders directory-level `log.md` files too, where a sub-bundle keeps its own history.

# Opening it

- The **Log** control in the [status bar](../ux/browsing-layout.md) toggles the view, as does the `L` [keyboard shortcut](../ux/keyboard-shortcuts.md). It is a low-frequency view, so the control lives there rather than in the title bar.
- It is a peer panel to the [reader](concept-reader.md) and [graph](graph-view.md), not a concept node. The spec reserves `log.md`, so it never appears as a concept in the [glossary](../reference/glossary.md) sense.

# Timeline

- The [Rust core](../architecture/okf-parsing.md) parses `log.md` into dated entries, the `log: LogEntry[]` shape in the [data model](../architecture/data-model.md).
- Entries render **grouped by their ISO `YYYY-MM-DD` date**, newest group first. Each group is a small date heading over a **timeline**. Entries hang off a hairline rail, one dot per entry. **Each entry renders separately** as its own block, because joined consecutive lines would merge into one markdown paragraph blob.
- The dot takes the entry's **conventional kind color**. The log convention leads each entry with `**Creation**` / `**Update**` / `**Fix**` / `**Deprecation**`, mapped to the ok / accent / warn / error roles. A scan of the rail therefore shows *what kind* of change happened when. An unconventional lead falls back to a neutral dot. This is the one place those roles color the log, and the entry text stays plain.
- Entry **links behave like the [reader's](concept-reader.md)**. A log line naming the concepts it changed is navigation. A concept or section link therefore drives the shared selection, and the panel stays open while the reader updates behind it. An external link opens in the system browser with the same outbound cues. No click ever takes the webview itself away from the app.
- A date heading that is not ISO `YYYY-MM-DD` still renders, and [Validation](validation.md) reports it as a **non-blocking warning**. Reported, never fatal.

# Empty state

- When a bundle has no `log.md`, the view shows a calm [empty state](../ux/empty-and-error-states.md) explaining the file is optional, rather than an error. That is consistent with the tolerant-consumer stance.
