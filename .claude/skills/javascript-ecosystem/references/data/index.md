# Client state and data fetching

- [Jotai](jotai.md) - The v2 API exposed a framework-agnostic store (`createStore()` with `store.get`/`store.set`/`store.sub`) and split vanilla (`jotai/vanilla`) from React (`jotai/react`), so atoms can be read and...
- [NgRx](ngrx.md) - NgRx is Angular's dominant state library (its Redux Toolkit).
- [Pinia](pinia.md) - Pinia is the official, default Vue store; Vuex is maintenance-only and should not be reached for in new code.
- [Redux Toolkit (RTK + RTK Query)](redux-toolkit.md) - Redux is RTK now. Redux Toolkit is the official way to write Redux, and `createStore` is formally deprecated in the core.
- [SWR](swr.md) - SWR is Vercel's minimal stale-while-revalidate data hook, lighter than TanStack Query and Next-aligned.
- [TanStack Query (React Query)](tanstack-query.md) - v5 unified every hook on a single object argument (no positional overloads), and made Suspense first-class via dedicated `useSuspenseQuery`/`useSuspenseInfiniteQuery` where `data` is never typed...
- [Zustand](zustand.md) - v5 dropped React below 18, so it uses React's native `useSyncExternalStore` directly, and it removed the ability to pass a custom equality function to the `create`-returned hook.
