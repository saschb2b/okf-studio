---
type: Library Notes
title: "Node.js"
description: "Node now strips TypeScript types natively and by default for `.ts` files (the experimental warning is gone)."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# Node.js

**Verified 2026-06-04.** Check the project's `engines` field and the installed runtime first; re-verify if newer than below.

**Current stable**: Node 24 LTS (Node 22 also in LTS); ships npm 11. **LLM default bias**: Node 18 and 20. The assumption that running TypeScript needs `ts-node`/`tsx`, external test runners (Jest, Mocha) and watchers (`nodemon`), and that ESM cannot be `require()`'d.

## The shift
Node now strips TypeScript types natively and by default for `.ts` files (the experimental warning is gone). The built-in `node:test` runner, `--watch`, and `require(esm)` (synchronously requiring ESM without top-level await) are stable. Much of the external toolchain collapses into the runtime.

## Stop / Start
| Stop (LLM default) | Start (Node 24) |
| --- | --- |
| `ts-node` / `tsx` to run TS | `node file.ts` (native type stripping) |
| `nodemon` | `node --watch` |
| Jest or Mocha for basic suites | `node --test` with `node:test` |
| "You cannot `require()` an ESM module" | `require(esm)` works (for ESM without top-level await) |
| Targeting Node 18 or 20 baselines | Node 24 LTS (or 22); Node 18 is end of life |
| Omitting `type` on type-only TS imports | `import type` (stripping cannot tell value from type otherwise) |

## Gotchas
- Native stripping only removes types. It does not transpile enums, namespaces, or decorator emit; use `--experimental-transform-types` or a real compiler for those.
- Node will not rewrite module systems. A `.ts` file still obeys `package.json` `"type"`, and import/export syntax must match.
- `require(esm)` throws if the target uses top-level await; fall back to dynamic `import()`.

## Sources
- https://nodejs.org/api/typescript.html
- https://nodejs.org/en/about/previous-releases
