---
type: Library Notes
title: "React Router (the merged Remix)"
description: "Remix v2 merged into React Router v7, which has three modes: declarative, data, and framework."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-04T00:00:00Z
---
# React Router (the merged Remix)

**Verified 2026-06-04.** Check the installed `react-router` version first; re-verify if newer than below.

**Current stable**: React Router v7 (v7.0 shipped Nov 2024). **LLM default bias**: Remix v2 (`@remix-run/*`, `remix.config.js`) and React Router v6 `react-router-dom` as a client-only library.

## The shift
Remix v2 merged into React Router v7, which has three modes: declarative, data, and framework. Framework mode (Vite plugin, file routes, loaders and actions, SSR) is the direct successor to Remix v2, so new full-stack work uses React Router framework mode, not `@remix-run/*`. Note that "Remix v3" is a separate, future, Preact-based project, unrelated to this codebase.

## Stop / Start
| Stop (LLM default) | Start (React Router v7) |
| --- | --- |
| `@remix-run/react` / `@remix-run/node` | `react-router` (single package), framework mode |
| `remix.config.js` + Remix CLI | `@react-router/dev` Vite plugin + `react-router.config.ts` |
| Importing from `react-router-dom` | Import from `react-router` (the `-dom` package is folded in) |
| Saying "use Remix" for new React full-stack apps | "React Router v7 framework mode" |
| Hand-typing loader and action data | Generated route types (`+types`) for `loaderData`/`actionData` |

## Gotchas
- "Remix" is now ambiguous. React Router v7 framework mode is the merged successor; "Remix v3" is a different, Preact-based reimagining.
- Migrating from Remix v2 is mostly dependency renames if the v2 future flags were already enabled.
- Data mode (`createBrowserRouter`) and declarative mode (`<BrowserRouter>`) remain valid for non-full-stack apps.

## Sources
- https://reactrouter.com/start/modes
- https://reactrouter.com/upgrading/remix
