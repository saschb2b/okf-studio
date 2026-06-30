---
type: Library Notes
title: "Pinia"
description: "Pinia is the official, default Vue store; Vuex is maintenance-only and should not be reached for in new code."
tags: [javascript, data]
timestamp: 2026-06-04T00:00:00Z
---
# Pinia

**Verified 2026-06-04.** Check the installed `pinia` version first; re-verify if newer than below.

**Current stable**: 3.0 (Feb 2025). **LLM default bias**: Pinia v2, and more damagingly Vuex 3/4 with `state`/`getters`/`mutations`/`actions` modules and `mapState`/`mapActions`.

## The shift
Pinia is the official, default Vue store; Vuex is maintenance-only and should not be reached for in new code. Pinia v3 is a deliberately small major: it drops Vue 2 (Vue 3 only), requires TypeScript 5+, and upgrades to Devtools v7. The v2 to v3 upgrade usually needs zero code changes.

## Stop / Start
| Stop (LLM default) | Start (current Pinia) |
| --- | --- |
| Reaching for Vuex (modules, mutations, `mapState`) | Pinia as the default store |
| `defineStore({ id: 'counter', ... })` object syntax | `defineStore('counter', ...)` (object-id form removed in v3) |
| Options stores by default | Setup stores (`defineStore('x', () => { const c = ref(0); ...; return { c } })`) |
| Mutations as a separate concept | Mutate state directly inside actions (Pinia has no mutations) |
| Installing Pinia v3 on Vue 2 / Nuxt 2 | Stay on Pinia v2 there; v3 is Vue 3 / Nuxt 3+ only |

## Gotchas
- v3 requires TypeScript 5+.
- In setup stores you must return everything you want exposed, and use `storeToRefs()` to destructure state and getters without losing reactivity.
- The v2 to v3 break is mostly the removed `defineStore({ id })` syntax and the `PiniaStorePlugin` to `PiniaPlugin` rename.

## Companion
Vue paradigm notes in [../frameworks/vue.md](../frameworks/vue.md).

## Sources
- https://pinia.vuejs.org/cookbook/migration-v2-v3.html
- https://pinia.vuejs.org/core-concepts/
