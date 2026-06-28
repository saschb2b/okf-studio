---
type: Library Notes
title: "Turborepo"
description: "v2 renamed the `turbo.json` `pipeline` key to `tasks`, shipped first-class Watch Mode (`turbo watch`) and Boundaries (module-boundary enforcement), and the engine is fully Rust."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# Turborepo

**Verified 2026-06-04.** Check the installed `turbo` version and `turbo.json` first; re-verify if newer than below.

**Current stable**: v2 (2.9). **LLM default bias**: Turborepo 1.x, where the top-level config key was `pipeline` and the engine was a Go binary.

## The shift
v2 renamed the `turbo.json` `pipeline` key to `tasks`, shipped first-class Watch Mode (`turbo watch`) and Boundaries (module-boundary enforcement), and the engine is fully Rust. By 2.9, `turbo query` (affected queries over the monorepo) is stable. It is owned and developed by Vercel.

## Stop / Start
| Stop (Turborepo 1.x) | Start (Turborepo 2) |
| --- | --- |
| `"pipeline": { ... }` in `turbo.json` | `"tasks": { ... }` (the key was renamed) |
| Describing Turborepo as written in Go | Written in Rust (npm `turbo` ships platform binaries) |
| "No watch mode, use a third-party watcher" | `turbo watch <task>` (dependency-aware, built in) |
| Installing `turbo@1` / scaffolding 1.x configs | `turbo@2` (`npx turbo@latest`) |
| Codeowners or ESLint to enforce package boundaries | `"boundaries": true` (native, experimental) |
| Filtering affected packages manually | `turbo run --affected` / `turbo query` |

## Gotchas
- Run `npx @turbo/codemod migrate` to auto-rename `pipeline` to `tasks` and apply other v1 to v2 transforms.
- Boundaries and OpenTelemetry logging are still experimental in 2.9; do not present them as fully stable.
- v2 tightened env handling: env vars must be declared (`env`/`globalEnv`) for correct hashing, or caching is wrong.

## Sources
- https://turborepo.dev/docs/reference/configuration
- https://turborepo.dev/blog/2-9
