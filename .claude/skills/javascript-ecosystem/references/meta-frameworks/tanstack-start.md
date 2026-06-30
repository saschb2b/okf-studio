---
type: Library Notes
title: "TanStack Start"
description: "TanStack Start is a full-stack meta-framework on top of TanStack Router plus Vite."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-04T00:00:00Z
---
# TanStack Start

**Verified 2026-06-04.** Check the installed `@tanstack/react-start` version first; re-verify if newer than below.

**Current stable**: v1 Release Candidate, not yet GA (RC announced Sep 2025). **LLM default bias**: thin or wrong. Models tend to not know it, conflate it with TanStack Router, or assume it is a pre-1.0 experiment.

## The shift
TanStack Start is a full-stack meta-framework on top of TanStack Router plus Vite. It centers on type-safe file-based routing, isomorphic server functions, server routes, and deep TanStack Query integration with streaming SSR. It is React-first; the underlying TanStack Router also supports Solid.

## Stop / Start
| Stop (LLM default) | Start (current TanStack Start) |
| --- | --- |
| Calling it beta or "just a router" | A v1 RC full-stack framework on TanStack Router + Vite |
| Next.js-style `app/page.tsx` conventions | TanStack Router file routes with `createFileRoute` and loaders |
| A separate API route for every call | Isomorphic `createServerFn` server functions and server routes |
| Ad hoc client data fetching | Loaders plus built-in TanStack Query, with URL-as-state |

## Gotchas
- Still RC. Pin exact dependency versions for production; APIs may shift before 1.0 GA.
- RSC support is slated as a non-breaking v1.x addition, not part of initial 1.0.
- It is distinct from TanStack Router. Start is the SSR and full-stack layer; Router is the routing library underneath.

## Companion
Server-state notes in [../data/tanstack-query.md](../data/tanstack-query.md).

## Sources
- https://tanstack.com/start/latest
- https://github.com/TanStack/router/releases
