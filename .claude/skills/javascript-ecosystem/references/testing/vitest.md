---
type: Library Notes
title: "Vitest"
description: "Vitest is the default test runner for Vite-based projects, having displaced Jest for new Vite, React, Vue, and Svelte work because it reuses the Vite config and transform pipeline and runs ESM and..."
tags: [javascript, testing]
timestamp: 2026-06-04T00:00:00Z
---
# Vitest

**Verified 2026-06-04.** Check the installed `vitest` version first; re-verify if newer than below.

**Current stable**: 4.x (4.0 GA Dec 2025). **LLM default bias**: 0.x and 1.x config patterns, the assumption that Jest is the default runner, and treating browser mode as experimental.

## The shift
Vitest is the default test runner for Vite-based projects, having displaced Jest for new Vite, React, Vue, and Svelte work because it reuses the Vite config and transform pipeline and runs ESM and TS natively. v4 made Browser Mode stable, so component tests run in a real browser via Playwright instead of JSDOM.

## Stop / Start
| Stop (LLM default) | Start (Vitest 4) |
| --- | --- |
| Reaching for Jest by default in a Vite project | Vitest, reusing the existing `vite.config.ts` transforms |
| The `workspace` config field | `projects` (`workspace` was removed in v4) |
| Treating browser testing as experimental or JSDOM-only | Stable Browser Mode (`browser.provider: 'playwright'`) for real-DOM tests |
| Importing browser context from `@vitest/browser/context` | Import from `vitest/browser` |
| Expecting `vi.restoreAllMocks()` to reset `vi.fn()` | `vi.resetAllMocks()` for those (v4 `restoreAll` only undoes `spyOn`) |

## Gotchas
- Config lives in `vitest.config.ts`, merged with `vite.config.ts` via `mergeConfig`. Use the `test` key.
- `vi.fn().mock.invocationCallOrder` now starts at 1 (Jest-aligned), not 0.
- v4 adds an `agent` reporter tuned for low-token AI-agent output.

## Companion
Vite paradigm notes in [../tooling/vite.md](../tooling/vite.md). Component assertions in [testing-library.md](./testing-library.md).

## Sources
- https://vitest.dev/blog/vitest-4
- https://vitest.dev/guide/migration.html
