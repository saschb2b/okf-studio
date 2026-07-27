---
type: Component
title: Viz card
description: A screenshot with its caption on one surface, the unit of the visualization grid.
tags: [components, card, media]
status: stable
applies_to: [web]
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
examples:
  - /components/viz-card.example.html
tokens:
  viz-card:
    background: "{colors.surface}"
    border: "{colors.border}"
    radius: "{radius.lg}"
  viz-card-hover:
    border: "{colors.border-strong}"
---

# Anatomy
`.viz-card` → `.viz-card__media` (a `<figure>` whose image bleeds to the card edge, seamed by a hairline border) then `.viz-card__text` → `.viz-card__title`, `.viz-card__body`.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `viz-card.background` | `{colors.surface}` |
| `viz-card.border` | `{colors.border}` |
| `viz-card.radius` | `{radius.lg}` |
| `viz-card-hover.border` | `{colors.border-strong}` |

# States
Hover brightens the border to `viz-card-hover.border`. The card does not move; see [feature card](/components/feature-card.md) for why.

# Examples
- [viz-card.example.html](/components/viz-card.example.html)

# Do & Don't
- **Do** keep the media flush to the card edge; the hairline seam does the separating (the [hero](/patterns/hero.md)'s grounded-media motif at card scale).
- **Do** reserve `aspect-ratio` on the media so a lazy-loaded screenshot never shifts the grid.
- **Don't** put more than a title and one caption line under the image; longer copy belongs in a [showcase panel](/patterns/showcase.md).
