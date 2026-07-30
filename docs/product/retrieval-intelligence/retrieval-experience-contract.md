---
type: UX Contract
title: Retrieval Experience Contract
description: Defines the surface ownership, disclosure levels, layout invariants, state coverage, and prototype gates for retrieval intelligence.
tags: [product, ux, retrieval, context, agents, storybook]
generated: { by: claude/unrecorded, at: 2026-07-19T11:22:06Z }
---

# Decision

Retrieval intelligence must fit the existing workspace hierarchy before Studio implements its backend package. Each user job has one surface owner, and technical detail stays behind deliberate inspection. Dynamic retrieval state cannot reduce the readable conversation or make the composer unreachable.

This contract governs the [retrieval-intelligence roadmap](retrieval-intelligence-roadmap.md). A package that changes the interface must pass its experience gate before production wiring begins. Passing a technical benchmark does not waive that gate.

# User jobs and surface ownership

| User job | Surface owner | Default presentation | Must not happen |
| --- | --- | --- | --- |
| Ask a bundle question | Composer and conversation | Prompt, readable answer, useful inline citations, and one compact evidence summary | The answer repeats an Evidence, Sources, internal-path, or receipt-ID footer already owned by Inspect; raw routes, scores, or candidate lists become permanent transcript chrome |
| Confirm scope before work | Existing task launcher or context plan | Bundles, grants, network use, exceptional cost, and material route changes | Routine local retrieval adds another confirmation step |
| Inspect selected evidence | Reader, graph, and a retrieval inspector opened from the compact summary | Exact concepts, sections, paths, omissions, and bundle revision | Source bodies are copied into a second transcript-like region |
| Change the evidence route | Retrieval inspector | Available routes, consequences, and rerun action | Route controls remain visible for every ordinary question |
| Diagnose weak or confusing evidence | Separate Evidence Lab workspace | Plain trust outcome, source review, optional search-method comparison, and a collapsed technical report | The user must understand routes, scores, providers, or receipts before they can act |
| Repair bundle knowledge | Existing structured work and reviewed staging | Evidence-backed proposal, held-out effect, validation, and review | An index, receipt, or diagnostic writes directly to the bundle |

Settings owns persistent defaults and provider configuration. It does not own per-query route selection or diagnostic state. Notifications may report bounded background completion or failure, but they do not duplicate recovery actions already owned by the active surface.

# Progressive disclosure

Level 0, answer
: The conversation shows the user prompt, readable answer, useful inline citations, and blocking safety or scope failures. It does not append an evidence inventory or receipt identity. Retrieval machinery stays out of the reading path.

Level 1, evidence receipt
: One compact turn-owned row states the included excerpt count and route in user terms. It adds status text only for incomplete, conflicting, stale, unavailable, or remotely shared evidence. It never exposes an instruction written for the agent as user-facing copy.

Level 2, evidence inspector
: A deliberate action explains whether the sources support the answer, marks conflicting sources, and opens each excerpt in its full concept. Search method, candidates, paths, filters, scores, budgets, capabilities, and receipt identity stay under a collapsed technical disclosure. The inspector replaces the flexible transcript viewport while open. It restores transcript scroll, draft state, and focus when closed.

Level 3, Evidence Lab
: A separate troubleshooting workspace tests what Studio can find without contacting an agent, rewriting an answer, or changing the bundle. Its default path is question, trust outcome, and source review. Search-method comparison, technical export, and advisory bundle improvements are secondary actions. It never appears as a persistent band in an ordinary conversation.

The default view uses user language such as "Exact and lexical", "Related concepts", "Conflicting evidence", and "Evidence is incomplete". Internal route IDs, abstention instructions, rank-fusion terms, model dimensions, and raw score components stay in the inspector or lab.

# Layout invariants

- The conversation viewport owns flexible height. The composer remains fully reachable at every supported panel height.
- Live work and blocking requests have bounded height and internal scrolling under pressure. Retrieval state cannot create another unbounded vertical shelf.
- Opening the retrieval inspector replaces the flexible conversation viewport. It does not divide the remaining height between two reading surfaces.
- One region has one scroll owner. Docked controls remain outside the content scroll and cannot cover a landing position.
- Dynamic labels, paths, errors, and source names wrap or truncate with a complete accessible name. They cannot create panel-level horizontal overflow.
- The 360, 440, and 560 pixel panel fixtures and the wide desktop composition remain required. Text scaling and user spacing overrides may grow content without clipping it.
- Focus moves into an opened inspector or lab, returns to its trigger on close, and remains visible. Keyboard access cannot depend on hover.
- Blocking states keep one primary recovery action. Secondary diagnostics and dismissal cannot compete with it.

These invariants extend the proven workspace behavior in [Agent Workspace Dogfood](../../ux/agent-workspace-dogfood.md) and the shared [accessibility contract](../../ux/accessibility.md).

# State model

| State | Required presentation | Recovery |
| --- | --- | --- |
| Preparing | Bounded progress, active bundle scope, and cancel action | Cancel returns to the unchanged draft or prior result |
| Ready | Answer and compact evidence summary | Inspect evidence or continue the conversation |
| Empty | The searched scope and route, without an invented answer | Change query, inspect scope, or choose another available route |
| Partial | Usable evidence plus named omissions or unavailable stages | Inspect omissions or retry only the failed stage |
| Stale | Previous result remains readable and is marked with its old fingerprint | Rebuild and rerun without losing the prompt |
| Conflict | Competing claims and their sources remain visible | Inspect authority evidence or accept an abstaining answer |
| Permission blocked | Exact missing grant or remote disclosure owns the interruption | Grant explicitly or continue with the narrower local route |
| Provider unavailable | Local fallback and lost capability are named | Use fallback, configure the provider, or cancel |
| Cancelled | No success language and no partial result presented as current | Restart from the retained query and settings |
| Oversized | Context budget and omitted evidence are named | Narrow scope, change route, or open the inspector |

# Complexity budget

Every interface-changing package records:

- the existing surface it changes
- controls and persistent regions added, removed, or merged
- information visible at each disclosure level
- the primary action and recovery owner for every blocking state
- scroll, focus, keyboard, and narrow-width behavior
- the unavailable path when an index, provider, cache, or permission is missing.

A new persistent top-level surface requires a product decision and an update to [Browsing Layout](../../ux/browsing-layout.md). An implementation cannot justify a surface only because its backend emits more data. A package must consolidate duplicate bundle, agent, thread, route, or scope labels under their existing owner.

# Definition of ready

An interface-changing package may enter production implementation when:

- [x] the package names the user job and surface owner
- [x] a composition shows what appears, disappears, or moves
- [x] the package fixes the disclosure level of every new field and control
- [x] the package covers loading, ready, empty, partial, stale, conflict, permission, unavailable, cancelled, large, and long-content states, or marks them explicitly inapplicable
- [x] the package specifies focus order, keyboard actions, scroll ownership, and close behavior
- [x] 360-pixel and wide Storybook compositions use existing tokens and components where possible
- [x] the author used Storybook MCP to inventory overlapping components and screen the proposed states
- [x] the package gate names the behavior that prevents UI accretion.

# Definition of done

An interface-changing package is complete when:

- [x] colocated stories cover every applicable state and interactive stories have `play` assertions
- [x] Storybook MCP screening at 360 pixels and wide width finds no horizontal overflow, clipped text, unreachable composer, hidden recovery, or competing primary actions
- [x] `pnpm test:stories`, accessibility checks, and the owning integration journey pass
- [x] visual-consistency, theme-color, React, and prose reviews have no unresolved Glaring finding
- [x] the implementation preserves transcript scroll, draft state, selected evidence, and focus across inspection and recovery
- [x] whole-panel dogfood proves the feature under simultaneous live-work pressure instead of only in isolation
- [x] temporary screenshots remain outside `docs/ux/` unless a named UX concept links them as curated evidence.

# First vertical slice

The first shipped slice contains one exact or lexical question, one local route, and one compact evidence summary. It adds one retrieval inspector and source opening in the Reader. It includes empty, stale, partial, cancelled, and long-content states. It does not include dense retrieval, global synthesis, cached context, automatic repair, or the full Evidence Lab.

This slice must prove that retrieval explanation can fit the current workspace without another persistent band. Later routes reuse the same surface owners and disclosure levels.
