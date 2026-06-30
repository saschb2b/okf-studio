---
type: Library Notes
title: "Zustand"
description: "v5 dropped React below 18, so it uses React's native `useSyncExternalStore` directly, and it removed the ability to pass a custom equality function to the `create`-returned hook."
tags: [javascript, data]
timestamp: 2026-06-04T00:00:00Z
---
# Zustand

**Verified 2026-06-04.** Check the installed `zustand` version first; re-verify if newer than below.

**Current stable**: v5 (5.0 shipped Oct 2024). **LLM default bias**: v4. `create` with a built-in equality argument, `shallow` passed as a selector's second arg, deep middleware import paths, and the `use-sync-external-store` shim for React below 18.

## The shift
v5 dropped React below 18, so it uses React's native `useSyncExternalStore` directly, and it removed the ability to pass a custom equality function to the `create`-returned hook. Shallow comparison now goes through the `useShallow` hook. It is a client-state library, not a server cache.

## Stop / Start
| Stop (Zustand v4) | Start (Zustand v5) |
| --- | --- |
| `useStore(selector, shallow)` | `useStore(useShallow(selector))` |
| `import { shallow } from 'zustand/shallow'` | `import { useShallow } from 'zustand/react/shallow'` |
| `create` when you need custom equality | `createWithEqualityFn` from `zustand/traditional` |
| Returning a fresh object from a selector unmemoized | Wrap it in `useShallow` to avoid re-render loops |
| `import { devtools } from 'zustand/middleware/devtools'` | `import { devtools } from 'zustand/middleware'` |

## Gotchas
- Requires React 18+ and TypeScript 4.5+. ES5 output is dropped.
- Selectors returning new references are the number-one v5 upgrade footgun; `useShallow` is the fix.
- Recommended pairing: Zustand for UI and client state, plus TanStack Query for server state.

## Companion
For fetched server data, see [tanstack-query.md](./tanstack-query.md).

## Sources
- https://zustand.docs.pmnd.rs/migrations/migrating-to-v5
- https://github.com/pmndrs/zustand/releases
