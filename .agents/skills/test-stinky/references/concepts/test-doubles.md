---
type: Taxonomy
title: "Test Doubles"
description: "The five kinds of test double, the classical vs mockist split, and the contract-test obligation that keeps fakes honest."
tags: [testing, mocks, fakes, contract-testing]
timestamp: 2026-07-17T00:00:00Z
---
# Test Doubles

The vocabulary behind the [catalog's](../catalog.md) doubles pillar (categories 19 to 23). "Mock" in everyday speech covers five distinct things; the distinctions matter because each kind carries a different risk and a different obligation.

## The five kinds

Dummy
: Passed around but never used; fills a parameter list. No risk beyond noise.

Stub
: Returns canned answers to calls made during the test. Risk: canned answers drift from real behavior ([mock drift](../catalog.md), category 21).

Spy
: A stub that also records how it was called, for later inspection. Risk: the recording tempts interaction asserts where state asserts exist (category 13).

Mock
: Pre-programmed with expectations about the calls it will receive; the test fails on unexpected interaction. Risk: over-specification that freezes implementation, the core of over-mocking (category 19).

Fake
: A working lightweight implementation (in-memory repository, local filesystem stand-in). The most useful double and the most dangerous unverified: a fake is a second implementation of the contract, so **every nontrivial fake needs its own contract test** run against the real thing, or everything above it tests fiction.

## Classical vs mockist

Classical (state-based) testing uses real objects where practical and asserts on resulting state; mockist (interaction-based) testing isolates the unit behind doubles and asserts on conversations. The catalog takes the classical default: real objects for cheap collaborators, doubles only at genuine architectural boundaries, interaction asserts only where the interaction IS the contract (an outbound side effect with no observable state).

## Ownership rule

Do not double types you do not own (category 20). Wrap the third-party surface in a thin adapter you own, double the adapter, and cover the adapter with a narrow integration or contract test. This localizes vendor drift to one seam.

# Citations

- Fowler, Mocks Aren't Stubs (https://martinfowler.com/articles/mocksArentStubs.html)
- Meszaros, xUnit Test Patterns, Test Double (http://xunitpatterns.com/Test%20Double.html)
- Software Engineering at Google, Test Doubles (https://abseil.io/resources/swe-book/html/ch13.html)
- Freeman and Pryce, Mock Roles, not Objects (http://jmock.org/oopsla2004.pdf)
- Fowler, ContractTest (https://martinfowler.com/bliki/ContractTest.html)
