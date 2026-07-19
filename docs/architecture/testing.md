---
type: Architecture Decision
title: Testing & Dogfooding
description: The frontend, Rust core, native host, accessibility, conformance, and Studio authoring gates.
tags: [architecture, decision, testing, dogfooding]
timestamp: 2026-07-19T13:15:00Z
---

# Decision

Platform confinement fixtures run the enforcement path they claim. Linux CI invokes the ignored Bubblewrap fixture on a prepared Ubuntu host. The Windows host test launches the test binary through the production AppContainer launcher, checks the child token, proves an ungranted host file is unreadable, and proves the container's private scratch remains writable. A separate process-tree fixture proves the Windows Job Object stops descendants. No platform test returns green merely because its backend is absent.

Confidence comes from testing the contracts, not the implementation details. The core's two load-bearing commands — `scan_bundles` and `read_bundle` ([IPC & Security](ipc-and-security.md)) — are tested directly, the link/backlink logic is pinned with golden tests, and conformance is checked for parity against the canonical validator. The native host has its own merge gate for agent processes, provider requests, source intake, permissions, and reviewed transactions.

# Dogfooding this bundle

The primary integration fixture is **this `docs/` bundle itself**. The app's own spec doubles as its built-in sample, so the tests assert that `scan_bundles` **detects `docs/` as a bundle root** and that `read_bundle` produces the **expected concepts and edges** — the cross-links written here are the assertion set. If a section is reorganized, the test surfaces it. This is dogfooding: the product is exercised on the [product's own knowledge](../product/overview.md).

# Studio creation and reviewed-edit dogfood

The Studio staging test copies `docs/` to a temporary directory and exercises both authoring modes against real bundle structure. The Create path derives a separate two-concept bundle from a plain-text interview note and a CSV ownership table, validates the isolated draft, materializes it in a new destination, and reads the result through `okf-core`. The Enhance path stages changes to two existing `docs/` concepts plus one linked concept, explicitly keeps every modification hunk, validates and applies the selected revision, proves that exactly one concept was added to the current source fixture, and restores the checkpoint. The test compares the original files before and after the exercise, so a passing run also proves that dogfooding did not modify the checked-in bundle.

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

Frontend tests use **Vitest** with **React Testing Library** for component and interaction checks. They cover the pieces most likely to regress: selecting a node updates all three panes from one source of truth, search dims non-matches, and a `bundle-changed` event patches in place without resetting the layout, plus layout modes, the reader context rail, the [bundle switcher](../features/bundle-switcher.md), the Agent workspace, and keyboard actions. Browser-level review uses the runnable Vite fixture and `agent-browser` during UI work. Storybook stories run in Playwright Chromium as a separate automated lane. **Performance fixtures** — larger synthetic and sample bundles — back the budget asserted in [Performance & Scale](performance.md), so the "well under a second" claim has a measured floor.

The [OKF agent benchmark](agent-benchmarking.md) adds a separate model-free lane for specialization work. Its checked-in manifest freezes task intent, fixture hashes, tool boundaries, artifact kinds, safety failures, score criteria, and seeded critic defects. Node rejects unresolved critic reference kinds and any declared critic override of deterministic completion. Rust validates the critic envelope against exact artifact fields, concepts, sources, and deterministic rules. A manual provider workflow writes an explicit not-run plan when no live adapter result exists, so provider, credential, model, or network absence cannot make an ordinary merge gate fail or appear as a pass.

Generic-routing tests pin reachability, not instruction wording. The Node contract derives resource links from the capability manifest and reports any method the repository skill cannot reach. The Rust contract asks the production MCP catalog for every advertised resource and loads each one through the production handler. This catches a missing route or bundled resource while leaving writers free to improve the surrounding instructions. Test-owned report directories register cleanup before filesystem assertions, and the non-overwrite check asserts the concrete `EEXIST` boundary.

## Frontend test lanes

The frontend suite is split by cost and environment instead of calling every check a unit test:

- `pnpm test` runs pure `.test.ts` logic in Node and React or DOM-focused `.test.tsx` and `.dom.test.ts` files in jsdom. It is the fast feedback lane.
- `pnpm test:integration` runs `.integration.test.tsx` files that boot `AppProvider` and the complete application. The lane has two workers, shuffled order, explicit slow-test reporting, and a bounded timeout for full user journeys. The former 2,174-line app test and 844-line feature test are split by product behavior so failures identify one surface and files can be scheduled independently. Turn lifecycle, source retry, permission memory, queued recovery, and failed-turn retry are separate tests instead of one sequential scenario. Studio Agent security disclosure, reviewed creation, and native tool calls also use separate saved-endpoint fixtures whose cleanup runs on setup and assertion failures.
- `pnpm test:stories` renders every story and executes every `play` function in Playwright Chromium. One browser orchestrator avoids competing Chromium startups on Windows. Story execution takes only a few seconds; browser initialization dominates the lane. Storybook MCP remains the required discovery, preview, and focused isolation surface during component work, while the package command is the full automated lane.
- `pnpm test:frontend` runs those three lanes in sequence. It does not mix jsdom integration work with browser startup in one worker pool.

Vitest restores mocks between tests. The shared setup clears both browser storage areas and all mutable browser-agent state: profiles, connections, event subscribers, sessions, staged changes, checkpoints, permissions, installation state, and recent bundles. Pending permission requests resolve before their registries are cleared, so a failed test cannot leave an orphaned promise or poison the next test. Full-app tests use one shared render and bundle-opening harness, with an explicit Strict Mode option for lifecycle regressions. Setup text is pasted in one event unless individual keystrokes are the behavior under test. Every lane shuffles test order. ESLint rejects focused tests, disabled tests, missing or conditional assertions, unawaited Testing Library queries, and side effects hidden in polling callbacks. CI runs the fast, integration, and story lanes as separate jobs with hard job timeouts, so one expensive surface does not delay unrelated feedback.

Task-launcher journeys choose the named task before asserting its plan. They do not inherit whichever task happens to be the current product default, because changing that default must not silently turn a Research test into a Revise or Audit test.

Interaction tests wait for observable state. They do not retry user actions until an assertion passes. The reader-selection test establishes a DOM range once and captures it through the component's pointer-down contract before opening the attachment menu. This keeps the test aligned with the interaction sequence and removes its former five-attempt action loop.

In browser development, `?agent-gallery=<state>&width=<360|440|560>` opens a deterministic Agent Panel state gallery instead of the workspace. Its named states cover first use, saved work, stale and empty history, a capability-limited agent, session controls, live-work pressure, an active turn with a queued follow-up, an unresolved permission, staged edits, and a disconnected process. Long connection and thread names plus bounded errors are part of the fixture. `hierarchy=stacked|merged` switches between the shipped connection strip plus combined conversation toolbar and the rejected one-row prototype. The fixture performs no agent or network action. Component tests keep every named state and its reproducible URL available. The gallery's scope is **whole-panel compositions**; per-component states live in Storybook (next section), so new component states grow a story, not the gallery mock.

# Component playground (Storybook)

`pnpm storybook` serves **Storybook 10** on port 6006 (`@storybook/react-vite`, so stories build through the same `vite.config.ts` — the `@/` alias and the React Compiler babel plugin apply exactly as in the app). Stories are colocated `src/**/*.stories.tsx`; `.storybook/preview.tsx` imports the app's real `styles.css` and shared chrome primitives, wraps every story in an opaque `--bg` frame (the desktop window's `body` is transparent, so unframed stories would be see-through), and adds a toolbar toggle that drives the same `:root[data-theme]` attribute as `shared/theme.ts` — every story renders in both themes on the app's actual tokens and button geometry.

The dev server also mounts **`@storybook/addon-mcp`** at `http://localhost:6006/mcp`, registered for coding agents in the repo-root `.mcp.json`: with Storybook running, an agent can enumerate components and stories, fetch documentation and preview URLs, and run focused or complete story checks through MCP. The repository connection requests the `dev`, `docs`, and `test` toolsets. `@storybook/addon-vitest` supplies the manager-side test listener. The suite uses Vitest 4's separate Playwright provider, and a narrow pnpm patch raises the addon's fixed child-start guard from 30 to 120 seconds because Chromium initialization on the Windows host exceeds the upstream default. Test behavior and per-test deadlines are unchanged. A clean per-story screenshot for review comes from the iframe URL, `http://localhost:6006/iframe.html?id=<story-id>`. Ad hoc screenshots are temporary test output and stay outside the repository. A screenshot belongs in `docs/ux/` only when a named Markdown concept links it as curated evidence; otherwise the Storybook preview URL is the durable review surface.

The app's broad Vite warmup remains enabled for development because it shortens Tauri's first paint, but test mode disables it and releases optimized dependencies before the static-import crawl finishes. Storybook already supplies the exact story entries; warming the entire app first duplicated collection work and could prevent the browser session from connecting. The MCP addon also loads only in the development server, where agents use it, rather than adding its manifest and module-graph work to the headless test process. Vitest 4.1 reads the generated browser instance's handshake limit from the root test config, so the existing 90-second Windows startup bound lives there. Story assertions retain their separate 30-second deadline, and the lane does not retry failures.

**Stories are tests.** The `storybook` Vitest project runs headless in Playwright Chromium via `@storybook/addon-vitest`: every story renders, and every `play` function executes its interactions and assertions (typed searches, spied callbacks, disabled-state checks). Interactive stories carry `play` functions per the MCP addon's authoring instructions, so a story is simultaneously the visual state and its regression test.

Coverage spans the agent conversation items (tool rows and cards across every status, including collapsed successful details and open running output; messages; plans; grouped turns with one response footer; the combined thread toolbar; OKF mention suggestions; and a full Thread composition at 440px and the 360px floor), the attachment picker and session-configuration rail, the live-work shelf and permission card, the staging previews (okf-proposal through the real parser, the staged-graph thumbnail), the three hierarchy visualizations on the real type palette, and — through a `WithStore` harness that boots the real `AppProvider` over the browser mock — the store-bound shell surfaces (status bar, top bar, empty state, sidebar).

# Integrated Git gate

Integrated Git uses real temporary repositories for its Rust tests instead of mocking command output at the mutation boundary. The focused sequence initializes a repository, writes and stages files, reads status and diffs, commits, and performs the revision-bound soft undo. Separate parser and scope cases cover two-dimensional status, renames, history framing, tracking distance, invalid path and revision input, a repository outside the grant, and an ordinary non-repository. Watcher tests cover working-tree, index, HEAD, refs, and linked-worktree metadata relevance without accepting Git object or build-directory noise.

The frontend mock supplies a deterministic repository snapshot, history page, and unified diff. Full-app integration proves that Git and Agent remain mutually exclusive, changed paths open the dedicated diff workspace, and `Ctrl/Cmd + Shift + G` moves focus into and back out of the panel. Storybook is the pressure-state matrix for clean, mixed, conflicted, long-path, unavailable, pending-failure, empty-history, tracked-only commit, binary/no-text, truncated, loading, and error states. Its play functions cover staging-adjacent actions, diff routing, commit scope, the commit keyboard action, history selection, pending disablement, and accessibility.

# Native host gate

Pull requests run `cargo clippy -p okf-viewer --all-targets -- -D warnings` and `cargo test -p okf-viewer --no-fail-fast` on Windows. The job covers the official ACP client boundary, process-tree teardown, managed installation, local-model adapters, credential-store mocks, bounded source extraction, MCP tools, staging, validation, transactional Apply, interrupted-operation recovery, and checkpoint Restore. It also runs the PDF helper integration test. The one test that fetches a live GitHub archive remains ignored because ordinary CI must be deterministic and network-independent.

Platform fixtures never report a silent pass. The process-tree helper is an explicitly ignored subprocess fixture invoked with `--ignored` by its owning test, and a file handshake releases its descendant only after process ownership is attached. The Bubblewrap mount-policy probe is explicitly ignored on ordinary hosts and the dedicated Ubuntu job invokes that exact test with `--ignored`. A missing platform capability therefore appears as ignored or failed, never green without executing the assertion body.

The pure `okf-core` job remains separate on Linux. It needs no Tauri or WebKit dependencies and gives fast feedback for parsing, query, validation, and bundle fixtures. `pnpm test:network` runs the one ignored live-GitHub archive smoke test explicitly; it stays outside ordinary CI because a remote outage must not fail a deterministic merge gate. Release packaging still builds the complete application per target platform.

# Automated accessibility gate

An **axe-core** check runs over the first-run state, an open bundle, the agent catalog, thread security disclosure, close confirmation, settings, shortcuts, and the bundle switcher. Any violation fails the suite. Colour contrast needs real layout that jsdom lacks, so that rule is verified through rendered review and the [design tokens](../ux/theming.md). The automated gate covers accessible names, roles, ARIA state, landmarks, and labels.

# Static analysis and linting

A strict, **type-aware** ESLint stack (`pnpm lint`) backs the tests as a second gate, run on the full source:

- **typescript-eslint** `strictTypeChecked` + `stylisticTypeChecked` — type-aware rules (no floating promises, no needless conditions, exhaustive nullish handling), which require the TypeScript project service.
- The **React Compiler** ruleset (`eslint-plugin-react-hooks` v7) at error — the correctness rules (refs not read during render, no setState-in-render, purity, immutability) and the dependency rules. Because the [React Compiler](frontend-architecture.md) is on, `react-hooks/rule-suppression` forbids silencing the correctness rules; only the long-standing `exhaustive-deps` may be suppressed, and only for the imperative ref-driven [graph](../features/graph-view.md) effects with a stated reason.
- **jsx-a11y** (recommended) — the static accessibility rules, complementing the runtime axe gate above.
- **Vitest and Testing Library plugins** — focused or disabled tests, assertion-free tests, unawaited async queries, side effects in polling callbacks, and other reliability defects fail lint before the runner starts.
- **eslint-config-prettier** last, so formatting is left to a formatter rather than fought by lint rules.

The intent is that the same strictness applies as in sibling projects: catch the class of defect that compiles and passes tests but is still wrong. A handful of rules are tuned, not disabled — numbers are allowed in template literals, and test files relax the no-empty-function and (for polyfilled DOM globals) no-unnecessary-condition rules — each with a comment in `eslint.config.mjs` saying why.
