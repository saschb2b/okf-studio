---
type: Evaluation Record
title: OKF Writing Quality Dogfood
description: The retained implementation, component, provider, and packaging evidence for the first OKF Writing release.
tags: [product, agents, writing, evaluation, dogfood]
generated: { by: claude/unrecorded, at: 2026-07-18T20:30:00Z }
---

# Scope

The first dogfood pass used the product rationale for reviewed staging as the revision target. Its reader needs to understand why staging exists and which authority boundary it creates. The pass also exercised seven frozen writing cases twice through an authenticated external Codex provider.

# Reviewed concept evidence

| Claim | Before | After | Status |
| --- | --- | --- | --- |
| Review boundary | Agent edits can be reviewed before they are applied. | Agent edits stay outside the bundle until validation, review, and Apply. | Reworded |
| Apply authority | Apply remains a separate user action. | Apply remains a separate user action. | Unchanged |

The proposed wording makes the safety boundary explicit without changing Apply authority. The wide and narrow `writing-revision` stories retain this comparison beside the reader job, sources, deterministic findings, and isolated critic. Storybook MCP discovered both stories from the live index and passed their interaction and accessibility checks. The complete Storybook MCP run also passed.

# Provider evidence

Codex CLI reported model `gpt-5.6-sol`. Two runs covered all seven writing cases in opposite orders, producing 14 retained prompts and outputs in the application-data benchmark directory. All 14 passed the model-free required-knowledge, qualifier, citation, link, and unsupported-claim gates.

The first score exposed an evaluation defect: the source-policy case required the exact phrase `must retain`, while the provider preserved the same normative claim as `requires records to be retained`. The scorer now accepts a closed set of equivalent normative forms. It still fails missing normativity, retention period, policy attribution, citation, or unsupported promotional language.

This result is not the blind preference gate. No Studio Agent endpoint was configured, and no human pairwise review was performed. The local result records both as unavailable instead of assigning a passing score.

# Generic chat routing evidence

A read-only external Codex run received a generic request to review the bundle for clearer writing. It loaded the repository `okf` router, selected `okf-revise`, preserved the method's no-semantic-change boundary, and returned a claim-inventory procedure without editing files. Transport tests separately confirmed that an ACP agent can enumerate the active capability catalog and load the declared revision resource through Studio MCP.

This proves discovery and delivery, not provider compliance. Studio still cannot attest that an external agent followed every instruction after loading it. A named task remains the stronger entry point when the user needs a deterministic task ID, context plan, and artifact contract.

# Product and packaging evidence

Frontend lint, typecheck, 234 unit and component tests, 14 benchmark tests, production build, Rust formatting, both clippy gates, 73 core tests, 228 desktop-library tests, the docs bundle, the marketing site, and the ODSF bundle passed locally.

The Windows release build produced the application binary, MSI, and NSIS installer. Updater signing did not run because this environment has the public key but not `TAURI_SIGNING_PRIVATE_KEY`. Linux and macOS packages require their platform runners.

# Open release evidence

- Run the same two writing passes through a configured Studio Agent endpoint.
- Complete the shuffled blind human comparison and meet the frozen 70 percent preference threshold.
- Sign release artifacts in the protected release environment and complete Linux and macOS package jobs.

These items do not change the shipped writing method or review boundary, but the roadmap does not treat them as completed evidence until they run.
