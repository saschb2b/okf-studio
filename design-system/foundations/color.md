---
type: Color
title: Color
description: Dark-first palette built from the app theme and app-icon gradient — near-black surfaces with a blue→violet brand accent.
tags: [foundations, color, tokens]
status: stable
timestamp: 2026-07-01T16:29:01Z
tokens:
  colors:
    bg: "#0B0B0D"
    surface: "#141518"
    surface-2: "#1C1D22"
    border: "#26272E"
    border-strong: "#34353E"
    text: "#EDEEF2"
    text-muted: "#A0A6B0"
    text-dim: "#6C717B"
    primary: "#5B8CFF"
    primary-hover: "#6E9BFF"
    secondary: "#9A6BFF"
    indigo: "#3E4BAF"
    on-primary: "#FFFFFF"
    success: "#5ED39A"
    warning: "#E0B341"
    error: "#FF6B5E"
    focus: "#5B8CFF"
    gradient-brand: "linear-gradient(135deg, #5B8CFF, #9A6BFF)"
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
| `colors.primary` | `#5B8CFF` | Brand blue — links, primary accents. |
| `colors.secondary` | `#9A6BFF` | Brand violet — the second gradient stop. |
| `colors.gradient-brand` | blue→violet | The signature CTA / highlight gradient. |

# Roles
The system is **dark-first**: everything sits on `bg`, cards lift to `surface`. Color identity is carried by exactly one thing — the blue→violet **gradient-brand**, lifted straight from the app icon's folder — so the brand reads without a rainbow. `text` / `text-muted` / `text-dim` are the three legible steps on dark.

# Usage
Use `gradient-brand` sparingly: the primary CTA, one hero highlight, focus/hover glows. Everything else is neutral (`text`, `border`, `surface`) so the accent stays special.

# Do & Don't
- **Do** keep the gradient for primary emphasis only.
- **Don't** fill large areas with flat `#000`; use `bg`/`gradient-tile` so edges stay defined (per Apple dark-icon guidance).
