---
type: Library Notes
title: "TanStack Router"
description: "TanStack Router is a standalone, end-to-end type-safe React router (TanStack Start is the full-stack framework built on top of it)."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# TanStack Router

**Verified 2026-06-05.** Check the installed `@tanstack/react-router` version first; re-verify if newer than below.

**Current stable**: v1. **LLM default bias**: applying React Router patterns (`<Routes>`/`<Route element>`, `:param`), untyped params and search, and forgetting the route-tree codegen.

## The shift
TanStack Router is a standalone, end-to-end type-safe React router (TanStack Start is the full-stack framework built on top of it). The headline is fully typed params, typed search params parsed as structured JSON, and route loaders, with a generated route tree.

## Stop / Start
| Stop (React Router habits) | Start (TanStack Router) |
| --- | --- |
| `<Routes>` / `<Route element>` JSX or `createBrowserRouter` arrays | `createFileRoute('/posts/')({ component })` exporting `Route` |
| `:param` dynamic segments | `$param` segments (`/blog/post/$postId`) |
| Untyped `useParams` and query strings | Typed `Route.useParams()` and `validateSearch` + `Route.useSearch()` |
| Hand-wiring data fetching in components | A route `loader` plus `Route.useLoaderData()` |
| Plain `<Link to>` without inference | Typed `<Link to params search>` and `useNavigate({ from })` |

## Gotchas
- The `@tanstack/router-plugin/vite` plugin (`tanstackRouter({ target: 'react' })`) must come before `@vitejs/plugin-react`; it generates `routeTree.gen.ts`. The `tsr generate`/`tsr watch` CLI is the alternative. Skipping it breaks type inference.
- Search params are a first-class state manager here; validate them with a schema (for example Zod) via `validateSearch`.
- It is distinct from React Router and from TanStack Start; do not conflate the APIs.

## Companion
The full-stack framework on top is [tanstack-start.md](./tanstack-start.md); the established alternative is [react-router.md](./react-router.md).

## Sources
- https://tanstack.com/router/latest/docs
- https://tanstack.com/router/latest/docs/framework/react/guide/search-params
