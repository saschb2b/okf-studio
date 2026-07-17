---
okf_version: "0.1"
---

# Detection catalog, suite pass, gate stack, and background concepts behind the test-stinky skill.

The three operating documents, in the order a scan uses them:

- [Test Stinky Catalog](catalog.md) - The full test-suite smell catalog, in nine pillars and 49 categories, language and framework agnostic.
- [Test Stinky: Suite Pass](suite-pass.md) - A sweep-level audit of the whole suite's shape, layers, runtime, flake surface, and redundancy, plus the slimming procedure for an oversized suite.
- [Test Stinky: Gate Stack](gates.md) - The mechanical enforcement layer that keeps a slimmed suite honest, lint rules, order shuffle, duration budgets, flake detection, mutation spot-checks, and CI lane wiring.

The background concepts the operating documents link into ([concepts/](concepts/index.md)):

- [Test Pyramid and Placement](concepts/test-pyramid.md) - The layer model (pyramid, trophy, test sizes) and the placement rule the shapes all reduce to.
- [Test Doubles](concepts/test-doubles.md) - The five kinds of double, the classical vs mockist split, and the contract-test obligation that keeps fakes honest.
- [Flakiness](concepts/flakiness.md) - What a flaky test is, where flakes come from, and the detect-quarantine-fix lifecycle with its trust metrics.
- [Hermeticity and Lanes](concepts/hermeticity.md) - What makes a test hermetic, why the fast lane demands it, and how an integration lane earns its exceptions.
- [DAMP vs DRY](concepts/damp-vs-dry.md) - Why test code optimizes for descriptive readability over deduplication, and the builder vocabulary that resolves the tension.
- [Mutation Testing](concepts/mutation-testing.md) - Seeding artificial bugs to measure whether the suite can fail, with tools and a sustainable sampling strategy.
- [Property-Based Testing](concepts/property-based-testing.md) - Invariants over generated inputs with shrinking and reported seeds, the disciplined form of randomness.
