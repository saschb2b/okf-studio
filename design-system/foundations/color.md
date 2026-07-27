---
type: Color
title: Color
description: "Dark-first palette built from the app theme and app icon: near-black surfaces with one blue accent, used only where a reader can act. The brand roles track the app; the surfaces deliberately do not."
tags: [foundations, color, tokens]
status: stable
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
tokens:
  colors:
    bg: "#0B0B0D"
    surface: "#141518"
    surface-2: "#1C1D22"
    border: "#26272E"
    border-strong: "#34353E"
    text: "#EDEEF2"
    text-muted: "#A0A6B0"
    text-dim: "#7B808A"
    primary: "#74A0FF"
    primary-hover: "#92B4FF"
    secondary: "#9A6BFF"
    indigo: "#3E4BAF"
    on-primary: "#0B0B0D"
    success: "#5ED39A"
    warning: "#E0B341"
    error: "#FF7F72"
    focus: "#74A0FF"
    gradient-brand: "linear-gradient(135deg, #74A0FF, #9A6BFF)"
    gradient-tile: "linear-gradient(180deg, #2A2A2E, #060608)"
---

# Tokens
| Token | Value | Role |
|-------|-------|------|
| `colors.bg` | `#0B0B0D` | Page background (deep near-black, from the icon tile bottom). |
| `colors.surface` | `#141518` | Card / panel surface (icon tile top). |
| `colors.surface-2` | `#1C1D22` | Raised surface, hover fills. |
| `colors.border` | `#26272E` | Hairline dividers and card borders. |
| `colors.text` | `#EDEEF2` | Primary body / heading text. |
| `colors.text-muted` | `#A0A6B0` | Secondary text, captions. |
| `colors.primary` | `#74A0FF` | The accent: links, the primary button, focus. Tracks the app. |
| `colors.secondary` | `#9A6BFF` | The violet the icon fades into; background tints only. |
| `colors.gradient-brand` | blue→violet | The icon's gradient. Artwork only, never UI chrome. |

# Roles
The system is **dark-first**: everything sits on `bg`, cards lift to `surface`. `text` / `text-muted` / `text-dim` are the three legible steps on dark, and they carry almost all of the hierarchy on their own.

# The accent means "you can act here"
Color identity is carried by exactly one hue, `colors.primary`, lifted from the app icon's folder. It is not decoration: it marks the things a reader can act on, and nothing else.

| Accent belongs on | Accent does not belong on |
|-------------------|---------------------------|
| Links and detail affordances | Headlines and headline fragments |
| The one primary button per view | Eyebrow labels (they use `text-dim`) |
| Focus rings (`colors.focus`) | Card borders, icons, rules, bullets |
| Hover states of the above | Anything static |

`colors.gradient-brand` is where the accent came from, not something to paint with. It belongs to the app icon and to exported artwork such as the social card. Filling headline text or button faces with it makes every page read like a template; a solid `colors.primary` fill on the single primary action reads like a tool.

`colors.secondary` survives only as a **background tint**, mixed into transparency at 8 percent or less behind a large surface. At that strength it warms the dark without becoming a second brand color.

# Relationship to the app theme
This palette was derived from the desktop app's dark theme (`src/styles.css`), and the two drifted apart the first time the app's changed. Some of that drift is deliberate and some was an accident, so the split is now explicit.

**These track the app. Change one, change both.**

| Token | App role |
|-------|----------|
| `colors.primary` | `--accent` |
| `colors.primary-hover` | `--accent-hover` |
| `colors.focus` | `--accent` |
| `colors.error` | `--error` |
| `colors.warning` | `--warn` |
| `colors.success` | `--ok` |

The accent is the product's one identity color. A visitor who reads the site and then opens the app should not see two different blues, and the site has room to follow: the app's value moved because a colored label sitting on a hovered row inside a dialog has to clear 4.5:1, and on this page, which is darker still and has no state fills under its links, adopting it only adds headroom.

**These deliberately differ, and should not be "fixed" to match.**

| Token | Why |
|-------|-----|
| `bg`, `surface`, `surface-2`, `border` | A marketing page is one long scroll on a near-black canvas; the app is a dense tool window with five stacked surfaces. Both are near-black, and neither ramp fits the other's job. |
| `text`, `text-muted`, `text-dim` | Tuned against this darker page and this larger type. |
| `on-primary` | The ink on an accent fill, which here is *this* page's `bg`, not the app's. |

`node scripts/check-design-system.mjs` enforces the first table and the contrast numbers below, so neither claim can rot quietly.

# Contrast
Every pairing the system actually uses clears 4.5:1, the threshold for normal-size text, because most of this site's small text is exactly that: 13px mono meta lines and eyebrow labels.

| Pairing | Ratio |
|---------|-------|
| `text` on `bg` | 16.96:1 |
| `text-muted` on `surface` | 7.46:1 |
| `text-dim` on `surface` | 4.61:1 |
| `primary` on `bg` (links) | 7.69:1 |
| `on-primary` on `primary` (the button label) | 7.69:1 |

These are measured, not remembered. The previous table claimed 17.4, 8.4, 5.2, and 6.2 — close enough to look right in review, and none of them derivable from the tokens beside them.

Two of these took a change. `text-dim` was `#6C717B`, which came to 4.0:1 on `bg` and less on `surface`, and it carries the footer, the download notes, the mono meta lines, and every eyebrow. And `on-primary` was white, which on the accent is 3.2:1: a primary button whose own label failed the threshold.

White cannot be fixed by darkening the accent, because the same hue has to work as a link on a near-black page, where darkening makes it worse. The two requirements pull in opposite directions, so the button takes dark text on the bright fill instead. That is also the honest reading of the palette: `primary` is a light color, and light colors carry dark text.

# Do & Don't
- **Do** spend the accent on what a reader can click, then stop.
- **Do** check a new pairing at 4.5:1, not at 3:1; almost nothing here is large text.
- **Do** keep large tinted washes under 10 percent color-mix, so the surface still reads as neutral.
- **Don't** fill text or button faces with `gradient-brand`.
- **Don't** fill large areas with flat `#000`; use `bg`/`gradient-tile` so edges stay defined (per Apple dark-icon guidance).
