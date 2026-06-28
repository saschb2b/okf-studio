---
type: Library Notes
title: "Redux Toolkit (RTK + RTK Query)"
description: "Redux is RTK now. Redux Toolkit is the official way to write Redux, and `createStore` is formally deprecated in the core."
tags: [javascript, data]
timestamp: 2026-06-04T00:00:00Z
---
# Redux Toolkit (RTK + RTK Query)

**Verified 2026-06-04.** Check the installed `@reduxjs/toolkit` version first; re-verify if newer than below.

**Current stable**: RTK 2.x (2.0 shipped Dec 2023). **LLM default bias**: legacy hand-rolled Redux. `createStore`, separate action-type constants and creators, switch-statement reducers with manual spreads, `connect()`/`mapStateToProps`, and standalone `redux-thunk`/`redux-saga`.

## The shift
Redux is RTK now. Redux Toolkit is the official way to write Redux, and `createStore` is formally deprecated in the core. RTK Query (bundled in the package) is the built-in data-fetching layer, so hand-written thunks plus reducers for server data are out. For purely client and UI state, many teams now reach for Zustand or Jotai rather than Redux at all.

## Stop / Start
| Stop (LLM default) | Start (current Redux) |
| --- | --- |
| `createStore(rootReducer)` | `configureStore({ reducer })` |
| Action constants + creators + switch reducers | `createSlice()` (auto actions, Immer reducers) |
| `connect()` + `mapStateToProps`/`mapDispatchToProps` | `useSelector` / `useDispatch` hooks |
| Hand-rolled `redux-thunk`/`redux-saga` fetch logic | RTK Query (`createApi`) or `createAsyncThunk` |
| Manual `Object.assign`/spread immutable updates | Direct mutation inside `createSlice` (Immer) |
| Redux as the default for all state | RTK for complex shared state; a server-cache lib for fetched data |

## Gotchas
- RTK 2.0 dropped some legacy APIs, went ESM-first, and removed the object syntax for `extraReducers` (use the builder callback).
- RTK Query ships inside `@reduxjs/toolkit`; no separate install. It is not deprecated and ships regular releases.
- The hooks integration needs React-Redux v9 with React 18+.

## Companion
For server data on a non-Redux stack, see [tanstack-query.md](./tanstack-query.md).

## Sources
- https://redux-toolkit.js.org/usage/migrating-rtk-2
- https://redux.js.org/usage/migrating-to-modern-redux
