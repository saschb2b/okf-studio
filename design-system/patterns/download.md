---
type: Pattern
title: Download grid
description: "The per-OS download section: a rounded band (the closing echo of the hero canvas) holding a row of platform download buttons over a mono note about signing/updates."
tags: [patterns, download, band]
status: stable
timestamp: 2026-07-11T04:45:00Z
examples:
  - /patterns/download.example.html
---

# When to use
The download section (anchor `#download`), and any "get the app" block.

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Band | rounded container, `radius.xl`, `colors.surface` | Mirrors the [hero](/patterns/hero.md) canvas, so the page opens and closes on the same contained shape. A single radial tint (color-mix of `colors.secondary` into transparency) glows from its top edge. |
| Buttons | [Download button](/components/download-button.md) × N | One per supported OS, centered in the band. |
| Note | mono `text.xs`, `colors.text-dim` | Version, "unsigned for now", link to all releases. |

# Example
- [download.example.html](/patterns/download.example.html)

# Do & Don't
- **Do** link each button to a concrete release artifact.
- **Do** keep the band the last content surface before the footer; it is the page's closing bookend.
- **Don't** gate the download behind a form.
