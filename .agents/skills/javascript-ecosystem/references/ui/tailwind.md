---
type: Library Notes
title: "Tailwind CSS"
description: "v4 is a ground-up rewrite on the Rust \"Oxide\" engine with a CSS-first configuration model."
tags: [javascript, ui]
timestamp: 2026-06-04T00:00:00Z
---
# Tailwind CSS

**Verified 2026-06-04.** Check the installed `tailwindcss` version first; re-verify if newer than below.

**Current stable**: v4.x (v4.0 shipped Jan 2025). **LLM default bias**: v3.x. A JavaScript `tailwind.config.js` with `content` globs and `theme.extend`, the `@tailwind base/components/utilities` directives, and PostCSS/JIT as the engine.

## The shift
v4 is a ground-up rewrite on the Rust "Oxide" engine with a CSS-first configuration model. There is no `tailwind.config.js` by default. You configure the design system inside CSS via `@theme`, and a single `@import "tailwindcss";` replaces the three `@tailwind` directives. v4 is the default for new projects.

## Stop / Start
| Stop (LLM default) | Start (Tailwind v4) |
| --- | --- |
| `tailwind.config.js` with `theme.extend` | A `@theme { ... }` block in CSS (JS config is opt-in via `@config`) |
| `@tailwind base; @tailwind components; @tailwind utilities;` | A single `@import "tailwindcss";` |
| Design tokens defined in JS | CSS custom properties in `@theme` (a token also becomes a real CSS var) |
| `postcss` + `autoprefixer` + `tailwindcss` trio | `@tailwindcss/postcss` or `@tailwindcss/vite` |
| `theme()` function calls in CSS | Reference the generated variables, `var(--color-...)` |

## Gotchas
- v4 needs a modern-browser baseline (cascade layers, `@property`, `color-mix()`). Not for legacy targets.
- Renamed utilities: `shadow-sm` to `shadow-xs`, `outline-none` to `outline-hidden`; the `bg-opacity-*` style modifiers are gone. Use `npx @tailwindcss/upgrade`.
- A JS config still works, but only when loaded explicitly with `@config "./tailwind.config.js";`. It is no longer auto-detected.

## Sources
- https://tailwindcss.com/blog/tailwindcss-v4
- https://tailwindcss.com/docs/upgrade-guide
