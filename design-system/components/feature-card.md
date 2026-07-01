---
type: Component
title: Feature card
description: A glyph, title, and one-line body — the unit of the feature grid.
tags: [components, card]
status: stable
applies_to: [web]
timestamp: 2026-07-01T16:30:46Z
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
`.feature-card` → `.feature-card__glyph`, `.feature-card__title`, `.feature-card__body`.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `feature-card.background` | `{colors.surface}` |
| `feature-card.radius` | `{radius.lg}` |

# Examples
- [feature-card.example.html](/components/feature-card.example.html)

# Do & Don't
- **Do** keep the body to one line of value.
- **Don't** stack multiple CTAs inside a card.
