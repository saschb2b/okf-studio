---
type: Typography
title: Typography
description: A system sans for UI/marketing copy and a monospace for code and eyebrow labels, on a large, confident scale.
tags: [foundations, typography, tokens]
status: stable
timestamp: 2026-07-01T16:29:01Z
tokens:
  font:
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Inter, sans-serif"
    mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    weight-normal: "400"
    weight-medium: "500"
    weight-semibold: "600"
    weight-bold: "700"
  text:
    display: "clamp(2.75rem, 6vw, 4.5rem)"
    h1: "clamp(2rem, 4vw, 2.75rem)"
    h2: "1.75rem"
    h3: "1.25rem"
    lg: "1.125rem"
    base: "1rem"
    sm: "0.875rem"
    xs: "0.8125rem"
  leading:
    tight: "1.08"
    snug: "1.3"
    normal: "1.6"
  tracking:
    tight: "-0.02em"
    normal: "0"
    wide: "0.08em"
---

# Tokens
| Token | Value | Role |
|-------|-------|------|
| `font.sans` | system-ui stack | UI and marketing copy. |
| `font.mono` | ui-monospace stack | Code, version strings, eyebrow labels. |
| `text.display` | fluid ~44–72px | Hero headline. |
| `text.h2` | 28px | Section headings. |
| `text.base` | 16px | Body. |
| `tracking.wide` | 0.08em | Uppercase mono eyebrow labels. |

# Roles
Display and H1 use `tracking.tight` + `leading.tight` for a dense, confident headline (the zed.dev register). Body uses `leading.normal`. Mono at `text.xs` + `tracking.wide`, uppercased, is the "eyebrow" label above sections.

# Do & Don't
- **Do** reserve mono for labels, versions, and code.
- **Don't** set long body copy in mono.
