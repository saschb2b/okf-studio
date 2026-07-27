---
type: Component
title: Button
description: Action control. Primary is a solid accent fill; secondary and ghost are neutral. Feedback is color, never motion.
tags: [components, button]
status: stable
applies_to: [web]
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
examples:
  - /components/button.example.html
tokens:
  button-primary:
    background: "{colors.primary}"
    color: "{colors.on-primary}"
    radius: "{radius.md}"
  button-primary-hover:
    background: "{colors.primary-hover}"
  button-secondary:
    background: "{colors.surface-2}"
    color: "{colors.text}"
    border: "{colors.border-strong}"
---

# Anatomy
A single element (`.btn`) with one variant modifier: `.btn--primary`, `.btn--secondary`, or `.btn--ghost`, and one optional size modifier, `.btn--lg`. Optional leading glyph in the `gap`.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `button-primary.background` | `{colors.primary}` |
| `button-primary.color` | `{colors.on-primary}` |
| `button-primary-hover.background` | `{colors.primary-hover}` |
| `button-secondary.background` | `{colors.surface-2}` |

# Variants & States
| Variant | Use | Hover |
|---------|-----|-------|
| `--primary` | The one main action (Download). | Fill brightens one step. |
| `--secondary` | Neutral secondary action. | Border brightens. |
| `--ghost` | Low-emphasis and nav actions. | Text brightens. |
| `--lg` | The page's headline action, in the hero and the download band. | As its variant. |

The default size sits at `text.sm`, which is the size the nav pill needs; `--lg` steps up to `text.base` with `space.16`/`space.24` padding for the one action a page is built around.

# Why the gradient and the glow are gone
The primary button used to carry `colors.gradient-brand` with a `glow.brand` shadow and a 1px lift on hover. Three signals for one control, and all three are the visual signature of a template landing page rather than of a tool. A solid `colors.primary` fill is louder in the only way that matters, because it is the sole saturated element on the page, and it stays honest at every size. Hover moves one step to `colors.primary-hover`, and nothing moves.

# Examples
- [button.example.html](/components/button.example.html) - the variants and sizes.

# Accessibility
Padding keeps the hit target at least 40px tall, and `--lg` at 48px. Focus uses `:focus-visible` with a 2px `colors.focus` ring at a 2px offset. The label is `colors.on-primary`, which is near-black rather than white: on the light `colors.primary` fill, white came to 3.2:1 and the near-black comes to 6.2:1. See [color](/foundations/color.md) for why darkening the accent instead was not an option.

# Do & Don't
- **Do** use exactly one `--primary` per view.
- **Do** reserve `--lg` for that same single action.
- **Don't** fill a button with `colors.gradient-brand`.
- **Don't** animate a button's position or add a shadow on hover.
