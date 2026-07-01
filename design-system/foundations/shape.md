---
type: Shape
title: Shape
description: Corner-radius scale, echoing the app-icon tile's ~16% rounding.
tags: [foundations, shape, radius, tokens]
status: stable
timestamp: 2026-07-01T16:29:01Z
tokens:
  radius:
    sm: "8px"
    md: "12px"
    lg: "16px"
    xl: "24px"
    pill: "999px"
  border:
    width: "1px"
---

# Tokens
| Token | Value | Role |
|-------|-------|------|
| `radius.md` | 12px | Buttons, inputs. |
| `radius.lg` | 16px | Cards, panels (matches the icon tile proportion). |
| `radius.xl` | 24px | Hero media, large surfaces. |
| `radius.pill` | 999px | Pills, eyebrow chips. |

# Do & Don't
- **Do** pair larger surfaces with larger radii.
- **Don't** mix sharp and round corners on one element.
