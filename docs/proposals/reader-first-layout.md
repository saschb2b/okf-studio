---
type: Proposal
title: Reader-First Adaptive Layout
description: Make the reader a first-class pane with resizable panes, explicit reader-only/split/graph-only modes, and an opt-in adaptive auto-switch.
status: proposed
tags: [proposal, layout, reader, ux]
timestamp: 2026-06-28T17:00:00Z
---

# The ask

The right pane — the [Concept Reader](../features/concept-reader.md), the rendered markdown — is the app's main meat and potatoes, yet it takes only ~1/4 of the width while the [graph](../features/graph-view.md) keeps the rest. Make the reader first-class: a manual **view toggle** (reader-only / split / graph-only), **resizable** panes, and **intelligent auto-switching** (reading gives the reader room; exploring gives the graph room). Take hints from modern IDEs (VS Code / Zed) on file/preview experience.

# Problem

The layout is a fixed grid (`280px / 1fr / 360px`): the reader is a fixed 360px, the graph soaks up all the elastic space, and panes are only binary-collapsible (`[` / `]`). There is no way to widen the reader, no split control, no reader-first mode, and no context-awareness — selecting a concept *to read it* leaves a 360px column while a graph you aren't looking at keeps 60%+ of the screen. (Note a doc-vs-reality gap: [Browsing Layout](../ux/browsing-layout.md) already claims panes are "resizable and individually collapsible" — they aren't yet, so part of this is closing that gap.)

A role correction worth stating: in an IDE the editor dominates and the preview is secondary; here it **inverts** — the reader is the artifact you came to consume, and the graph is the navigator. So borrow the IDE *mechanisms* (named layouts, side-by-side, remembered per context) but flip the default weighting toward content.

# Recommendation

- **Flip the default weighting.** Default to a **balanced split** weighted toward the reader once a concept is open (e.g. graph `1fr` / reader `1.2fr`), not a fixed 360px. The reader's existing `max-width` measure cap keeps prose readable at any pane width, so widening is free of readability cost — extra width becomes gutters.
- **Explicit layout modes** (manual control always wins): **Split** (default), **Reader-only / Focus** (graph hidden; a "zen" read), **Graph-only / Explore**. Surface them as a 3-icon segmented control in the top bar plus hotkeys (mirroring VS Code's "Open Preview to the Side" `Ctrl/Cmd+K V` and full-preview `Ctrl/Cmd+Shift+V`). Keep `[`/`]` (sidebar/reader collapse) composing with modes.
- **Resizable panes**: draggable dividers between sidebar|graph and graph|reader; double-click resets; min-width clamps; **keyboard-operable** (`role="separator"`, arrow-key resize). Persist sizes + active mode **per bundle root**.
- **Adaptive mode (opt-in, conservative).** Off by default. When armed, a single reversible nudge to *weighting within the current mode* — never a mode change, never a per-click "breathing" layout:
  1. Read-intent (a reader link, a Links-to/Cited-by click, the palette, the sidebar tree) → ensure the reader is visible and at/above default weight.
  2. Explore-intent (graph pan/zoom/drag) → favor the graph; a single graph-node click is a *peek* (reader unchanged), expand only on a stronger signal.
  3. Reader focused + scrolling → one nudge toward more reader width.
  4. Empty reader → lean graph-dominant; first selection rebalances.
  Any manual divider drag or mode hotkey **disarms auto-switch for that context** (sticky override).

# Risks & alignment

- **Auto-switch annoyance is the top risk** — mitigated by opt-in + sticky manual override + single-nudge. If in doubt, ship modes + resize first, Adaptive behind a setting.
- **Keyboard / a11y** ([principle](../product/principles.md)): dividers and modes must be fully keyboard-operable and focus must follow the layout (no trap on a hidden pane) — acceptance criteria, not polish.
- **Reduced motion**: all mode/resize transitions must honor the existing `reduceMotion` setting (instant, no slide).
- **Scope**: ship sensible default hotkeys (custom keybinding UI is a [documented non-goal](../ux/keyboard-shortcuts.md)). Modes + resize fulfill an already-promised feature; Adaptive is the genuinely new, conservative surface.

# Definition of done (later)

- Fixed grid replaced by three named modes with draggable, clamped, double-click-reset, keyboard-operable dividers.
- Default = Split, reader weighted co-equal (not a fixed 360px).
- Top-bar segmented layout control + per-mode hotkeys; `[`/`]` still compose.
- Sizes + mode persist per bundle root; focus moves into the primary pane on mode change.
- Adaptive mode behind an opt-in toggle with the heuristics above; manual action disarms it; mode never overridden by auto.
- All transitions honor `reduceMotion` / `prefers-reduced-motion`.
- Reader keeps its measure cap at any width; optional reader-width setting (default Comfortable).
- [Browsing Layout](../ux/browsing-layout.md) and [Keyboard Shortcuts](../ux/keyboard-shortcuts.md) updated to match.
