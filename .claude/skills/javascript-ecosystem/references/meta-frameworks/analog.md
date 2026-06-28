---
type: Library Notes
title: "AnalogJS"
description: "AnalogJS is the fullstack Angular meta-framework, the Angular equivalent of Next.js, Nuxt, and SvelteKit."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# AnalogJS

**Verified 2026-06-05.** Check the installed `@analogjs/platform` version first; re-verify if newer than below.

**Current stable**: 2.x. **LLM default bias**: not knowing Angular has a Vite meta-framework; assuming Angular CLI plus webpack only; manual `RouterModule.forRoot([...])` route arrays.

## The shift
AnalogJS is the fullstack Angular meta-framework, the Angular equivalent of Next.js, Nuxt, and SvelteKit. It is Vite-powered (Vite, Vitest, Nitro/h3), with file-based routing, server and API routes, and hybrid SSR/SSG.

## Stop / Start
| Stop (LLM default) | Start (AnalogJS) |
| --- | --- |
| "Angular is CLI plus webpack only" | A Vite-based meta-framework (the `analog()` plugin in `vite.config.ts`) |
| Manual `RouterModule.forRoot([...])` arrays | File-based routes under `src/app/pages` (`*.page.ts`) plus `provideFileRouter()` |
| A separate backend for simple endpoints | Filesystem API routes under `src/server/routes/api` (h3 `defineEventHandler`) |
| Karma plus a webpack build | Vitest test runner; SSG via `prerender.routes` |

## Gotchas
- Folder conventions: pages `src/app/pages`, API `src/server/routes/api`, content `src/content`.
- Dynamic route params use `[param].page.ts`; route groups use `(group)/`.
- The Analog SFC (`.analog`/`.ng`, `defineMetadata()` with `<script>`/`<template>`/`<style>`) is experimental behind a flag; do not assume it for normal components.

## Companion
The framework in [../frameworks/angular.md](../frameworks/angular.md).

## Sources
- https://analogjs.org/docs
- https://analogjs.org/docs/features/routing/overview
