# Background concepts behind the test-stinky catalog, suite pass, and gate stack.

- [Test Pyramid and Placement](test-pyramid.md) - The layer model (pyramid, trophy, test sizes) and the placement rule the shapes all reduce to.
- [Test Doubles](test-doubles.md) - The five kinds of double, the classical vs mockist split, and the contract-test obligation that keeps fakes honest.
- [Flakiness](flakiness.md) - What a flaky test is, where flakes come from, and the detect-quarantine-fix lifecycle with its trust metrics.
- [Hermeticity and Lanes](hermeticity.md) - What makes a test hermetic, why the fast lane demands it, and how an integration lane earns its exceptions.
- [DAMP vs DRY](damp-vs-dry.md) - Why test code optimizes for descriptive readability over deduplication, and the builder vocabulary that resolves the tension.
- [Mutation Testing](mutation-testing.md) - Seeding artificial bugs to measure whether the suite can fail, with tools and a sustainable sampling strategy.
- [Property-Based Testing](property-based-testing.md) - Invariants over generated inputs with shrinking and reported seeds, the disciplined form of randomness.
