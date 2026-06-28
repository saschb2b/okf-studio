---
type: Library Notes
title: "Jotai"
description: "The v2 API exposed a framework-agnostic store (`createStore()` with `store.get`/`store.set`/`store.sub`) and split vanilla (`jotai/vanilla`) from React (`jotai/react`), so atoms can be read and..."
tags: [javascript, data]
timestamp: 2026-06-04T00:00:00Z
---
# Jotai

**Verified 2026-06-04.** Check the installed `jotai` version first; re-verify if newer than below.

**Current stable**: v2.x. **LLM default bias**: v1 (Recoil-inspired). No exposed store API, and `useAtom` behavior where an atom getter auto-resolved promises.

## The shift
The v2 API exposed a framework-agnostic store (`createStore()` with `store.get`/`store.set`/`store.sub`) and split vanilla (`jotai/vanilla`) from React (`jotai/react`), so atoms can be read and written outside React. Async atoms became "just atoms with promise values": the getter returns the promise, only the `useAtom` hook resolves it. v2 is intentionally not Recoil-compatible.

## Stop / Start
| Stop (Jotai v1) | Start (Jotai v2) |
| --- | --- |
| Treating Jotai as having no store handle | `const store = createStore(); store.set(fooAtom, 'foo')` |
| Expecting an atom `get` to auto-await an async dep | `get` returns the promise; `await` it or read via `useAtom` |
| Importing everything from `jotai` for non-React use | `jotai/vanilla` for core, `jotai/react` for hooks |
| Assuming v1 Recoil-style semantics | The v2 atom and store model (not Recoil-compatible) |

## Gotchas
- The v1 to v2 break is mainly async-atom and store-API behavior. Simple synchronous atom code is mostly unaffected.
- Jotai is bottom-up atomic client state, good for fine-grained derived state. Like Zustand, it is not a server cache.
- Devtools live in the separate `jotai-devtools` package.

## Companion
For fetched server data, see [tanstack-query.md](./tanstack-query.md).

## Sources
- https://jotai.org/docs/guides/migrating-to-v2-api
- https://github.com/pmndrs/jotai/releases
