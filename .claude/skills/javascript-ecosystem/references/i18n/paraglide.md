---
type: Library Notes
title: "Paraglide JS (inlang)"
description: "Paraglide is compiler-based, not a runtime dictionary."
tags: [javascript, i18n]
timestamp: 2026-06-04T00:00:00Z
---
# Paraglide JS (inlang)

**Verified 2026-06-04.** Check the installed `@inlang/paraglide-js` version first; re-verify if newer than below.

**Current stable**: Paraglide 2 (2.18). **LLM default bias**: Paraglide 1.x with the SvelteKit-centric `@inlang/paraglide-sveltekit` package, or no awareness of it at all.

## The shift
Paraglide is compiler-based, not a runtime dictionary. Messages compile to typed ESM functions you import and call (`m.greeting({ name })`), so there is no runtime key lookup, unused messages tree-shake out, and keys and params are type-checked at build time. v2 unifies framework support into one core package plus a server middleware and per-framework adapters.

## Stop / Start
| Stop (LLM default) | Start (Paraglide 2) |
| --- | --- |
| Loading JSON dictionaries and resolving keys at runtime | Import compiled functions from `./paraglide/messages.js` and call `m.key(params)` |
| Stringly-typed `t('some.key')` lookups | Direct function calls with autocomplete and compile-time errors |
| Shipping every locale's strings to the client | The compiler tree-shakes unused messages per route |
| Framework-specific `@inlang/paraglide-sveltekit` | The unified `@inlang/paraglide-js` v2 core plus adapters |
| v1 runtime `setLocale`/`getLocale` assumptions | `getLocale()`/`setLocale()` from generated `runtime.js`, plus server middleware for SSR |

## Gotchas
- There is a build step: the compiler emits `paraglide/messages.js` and `paraglide/runtime.js`, wired via a bundler plugin or the CLI.
- Because resolution is compile-time, fully dynamic runtime key construction is not the model; messages are statically known functions.
- SSR needs the server middleware for correct request-scoped locale.

## Sources
- https://paraglidejs.com/
- https://github.com/opral/paraglide-js
