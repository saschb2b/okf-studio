---
type: Component
title: Site nav
description: Sticky top bar: brand mark on the left, links and a primary action on the right.
tags: [components, navigation]
status: stable
applies_to: [web]
timestamp: 2026-07-01T16:30:46Z
examples:
  - /components/nav.example.html
tokens:
  nav:
    border: "{colors.border}"
    surface: "{colors.surface}"
---

# Anatomy
`.site-nav` with `.site-nav__brand` (logo + wordmark) and `.site-nav__links` (text links + one `.btn--primary`).

# Tokens
| Token | Resolves to |
|-------|-------------|
| `nav.border` | `{colors.border}` |
| `nav.surface` | `{colors.surface}` |

# Examples
- [nav.example.html](/components/nav.example.html)

# Accessibility
Wrap in `<nav aria-label="Primary">`. Links get `:focus-visible`. The bar uses a translucent `colors.bg` so content scrolls under it legibly.

# Do & Don't
- **Do** keep one primary action in the bar.
- **Don't** crowd the bar with more than ~4 links.
