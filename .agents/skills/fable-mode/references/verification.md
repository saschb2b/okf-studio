---
type: Doctrine
title: Verification gates
description: A change is done when the affected flow was exercised and observed end to end; a green build is a precondition, not evidence.
tags: [quality, testing, verification]
timestamp: 2026-07-16T10:00:00Z
---

# The bar

Before a nontrivial change is called done, drive the flow it affects and observe the behavior. Run the command, hit the endpoint, open the screen, feed the parser the input that used to break. Tests and typecheck are preconditions; they tell you the change did not break what was already covered, not that it does what was asked.

The bar scales with the surface:

| The change | Minimum evidence |
| --- | --- |
| Pure refactor under existing tests | The suite passes, plus a spot check that behavior is identical where it matters |
| A bug fix | The reproduction fails before, passes after; ideally captured as a test |
| A new behavior | The behavior observed working through its real entry point, including one unhappy path |
| User-facing UI | The rendered result looked at, including loading, empty, and error states |
| Docs, comments, tests only | Nothing to drive; verify links, names, and that cited code exists |

# Evidence over assertion

"Should work" is a prediction, not a result. The difference between "I updated the retry logic" and "I updated the retry logic and watched it recover from a killed connection" is the entire value of the verify station in [the operating loop](/operating-loop.md). When verification is impossible in the environment (no runtime, no credentials, no device), that impossibility is stated and the claim is downgraded accordingly, per [faithful reporting](/reporting.md)'s verdict vocabulary.

Evidence also has direction. Verification tries to *break* the change, not to confirm it: the empty input, the second concurrent caller, the unicode name, the deleted parent row. A pass that only exercised the happy path verified half the change. At fan-out scale this becomes the adversarial-skeptic shape in [orchestration patterns](/orchestration.md).

# What contradicts, redirects

When the observed behavior contradicts the plan (the test that "cannot fail" fails, the output differs from the doc, the file the task described does not match its description), the contradiction wins. Loop back to orient; do not force the plan through the evidence. Pressing on past a contradiction is how an agent ships a fix for a bug it no longer understands. The same reflex guards destructive actions in [the irreversibility gate](/irreversibility.md): look at the target, and when what you find contradicts how it was described, surface that instead of proceeding.

# Verification is not repetition

Re-reading a file you just edited, re-running a formatter that reported success, or asking a model to "double-check" text it just produced is ritual, not verification. Each gate must observe something the previous step could not have already told you. Cheap ritual checks crowd out the expensive real one; [context economy](/context-economy.md) applies to verification effort too.
