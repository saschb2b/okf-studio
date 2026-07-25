---
type: Reference
title: Theming
description: Light/dark theming that follows the OS, and the deterministic palette that colors concepts by type.
tags: [ux, theme, color, accessibility]
timestamp: 2026-07-02T05:20:00Z
---

# Design tokens (one scale layer)

All visual values come from a single token layer defined once on `:root` (light and dark), and **every component references tokens — never a raw literal**. This keeps the UI consistent and makes a restyle a one-file change:

- **Color roles**, not values: `--bg`, `--bg-elev`, `--bg-sunken`, `--text`, `--text-dim`, `--border`, `--accent` (+ `--accent-contrast`), and the status roles `--error` / `--warn` / `--ok`. Plus `--shadow` (one elevation) and `--scrim` (the modal backdrop). Hex/`rgba()` literals live only here; components use `var(--…)` (and `color-mix()` for a derived tint), never inline colors.
- **Spacing scale** (`--space-2 … --space-40`, named by px on a 2/4/8 rhythm) — paddings, margins, and gaps snap to it instead of magic numbers.
- **Type scale** (`--fs-xs 12 / --fs-sm 14 / --fs-md 16 / --fs-lg 20 / --fs-xl 28`) with paired line-height tokens — a bounded set, not a dozen ad-hoc sizes.
- **Radius scale** (`--radius-sm 6 / --radius 8 / --radius-lg 12`; `999px`/`50%` reserved for pills and dots).
- **Focus** (`--focus-w`, applied as one consistent ring) and **motion** (`--dur`), the latter suppressed under `prefers-reduced-motion` (see [Accessibility](accessibility.md)).
- **Reading layer** — the [Concept Reader](../features/concept-reader.md) adds reader-scoped variables for its prose column: a character-based **measure**, **line-height**, **font** (the UI sans by default, an opt-in serif), and the context-**rail** width, all tunable via its "Aa" control and persisted in [settings](settings.md). Callouts/admonitions reuse the status roles (`--accent` / `--ok` / `--warn` / `--error`) via `color-mix()` tints, adding no new color literals.

# Light & dark

- The app follows the OS color scheme by default, with a manual override in settings.
- Both themes meet WCAG AA contrast for text and for node/edge legibility, part of the app's [accessibility](accessibility.md) commitments.

**The light theme's accent and status colors are darker than their dark-theme counterparts**, and deliberately so: on a near-white surface they have to carry *text*, not just fill a shape. Each is checked against all three background roles, `--bg`, `--bg-elev`, and `--bg-sunken`, because `--bg-sunken` is the palest surface a colored label lands on and is the one that fails first. The earlier values missed AA there: the accent came to 3.90, `--warn` to 2.80, and `--ok` to 4.33. Their replacements clear 4.5 on all three and still take white at 4.5 when used as a fill, so a colored role works in both directions. Check both before changing one; an accent light enough to look bright on dark is never dark enough to be read on white.

# The type-color palette

Concept `type` drives node and badge color across the [graph](../features/graph-view.md), [reader](../features/concept-reader.md), [bundle switcher](../features/bundle-switcher.md), and [filters](../features/search-and-filter.md). Because `type` is open-ended (the [spec](../reference/okf-spec-summary.md) does not enumerate it), colors are assigned **deterministically from the type string** rather than a fixed map:

- Sort the distinct types in a bundle; assign hues by the golden-angle sequence (`hue = i × 137.5° mod 360`) at fixed saturation/lightness tuned per theme.
- Determinism means the same type gets a stable color within a bundle and run to run, so the legend is learnable.
- The legend is the single source of truth and doubles as the [type filter](../features/search-and-filter.md).

# Typography & code

- **Inter** for chrome and bodies, **JetBrains Mono** for inline code and fenced blocks with light syntax tinting, both shipped with the app as variable fonts rather than resolved from the host. A desktop app that inherits `system-ui` renders in Segoe UI on Windows, SF on macOS, and whatever fontconfig picks on Linux, so one window has three different sets of metrics and three different x-heights, and a weight like 650 either exists or silently rounds to bold. Bundling them costs about 113KB of latin subsets and makes the chrome identical on all three platforms. The system stacks stay behind them as the fallback.
- Inter is set with `font-optical-sizing: auto` and the `--ui-features` alternates (single-storey `g` and `l`, curved `r`), which read quieter at the 12px most of the chrome runs at.
- The reader's opt-in serif and its own measure/line-height controls are unaffected; they layer on top of this (see [Concept Reader](../features/concept-reader.md)).
- Markdown rendering styles (tables, blockquotes, headings) are consistent in both themes.

# Native chrome

The window runs **borderless** — native title-bar decorations are off and the [top bar](browsing-layout.md) is our own **custom title bar** (a drag region with minimize / maximize / close controls and edge resize handles), with **slightly rounded corners** (the window is transparent so the corners cut out softly; squared when maximized), so the frame is ours end to end. Smaller touches finish the native feel: scrollbars are themed to the token palette with `scrollbar-gutter: stable` (so layout doesn't shift when they appear), text selection is disabled on chrome but preserved on [reader](../features/concept-reader.md) prose, and the browser context menu and page-zoom — keyboard, ctrl+wheel, and trackpad/touch pinch (WebKit gesture events) — are suppressed. The **document itself never scrolls** — the app is a fixed shell whose panes scroll internally, enforced with `overflow: clip` on the root so neither wheel chaining past a pane's end nor programmatic `scrollIntoView` can shift the whole chrome (WebKitGTK's sub-pixel viewport rounding under fractional display scaling otherwise leaves the document scrollable by a hair). The text-size zoom this pairs with is content-scoped — see [Settings](settings.md).
