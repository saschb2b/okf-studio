---
type: Component
title: Feature card
description: A compact title and value statement with optional glyph and detail link.
tags: [components, card]
status: stable
applies_to: [web]
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
examples:
  - /components/feature-card.example.html
tokens:
  feature-card:
    background: "{colors.surface}"
    border: "{colors.border}"
    radius: "{radius.lg}"
  feature-card-hover:
    border: "{colors.border-strong}"
---

# Anatomy
`.feature-card` contains `.feature-card__title` and `.feature-card__body`. It may add a leading `.feature-card__glyph` or a trailing `.feature-card__link` to a detail route. The link is a quiet text affordance rather than a second button.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `feature-card.background` | `{colors.surface}` |
| `feature-card.radius` | `{radius.lg}` |
| `feature-card-hover.border` | `{colors.border-strong}` |

# States
Hover brightens the border to `feature-card-hover.border` and nothing else. The card previously also rose 2px, which made a grid ripple as the pointer crossed it and implied a click target on cards that have none. Cards that do link somewhere say so with `.feature-card__link`.

# Cards in a grid must fill their row
A grid of cards is read as a set, so a half-empty final row reads as a missing card rather than as a design. Size the grid to the count: five parallel items belong in a layout that ends flush, not in a three-across grid with two orphans. When the count is awkward and cannot change, use a hairline-divided list instead of cards.

# Examples
- [feature-card.example.html](/components/feature-card.example.html)

# Do & Don't
- **Do** keep the body to one concise value statement.
- **Do** use at most one `.feature-card__link`, and only when a detail route exists.
- **Do** check that the card count fills the grid's rows at every breakpoint.
- **Don't** stack multiple CTAs inside a card.
- **Don't** move the card on hover.
