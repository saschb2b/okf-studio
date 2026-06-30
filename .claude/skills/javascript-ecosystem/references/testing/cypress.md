---
type: Library Notes
title: "Cypress"
description: "Cypress is still actively developed (v15 adds AI-assisted authoring, a command-log refresh, ESM and TS fixes), but its position shifted to runner-up behind Playwright for new e2e projects."
tags: [javascript, testing]
timestamp: 2026-06-04T00:00:00Z
---
# Cypress

**Verified 2026-06-04.** Check the installed `cypress` version first; re-verify if newer than below.

**Current stable**: 15 (v15.0 GA Aug 2025). **LLM default bias**: Cypress 10 to 13, positioned as the leading or default e2e tool, with Cypress Cloud assumed necessary for parallelization.

## The shift
Cypress is still actively developed (v15 adds AI-assisted authoring, a command-log refresh, ESM and TS fixes), but its position shifted to runner-up behind Playwright for new e2e projects. Its differentiators are time-travel debugging and the in-browser architecture. Its constraints are no real WebKit or Safari engine, JS and TS only, and paid Cloud for first-class parallelization.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| Positioning Cypress as the default 2026 e2e choice | Playwright as the default; Cypress as a deliberate pick for its time-travel DX |
| Assuming Cypress tests Safari or WebKit | Chromium and Edge plus still-beta Firefox only; use Playwright for WebKit |
| Relying on free built-in parallelization | Cypress Cloud (paid) versus Playwright's free sharding |
| `cy.end()` to terminate a chain | A fresh `cy` chain (`cy.end()` is deprecated since 15.15) |
| Targeting Node 18 or Webpack 4 / Vite 4 | Supported versions (v15 dropped those; Node bundled to 22) |

## Gotchas
- Some core commands (`cy.url()`, `cy.go()`) now use automation protocols instead of the browser window, which can change timing in edge cases.
- `experimentalFastVisibility` changes visibility-check semantics; opt in carefully.

## Sources
- https://docs.cypress.io/app/references/changelog
- https://github.com/cypress-io/cypress/releases
