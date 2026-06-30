---
type: Architecture Decision
title: Testing & Dogfooding
description: The test strategy — Rust unit and integration tests, golden link tests, validator parity, tolerance proofs, and dogfooding this bundle.
tags: [architecture, decision, testing, dogfooding]
timestamp: 2026-06-29T23:59:00Z
---

# Decision

Confidence comes from testing the contracts, not the implementation details. The core's two load-bearing commands — `scan_bundles` and `read_bundle` ([IPC & Security](ipc-and-security.md)) — are tested directly, the link/backlink logic is pinned with golden tests, and conformance is checked for parity against the canonical validator.

# Dogfooding this bundle

The primary integration fixture is **this `docs/` bundle itself**. The app's own spec doubles as its built-in sample, so the tests assert that `scan_bundles` **detects `docs/` as a bundle root** and that `read_bundle` produces the **expected concepts and edges** — the cross-links written here are the assertion set. If a section is reorganized, the test surfaces it. This is dogfooding: the product is exercised on the [product's own knowledge](../product/overview.md).

# Golden tests for link and backlink resolution

Link resolution is the subtlest part of [OKF parsing](okf-parsing.md), so it is pinned with **golden tests** covering each case:

- bundle-absolute hrefs (`/section/file.md`) resolved from the root,
- relative hrefs (`file.md`, `../section/file.md`) resolved from the concept's directory,
- `.`/`..` normalization,
- trailing `#anchor` stripping,
- **broken-link tolerance** — a link to a non-existent target is preserved for display but produces no edge,
- backlink inversion — each `citedBy` list is the exact reverse of the edge set.

# Validator parity

The app must agree with the spec. Parity tests assert that the core's conformance checks produce the **same verdicts** as the canonical `scripts/okf-validate.mjs` over a shared set of fixtures, so [Validation](../features/validation.md) in the app never diverges from the reference validator.

# Tolerant-consumer proofs

The [tolerant-consumer principle](../product/principles.md) is a hard guarantee, so it is tested as one: malformed frontmatter, an unknown `type`, broken cross-links, and a missing `index.md` must each parse **without throwing**. These tests prove the app degrades gracefully and records issues instead of failing — opening an untrusted or sloppy bundle is always safe.

# Sample bundles as fixtures

Google's published [OKF sample bundles](../reference/okf-sample-bundles.md) — GA4, Stack Overflow, Bitcoin — are used as additional fixtures. They bring **type variety** (concept types we did not author) and **scale** (more concepts and edges than our own bundle), exercising the tolerant consumer against real third-party producers, not just our own conventions.

# Frontend and performance checks

Frontend tests use **Vitest** with **React Testing Library** for component and interaction checks, and **Playwright** for end-to-end flows. They cover the pieces most likely to regress: selecting a node updates all three panes from one source of truth, search dims non-matches, and a `bundle-changed` event patches in place without resetting the layout — plus the major interactive features (layout modes, the reader's context rail, the [bundle switcher](../features/bundle-switcher.md), and the keyboard-shortcuts overlay). **Performance fixtures** — larger synthetic and sample bundles — back the budget asserted in [Performance & Scale](performance.md), so the "well under a second" claim has a measured floor.

# Automated accessibility gate

An **axe-core** check runs over the rendered app (the empty state and an open bundle) and **fails the suite on any violation**, so the [accessibility](../ux/accessibility.md) commitments are verified, not merely asserted (Microsoft's "run automated accessibility checks in CI" practice). Colour contrast needs real layout that jsdom lacks, so that rule is verified via the [design tokens](../ux/theming.md) instead; the gate covers the structural rules — accessible names, roles, ARIA state, landmarks, and labels. It has already caught real regressions (an inappropriate role on the title bar, a splitter missing `aria-valuenow`).

# Static analysis and linting

A strict, **type-aware** ESLint stack (`pnpm lint`) backs the tests as a second gate, run on the full source:

- **typescript-eslint** `strictTypeChecked` + `stylisticTypeChecked` — type-aware rules (no floating promises, no needless conditions, exhaustive nullish handling), which require the TypeScript project service.
- The **React Compiler** ruleset (`eslint-plugin-react-hooks` v7) at error — the correctness rules (refs not read during render, no setState-in-render, purity, immutability) and the dependency rules. Because the [React Compiler](frontend-architecture.md) is on, `react-hooks/rule-suppression` forbids silencing the correctness rules; only the long-standing `exhaustive-deps` may be suppressed, and only for the imperative ref-driven [graph](../features/graph-view.md) effects with a stated reason.
- **jsx-a11y** (recommended) — the static accessibility rules, complementing the runtime axe gate above.
- **eslint-config-prettier** last, so formatting is left to a formatter rather than fought by lint rules.

The intent is that the same strictness applies as in sibling projects: catch the class of defect that compiles and passes tests but is still wrong. A handful of rules are tuned, not disabled — numbers are allowed in template literals, and test files relax the no-empty-function and (for polyfilled DOM globals) no-unnecessary-condition rules — each with a comment in `eslint.config.mjs` saying why.
