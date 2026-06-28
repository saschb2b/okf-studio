---
type: Reference
title: Theming
description: Light/dark theming that follows the OS, and the deterministic palette that colors concepts by type.
tags: [ux, theme, color, accessibility]
timestamp: 2026-06-28T12:00:00Z
---

# Light & dark

- The app follows the OS color scheme by default, with a manual override in settings.
- Both themes meet WCAG AA contrast for text and for node/edge legibility, part of the app's [accessibility](accessibility.md) commitments.

# The type-color palette

Concept `type` drives node and badge color across the [graph](../features/graph-view.md), [reader](../features/concept-reader.md), [bundle browser](../features/bundle-browser.md), and [filters](../features/search-and-filter.md). Because `type` is open-ended (the [spec](../reference/okf-spec-summary.md) does not enumerate it), colors are assigned **deterministically from the type string** rather than a fixed map:

- Sort the distinct types in a bundle; assign hues by the golden-angle sequence (`hue = i × 137.5° mod 360`) at fixed saturation/lightness tuned per theme.
- Determinism means the same type gets a stable color within a bundle and run to run, so the legend is learnable.
- The legend is the single source of truth and doubles as the [type filter](../features/search-and-filter.md).

# Typography & code

- A readable UI font for chrome and bodies; a monospace font for inline code and fenced blocks, with light syntax tinting.
- Markdown rendering styles (tables, blockquotes, headings) are consistent in both themes.
