---
type: Component
title: Feature card
description: A compact title and value statement with optional glyph and detail link.
tags: [components, card]
status: stable
applies_to: [web]
timestamp: 2026-07-19T00:00:00Z
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

# Examples
- [feature-card.example.html](/components/feature-card.example.html)

# Do & Don't
- **Do** keep the body to one concise value statement.
- **Do** use at most one `.feature-card__link`, and only when a detail route exists.
- **Don't** stack multiple CTAs inside a card.
