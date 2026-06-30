---
type: Library Notes
title: "CSS-in-JS and styling status"
description: "Runtime CSS-in-JS lost ground."
tags: [javascript, ui]
timestamp: 2026-06-05T00:00:00Z
---
# CSS-in-JS and styling status

**Verified 2026-06-05.** Check how the project styles components first; re-verify if newer than below.

**Current stable**: styled-components v6 (maintenance mode, v7 in prerelease); Emotion 11; Tailwind v4; vanilla-extract / Panda CSS / StyleX for zero-runtime. **LLM default bias**: defaulting to runtime CSS-in-JS (styled-components, Emotion) for new apps, and using it inside Server Components.

## The shift
Runtime CSS-in-JS lost ground. styled-components entered maintenance mode in 2025 (still shipping fixes and even v7 prereleases, but no longer the default choice). The ecosystem moved to build-time CSS: Tailwind and CSS Modules dominate, and the zero-runtime camp (vanilla-extract, Panda CSS, StyleX) emits static CSS. Crucially, runtime CSS-in-JS does not work in React Server Components.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| Defaulting to `styled-components` or Emotion for new apps | Tailwind or CSS Modules (build-time, RSC-safe) |
| Runtime CSS-in-JS inside a Server Component | Move it to a Client Component (`"use client"`), or use static CSS |
| Assuming styled-components is the modern default | It is in maintenance mode; pick it deliberately, not by habit |
| Reaching for a runtime engine when you want types plus zero runtime | vanilla-extract, Panda CSS, or StyleX (static CSS at build time) |

## Gotchas
- Runtime CSS-in-JS (styled-components, Emotion) needs `"use client"` plus an SSR style registry (`useServerInsertedHTML`); it cannot run in Server Components. The Next.js docs say so explicitly.
- styled-components is "maintenance mode, not dead": v6.4.x added `createTheme` CSS-variable theming and RSC-compatible output. Do not call it abandoned, but do not treat it as the growth path either.
- Panda CSS and StyleX are explicitly RSC-compatible; vanilla-extract generates static CSS at build time.

## Companion
Material UI styling engine in [mui.md](./mui.md); Tailwind in [tailwind.md](./tailwind.md); color roles in [theme-colors.md](./theme-colors.md).

## Sources
- https://styled-components.com/blog/celebrating-a-decade-of-styled-components
- https://nextjs.org/docs/app/guides/css-in-js
- https://panda-css.com/
