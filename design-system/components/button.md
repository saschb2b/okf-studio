---
type: Component
title: Button
description: Action control. Primary uses the brand gradient; secondary and ghost are neutral.
tags: [components, button]
status: stable
applies_to: [web]
timestamp: 2026-07-01T16:30:46Z
examples:
  - /components/button.example.html
tokens:
  button-primary:
    background: "{colors.gradient-brand}"
    color: "{colors.on-primary}"
    radius: "{radius.md}"
  button-primary-hover:
    shadow: "{glow.brand}"
  button-secondary:
    background: "{colors.surface-2}"
    color: "{colors.text}"
    border: "{colors.border-strong}"
---

# Anatomy
A single element (`.btn`) with one variant modifier: `.btn--primary`, `.btn--secondary`, or `.btn--ghost`. Optional leading glyph in the `gap`.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `button-primary.background` | `{colors.gradient-brand}` |
| `button-primary.color` | `{colors.on-primary}` |
| `button-primary-hover.shadow` | `{glow.brand}` |
| `button-secondary.background` | `{colors.surface-2}` |

# Variants & States
| Variant | Use | Hover |
|---------|-----|-------|
| `--primary` | The one main action (Download). | Brand glow + 1px lift. |
| `--secondary` | Neutral secondary action. | Border brightens. |
| `--ghost` | Low-emphasis / nav actions. | Text brightens. |

# Examples
- [button.example.html](/components/button.example.html) - the three variants.

# Accessibility
Hit target ≥ 44px tall via padding. Focus uses `:focus-visible` with a 2px `colors.focus` ring. Large bold label keeps gradient contrast ≥ 3:1.

# Do & Don't
- **Do** use exactly one `--primary` per view.
- **Don't** put the gradient on secondary actions.
