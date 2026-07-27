---
type: Design System
title: OKF Studio Design System
description: The dark-first visual language for OKF Studio's marketing and download site, built from the app theme and app icon, in the register of zed.dev.
tags: [overview, design-system]
status: stable
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
---

# Principles
1. **Dark-first, near-black.** Content sits on `colors.bg`; surfaces lift to `colors.surface`. Deep, calm, developer-native (the register of zed.dev).
2. **The accent marks what you can act on.** Identity is one hue, `colors.primary`, from the app icon's folder. It goes on links, the single primary button, and focus, and nowhere else. The icon's gradient stays on the icon.
3. **Restrained type.** Real typefaces, self-hosted; a display size that fits inside its measure; hierarchy from weight, color, and space rather than from scale. Monospace for labels, versions, and code.
4. **Space groups things.** Gaps are chosen to bind related blocks and separate unrelated ones, not set to the largest value available.
5. **Show the product, legibly.** A screenshot is evidence only if its text can be read; a sample of the real file format beats a paragraph describing it. If a surface does not ship yet, say so instead of illustrating it.
6. **Restraint over decoration.** No glow, no gradient fills, no movement on hover.
7. **Function first, edge to edge.** OKF Studio is a power tool: docked surfaces run flush behind a single hairline, and radius belongs to what floats. Beauty comes from alignment and rhythm, not enclosure (see [function-first](/guidelines/function-first.md)).

# Its relationship to the app
This bundle is the *site's* language, derived from the desktop app's dark theme. The brand roles (`primary`, `primary-hover`, `focus`, `error`, `warning`, `success`) **track the app** and must change with it; the surfaces and text roles deliberately do not, because a marketing page is one scroll on a near-black canvas and the app is a dense tool window with five stacked surfaces. Both tables, with reasons, are in [color](/foundations/color.md); `pnpm check:ds` enforces them.

# How to use this bundle
Start here, then pull the foundations from [`/styles/tokens.css`](/styles/tokens.css) (import it once; every value is a CSS custom property). The language behind those properties lives in [color](/foundations/color.md), [typography](/foundations/typography.md), [spacing](/foundations/spacing.md), [shape](/foundations/shape.md), [elevation](/foundations/elevation.md), and [motion](/foundations/motion.md). Descend to the [components](/components/) and [patterns](/patterns/) the page needs, copy the markup from each concept's `*.example.html`, and honor the [guidelines](/guidelines/). The site's own CSS should consume the token custom properties via `var(--…)` and never hard-code a literal.
