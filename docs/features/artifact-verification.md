---
type: Feature
title: Artifact Verification and Critic Passes
description: Deterministic checks and an optional isolated OKF critic that compare findings without gaining authority over revisions or writes.
tags: [feature, agents, artifacts, verification, critic, safety]
timestamp: 2026-07-18T14:20:00Z
---

# Purpose

Structured OKF work needs a stronger completion signal than fluent agent prose. Studio runs deterministic checks over every accepted [Structured Agent Work](structured-agent-work.md) revision. An optional independent critic may then look for semantic coverage gaps, contradictions, unsupported claims, and missed relationships. The two passes remain separate: model feedback cannot erase a deterministic failure.

# Why this exists

Schema validation can prove that an artifact is well formed and tied to the current bundle. It cannot prove that the work is complete, that its conclusions follow from the cited evidence, or that the producing model noticed a contradiction. Without another layer, a polished response becomes the practical completion signal and the user must audit it from scratch.

The deterministic pass turns requirements that Studio can prove into stable findings. The isolated critic covers semantic questions that cannot be reduced to a parser rule. Keeping their authority separate gives the user a useful second opinion without allowing one model response to approve another or clear a machine-detected block.

# Deterministic pass

Rust runs the artifact pass after schema, identity, revision, source, and path validation. It reports versioned findings for incomplete required fields, work items outside the declared concept scope, proposed concepts, unused sources, and completed or advisory items without a concept or source reference. Errors set `completionBlocked`; warnings remain advisory. The result is attached to the exact artifact returned over IPC.

The staged-change surface also re-runs its existing isolated OKF parser and validator automatically after a staged file or hunk update. Apply and fresh-bundle creation still require the exact validated staged revision and remain blocked by deterministic conformance errors.

# Independent critic

The critic is available only for Studio Agent. External ACP processes are ineligible even when their launcher profile is Restricted offline: a read-only bundle mount would still expose more concepts than the declared critic scope.

Rust creates a separate Studio Agent session, verifies that its write grant is denied, and sends the model an empty tool catalog. The prepared prompt embeds the validated artifact and the exact content of at most 24 declared current concepts, with no user attachments or new external evidence. If that complete packet exceeds the host limit, preparation fails instead of truncating evidence. The critic prompt prohibits editing, staging, approval, Apply, scope expansion, fetching, and presenting inference as evidence. The critic response does not enter the original transcript or staged transaction.

# Accepted result

Rust accepts only a bounded `okf-critic` JSON envelope tied to the exact artifact ID, artifact revision, and bundle fingerprint. It requires one status for each review category. `unavailable` stays unavailable and requires a stated limitation. Every finding must resolve to an artifact field ID, declared concept ID, or source ID. An inference may appear only as an unverified question. Unknown references, unknown deterministic rule IDs, duplicate identities, approval fields, and malformed comparison claims are rejected.

The report shows checked and unavailable categories, findings and their exact references, agreements and disagreements with deterministic rules, unverified questions, host limitations, and provider capability limitations. A critic result can be `concerns found`, `no concerns`, or `inconclusive`; none grants completion or write authority.

# Verification

Rust tests prove that the prepared packet contains the declared concept body, that only the native provider can enter critic mode, and that the model receives no tools. They seed an unsupported immediate-Apply conclusion against the reviewed-staging concept and require the critic contract to catch it with field, concept, and source references. Another case gives a partial artifact a no-concern critic response and proves the deterministic completion block remains set. The model-free [OKF agent benchmark](../architecture/agent-benchmarking.md) freezes both cases and rejects critic authority or unresolved reference kinds in CI.

Storybook MCP covers ready, compared, capability-unavailable, loading, invalid, Standard-agent-blocked, and 360-pixel states. The artifact body remains the only scrolling region, while revision actions stay in the stable footer.

Related trust boundaries: [Agent Panel](agent-panel.md), [Knowledge Health](knowledge-health.md), and [IPC & Security](../architecture/ipc-and-security.md).
