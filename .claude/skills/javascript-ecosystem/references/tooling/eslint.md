---
type: Library Notes
title: "ESLint"
description: "Flat config (`eslint.config.js`) became the default in v9 and is the only config system in v10, which removed the legacy `eslintrc` system entirely."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# ESLint

**Verified 2026-06-04.** Check the installed `eslint` version and which config file exists first; re-verify if newer than below.

**Current stable**: v9 (flat config default) and v10 (flat config only). **LLM default bias**: `.eslintrc.{js,json,yml}` with `extends`/`env`/`overrides`, and `.eslintignore` files.

## The shift
Flat config (`eslint.config.js`) became the default in v9 and is the only config system in v10, which removed the legacy `eslintrc` system entirely. Config resolution is per-file-directory, which is monorepo-friendly, rather than cwd-based.

## Stop / Start
| Stop (LLM default) | Start (current ESLint) |
| --- | --- |
| `.eslintrc.*` | `eslint.config.js` (flat config) |
| `extends: [...]` strings | Import configs and spread them, or `defineConfig` from `@eslint/config-helpers` |
| `env: { browser: true }` | `languageOptions.globals` (e.g. from the `globals` package) |
| `.eslintignore` | `globalIgnores()` or the `ignores` key |
| Hand-rewriting an old config | `npx @eslint/migrate-config .eslintrc.json` |

## Gotchas
- Plugins must export flat-config-compatible objects. Very old plugins without flat-config support will not load on v10.
- Flat config does not search up the tree the way `eslintrc` cascaded; composition is explicit via the exported array.
- See also **Biome** as a single-binary lint-plus-format alternative.
- Angular projects lint with `angular-eslint` (flat config via `tseslint.config(...)` + `angular.configs.*`, plus a `**/*.html` block for template and a11y rules). TSLint and Codelyzer are dead. Add it with `ng add angular-eslint`.

## Sources
- https://eslint.org/docs/latest/use/configure/configuration-files
- https://eslint.org/blog/2025/03/flat-config-extends-define-config-global-ignores/
