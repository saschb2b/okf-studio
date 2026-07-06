---
type: Pattern
title: Showcase panel
description: "An alternating feature row as a contained surface: copy on one half, the product screenshot bleeding flush to the panel's edge on the other."
tags: [patterns, showcase, landing]
status: stable
timestamp: 2026-07-06T15:00:00Z
examples:
  - /patterns/showcase.example.html
---

# When to use
Deep-dive feature sections on the landing page: one panel per story, alternating the media side row to row. Sits between the feature-card grid and the [download band](/patterns/download.md).

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Panel | rounded container, `radius.xl`, `colors.surface`, `border` hairline | The same contained-surface family as the [hero canvas](/patterns/hero.md); clips the media bleed. |
| Copy | eyebrow + `text.h2` title + body `text.lg` in `colors.text-muted` | Vertically centered; owns the panel's padding (`space.48`, `space.24` on narrow screens). |
| Media | product screenshot, absolute-fill, `object-fit: cover` | Bleeds flush to the panel's top, bottom, and outer edge; a hairline seam (an inset ring the panel's radius clips on the outer sides) separates it from the copy half. |

# Behavior
- Alternate the media side per row (order swap), so a stack of panels reads as a rhythm, not a template.
- On a single-column layout the media drops below the copy at its natural height instead of cover-cropping.
- The media stays zoomable (the page's spotlight); cropping in the panel is a teaser, not the full picture.

# Example
- [showcase.example.html](/patterns/showcase.example.html)

# Do & Don't
- **Do** keep one story per panel: one eyebrow, one claim, one screenshot.
- **Don't** float the screenshot beside the copy on the bare page background; the flush bleed inside the panel is the point (no floating slabs).
- **Don't** pad the media; only the copy half carries padding.
