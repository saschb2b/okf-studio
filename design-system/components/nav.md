---
type: Component
title: Site nav
description: "A floating pill bar: brand mark on the left, route links with one Product disclosure and a primary action on the right, and a mobile menu panel at narrow widths."
tags: [components, navigation]
status: stable
applies_to: [web]
timestamp: 2026-07-19T00:00:00Z
examples:
  - /components/nav.example.html
tokens:
  nav:
    border: "{colors.border}"
    surface: "{colors.surface}"
---

# Anatomy
`.site-nav` with `.site-nav__brand` (logo + wordmark) and `.site-nav__links` (route links, one optional `.nav-menu` disclosure, and one `.btn--primary`). The bar is a pill: fully rounded (`shape.radius-pill`), hairline `nav.border` on all sides, translucent `nav.surface` with a backdrop blur, and a `shadow-sm` lift. Actions inside the pill take its curvature.

Two subcomponents extend the pill for a multi-page site:

* **Nav disclosure** (`.nav-menu`): a `.nav-menu__trigger` button with a `.nav-menu__chevron`, opening a floating `.nav-menu__panel` of `.nav-menu__item` route links below the trigger. For grouped product depth that should not crowd the bar.
* **Mobile menu** (`.mobile-menu`): a panel below the pill holding the same destinations as the desktop bar. A `.mobile-menu__group` with a `.mobile-menu__label` expands the disclosure's routes inline; the rest are `.mobile-menu__link` rows.

# Placement
The pill owns only its shape; the page positions it. The site applies `position: sticky` with a small top offset, so the pill floats just above the [hero canvas](/patterns/hero.md) at rest and hovers over content while scrolling, keeping the primary Download action reachable without a page-wide bordered strip. The mobile menu renders directly below the pill inside the same sticky container.

# States
* The active route gets `aria-current="page"`: full text color plus a brand-colored underline. A disclosure trigger whose child route is active gets `data-active="true"` and the same treatment.
* `.nav-menu__trigger[aria-expanded="true"]` lifts the trigger to full text color and flips the chevron.
* Panels hide with the `hidden` attribute; the stylesheet enforces `display: none` for it.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `nav.border` | `{colors.border}` |
| `nav.surface` | `{colors.surface}` |

# Examples
- [nav.example.html](/components/nav.example.html)

# Accessibility
Wrap in `<nav aria-label="Primary">`. Links get `:focus-visible`. The translucent surface pairs with a backdrop blur so content scrolls under it legibly. The disclosure trigger and the mobile Menu button are real `<button>`s carrying `aria-expanded` and `aria-controls`; they open on click and keyboard, never on hover alone. The page script closes an open panel on Escape and on outside interaction and returns focus to the trigger. The mobile menu traps no focus and must present every desktop destination; external links carry a visually hidden "(external)" label. Links and menu rows keep at least 24 by 24 CSS-pixel targets.

# Do & Don't
- **Do** keep one primary action in the bar.
- **Do** group product depth behind one disclosure instead of adding sibling links.
- **Don't** crowd the bar with more than ~5 top-level items.
- **Don't** open the disclosure on hover; it is a click/keyboard control.
- **Don't** give the pill a bottom-border-only treatment; it is a floating object, not a strip.
- **Don't** reduce narrow screens to brand + Download; the mobile menu keeps every destination reachable.
