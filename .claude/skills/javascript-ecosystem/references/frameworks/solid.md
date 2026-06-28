---
type: Library Notes
title: "Solid"
description: "Signals stay the foundation (`createSignal`, `createMemo`, `createEffect`)."
tags: [javascript, frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# Solid

**Verified 2026-06-05.** Check the installed `solid-js` version first; re-verify if newer than below.

**Current stable**: 1.9.x (2.0 in beta). **LLM default bias**: thin corpus overall. Usually `createResource` + `<Suspense>`, manual `batch()`, and React mental models leaking in.

## The shift
Signals stay the foundation (`createSignal`, `createMemo`, `createEffect`). Solid 2.0 (beta) makes async first-class. Computations can await promises, the graph suspends and resumes automatically, and `createAsync()` largely supersedes the `createResource` + `<Suspense>` ceremony. Batching becomes automatic.

## Stop / Start
| Stop (LLM default) | Start (current Solid) |
| --- | --- |
| Destructuring props (breaks reactivity) | Access props directly, or `splitProps` / `mergeProps` |
| Reading a signal as a value | Call it as a getter, `count()` |
| React `useEffect` deps-array mental model | `createEffect` tracks read dependencies automatically |
| `createResource` + manual `<Suspense>` (2.0) | `createAsync()` with first-class async |
| Wrapping updates in `batch()` (2.0) | Automatic batching, with `flush()` to force |
| React-style immutable spread of whole objects | `createStore` path syntax (`setState("user", "name", v)`) or `produce` |

## Gotchas
- 2.0 is beta on the npm `next` tag. Use the 1.9 stable line in production. SolidStart tracks 2.0 in lockstep and is not yet stable on it.
- Props are reactive proxies, not plain objects. Top-level destructuring loses reactivity in both 1.x and 2.0.
- Components run once; there is no re-render cycle, so only fine-grained reads update.
- `createAsync` currently ships via `@solidjs/router` (2.0-era), not core `solid-js` 1.9. `createEffect` has no deps array; its optional second argument is an initial value, not dependencies.

## Sources
- https://www.solidjs.com/
- https://github.com/solidjs/solid/releases
