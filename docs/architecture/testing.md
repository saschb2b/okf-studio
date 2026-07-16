---
type: Architecture Decision
title: Testing & Dogfooding
description: The frontend, Rust core, native host, accessibility, conformance, and Studio authoring gates.
tags: [architecture, decision, testing, dogfooding]
timestamp: 2026-07-16T22:30:00Z
---

# Decision

Confidence comes from testing the contracts, not the implementation details. The core's two load-bearing commands — `scan_bundles` and `read_bundle` ([IPC & Security](ipc-and-security.md)) — are tested directly, the link/backlink logic is pinned with golden tests, and conformance is checked for parity against the canonical validator. The native host has its own merge gate for agent processes, provider requests, source intake, permissions, and reviewed transactions.

# Dogfooding this bundle

The primary integration fixture is **this `docs/` bundle itself**. The app's own spec doubles as its built-in sample, so the tests assert that `scan_bundles` **detects `docs/` as a bundle root** and that `read_bundle` produces the **expected concepts and edges** — the cross-links written here are the assertion set. If a section is reorganized, the test surfaces it. This is dogfooding: the product is exercised on the [product's own knowledge](../product/overview.md).

# Studio creation and reviewed-edit dogfood

The Studio staging test copies `docs/` to a temporary directory and exercises both authoring modes against real bundle structure. The Create path derives a separate two-concept bundle from a plain-text interview note and a CSV ownership table, validates the isolated draft, materializes it in a new destination, and reads the result through `okf-core`. The Enhance path stages changes to two existing `docs/` concepts plus one linked concept, explicitly keeps every modification hunk, validates and applies the selected revision, reads the resulting 49-concept bundle, and restores the checkpoint. The test compares the original files before and after the exercise, so a passing run also proves that dogfooding did not modify the checked-in bundle.

Frontend interaction tests cover the corresponding guided Create and Enhance starters, proposal generation, grant requirement, staged review, explicit hunk choices, validation, portable destination checks, and Apply controls. Together these tests provide deterministic coverage of Studio's reviewed-authoring boundary. They do not substitute for live-provider quality checks.

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

Frontend tests use **Vitest** with **React Testing Library** for component and interaction checks. They cover the pieces most likely to regress: selecting a node updates all three panes from one source of truth, search dims non-matches, and a `bundle-changed` event patches in place without resetting the layout, plus layout modes, the reader context rail, the [bundle switcher](../features/bundle-switcher.md), the Agent workspace, and keyboard actions. Browser-level review uses the runnable Vite fixture and `agent-browser` during UI work; Playwright is not part of the automated suite. **Performance fixtures** — larger synthetic and sample bundles — back the budget asserted in [Performance & Scale](performance.md), so the "well under a second" claim has a measured floor.

In browser development, `?agent-gallery=<state>&width=<360|440|560>` opens a deterministic Agent Panel state gallery instead of the workspace. Its nine states cover first use, saved work, stale and empty history, a capability-limited agent, an active turn with a queued follow-up, an unresolved permission, staged edits, and a disconnected process. Long connection and thread names plus bounded errors are part of the fixture. `hierarchy=stacked|merged` switches between the shipped two-level navigator and the rejected one-row prototype. The fixture performs no agent or network action. Component tests keep every named state and its reproducible URL available. The gallery's scope is **whole-panel compositions**; per-component states live in Storybook (next section), so new component states grow a story, not the gallery mock.

# Component playground (Storybook)

`pnpm storybook` serves **Storybook 10** on port 6006 (`@storybook/react-vite`, so stories build through the same `vite.config.ts` — the `@/` alias and the React Compiler babel plugin apply exactly as in the app). Stories are colocated `src/**/*.stories.tsx`; `.storybook/preview.tsx` imports the app's real `styles.css`, wraps every story in an opaque `--bg` frame (the desktop window's `body` is transparent, so unframed stories would be see-through), and adds a toolbar toggle that drives the same `:root[data-theme]` attribute as `shared/theme.ts` — every story renders in both themes on the app's actual tokens.

The dev server also mounts **`@storybook/addon-mcp`** at `http://localhost:6006/mcp`, registered for coding agents in the repo-root `.mcp.json`: with Storybook running, an agent can enumerate components and stories, fetch story URLs and docs, and author new stories through the addon's tools. A clean per-story screenshot for review comes from the iframe URL, `http://localhost:6006/iframe.html?id=<story-id>`.

**Stories are tests.** The Vitest config splits into two projects: `unit` (the jsdom suite `pnpm test` runs — the CI gate) and `storybook`, which `pnpm test:stories` runs headless in Playwright Chromium via `@storybook/addon-vitest` — every story renders, and every `play` function executes its interactions and assertions (typed searches, spied callbacks, disabled-state checks). Interactive stories carry `play` functions per the MCP addon's authoring instructions, so a story is simultaneously the visual state and its regression test.

Coverage spans the agent conversation items (tool rows and cards across every status, including the inline diff and command-output bodies; messages; plans; a full Thread composition at 440px and the 360px floor), the attachment picker and session-configuration rail, the live-work shelf and permission card, the staging previews (okf-proposal through the real parser, the staged-graph thumbnail), the three hierarchy visualizations on the real type palette, and — through a `WithStore` harness that boots the real `AppProvider` over the browser mock — the store-bound shell surfaces (status bar, top bar, empty state, sidebar).

# Native host gate

Pull requests run `cargo clippy -p okf-viewer --all-targets -- -D warnings` and `cargo test -p okf-viewer --no-fail-fast` on Windows. The job covers the official ACP client boundary, process-tree teardown, managed installation, local-model adapters, credential-store mocks, bounded source extraction, MCP tools, staging, validation, transactional Apply, interrupted-operation recovery, and checkpoint Restore. It also runs the PDF helper integration test. The one test that fetches a live GitHub archive remains ignored because ordinary CI must be deterministic and network-independent.

The pure `okf-core` job remains separate on Linux. It needs no Tauri or WebKit dependencies and gives fast feedback for parsing, query, validation, and bundle fixtures. Release packaging still builds the complete application per target platform.

# Automated accessibility gate

An **axe-core** check runs over the first-run state, an open bundle, the agent catalog, thread security disclosure, close confirmation, settings, shortcuts, and the bundle switcher. Any violation fails the suite. Colour contrast needs real layout that jsdom lacks, so that rule is verified through rendered review and the [design tokens](../ux/theming.md). The automated gate covers accessible names, roles, ARIA state, landmarks, and labels.

# Static analysis and linting

A strict, **type-aware** ESLint stack (`pnpm lint`) backs the tests as a second gate, run on the full source:

- **typescript-eslint** `strictTypeChecked` + `stylisticTypeChecked` — type-aware rules (no floating promises, no needless conditions, exhaustive nullish handling), which require the TypeScript project service.
- The **React Compiler** ruleset (`eslint-plugin-react-hooks` v7) at error — the correctness rules (refs not read during render, no setState-in-render, purity, immutability) and the dependency rules. Because the [React Compiler](frontend-architecture.md) is on, `react-hooks/rule-suppression` forbids silencing the correctness rules; only the long-standing `exhaustive-deps` may be suppressed, and only for the imperative ref-driven [graph](../features/graph-view.md) effects with a stated reason.
- **jsx-a11y** (recommended) — the static accessibility rules, complementing the runtime axe gate above.
- **eslint-config-prettier** last, so formatting is left to a formatter rather than fought by lint rules.

The intent is that the same strictness applies as in sibling projects: catch the class of defect that compiles and passes tests but is still wrong. A handful of rules are tuned, not disabled — numbers are allowed in template literals, and test files relax the no-empty-function and (for polyfilled DOM globals) no-unnecessary-condition rules — each with a comment in `eslint.config.mjs` saying why.
