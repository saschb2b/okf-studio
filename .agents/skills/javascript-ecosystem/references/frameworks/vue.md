---
type: Library Notes
title: "Vue"
description: "`<script setup>` Composition API is the idiomatic default."
tags: [javascript, frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# Vue

**Verified 2026-06-05.** Check the installed `vue` version first; re-verify if newer than below.

**Current stable**: 3.5 (3.6 with Vapor Mode in beta). **LLM default bias**: Vue 2 Options API, `Vue.component`, mixins, Vuex, plus Options-heavy early Vue 3.

## The shift
`<script setup>` Composition API is the idiomatic default. Shared logic moves from mixins to composables, state from Vuex to Pinia, two-way binding to `defineModel()`. Vue 3.6 adds Vapor Mode, an opt-in virtual-DOM-free compile path for Solid and Svelte-class performance, still experimental.

## Stop / Start
| Stop (LLM default) | Start (current Vue) |
| --- | --- |
| Options API (`data`/`methods`/`computed`) as default | `<script setup>` with `ref`/`reactive`/`computed` |
| Mixins for shared logic | Composables (`useX()` functions) |
| Runtime `defineProps`/`defineEmits` objects | Type-based `defineProps<T>()` / `defineEmits<T>()` |
| `modelValue` + `update:modelValue` boilerplate | `defineModel()` (stable since 3.4) |
| Vuex | Pinia, the official state default |
| `Vue.component` global registration | Explicit imports and `createApp().use()` |
| `withDefaults()` for prop defaults | Native destructure defaults (Reactive Props Destructure, stable 3.5) |
| String `ref` + `this.$refs` | `useTemplateRef('name')` (3.5); `useId()` for SSR-safe ids |

## Gotchas
- Vapor Mode is opt-in via `<script setup vapor>` (or `createVaporApp` for a whole app) and not production-ready in the 3.6 alpha/beta. Do not assume it.
- The 3.6 reactivity rewrite is internal and mostly backward compatible. Retest performance-sensitive code.
- `defineModel()` replaces the old `modelValue` prop plus `update:modelValue` emit pattern.

## Agent skills
Vue publishes official `llms.txt` and `llms-full.txt` (vuejs.org/llms.txt) for agent context. The community `vuejs-ai/skills` exists but is not yet official.

## Sources
- https://vuejs.org/about/releases
- https://blog.vuejs.org/
- https://github.com/vuejs/core/releases
