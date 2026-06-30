---
type: Library Notes
title: "Storybook"
description: "Testing moved into the core via the Vitest addon: Storybook 9 rebuilt component testing on Vitest browser mode, running stories as real-browser tests, and slimmed the install by folding the former..."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# Storybook

**Verified 2026-06-04.** Check the installed `storybook` version first; re-verify if newer than below.

**Current stable**: 10.x (10.4, Jun 2026); v10.0 shipped Oct 2025. **LLM default bias**: Storybook 6/7. `@storybook/addon-essentials`, the standalone `@storybook/test-runner` plus `@storybook/jest`/`@storybook/testing-library`, CommonJS, and the heavyweight multi-addon install.

## The shift
Testing moved into the core via the Vitest addon: Storybook 9 rebuilt component testing on Vitest browser mode, running stories as real-browser tests, and slimmed the install by folding the former "essentials" (Controls, Actions, Viewport, Backgrounds) into core. Storybook 10 is ESM-only, adds Vitest 4 and Next 16 support, and introduces `sb.mock` module mocking.

## Stop / Start
| Stop (LLM default) | Start (Storybook 10) |
| --- | --- |
| Installing or expecting Storybook 7/8/9 | Storybook 10 (10.4.x); v9 is the prior major |
| `@storybook/addon-essentials` plus a pile of addons | A minimal install; Controls/Actions/Viewport are built into core |
| `@storybook/test-runner` + `@storybook/jest` + `testing-library` | `@storybook/addon-vitest` (stories as Vitest browser-mode tests) |
| `@storybook/experimental-addon-test` | `@storybook/addon-vitest` (renamed, stable) |
| Separate MDX/autodocs addons | `@storybook/addon-docs` (consolidated) |
| CommonJS config and old Node | ESM-only config on Node 20.16+/22.19+/24+ |

## Gotchas
- Upgrade with `npx storybook@latest upgrade`, which runs codemods; verify your `.storybook/main` addon list afterward.
- The Vitest addon needs a real browser runner (Playwright via `@vitest/browser`), so CI must provision browsers.
- v10 being ESM-only breaks `require()`-based config and old Node; bump Node first.

## Companion
Vitest paradigm notes in [../testing/vitest.md](../testing/vitest.md).

## Sources
- https://storybook.js.org/blog/storybook-10/
- https://storybook.js.org/docs/writing-tests/integrations/vitest-addon
