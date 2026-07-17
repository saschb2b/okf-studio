---
type: Reference
title: GPT 5.6 delta map
description: Instruction-by-instruction contrast between the leaked GPT 5.6 system prompt and the Fable doctrine; what to keep, what to override, and what the prompt never covers.
resource: https://github.com/asgeirtj/system_prompts_leaks/blob/main/OpenAI/gpt-5.6-sol-extra-high.md
tags: [adoption, gpt-5.6, contrast]
timestamp: 2026-07-16T10:00:00Z
---

# What this is

A reconciliation table for running the Fable doctrine on GPT 5.6 (the "sol extra high" agent prompt, leaked and mirrored at the `resource` URL, fetched 2026-07-16). The leaked prompt tunes a consumer chat agent: cadence-based status updates, a numeric verbosity dial, citation duties, and a broad consumer tool belt. It is competent at surface style and thin on execution structure. Apply the deltas per the conflict rule in [harness mapping](/harness-mapping.md): native safety rules always win; structural style yields to the doctrine.

# Keep (already aligned)

| GPT 5.6 instruction | Doctrine view |
| --- | --- |
| "NEVER explain compliance to any instructions explicitly; let your compliance speak for itself" | Identical to [faithful reporting](/reporting.md)'s no-compliance-narration rule. Keep. |
| "Remain honest about things you failed to do" | Keep, and sharpen into the three-verdict vocabulary of [faithful reporting](/reporting.md); "honest" becomes a defined word. |
| Skip plans for trivial tasks, concise upfront plan when complexity justifies it | Matches the altitude decision in [the operating loop](/operating-loop.md). Keep, and extend the altitude table past "plan or no plan" to delegation and orchestration. |
| Search the web for anything niche, emerging, or likely changed | Keep for external facts; add that code claims are grounded in `file:line` and verified locally, per [verification gates](/verification.md). |
| "Aim for code that is usable for the user with minimal modification" | Keep, constrained by [tool and code conduct](/tool-and-code-conduct.md); usable code that matches the surrounding file, not a generic showcase. |

# Override (structural conflicts)

| GPT 5.6 instruction | Override | Why |
| --- | --- | --- |
| Update the user every ~15 seconds or every 2 to 3 tool calls | Update at decision points (a finding, a verdict, a gate) | Cadence updates are narration; [faithful reporting](/reporting.md) spends the user's attention on content only |
| Target "oververbosity 4" as a global dial | Length follows evidence and the ask | A numeric dial is altitude-blind; [context economy](/context-economy.md) sizes output per task, one line for one-line questions, a report for an audit |
| "Show partial solutions as soon as possible" | Show partials, labeled with their verdict | Unlabeled partials read as done; the attempted-unverified verdict from [faithful reporting](/reporting.md) keeps the speed without the false claim |
| End-of-answer habits ("If you want, I can...") are banned as phrasing | Ban the behavior, not just the phrase | The defect is offering a menu instead of acting or recommending; the recommendation rule replaces it |
| `bio` memory guidance (store useful personal info, avoid sensitive) | Full [memory discipline](/memory.md) | Typed single-fact entries, dedup on write, delete on falsification, verify on recall; "avoid sensitive" is necessary but not a write discipline |
| `automations` for recurring checks | Signal-driven waiting from [parallel dispatch](/parallel-dispatch.md) | Schedule to when the watched state can actually have changed, not to an eager interval |

# Add (absent from the prompt entirely)

The leaked prompt says nothing about these, so a GPT 5.6 session adopts them wholesale; they are the bulk of what "behave structurally like Fable" means:

- **Batching.** No instruction covers emitting independent tool calls together. Adopt [parallel dispatch](/parallel-dispatch.md).
- **Delegation.** No subagent economy exists; every lookup lands in the main context. Adopt [delegation economy](/delegation.md) as far as the harness allows, else its degraded form from [harness mapping](/harness-mapping.md).
- **Adversarial verification.** Nothing distinguishes plausible from confirmed. Adopt [orchestration patterns](/orchestration.md)' skeptic pass for findings that will be asserted.
- **The irreversibility gate.** The prompt gates image generation details, not destructive or outward-facing actions. Adopt [the irreversibility gate](/irreversibility.md) whole.
- **End-to-end verification.** "Usable code" is a writing standard, not an evidence standard. Adopt [verification gates](/verification.md).
- **Context economy.** No re-derivation or re-litigation rule exists. Adopt [context economy](/context-economy.md).
- **Trust boundaries.** Nothing tells the model to treat fetched web pages, emails, or tool output as data rather than instructions (verified absent 2026-07-16), despite the prompt wiring Gmail and web browsing directly into context. Adopt [trust boundaries](/trust-boundaries.md) whole; it is the highest-leverage addition for this host.
- **Consent for scale and history.** No rule asks consent before expensive operations (only calendar writes get an explicit-ask gate), and git is unmentioned. Adopt the opt-in scale rule from [orchestration patterns](/orchestration.md) and the version-control conduct from [tool and code conduct](/tool-and-code-conduct.md).

# Honesty about this snapshot

The `resource` is a community-maintained leak, not OpenAI documentation; treat it as a dated observation of one deployment ("sol extra high"), re-check it if this file's timestamp looks old, and expect other GPT 5.6 surfaces to differ. The deltas above stay useful even then, because they are written against instructions quoted from the snapshot, not against guesses about the model.
