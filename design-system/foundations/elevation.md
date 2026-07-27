---
type: Elevation
title: Elevation
description: Three black shadows for the few surfaces that genuinely float; depth on dark comes from layered near-blacks and hairlines instead.
tags: [foundations, elevation, shadow, tokens]
status: stable
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
tokens:
  shadow:
    sm: "0 1px 2px rgba(0,0,0,0.5)"
    md: "0 8px 30px rgba(0,0,0,0.45)"
    lg: "0 24px 70px rgba(0,0,0,0.55)"
---

# Tokens
| Token | Use |
|-------|-----|
| `shadow.sm` | The nav pill at rest. |
| `shadow.md` | Menus and popovers over the page. |
| `shadow.lg` | The hero product shot and the spotlight overlay. |

Shadows are pure black at low alpha, because a colored shadow on a near-black background reads as haze rather than as depth.

# Depth comes from layering, not from bloom
On dark, a surface separates from its background because it is a step lighter (`bg` to `surface` to `surface-2`) and because a `colors.border` hairline draws its edge. That is the whole system. Shadow is reserved for the three cases above, where an element really is floating over something else.

The palette previously carried `glow.brand` and `glow.brand-strong`, colored blooms behind the hero art and under the primary button on hover. They are gone. A glowing button is the most common tell of a template landing page, and on a product whose claim is that you can see exactly what it does, atmosphere works against the message.

# Do & Don't
- **Do** separate surfaces with a step in lightness and a hairline.
- **Do** keep hover feedback on border and text color rather than on elevation.
- **Don't** add a colored glow to any element.
- **Don't** lift cards on hover; a grid that jumps under the pointer reads as decoration.
