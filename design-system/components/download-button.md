---
type: Component
title: Download button
description: OS-specific download CTA: platform glyph, label, and a mono file/format meta line.
tags: [components, download, button]
status: stable
applies_to: [web]
generated: { by: claude/unrecorded, at: 2026-07-11T04:45:00Z }
examples:
  - /components/download-button.example.html
tokens:
  download-btn:
    background: "{colors.surface}"
    border: "{colors.border}"
    radius: "{radius.md}"
  download-btn-hover:
    border: "{colors.primary}"
    background: "{colors.surface-2}"
---

# Anatomy
`.dl-btn` holds a `.dl-btn__glyph` (platform mark), a `.dl-btn__text` column — `.dl-btn__os` (e.g. "Windows") over `.dl-btn__meta` (mono, e.g. ".msi · x64") — and a trailing `.dl-btn__arrow` (`↓`) pushed to the right edge: the quiet affordance that makes the card read as an action, not an info tile.

# Tokens
| Token | Resolves to |
|-------|-------------|
| `download-btn.background` | `{colors.surface}` |
| `download-btn-hover.border` | `{colors.primary}` |

# Variants & States
One shape per OS (Windows, macOS, Linux). Hover brightens the border to `colors.primary`; the arrow takes the primary color and nudges down 2px (instant under reduced motion). At rest the arrow sits dim (`colors.text-dim`).

# Examples
- [download-button.example.html](/components/download-button.example.html)

# Accessibility
Each is a link to a concrete artifact; the mono meta names the format so the target is unambiguous before the click.

# Do & Don't
- **Do** state the file format in the meta line.
- **Don't** hide which OS a button targets behind an icon alone.
