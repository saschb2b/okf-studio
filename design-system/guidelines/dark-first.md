---
type: Guideline
title: Dark-first, never flat black
description: Build on near-black surfaces with defined edges, not pure #000.
tags: [guidelines, color, dark]
status: stable
generated: { by: claude/unrecorded, at: 2026-07-01T16:31:45Z }
sources:
  - id: apple-hig-icons
    resource: https://developer.apple.com/design/human-interface-guidelines/app-icons
    title: "Apple Human Interface Guidelines: App icons"
---

# Rule
Use `colors.bg` (#0B0B0D) and `colors.gradient-tile` for large dark areas, never flat `#000000`.

# Why
Per Apple's dark-icon/dark-UI guidance, flat pure black loses edge definition on dark displays and OLED: surfaces and tiles lose their silhouette. A subtle near-black (and a gentle top→bottom gradient on hero tiles) keeps edges and depth.

# Do
Fill the page with `colors.bg`; give hero/product tiles `colors.gradient-tile`.

# Don't
Set `background: #000` on the page or large panels.
