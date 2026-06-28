---
type: Library Notes
title: "Svelte"
description: "Svelte 5 replaced implicit reactivity with explicit runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`), which give fine-grained reactivity that also works in `.svelte.js` and..."
tags: [javascript, frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# Svelte

**Verified 2026-06-05.** Check the installed `svelte` version first; re-verify if newer than below.

**Current stable**: Svelte 5 (Svelte 6 upcoming). **LLM default bias**: Svelte 3 and 4. `let x` implicit reactivity, `$:` labels, `export let` props, `$store` everywhere, `createEventDispatcher` and `on:click`.

## The shift
Svelte 5 replaced implicit reactivity with explicit runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`), which give fine-grained reactivity that also works in `.svelte.js` and `.svelte.ts` modules. Events moved to plain attributes and callback props, and slots became snippets.

## Stop / Start
| Stop (Svelte 3 and 4) | Start (Svelte 5) |
| --- | --- |
| `let count = 0` as reactive state | `let count = $state(0)` |
| `$: doubled = count * 2` | `const doubled = $derived(count * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `export let foo` | `let { foo } = $props()` |
| `createEventDispatcher` / `on:click` | Callback props / `onclick={...}` |
| `<slot>` and `let:` | Snippets (`{#snippet}` / `{@render}`) |

## Gotchas
- Runes are compiler keywords, not imports. They work in `.svelte` files and `.svelte.js`/`.svelte.ts` modules only.
- Svelte 4 stores and `$:` still work for gradual migration. `svelte-migrate` automates most of it.
- Async (`await` in markup) is still behind `experimental.async`. The flag is slated to be removed in Svelte 6.
- The immutable variant is `$state.raw` (there is no `$state.frozen`); use `$state.snapshot(x)` for a plain non-proxy copy, `$derived.by(() => ...)` for multi-statement derivations, and `$effect.pre` to run before the DOM updates.
- Event modifiers were removed. `on:click|preventDefault` is gone; call `event.preventDefault()` inside the handler.

## Agent skills
Svelte ships an official MCP server (svelte.dev/docs/mcp, repo `sveltejs/ai-tools`) plus `llms.txt` and `llms-full.txt`. Prefer the official MCP for agent context.

## Sources
- https://svelte.dev/docs/svelte/v5-migration-guide
- https://svelte.dev/blog/runes
