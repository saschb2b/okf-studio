---
type: Library Notes
title: "SvelteKit"
description: "Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) replace the implicit Svelte 4 model inside SvelteKit too."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-04T00:00:00Z
---
# SvelteKit

**Verified 2026-06-04.** Check the installed `@sveltejs/kit` and `svelte` versions first; re-verify if newer than below.

**Current stable**: SvelteKit 2.x with Svelte 5. **LLM default bias**: Svelte 4 reactivity inside SvelteKit, and the assumption that `load` functions plus form actions are the only data path.

## The shift
Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) replace the implicit Svelte 4 model inside SvelteKit too. SvelteKit added remote functions (`query`, `form`, `command`, `prerender`) for type-safe client-server calls directly in components, an alternative to `load` and form actions, though still experimental.

## Stop / Start
| Stop (LLM default) | Start (current SvelteKit) |
| --- | --- |
| `export let prop` and `$:` inside routes | Runes (`$props()`, `$derived`, `$effect`) |
| Assuming `load` + form actions are the only data path | Optionally remote functions (`query`/`form`/`command`) for component-level data |
| `on:click` event directives | Plain `onclick` attributes (Svelte 5 event model) |
| `<slot>` for composition | Snippets (`{#snippet}` / `{@render}`) |

## Gotchas
- Remote functions are experimental. They require `kit.experimental.remoteFunctions` and `compilerOptions.experimental.async`. Do not present them as the stable default.
- The remote-function API churns fast across minors. Confirm the current signatures before using.

## Companion
Core Svelte 5 runes notes in [../frameworks/svelte.md](../frameworks/svelte.md).

## Sources
- https://svelte.dev/docs/kit/remote-functions
- https://github.com/sveltejs/kit/releases
