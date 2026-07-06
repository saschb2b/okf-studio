---
type: Component
title: Site nav
description: "A floating pill bar: brand mark on the left, links and a primary action on the right, translucent over whatever scrolls beneath."
tags: [components, navigation]
status: stable
applies_to: [web]
timestamp: 2026-07-06T14:30:00Z
examples:
  - /components/nav.example.html
tokens:
  nav:
    border: "{colors.border}"
    surface: "{colors.surface}"
---

# Anatomy
`.site-nav` with `.site-nav__brand` (logo + wordmark) and `.site-nav__links` (text links + one `.btn--primary`). The bar is a pill: fully rounded (`shape.radius-pill`), hairline `nav.border` on all sides, translucent `nav.surface` with a backdrop blur, and a `shadow-sm` lift. Actions inside the pill take its curvature.

# Placement
The pill owns only its shape; the page positions it. The landing page applies `position: sticky` with a small top offset, so the pill floats just above the [hero canvas](/patterns/hero.md) at rest and hovers over content while scrolling, keeping the primary Download action reachable without a page-wide bordered strip.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `nav.border` | `{colors.border}` |
| `nav.surface` | `{colors.surface}` |

# Examples
- [nav.example.html](/components/nav.example.html)

# Accessibility
Wrap in `<nav aria-label="Primary">`. Links get `:focus-visible`. The translucent surface pairs with a backdrop blur so content scrolls under it legibly. On narrow screens collapse the text links and keep only the brand and the primary action.

# Do & Don't
- **Do** keep one primary action in the bar.
- **Don't** crowd the bar with more than ~4 links.
- **Don't** give the pill a bottom-border-only treatment; it is a floating object, not a strip.
