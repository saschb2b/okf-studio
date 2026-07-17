---
type: Design System
title: OKF Studio Design System
description: The dark-first visual language for OKF Studio's marketing and download site, built from the app theme and app icon, in the register of zed.dev.
tags: [overview, design-system]
status: stable
timestamp: 2026-07-16T21:45:00Z
---

# Principles
1. **Dark-first, near-black.** Content sits on `colors.bg`; surfaces lift to `colors.surface`. Deep, calm, developer-native (the register of zed.dev).
2. **One owned color.** Identity is the blue→violet **gradient-brand**, taken from the app icon's folder. Used only for primary emphasis; everything else is neutral.
3. **Confident type.** A large, tight display headline; body at a comfortable measure; monospace for labels, versions, and code.
4. **Generous space.** Sections breathe at `space.96`/`space.128`.
5. **Restraint over decoration.** One glow, one gradient, minimal borders. No noise.
6. **Function first, edge to edge.** OKF Studio is a power tool: docked surfaces run flush behind a single hairline, and radius belongs to what floats. Beauty comes from alignment and rhythm, not enclosure (see [function-first](/guidelines/function-first.md)).

# How to use this bundle
Start here, then pull the foundations from [`/styles/tokens.css`](/styles/tokens.css) (import it once; every value is a CSS custom property). The language behind those properties lives in [color](/foundations/color.md), [typography](/foundations/typography.md), [spacing](/foundations/spacing.md), [shape](/foundations/shape.md), [elevation](/foundations/elevation.md), and [motion](/foundations/motion.md). Descend to the [components](/components/) and [patterns](/patterns/) the page needs, copy the markup from each concept's `*.example.html`, and honor the [guidelines](/guidelines/). The site's own CSS should consume the token custom properties via `var(--…)` and never hard-code a literal.
