---
type: Technique
title: "Property-Based Testing"
description: "Testing invariants over generated inputs with shrinking and reported seeds, the disciplined form of randomness and the replacement for mega-parametrization."
tags: [testing, property-based, generators, randomness]
timestamp: 2026-07-17T00:00:00Z
---
# Property-Based Testing

Instead of asserting outputs for hand-picked inputs, a property-based test states an invariant that must hold for **all** inputs (`decode(encode(x)) == x`, sorting is idempotent, output length equals input length) and lets a generator explore the input space. On failure the framework **shrinks** the counterexample to a minimal one and **reports the seed**, so the failure replays deterministically.

That seed-and-shrink discipline is why the [catalog](../catalog.md) exempts it from the unseeded-randomness smell (category 25): the randomness is instrumented, not loose. It is also the prescribed replacement for mega-parametrization (category 39): a combinatorial matrix hand-enumerating thousands of cases is a generator written by an intern; let the framework own the space and keep the boundary cases as explicit examples.

## Good properties to reach for

- **Round trip:** encode then decode is identity (with at least one hand-written encoded form beside it, or the pair only proves a shared bug, category 9).
- **Invariant:** output is always sorted, non-negative, within bounds, parseable.
- **Oracle:** matches a slow-but-obviously-correct reference implementation.
- **Metamorphic:** a known input transformation produces a known output transformation (adding an item never decreases the total).

## Frameworks

| Ecosystem | Framework |
| --- | --- |
| Python | Hypothesis (https://hypothesis.readthedocs.io/) |
| Rust | proptest, quickcheck |
| JS/TS | fast-check (https://fast-check.dev/) |
| JVM | jqwik |

Keep example-based tests beside the properties for the boundary values a reviewer should see spelled out ([DAMP](damp-vs-dry.md) applies to properties too: the invariant statement is the meaningful phrase, keep it readable).

# Citations

- Claessen and Hughes, QuickCheck (https://dl.acm.org/doi/10.1145/351240.351266)
- Hypothesis documentation (https://hypothesis.readthedocs.io/)
- fast-check documentation (https://fast-check.dev/)
