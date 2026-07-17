---
type: Principle
title: "DAMP vs DRY"
description: "Why test code optimizes for descriptive, self-contained readability over deduplication, and the builder vocabulary that resolves the tension."
tags: [testing, damp, fixtures, readability]
timestamp: 2026-07-17T00:00:00Z
---
# DAMP vs DRY

Production code optimizes DRY (Don't Repeat Yourself) because duplication breeds divergence. Test code optimizes **DAMP** (Descriptive And Meaningful Phrases): a test is its own documentation and its own debugger, read in isolation at the moment it fails, so a little visible repetition of the meaningful facts beats an abstraction the reader must chase. The tension is real and resolved by a placement rule, not a winner:

**Helpers hide irrelevant mechanics; the test keeps the inputs and expectations that give it meaning.**

Both failure directions live in the [catalog](../catalog.md): over-DRY indirection that turns the test into a puzzle (category 16) and raw copy-paste setup drifting across files (category 17). Mystery guests (14), general fixtures (15), and irrelevant-detail noise (18) are the same tension seen from the fixture side.

## The builder vocabulary

Test data builder
: A function or fluent builder with sensible defaults where the test names only the facts that drive the behavior: `aUser({ role: "admin" })`, `bundle_with_missing_type()`. The standard fix for 14, 17, and 18 at once.

Object mother
: A catalog of named canonical instances (`Users.admin()`). Fine for a few truly shared shapes; grows into a [general fixture](../catalog.md) (15) when every test's needs get bolted onto it. Prefer builders past a handful of cases.

Minimal fixture
: Each test builds exactly the world its behavior needs, inline or via builders. Shared fixtures are reserved for expensive immutable ground ([hermeticity](hermeticity.md) explains the mutable/immutable line).

Intent-revealing fixture name
: When data must live outside the test, the name carries the relevant fact (`invoice_with_negative_total.json`), so the reader does not open the file to understand the assert.

# Citations

- Google Testing Blog, Tests Too DRY? Make Them DAMP! (https://testing.googleblog.com/2019/12/testing-on-toilet-tests-too-dry-make.html)
- Software Engineering at Google, Unit Testing (https://abseil.io/resources/swe-book/html/ch12.html)
- Meszaros, xUnit Test Patterns, Test Data Builder territory under Fixture Setup (http://xunitpatterns.com/Creation%20Method.html)
- Kent C. Dodds, AHA Testing (https://kentcdodds.com/blog/aha-testing)
