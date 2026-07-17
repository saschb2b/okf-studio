---
type: Smell Catalog
title: "Test Stinky Catalog"
description: "The full test-suite smell catalog, in nine pillars, language and framework agnostic."
tags: [testing, test-smells, flakiness, quality]
timestamp: 2026-07-17T00:00:00Z
---
# Test Stinky Catalog

The full test-suite smell catalog, in nine pillars, 49 categories. Each entry: what to sniff for, the fix, what NOT to flag, and the source. Run the "Don't flag" line before you report anything. The default stink rating is in brackets; raise it when the smell causes a real bug or a real flake, drop it when the suite is internally consistent.

The catalog is language and framework agnostic. Detection signals name concrete APIs from several ecosystems (Vitest/Jest, Playwright, pytest, JUnit, cargo test, Go testing) as recognition anchors, not as requirements; translate to whatever the project uses.

The load-bearing background terms each have their own concept: the [test pyramid and placement rule](./concepts/test-pyramid.md), the [test-doubles taxonomy](./concepts/test-doubles.md), [flakiness and its lifecycle](./concepts/flakiness.md), [hermeticity and lanes](./concepts/hermeticity.md), [DAMP vs DRY](./concepts/damp-vs-dry.md), [mutation testing](./concepts/mutation-testing.md), and [property-based testing](./concepts/property-based-testing.md). Read the concept when a finding needs the underlying model, not just the smell.

Pillars:
1. Test intent and shape (1 to 6)
2. Assertions (7 to 13)
3. Fixtures, setup, and duplication (14 to 18)
4. Test doubles (19 to 23)
5. Determinism (24 to 30)
6. Async and waiting (31 to 34)
7. Speed and cost (35 to 40)
8. Coverage theater and gaps (41 to 44)
9. Lifecycle and CI hygiene (45 to 49)

Production-code smells found along the way go to the sibling skills (`react-stinky`, `tauri-stinky`), not this catalog.

# Pillar 1. Test intent and shape

### 1. vague-test-name [Funky]
- **Sniff for:** names that restate the function name (`testParseBundle`, `it("parseBundle")`), say nothing falsifiable (`works`, `handles correctly`, `test1`, `misc`), or omit the condition (`it("returns null")` with no when-clause).
- **Fix:** name the behavior as a claim with a condition and an outcome: `rejects a bundle whose index is missing`, `parse_returns_error_when_frontmatter_lacks_type`. A failing test's name alone should tell you what broke.
- **Don't flag:** short names inside a `describe`/module whose path supplies the condition (`describe("empty bundle") > it("renders the onboarding hint")`). Judge the full path, not the leaf.
- **Source:** Google Testing Blog, Writing Descriptive Test Names (https://testing.googleblog.com/2014/10/testing-on-toilet-writing-descriptive.html).

### 2. eager-test [Funky, Rancid when a mid-test failure hides the later behaviors]
- **Sniff for:** one test walking many behaviors end to end: hundreds of lines, dozens of awaited steps, assertion clusters on unrelated features, a name with "and" in it. When step 12 breaks, behaviors 13 through 40 stop being tested at all and every failure lands in the same test name.
- **Fix:** one behavior per test. Split along the assertion clusters; share the walk-up via a helper or a fixture that gets the world to the starting state. Keep one deliberate end-to-end journey per flow, not one per feature.
- **Don't flag:** a genuine user-journey test that is intentionally one flow, when the cheap per-behavior tests exist beside it. Multiple assertions on one behavior's outcome are one behavior, not an eager test.
- **Source:** Meszaros, xUnit Test Patterns, Assertion Roulette / Eager Test (http://xunitpatterns.com/Assertion%20Roulette.html).

### 3. logic-in-tests [Funky, Rancid when the logic re-implements production code]
- **Sniff for:** `if`/`for`/`while`/`try` in a test body; expected values computed by the same algorithm the production code uses (the test can never catch a shared bug); catch blocks that swallow and pass; branching on environment inside the test body.
- **Fix:** straight-line tests with literal expected values. Turn loops into parametrized cases (`test.each`, `@pytest.mark.parametrize`, `#[rstest]`). If you need logic to build inputs, put it in a well-named, trivially-verifiable helper, and keep the assert literal.
- **Don't flag:** a loop that drives a table of parametrized cases where the framework lacks native parametrization, when each iteration reports which case failed. Builders and factories are fine; it is logic that computes the expectation that stinks.
- **Source:** Google Testing Blog, Don't Put Logic in Tests (https://testing.googleblog.com/2014/07/testing-on-toilet-dont-put-logic-in.html).

### 4. structure-mirroring [Funky]
- **Sniff for:** a test file per production method with one test per branch, tests reaching private internals (exported-for-test hooks, reflection, `#[cfg(test)] pub`, `as any` to grab private state), tests that must change whenever the internals are refactored with behavior unchanged.
- **Fix:** test through the public API, organized by behavior, not by method. If a private part is too complex to reach through the public surface, that is a design signal: extract it into its own unit with its own public API.
- **Don't flag:** a test-only constructor or seam that injects a dependency (a clock, a temp dir); that is a boundary, not internals-poking.
- **Source:** Software Engineering at Google, Unit Testing (https://abseil.io/resources/swe-book/html/ch12.html).

### 5. god-test-file [Funky]
- **Sniff for:** a single test file with dozens of tests in one flat block, thousands of lines, mixed feature areas, setup drifting to serve everyone; inline test modules that outweigh the production code in the same file by thousands of lines.
- **Fix:** split by feature area or behavior cluster into files whose names say what is under test; extract the shared walk-up into a common fixture module. In languages with inline test modules, promote an oversized module to its own test file beside the source.
- **Don't flag:** a large parametrized table testing one behavior; size from cases is fine, size from mixed concerns is the smell.
- **Source:** Meszaros, xUnit Test Patterns, Obscure Test (http://xunitpatterns.com/Obscure%20Test.html).

### 6. rotting-disabled-tests [Funky, Rancid when it hides a known regression]
- **Sniff for:** `.skip`/`xit`/`@Disabled`/`#[ignore]`/commented-out test blocks with no reason, no ticket, no expiry; `todo` tests that have sat for months; a disabled test whose subject has since changed so it could never be re-enabled.
- **Fix:** each disabled test gets a reason string, an owner, and a link or expiry, or it gets deleted. Re-enable or delete anything whose reason no longer applies. Track the count; it only ever grows on its own.
- **Don't flag:** a freshly disabled test with a reason and a ticket while the fix is in flight; that is quarantine working (category 46 governs whether the process exists).
- **Source:** Fowler, Eradicating Non-Determinism in Tests, Quarantine (https://martinfowler.com/articles/nonDeterminism.html).

# Pillar 2. Assertions

### 7. assertion-free-test [Rancid]
- **Sniff for:** tests that call code and assert nothing, relying on "did not throw" implicitly; tests whose only observable purpose is line coverage; smoke tests multiplied across every module.
- **Fix:** assert the observable outcome (return value, state change, emitted output). If "does not throw" is genuinely the contract, say so explicitly (`expect(fn).not.toThrow()`) so the intent is visible, and keep exactly one such test per contract.
- **Don't flag:** a compile-only or type-level test whose passing IS the assertion (type tests, `expectTypeOf`), or a story/render smoke test the project explicitly treats as a crash gate.
- **Source:** Google Testing Blog, Code Coverage Best Practices (https://testing.googleblog.com/2020/08/code-coverage-best-practices.html).

### 8. weak-assertion [Funky]
- **Sniff for:** `toBeTruthy()`, `toBeDefined()`, `assert x is not None`, `assert!(result.is_ok())`, `assertTrue(list.size() > 0)` where the exact value is known and cheap to state; asserting only the type or length of a result whose content matters.
- **Fix:** assert the specific value or the relevant shape: `expect(names).toEqual(["a", "b"])`, `assert_eq!(result.unwrap().version, "0.1")`. Unwrap the Ok and look inside it.
- **Don't flag:** existence checks that are genuinely the contract (a handle is returned, an id is non-empty) or a guard assert that precedes a specific one.
- **Source:** Software Engineering at Google, Unit Testing (https://abseil.io/resources/swe-book/html/ch12.html).

### 9. tautological-test [Rancid]
- **Sniff for:** asserting that a mock returns what the mock was configured to return; expected values produced by calling the code under test (`expect(f(x)).toBe(f(x))` in disguise, or capturing the output once and pasting it back as the expectation without reading it); round-trip tests that only prove the encoder and decoder share the same bug.
- **Fix:** independent expectations: literal values worked out by hand or from the spec. For round-trips, add at least one test against a fixed, hand-written encoded form.
- **Don't flag:** golden-master tests adopted deliberately for legacy characterization, when labeled as such and the golden output was reviewed once by a human.
- **Source:** Google Testing Blog, Don't Overuse Mocks (https://testing.googleblog.com/2013/05/testing-on-toilet-dont-overuse-mocks.html).

### 10. snapshot-everything [Funky, Rancid when updates are rubber-stamped]
- **Sniff for:** full-tree or full-JSON snapshots of large objects; hundreds of snapshot files; a history of bulk `--update`/`-u` commits with no review; snapshot diffs so big nobody reads them.
- **Fix:** assert the specific fields the behavior is about (partial matchers, `objectContaining`); where a snapshot earns its keep, make it small and inline so it is reviewed as code. Treat a snapshot update in review with the same suspicion as a changed assertion.
- **Don't flag:** small, focused, inline snapshots of an error message or a serialized fragment; deliberate golden files for a serializer whose whole job is the exact bytes.
- **Source:** Kent C. Dodds, Effective Snapshot Testing (https://kentcdodds.com/blog/effective-snapshot-testing).

### 11. wide-brittle-assertion [Funky]
- **Sniff for:** deep-equal on a giant object when one field matters; asserting exact full error strings or log output; expectations pinned to incidental facts of a live fixture (a count of files in a directory that other work legitimately changes); change-detector tests that break on every edit and confirm nothing.
- **Fix:** assert the slice that carries the behavior (the one field, the error kind or code, the presence of the record). For shared live fixtures, assert invariants (`> 0`, contains X) or give the test its own frozen fixture.
- **Don't flag:** exact full-value asserts on small values, wire formats, or public contracts where every byte is the spec.
- **Source:** Google Testing Blog, Change-Detector Tests Considered Harmful (https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html).

### 12. assertion-roulette [Whiff]
- **Sniff for:** long runs of undifferentiated asserts where a failure report cannot say which fact broke, in frameworks whose failure output does not include the expression or a message.
- **Fix:** add failure messages where the framework needs them, use soft-assertion blocks for related facts, or split into named tests.
- **Don't flag:** frameworks whose failure output already pinpoints the line and both values (most modern ones); this smell is about diagnosability, not assert count.
- **Source:** Meszaros, xUnit Test Patterns, Assertion Roulette (http://xunitpatterns.com/Assertion%20Roulette.html).

### 13. implementation-detail-assertion [Funky, Rancid when it freezes refactoring]
- **Sniff for:** spy call counts, call order, and argument captures as the primary check when an observable outcome exists; asserting internal state or private fields; frontend tests querying by CSS class or component internals instead of what the user sees; tests that fail on refactors that change no behavior.
- **Fix:** assert outputs and state the caller or user can observe. Reserve interaction asserts for genuine outbound side effects that have no observable state (an email handed to a gateway).
- **Don't flag:** interaction asserts on a true outbound boundary (the payment API was called once, not twice); that IS the behavior.
- **Source:** Kent C. Dodds, Testing Implementation Details (https://kentcdodds.com/blog/testing-implementation-details).

# Pillar 3. Fixtures, setup, and duplication

### 14. mystery-guest [Funky]
- **Sniff for:** a test whose meaning depends on values you cannot see from the test: a shared fixture file, a seeded DB row, a helper that hides which inputs matter; the reader must open three other files to know why the expected value is 7.
- **Fix:** bring the relevant facts into the test (inline the two fields that matter, name the fixture by intent: `bundle_with_missing_type()`), and let a builder default the rest.
- **Don't flag:** fixtures referenced by an intent-revealing name where the asserted facts are visible in the test.
- **Source:** Meszaros, xUnit Test Patterns, Mystery Guest (http://xunitpatterns.com/Obscure%20Test.html).

### 15. general-fixture [Funky]
- **Sniff for:** one giant fixture or seed serving every test, each test using a sliver of it; setup that grows monotonically because nobody knows who depends on what; tests slow because they build a world they mostly ignore.
- **Fix:** minimal per-test setup via builders with overridable defaults; a shared fixture only for genuinely shared, immutable ground (a compiled schema, a started app).
- **Don't flag:** an expensive immutable resource shared read-only at suite level; that is category 36's recommended fix, not a general fixture.
- **Source:** Meszaros, xUnit Test Patterns, General Fixture (http://xunitpatterns.com/Obscure%20Test.html).

### 16. over-dry-abstraction [Funky]
- **Sniff for:** assertion helpers three layers deep, setup indirection so thorough the test body is one opaque call, parametrization so clever you cannot reconstruct a single failing case; the test reads like a framework, not a statement of fact.
- **Fix:** DAMP over DRY (the principle and the builder vocabulary are in [damp-vs-dry](./concepts/damp-vs-dry.md)): prefer a little visible repetition of the meaningful facts. Helpers should hide irrelevant mechanics, never the inputs and expectations that give the test meaning.
- **Don't flag:** helpers that hide genuinely irrelevant mechanics (auth walk-up, temp-dir plumbing) while inputs and asserts stay in the test.
- **Source:** Google Testing Blog, Tests Too DRY? Make Them DAMP! (https://testing.googleblog.com/2019/12/testing-on-toilet-tests-too-dry-make.html).

### 17. copy-paste-setup [Funky]
- **Sniff for:** the same multi-line arrange block or helper function pasted across many files with small drifts (four files each defining their own `renderApp` or `seed_bundle`); a fix to the setup that must be applied N times and is applied N-1.
- **Fix:** one shared test-utils module per layer (render helpers, builders, fake servers), imported everywhere. Keep it as visible-by-name as the DAMP rule demands.
- **Don't flag:** two similar arranges that differ in the fact under test; forcing those into one helper is how category 16 starts.
- **Source:** Meszaros, xUnit Test Patterns, Test Code Duplication (http://xunitpatterns.com/Test%20Code%20Duplication.html).

### 18. irrelevant-detail-noise [Whiff]
- **Sniff for:** tests spelling out piles of fields that have nothing to do with the behavior (twelve-field object literals where one field matters), magic values with no name, so the reader cannot tell signal from scaffolding.
- **Fix:** builders with sensible defaults; the test names only the fields that drive the behavior (`aUser({ role: "admin" })`), and magic values get named constants.
- **Don't flag:** wire-format and serialization tests, where every field is the point.
- **Source:** Software Engineering at Google, Unit Testing, clear tests (https://abseil.io/resources/swe-book/html/ch12.html).

# Pillar 4. Test doubles

The five kinds of double, the classical-vs-mockist split, and the ownership rule this pillar applies are defined in the [test-doubles taxonomy](./concepts/test-doubles.md).

### 19. over-mocking [Funky, Rancid when the test only exercises its own mocks]
- **Sniff for:** every collaborator mocked including value objects and pure functions; setup that is mostly `when(...).thenReturn(...)`; tests that assert the wiring between mocks and would pass with the production logic deleted; tests that break on refactors and stay green on real bugs.
- **Fix:** use real objects for cheap in-process collaborators, fakes for heavy ones, and mocks only at genuine architectural boundaries (network, clock, external systems). Prefer state verification over interaction verification.
- **Don't flag:** doubles at a true boundary, or interaction asserts where the interaction is the contract (category 13's exception).
- **Source:** Google Testing Blog, Don't Overuse Mocks (https://testing.googleblog.com/2013/05/testing-on-toilet-dont-overuse-mocks.html); Fowler, Mocks Aren't Stubs (https://martinfowler.com/articles/mocksArentStubs.html).

### 20. mocking-what-you-dont-own [Funky]
- **Sniff for:** mocks of third-party SDK clients, ORMs, or HTTP libraries, stubbing method shapes the vendor may change; test doubles encoding guesses about foreign semantics (pagination, error shapes) that nothing verifies.
- **Fix:** wrap the third-party dependency in a thin adapter you own, mock the adapter, and cover the adapter itself with a narrow integration or contract test against the real thing (or its official emulator).
- **Don't flag:** record-replay style HTTP fixtures (VCR, MSW handlers mirroring a spec) when something periodically re-verifies them against the live contract.
- **Source:** Freeman and Pryce, Mock Roles, not Objects (http://jmock.org/oopsla2004.pdf); Fowler, ContractTest (https://martinfowler.com/bliki/ContractTest.html).

### 21. mock-drift [Rancid]
- **Sniff for:** hand-written fakes and mocks that have diverged from the real implementation: fields the real API renamed, error cases the real system added, success shapes it changed; nothing fails when the real contract moves, so every test above the fake is quietly testing fiction.
- **Fix:** every nontrivial fake gets its own contract test run against the real implementation; share one fake per boundary instead of per-file copies; generate types from the real schema so drift becomes a compile error.
- **Don't flag:** a fake that is deliberately partial when the unimplemented surface throws loudly instead of returning defaults.
- **Source:** Software Engineering at Google, Test Doubles, fakes require their own tests (https://abseil.io/resources/swe-book/html/ch13.html).

### 22. deep-mock-chains [Funky]
- **Sniff for:** mocks returning mocks returning mocks (`when(client.db().table("x").query())`), doubles for the friend-of-a-friend of the unit under test; enormous stubbing blocks reproducing an object graph.
- **Fix:** the test is reporting a Law of Demeter problem in production code; introduce a facade or pass the needed value directly, then mock the one flat seam.
- **Don't flag:** fluent builders on the test's own side (a stubbing DSL is not a mock chain).
- **Source:** Google Testing Blog, Don't Overuse Mocks (https://testing.googleblog.com/2013/05/testing-on-toilet-dont-overuse-mocks.html).

### 23. partial-mock-of-sut [Rancid]
- **Sniff for:** stubbing or spying on methods of the very class or module under test (partial mocks, monkeypatching the SUT's own helper, overriding a method in a test subclass) so the test exercises a hybrid that exists nowhere in production.
- **Fix:** extract the stubbed part into a collaborator and inject it; then the SUT runs whole and the boundary is honest.
- **Don't flag:** overriding a protected factory hook explicitly designed as a seam in legacy-rescue work, as a labeled transitional state.
- **Source:** Meszaros, xUnit Test Patterns, Test-Specific Subclass overuse (http://xunitpatterns.com/Test-Specific%20Subclass.html).

# Pillar 5. Determinism

### 24. real-clock [Rancid]
- **Sniff for:** `Date.now()`, `new Date()`, `Instant.now()`, `SystemTime::now()`, `time.time()` inside tested logic or expectations; tests that fail at midnight, month ends, DST shifts, or leap years; timestamps compared against "now" with tolerance windows.
- **Fix:** control time: fake timers (`vi.useFakeTimers`), an injected clock (`Clock` in the constructor, `freezegun`, `tokio::time::pause`), and fixed literal instants in expectations. The clock is a dependency; inject it like one.
- **Don't flag:** using the real clock to generate unique names scoped by pid or uuid (uniqueness, not logic), or duration measurement in explicitly-marked benchmark tests.
- **Source:** Fowler, Eradicating Non-Determinism in Tests, Time (https://martinfowler.com/articles/nonDeterminism.html).

### 25. unseeded-randomness [Funky, Rancid when failures are unreproducible]
- **Sniff for:** random inputs (`Math.random`, `faker` without a seed, `rand::random`) whose values are not logged; property-based tests that fail without printing the seed and the shrunk counterexample; "random" data actually meant as arbitrary data.
- **Fix:** seed the generator per test and print the seed on failure so any run is reproducible; for arbitrary data, use fixed boring values from a builder. [Property-based frameworks](./concepts/property-based-testing.md) that report seeds and shrink (Hypothesis, proptest, fast-check) are the right tool for genuine input exploration.
- **Don't flag:** property-based testing with reported seeds; that is disciplined randomness, not a smell.
- **Source:** Fowler, Eradicating Non-Determinism in Tests (https://martinfowler.com/articles/nonDeterminism.html).

### 26. order-dependence [Rancid]
- **Sniff for:** tests that pass in file order and fail alphabetized, shuffled, or alone; a test consuming state a previous test created (the id from test 1 used in test 3); suites pinned to sequential execution because "they interfere".
- **Fix:** each test builds and owns its state. Turn on order randomization (`pytest-randomly`, Vitest `sequence.shuffle`, JUnit random method order) to flush hidden coupling, then fix what it exposes.
- **Don't flag:** explicitly declared ordered scenario chains in tools designed for them, when the chain is one named journey rather than an accident.
- **Source:** Meszaros, xUnit Test Patterns, Interacting Tests under Erratic Test (http://xunitpatterns.com/Erratic%20Test.html).

### 27. shared-mutable-state [Rancid]
- **Sniff for:** module-level singletons mutated by tests, env vars set without restore, static caches warm from a previous test, one shared DB or directory all tests write into; symptoms are "passes alone, fails together" and cross-worker collisions.
- **Fix:** fresh state per test (new instance, unique temp dir, per-worker database or schema, transaction rollback); reset in setup rather than teardown, because a crashed test never runs its teardown.
- **Don't flag:** shared immutable state (compiled artifacts, read-only reference data); sharing is only a smell when someone mutates.
- **Source:** Meszaros, xUnit Test Patterns, Test Run War / Unrepeatable Test (http://xunitpatterns.com/Erratic%20Test.html).

### 28. unhermetic-unit [Rancid in the unit lane, Funky as unmarked integration]
- **Sniff for:** tests in the default fast lane hitting real network, live third-party APIs, DNS, the developer's global config, or machine-installed binaries; tests that fail offline, on a fresh machine, or when an external service hiccups.
- **Fix:** make the fast lane hermetic (the lane rule is in [hermeticity](./concepts/hermeticity.md)): in-process fakes, local emulators, containers the suite starts itself. Real-dependency tests are legitimate, but they live in a marked integration lane with its own schedule and their failures never block on external weather.
- **Don't flag:** integration tests that are honestly labeled, isolated to their lane, and hit infrastructure the suite itself provisions (testcontainers, a spawned localhost server).
- **Source:** Google Testing Blog, Hermetic Servers (https://testing.googleblog.com/2012/10/hermetic-servers.html).

### 29. platform-locale-dependence [Funky]
- **Sniff for:** hardcoded path separators and `/tmp`, expectations dependent on locale formatting, collation, or line endings; tests green on Linux and red on Windows (or only ever run on one OS in CI while the app ships on another).
- **Fix:** build paths with the platform API, pin `TZ` and locale for the suite, normalize line endings at the assert, and run CI on every OS the product ships on.
- **Don't flag:** platform-specific tests correctly gated to their platform with a visible skip elsewhere (`#[cfg(windows)]`, honest skip markers).
- **Source:** Fowler, Eradicating Non-Determinism in Tests (https://martinfowler.com/articles/nonDeterminism.html).

### 30. concurrency-race [Rancid]
- **Sniff for:** asserting on the intermediate state of parallel work, fixed sleeps to let a background thread win a race (a 250ms nap so a child registers before a kill), tests relying on scheduling luck; tests that fail only on slow or loaded CI runners.
- **Fix:** synchronize on events rather than time: latches, channels, notifications, deterministic executors, or a virtual-time runtime. If the code offers no way to await the state, that missing hook is the production bug to fix first.
- **Don't flag:** stress tests that hammer concurrency on purpose in their own lane; they hunt races, not regressions.
- **Source:** Google Testing Blog, Where Do Our Flaky Tests Come From? (https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html).

# Pillar 6. Async and waiting

### 31. sleep-based-sync [Rancid]
- **Sniff for:** `sleep(2000)` before asserting, `setTimeout`-then-check, polling loops of fixed naps (`for _ in 0..50 { sleep(20ms) }`), hard waits in e2e (`page.waitForTimeout`). Every one is simultaneously too slow (pays the worst case every run) and too flaky (fails when the worst case is worse).
- **Fix:** wait on the condition, not the clock: `waitFor`/`findBy`, `expect.poll`, web-first auto-retrying assertions, awaiting the actual promise or notification, a channel receive with a deadline. With fake timers, advance time explicitly.
- **Don't flag:** a bounded condition-poll with a clear timeout where no event exists to await (last resort, at the smallest interval); explicitly-marked timing tests measuring real durations.
- **Source:** Playwright, Best Practices, web-first assertions (https://playwright.dev/docs/best-practices); Fowler, Eradicating Non-Determinism in Tests, Asynchrony (https://martinfowler.com/articles/nonDeterminism.html).

### 32. missing-await [Rancid]
- **Sniff for:** an async assertion not awaited or returned, so the test exits green before the check runs; fire-and-forget promises in test bodies; async callbacks whose failures land after the test ended (or in the next test's report).
- **Fix:** await or return every promise/future in a test; enable the lint that makes this mechanical (`@typescript-eslint/no-floating-promises`, Vitest/Jest unhandled-rejection strictness, pytest asyncio strict mode). A test that cannot fail is worse than no test (category 44).
- **Don't flag:** deliberately unawaited work that the test then observes through a proper wait (category 31's fix).
- **Source:** typescript-eslint, no-floating-promises (https://typescript-eslint.io/rules/no-floating-promises/).

### 33. unbounded-or-global-waits [Funky]
- **Sniff for:** polling loops with no deadline (hang forever on a bug), suite-wide timeouts cranked to minutes to accommodate the slowest test, per-test timeouts so generous a hang costs 10 minutes of CI before failing.
- **Fix:** every wait gets a bound and a message saying what it was waiting for; keep the default timeout tight and raise it per-test with a reason where genuinely needed.
- **Don't flag:** one generous timeout on an honestly-slow marked integration test.
- **Source:** Playwright, Timeouts (https://playwright.dev/docs/test-timeouts).

### 34. in-test-retry-loop [Funky]
- **Sniff for:** a test retrying its own body until it passes (loop plus try/catch around act-and-assert), re-clicking until the UI responds, "attempt up to 3 times" helpers inside test code.
- **Fix:** retrying the whole action hides the race that made it fail; replace with a proper wait on the precondition (category 31) or fix the product race. Retries belong to the runner as a flake-detection tool (category 45), not inside test bodies where they silently convert real bugs into latency.
- **Don't flag:** retrying a genuinely idempotent setup step against infrastructure the test itself starts (waiting for a container to accept connections).
- **Source:** Google Testing Blog, Flaky Tests at Google and How We Mitigate Them (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html).

# Pillar 7. Speed and cost

### 35. inverted-pyramid [Funky]
- **Sniff for:** pure logic tested only through the UI or a spawned process; every feature owning an end-to-end test but no unit tests; a suite whose runtime lives in browser or subprocess tests while the functions they exercise have cheap seams sitting untested.
- **Fix:** push each test down to the cheapest layer that can catch the failure (the placement rule behind every shape in [test-pyramid](./concepts/test-pyramid.md)): logic to unit, wiring to integration, and a handful of user journeys end to end. Delete the e2e that only duplicates what a unit test now proves (category 37).
- **Don't flag:** a deliberate trophy-shaped suite (integration-heavy) in a wiring-dominated app; the principle is cheapest-layer-that-catches-it, not a fixed ratio.
- **Source:** Vocke, The Practical Test Pyramid (https://martinfowler.com/articles/practical-test-pyramid.html); Kent C. Dodds, Write tests. Not too many. Mostly integration. (https://kentcdodds.com/blog/write-tests).

### 36. heavy-per-test-setup [Funky]
- **Sniff for:** each test booting the whole app, re-seeding an entire database, recursively copying a large fixture tree, or starting a fresh browser for a single assertion; setup dwarfing act-and-assert in wall-clock terms.
- **Fix:** share expensive immutable ground at suite level (one boot, one compiled schema, one browser with fresh contexts per test) and give each test only its own mutable slice (transaction rollback, per-test subdirectory, copy-on-write). Or drop down a layer (category 35): most of those tests did not need the whole app.
- **Don't flag:** genuinely mutable expensive state rebuilt per test because isolation demands it and no cheaper isolation exists; that is the price of category 27 done right.
- **Source:** Meszaros, xUnit Test Patterns, Slow Tests (http://xunitpatterns.com/Slow%20Tests.html).

### 37. redundant-layer-coverage [Funky]
- **Sniff for:** the same behavior asserted at unit, integration, and e2e level; a bugfix that requires updating four tests in four files that all pin the same fact; e2e flows re-walking every variation a parametrized unit test already covers.
- **Fix:** each behavior gets one home at the cheapest sufficient layer; higher layers assert only what is new there (the wiring, the journey). Delete the duplicates, and push variations down (test the matrix at unit level, one representative path above).
- **Don't flag:** deliberate defense-in-depth on a small number of business-critical invariants (a payment amount), when the duplication is chosen, not accreted.
- **Source:** Vocke, The Practical Test Pyramid (https://martinfowler.com/articles/practical-test-pyramid.html).

### 38. forced-serial-suite [Funky]
- **Sniff for:** parallelism globally disabled (`--runInBand`, `workers = 1`, `parallelism: none`, `[serial]` everywhere) because tests collide; a suite whose wall clock is the sum of its tests on a 16-core machine.
- **Fix:** fix the collisions (category 27: per-worker state, unique resources), then parallelize by default and shard in CI. Serial execution is a symptom being tolerated, not a setting.
- **Don't flag:** a small serial subset with a stated hardware reason (one GPU, one license, one serial port), kept in its own lane.
- **Source:** Meszaros, xUnit Test Patterns, Slow Tests (http://xunitpatterns.com/Slow%20Tests.html).

### 39. mega-parametrization [Whiff]
- **Sniff for:** combinatorial matrices generating thousands of near-identical cases that all walk the same branch; parametrized cross-products where one axis at a time would prove the same thing; suite time dominated by case-count, not case-cost.
- **Fix:** pick boundary and representative values per axis, pairwise instead of full product, or replace the enumeration with one property-based test whose generator owns the space.
- **Don't flag:** exhaustive enumeration of a genuinely small, closed domain (all enum variants, all opcodes); exhaustive-and-cheap is a feature.
- **Source:** Google Testing Blog, Code Coverage Best Practices (https://testing.googleblog.com/2020/08/code-coverage-best-practices.html).

### 40. no-speed-budget [Whiff]
- **Sniff for:** nobody can name the slowest ten tests; suite runtime has doubled in a year and no alarm fired; no fast-lane guarantee, so developers stopped running tests locally and push-and-pray instead.
- **Fix:** make runtime visible (`--durations`, `slowTestThreshold`, nextest slow warnings), set a budget per lane (unit suite in seconds, PR gate in minutes), and treat a budget breach like a failing test: someone looks.
- **Don't flag:** a slow suite that is measured, budgeted, and honestly lane-split; slow-and-managed is a cost decision, not a smell.
- **Source:** Google Testing Blog, Test Sizes (https://testing.googleblog.com/2010/12/test-sizes.html).

# Pillar 8. Coverage theater and gaps

### 41. coverage-driven-tests [Funky]
- **Sniff for:** tests shaped to touch lines rather than state facts: calling every method once with no meaningful asserts, tests added in bulk to clear a threshold, coverage high while mutation testing (or deliberately breaking the code) shows nothing fails.
- **Fix:** write tests from behaviors and bug reports, not from the coverage report; use coverage to find untested behavior, never as the target. Spot-check with a [mutation tool](./concepts/mutation-testing.md) (Stryker, mutmut, cargo-mutants, PIT) where coverage numbers look too good.
- **Don't flag:** coverage used as a ratchet against regressions in reviewed, behavior-first suites.
- **Source:** Google Testing Blog, Code Coverage Best Practices (https://testing.googleblog.com/2020/08/code-coverage-best-practices.html).

### 42. trivial-tests [Whiff]
- **Sniff for:** tests of getters and setters, constants equaling themselves, framework behavior (the router routes, the ORM maps), generated code, and simple pass-through delegation; maintenance surface with no failure a human cares about.
- **Fix:** delete them; test the behavior that uses the value, not the value's existence. Framework behavior is the framework's test suite's job.
- **Don't flag:** a pass-through test that pins a public contract you promised (an exported constant that is an API), or delegation with mapping logic inside.
- **Source:** Software Engineering at Google, Unit Testing (https://abseil.io/resources/swe-book/html/ch12.html).

### 43. happy-path-only [Funky, Rancid for boundary-guarding code]
- **Sniff for:** success covered five ways while the error contract is untested: no test for invalid input, empty collections, missing files, denied permissions, or the failure branch of every `catch`/`Err`; parsers and validators tested only on well-formed input.
- **Fix:** for each public behavior, cover the interesting sads: one representative failure per error kind, the boundary values, the empty case. For code that guards a boundary (parsing, auth, sandboxing), the sad paths are the point and deserve the majority of the cases.
- **Don't flag:** internal code whose error paths are structurally unreachable (already guarded upstream) when a type or assert documents that.
- **Source:** Software Engineering at Google, Unit Testing (https://abseil.io/resources/swe-book/html/ch12.html).

### 44. cant-fail-test [Rancid]
- **Sniff for:** asserts inside callbacks that never run, expectations in a catch block that never throws, missing `expect.assertions` guards, mocked-out everything (category 19's terminal state); prove it by breaking the production code and watching the test stay green.
- **Fix:** make the failure path reachable and demonstrated: watch each new test fail once before it passes; add assertion-count guards where asserts live in callbacks; run a mutation tool over suspicious modules to find the always-green tests wholesale.
- **Don't flag:** nothing. A test that cannot fail is pure cost, delete or fix it.
- **Source:** Google Testing Blog, Mutation Testing (https://testing.googleblog.com/2021/04/mutation-testing.html).

# Pillar 9. Lifecycle and CI hygiene

The flake lifecycle (detect, quarantine, fix) and the trust metrics this pillar polices are defined in [flakiness](./concepts/flakiness.md).

### 45. retry-as-policy [Funky, Rancid when it hides a product bug]
- **Sniff for:** global retries in the runner or CI (`retries: 2`, `flaky = true` annotations accumulating, a plugin rerunning failures) with no tracking of what retried; flakes thereby converted into invisible latency, including the ones that are real product races users will hit.
- **Fix:** retries are a detection instrument, not a policy: record every pass-on-retry as a flake event with the test name, alert on the rate, and route flaky tests to quarantine (category 46) for a fix. A test that needs a retry to pass is a failing test with better marketing.
- **Don't flag:** bounded retries scoped to a lane that talks to genuinely unreliable external infrastructure, when pass-on-retry is still logged and reviewed.
- **Source:** Google Testing Blog, Flaky Tests at Google and How We Mitigate Them (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html).

### 46. quarantine-without-ledger [Funky]
- **Sniff for:** flaky tests skipped "temporarily" with no owner, ticket, or expiry, accumulating for years; a quarantine list nobody reviews; the suite's real coverage silently shrinking behind a green badge.
- **Fix:** quarantine is a queue, not a graveyard: each entry gets an owner, a link, and an expiry that fails the build when it lapses; review the list on a cadence; celebrate deletions.
- **Don't flag:** an actively-worked quarantine with single-digit entries and visible turnover; that is the mechanism functioning.
- **Source:** Fowler, Eradicating Non-Determinism in Tests, Quarantine (https://martinfowler.com/articles/nonDeterminism.html).

### 47. green-by-rerun [Rancid]
- **Sniff for:** the team habit of rerunning CI until it passes; merge-on-second-attempt normalized; nobody investigates a failure that "went away"; trust in the suite quietly gone, so real regressions get rerun past too.
- **Fix:** every non-deterministic failure is triaged: reproduce (rerun the test alone N times, shuffled), then fix or quarantine with a ledger entry. Track first-attempt green rate as a health metric; when it drops, that is an incident, not weather.
- **Don't flag:** a rerun after a genuine infrastructure outage, when the outage is named.
- **Source:** Google Testing Blog, Where Do Our Flaky Tests Come From? (https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html).

### 48. silent-conditional-pass [Rancid]
- **Sniff for:** tests that return early and report green when a precondition is absent (an env var unset, a binary not installed, a platform mismatch handled by `if ... return` instead of a skip); the test passes on every machine where it did not run, and the one guarantee it covers is only ever checked in one special CI job, if at all.
- **Fix:** use the framework's skip mechanism with a reason so the report says skipped, not passed; then make CI assert the test actually ran somewhere (a required lane where the precondition is provisioned and the skip count for it is zero).
- **Don't flag:** honest visible skips with a reason, paired with at least one CI lane that runs the real thing.
- **Source:** pytest, Skipping tests (https://docs.pytest.org/en/stable/how-to/skipping.html).

### 49. fix-by-deletion [Funky, Rancid when the behavior change was unintended]
- **Sniff for:** a failing assert "fixed" by weakening it (`toEqual` becoming `toBeTruthy`), inverting it, deleting the test, or bulk-updating snapshots to whatever the code now emits, with no evidence anyone decided the new behavior is correct. Agents under pressure to get CI green do this fluently.
- **Fix:** a test diff is a behavior-contract diff; review it with the same weight as the production diff. The valid moves are: the behavior change was intended (update the expectation and say why in the commit), or it was not (fix the code). "Make the test agree with the code" is never a reason on its own.
- **Don't flag:** deleting tests together with the feature they covered, or deleting redundant-layer duplicates as part of category 37.
- **Source:** Software Engineering at Google, Unit Testing, unchanging tests (https://abseil.io/resources/swe-book/html/ch12.html).
