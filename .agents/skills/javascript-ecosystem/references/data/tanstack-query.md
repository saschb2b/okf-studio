---
type: Library Notes
title: "TanStack Query (React Query)"
description: "v5 unified every hook on a single object argument (no positional overloads), and made Suspense first-class via dedicated `useSuspenseQuery`/`useSuspenseInfiniteQuery` where `data` is never typed..."
tags: [javascript, data]
timestamp: 2026-06-04T00:00:00Z
---
# TanStack Query (React Query)

**Verified 2026-06-04.** Check the installed `@tanstack/react-query` version first; re-verify if newer than below.

**Current stable**: v5.x (v5.0 shipped Oct 2023). **LLM default bias**: v3 and v4 under the old `react-query` package name, the positional `useQuery(key, fn, options)` signature, `cacheTime`, `isLoading`, `keepPreviousData`, and `onSuccess`/`onError` callbacks.

## The shift
v5 unified every hook on a single object argument (no positional overloads), and made Suspense first-class via dedicated `useSuspenseQuery`/`useSuspenseInfiniteQuery` where `data` is never typed as `undefined`. The package is `@tanstack/react-query`, not `react-query`. It is a server-state cache, not a client-state store.

## Stop / Start
| Stop (LLM default) | Start (TanStack Query v5) |
| --- | --- |
| `import { useQuery } from 'react-query'` | `import { useQuery } from '@tanstack/react-query'` |
| `useQuery(['todos'], fetchTodos, {...})` | `useQuery({ queryKey: ['todos'], queryFn: fetchTodos, ... })` |
| `cacheTime: 5000` | `gcTime: 5000` |
| `isLoading` to mean first load | `isPending` for the no-data state |
| `keepPreviousData: true` | `placeholderData: keepPreviousData` (import the helper) |
| `onSuccess`/`onError` on `useQuery` | Handle in the component, or global `QueryCache` callbacks (mutations keep these) |
| Manual `suspense: true` flag | `useSuspenseQuery` (typed, non-undefined `data`) |

## Gotchas
- Minimum React 18 and TypeScript 4.7. An official codemod converts the positional signature to the object form.
- `query.remove()` was removed; use `queryClient.removeQueries()`.
- For fetched server data, reach here, not for Redux or Zustand.

## Sources
- https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- https://github.com/TanStack/query/releases
