---
type: Technique
title: "Mutation Testing"
description: "Seeding artificial bugs to measure whether the suite can fail, the honest complement to line coverage, with per-ecosystem tools and a sustainable sampling strategy."
tags: [testing, mutation-testing, coverage, quality]
timestamp: 2026-07-17T00:00:00Z
---
# Mutation Testing

Mutation testing seeds small artificial bugs (mutants) into production code, one at a time (`>=` flipped to `>`, a branch deleted, a constant nudged), and reruns the tests. A mutant the suite fails on is **killed**; one the suite passes over **survives**. Surviving mutants in covered lines are the mechanical detector for the [catalog's](../catalog.md) coverage-theater pillar: tests that execute code without constraining it (category 41) and tests that cannot fail at all (category 44).

The point over line coverage: coverage proves the code *ran*, mutation score proves the tests would *notice a change*. That is the difference between a map and a guarantee, and why the [gate stack](../gates.md) refuses coverage-percentage gates but ships a mutation spot-check (gate 8).

## Tools

| Ecosystem | Tool |
| --- | --- |
| JS/TS | Stryker (https://stryker-mutator.io/) |
| Python | mutmut, cosmic-ray |
| Rust | cargo-mutants |
| JVM | PIT (https://pitest.org/) |

## Sustainable use

- **Sample and rotate, never whole-repo per PR.** Mutation runs multiply the suite's runtime by the mutant count; whole-repo runs are for occasional audits. Schedule a rotating module (gate 8) and prioritize the modules where correctness matters most.
- **Read survivors as findings, not as a score to chase.** Each survivor names a missing assert or a can't-fail test; fixing those is the value. A mutation-score target invites the same gaming as a coverage target.
- **Equivalent mutants exist** (mutations that change no observable behavior); triage survivors rather than demanding zero.
- The manual fallback needs no tool: deliberately break the code under a suspicious test and watch whether anything fails. One minute, and it settles category 44 for that test.

# Citations

- Google Testing Blog, Mutation Testing (https://testing.googleblog.com/2021/04/mutation-testing.html)
- Petrovic and Ivankovic, State of Mutation Testing at Google (https://research.google/pubs/pub46584/)
- Google Testing Blog, Code Coverage Best Practices (https://testing.googleblog.com/2020/08/code-coverage-best-practices.html)
