---
type: Pattern
title: Download grid
description: The per-OS download section: a row of platform download buttons over a mono note about signing/updates.
tags: [patterns, download]
status: stable
timestamp: 2026-07-01T16:31:45Z
examples:
  - /patterns/download.example.html
---

# When to use
The download section (anchor `#download`), and any "get the app" block.

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Buttons | [Download button](/components/download-button.md) × N | One per supported OS. |
| Note | mono `text.xs`, `colors.text-dim` | Version, "unsigned for now", link to all releases. |

# Example
- [download.example.html](/patterns/download.example.html)

# Do & Don't
- **Do** link each button to a concrete release artifact.
- **Don't** gate the download behind a form.
