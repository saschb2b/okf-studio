---
type: Feature
title: Profile-Aware Authoring
description: Carry selected advisory conventions into bounded agent tasks and check staged drafts without changing OKF conformance.
tags: [feature, profiles, agents, authoring, validation, staging]
generated: { by: claude/unrecorded, at: 2026-07-23T15:15:00Z }
---

# User job

A maintainer who chose an [advisory profile](advisory-profiles.md) wants Create, Revise, Audit, and migration work to follow that profile without copying its fields and examples into every prompt. Before work starts, Studio shows which local profile guidance will enter the task. During review, Studio checks the proposed bundle against both the OKF specification and the selected profile and names which result came from which contract.

# Accepted context

Only Create, Revise, Audit, and migration tasks receive profile context. Studio projects active and unavailable profile identities, field guidance, examples, relationship vocabulary, authored [typed relationships](typed-relationships.md), and current diagnostics into a closed, bounded manifest. It labels every field as **OKF-required**, **Profile-required**, or **Recommended**, states how many authored edges are included, and includes the fixed statement **Profile advice does not change OKF validation.**

The manifest is capped before it reaches an agent and validated again at the native session boundary. Typed edges are capped at 128 per task and preserve their resolution and portability status. The manifest becomes part of the bundle fingerprint, so a changed profile declaration, descriptor, or typed edge makes an accepted context plan stale. Research, repair, enrichment, change-impact, and ordinary authoring tasks do not receive this profile projection.

# Reviewed results

Staged validation produces two independent results:

- **OKF validation** contains the errors and warnings that can block Apply.
- **Profile checks** contain information, recommendations, warnings, active and unavailable profile counts, and whether the draft declared the profile itself.

Profile advice never increments the OKF error count and cannot block Apply. An edit-mode draft is evaluated with the profile descriptors copied from the authorized source bundle into an isolated validation mirror. A fresh-bundle draft that does not declare a profile is checked against the source bundle's already resolved profile and says **Selected source**. A fresh draft that declares profiles resolves its own local descriptors instead.

# Migration entry point

Each profile finding on the bundle home can open **Review migration**. The shared task launcher prefers the migration task, carries the affected concept when one exists, and attaches a bounded source that says the finding is advisory rather than OKF validation. The agent can propose a change, but the existing diff, validation, review, Apply, and Restore boundaries remain unchanged.

# Failure states

When a bundle declares profiles, profile-aware tasks wait for the typed report. A failed report explains that the bundle remains open and offers Retry. An unavailable descriptor stays visible in task context and staged review but contributes no interpreted checks. Oversized or malformed context is rejected at the native boundary instead of being silently trimmed after acceptance.

# Verification

Pure tests cover bounded projection, profile-sensitive fingerprints, persisted-manifest validation, native closed-schema validation, isolated staged evaluation, and source-profile evaluation for fresh drafts. Component tests cover the requirement labels and migration entry point. Wide and 360-pixel stories cover the context and review states.

Related behavior: [Native OKF Tasks](native-okf-tasks.md), [Agent Panel](agent-panel.md), [Validation](validation.md), and [Advisory Profile Contract](../reference/advisory-profile-contract.md).
