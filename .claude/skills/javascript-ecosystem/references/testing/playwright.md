---
type: Library Notes
title: "Playwright"
description: "Playwright is the dominant modern end-to-end default, ahead of Cypress on satisfaction and adoption."
tags: [javascript, testing]
timestamp: 2026-06-04T00:00:00Z
---
# Playwright

**Verified 2026-06-04.** Check the installed `@playwright/test` version first; re-verify if newer than below.

**Current stable**: 1.6x (2026). **LLM default bias**: 1.2x to 1.3x patterns, recommending Cypress as the e2e default, and treating Playwright as a newer alternative rather than the incumbent.

## The shift
Playwright is the dominant modern end-to-end default, ahead of Cypress on satisfaction and adoption. It offers free parallelization and sharding, real multi-engine coverage (Chromium, Firefox, WebKit), and multi-tab and multi-context testing. Recent releases lean into agent-driven testing (auto-cleanup disposables, AI-optimized accessibility snapshots).

## Stop / Start
| Stop (LLM default) | Start (current Playwright) |
| --- | --- |
| Defaulting to Cypress for new e2e suites | Defaulting to Playwright |
| `page.waitForTimeout` and manual sleeps | Auto-waiting web-first assertions (`await expect(locator).toBeVisible()`) |
| CSS or XPath selectors as the primary locator | Role, text, and label locators (`getByRole`, `getByText`, `getByLabel`) |
| Manual browser and context teardown | `await using` disposables (1.59+) for automatic cleanup |
| Planning component tests on `experimental-ct-*` | Vitest Browser Mode, or the main `@playwright/test` runner |

## Gotchas
- Component testing (`@playwright/experimental-ct-*`) is still experimental and is being pruned (Svelte and others removed). Use Vitest Browser Mode for component-level tests.
- The bundled browser is now Chrome for Testing builds.

## Sources
- https://playwright.dev/docs/release-notes
- https://github.com/microsoft/playwright/releases
