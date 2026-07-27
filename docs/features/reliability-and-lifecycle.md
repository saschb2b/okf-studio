---
type: Feature
title: Reliability and Lifecycle
description: Qualify knowledge with optional lifecycle, confidence, effective-time, review, contradiction, and replacement signals.
tags: [feature, reliability, lifecycle, profiles, retrieval, health]
generated: { by: claude/unrecorded, at: 2026-07-23T16:15:00Z }
lifecycle: active
confidence: 0.9
review_after: 2026-10-01
---

# User job

A reader needs to know when a concept is uncertain, disputed, due for review, outside its effective period, deprecated, superseded, or retired before relying on it. A maintainer needs malformed states and replacement cycles to appear in the same deterministic health workflow as other advisory quality findings.

# Advisory profile

Studio ships the local `io.okf.reliability` descriptor as an example profile. A bundle opts in through its root `profiles` map and may use these concept fields:

| Field | Meaning |
| --- | --- |
| `lifecycle` | `draft`, `active`, `deprecated`, `superseded`, or `retired` |
| `confidence` | Authored assessment from 0 to 1 |
| `effective_from`, `effective_until` | ISO effective-time bounds |
| `review_after` | ISO date after which review is due |
| `superseded_by` | Bundle concept IDs that replace this concept |
| `contradicts` | Bundle concept IDs whose claims should be inspected together |

The same profile defines portable `supersedes` and `contradicts` [typed relationships](typed-relationships.md). Every typed edge still requires an ordinary Markdown link.

# Derived status

The Concept Reader derives one prominent status with deterministic precedence: retired, superseded, deprecated, contradicted, not yet effective, outside effective period, review overdue, uncertain, then current. It shows the authored signals and states that Studio has not verified the claim. Missing reliability metadata renders no notice and never creates an OKF issue.

Malformed confidence or date ranges, unknown lifecycle values, active concepts with a declared replacement, superseded concepts without a replacement, and supersession cycles are advisory findings. A cycle never causes Studio to guess which concept is current.

# Retrieval qualification

The Rust retrieval manifest preserves the reliability fields with each coherent evidence unit. Included deprecated, superseded, retired, uncertain, or explicitly contradictory knowledge produces a bounded caveat. Conflict or lifecycle caveats require an abstaining answer rather than silently presenting the excerpt as current truth. The native agent tool returns the same caveats as the Studio retrieval inspector.

Authored confidence remains an assertion by the producer. A URL, timestamp, status, or high confidence value is not proof that a claim is correct.

Maintainers change lifecycle deliberately through the [Retirement Workflow](retirement-workflow.md). That workflow turns deprecation, redirect, tombstone, or deletion into an impact-aware graph change and records its reason in `log.md`; the advisory profile alone never deletes or rewrites a file.

# Bounds and failure states

Reliability fields are scalars or bounded concept-ID arrays under the existing concept extension limits. Health analysis uses a linear cycle-core pass over the already bounded graph. Unknown values remain visible in the [Metadata Inspector](metadata-inspector.md), profile advice stays separate from [Validation](validation.md), and ordinary concepts without the profile remain readable.

Related behavior: [Advisory Profiles](advisory-profiles.md), [Knowledge Health](knowledge-health.md), [Retrieval Intelligence](retrieval-intelligence.md), and [Typed Relationships](typed-relationships.md).
