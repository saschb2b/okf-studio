---
type: Library Notes
title: "Jest"
description: "Jest 30 is faster and leaner with a modernized toolchain (jsdom 26, dropped legacy Node)."
tags: [javascript, testing]
timestamp: 2026-06-04T00:00:00Z
---
# Jest

**Verified 2026-06-04.** Check the installed `jest` version first; re-verify if newer than below.

**Current stable**: 30 (Jun 2025). **LLM default bias**: Jest 27 to 29 with Babel-based CommonJS transforms, `jest.mock()` for CJS, and Jest assumed to be the universal default runner.

## The shift
Jest 30 is faster and leaner with a modernized toolchain (jsdom 26, dropped legacy Node). But for a new Vite or ESM project it is now the legacy choice versus Vitest. Native ESM works but is still experimental and needs explicit setup.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| Adopting Jest for a fresh Vite, React, or TS project | Vitest (keep Jest for established CRA, Babel, or Next-without-Vite suites) |
| Assuming seamless native ESM | `--experimental-vm-modules` and `jest.unstable_mockModule()` for module mocking |
| Targeting old Node | Node 18+ (Jest 30 dropped 14, 16, 19, 21) and TypeScript 5.4+ |
| Mocking `window.location` the old way | Account for jsdom 26 spec-compliance, which broke navigation hacks |
| Removed `expect` aliases | Canonical matcher names (eslint-plugin-jest autofixes) |

## Gotchas
- Config can be authored in TypeScript (`.mts`/`.cts`).
- The new `globalsCleanup` option (default soft) warns about uncleaned globals; address leaks now.
- The `using` keyword is supported for auto-cleanup of spies.

## Sources
- https://jestjs.io/blog/2025/06/04/jest-30
- https://jestjs.io/docs/upgrading-to-jest30
