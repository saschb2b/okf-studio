---
odsf_version: "0.1"
okf_version: "0.1"
---

# OKF Studio Design System

Dark-first, zed.dev-inspired visual language for the OKF Studio marketing and download site. Built from the desktop app's theme and its app icon (the blue→violet folder on a near-black tile). One accent hue, restrained type on self-hosted Inter and JetBrains Mono, and no decoration that competes with the product. Start at the [overview](overview.md); pull tokens from [styles/tokens.css](styles/tokens.css).

# Overview
* [OKF Studio Design System](overview.md) - Principles, voice, and how to consume this bundle.

# Foundations
* [Color](foundations/color.md) - Near-black palette and the one accent hue.
* [Typography](foundations/typography.md) - Self-hosted Inter and JetBrains Mono on a restrained scale.
* [Spacing](foundations/spacing.md) - The px-named spacing scale and the width caps.
* [Shape](foundations/shape.md) - Corner-radius scale.
* [Elevation](foundations/elevation.md) - Three black shadows; depth from layering.
* [Motion](foundations/motion.md) - Durations and the shared easing curve.

# Components
* [Button](components/button.md) - Action control; primary is a solid accent fill. ([example](components/button.example.html))
* [Download button](components/download-button.md) - OS-specific download CTA. ([example](components/download-button.example.html))
* [Site nav](components/nav.md) - Floating pill bar. ([example](components/nav.example.html))
* [Feature card](components/feature-card.md) - Glyph + title + line. ([example](components/feature-card.example.html))
* [Viz card](components/viz-card.md) - Screenshot + caption on one surface. ([example](components/viz-card.example.html))
* [Definition rows](components/deflist.md) - Named claims on one hairline-divided surface. ([example](components/deflist.example.html))
* [Code sample](components/code.md) - A named file and its literal contents. ([example](components/code.example.html))

# Patterns
* [Hero](patterns/hero.md) - Above-the-fold composition. ([example](patterns/hero.example.html))
* [Showcase section](patterns/showcase.md) - A product story: copy header over full-width evidence. ([example](patterns/showcase.example.html))
* [Download grid](patterns/download.md) - Per-OS download section. ([example](patterns/download.example.html))

# Guidelines
* [Dark-first, never flat black](guidelines/dark-first.md) - Near-black surfaces with defined edges.
* [Function first, edge to edge](guidelines/function-first.md) - Docked tool surfaces run edge-to-edge behind a hairline; radius is for what floats.

# Subdirectories
* [foundations/](foundations/) - The design language as tokens.
* [components/](components/) - Reusable elements, each with a runnable example.
* [patterns/](patterns/) - Compositions of components.
* [guidelines/](guidelines/) - Rules to honor.
* [styles/](styles/) - Runnable token and component CSS.
