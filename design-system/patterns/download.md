---
type: Pattern
title: Download grid
description: "The per-OS download section: a rounded band (the closing echo of the hero canvas) holding a row of platform download buttons over a mono note about signing/updates."
tags: [patterns, download, band]
status: stable
timestamp: 2026-07-25T00:00:00Z
examples:
  - /patterns/download.example.html
---

# When to use
The download section (anchor `#download`), and any "get the app" block.

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Band | rounded container, `radius.xl`, `colors.surface` | Mirrors the [hero](/patterns/hero.md) canvas, so the page opens and closes on the same contained shape. A single radial tint (color-mix of `colors.secondary` into transparency at 7 percent) warms its top edge. |
| Buttons | [Download button](/components/download-button.md) × N | One per supported OS, centered in the band. |
| Note | mono `text.xs`, `colors.text-dim` | Version, what is not signed yet, and a link to all releases. |

# Say the awkward part here
The note under the buttons is where a reader looks for the catch, so it is the one place on the page that should be blunt: the version, the platforms that are missing a signed build, whether the OS will warn on first launch, and where the older releases are. A download band that answers those questions in a quiet mono line is trusted more than one that answers none of them, and the reader finds out either way within a minute of clicking.

# Example
- [download.example.html](/patterns/download.example.html)

# Do & Don't
- **Do** link each button to a concrete release artifact.
- **Do** name the limitations in the note rather than in a footnote elsewhere.
- **Do** keep the band the last content surface before the footer; it is the page's closing bookend.
- **Don't** gate the download behind a form.
