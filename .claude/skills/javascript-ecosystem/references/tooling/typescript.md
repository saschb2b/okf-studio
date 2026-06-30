---
type: Library Notes
title: "TypeScript"
description: "Modern configs are ESM-first and strict, with verbatim module syntax."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# TypeScript

**Verified 2026-06-04.** Check the installed `typescript` version and `tsconfig.json` first; re-verify if newer than below.

**Current stable**: 5.x line, with 6.0 as the last release on the original JavaScript codebase and 7.0 (the Go-based native compiler, "tsgo") in preview. **LLM default bias**: TS 5.0 to 5.5, `moduleResolution: "node"`, `esModuleInterop`-era CommonJS configs, and the assumption that `tsc` is always the slow JS-based compiler.

## The shift
Modern configs are ESM-first and strict, with verbatim module syntax. TypeScript 7.0 rewrites the compiler in Go ("tsgo") for roughly 10x faster type-checking with the same type semantics. 6.0 is the transitional last release on the old codebase and turns long-deprecated options into errors.

## Stop / Start
| Stop (LLM default) | Start (modern TS) |
| --- | --- |
| `moduleResolution: "node"` | `"nodenext"` (or `"bundler"` for bundler projects) |
| `importsNotUsedAsValues` / `preserveValueImports` | `verbatimModuleSyntax: true` (forces explicit `import type`) |
| Assuming `tsc` is the only or slow compiler | `tsgo` (`@typescript/native-preview`) for the 7.0 preview |
| Manual `try`/`finally` for cleanup | `using` / `await using` (stable since 5.2) |
| Hand-written `esModuleInterop`-heavy CJS tsconfig | The modern `tsc --init` baseline (`nodenext`, `esnext`, `strict`, `isolatedModules`) |

## Gotchas
- With `verbatimModuleSyntax`, type-only imports and exports must use `import type` / `export type` or the build breaks. Node's native type stripping needs the same.
- The 7.0 preview is not a drop-in for pipelines that depend on the TypeScript Compiler API; treat it as preview.
- Run a build on 6.0 before attempting 7.0; 6.0 makes deprecated options hard errors.

## Sources
- https://www.typescriptlang.org/docs/handbook/release-notes/
- https://devblogs.microsoft.com/typescript/
