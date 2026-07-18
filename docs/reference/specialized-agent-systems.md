---
type: Reference
title: Specialized Agent Systems Research
description: Primary-source findings that inform the transformation from a general agent panel into an OKF-specialized knowledge workspace.
resource: https://docs.github.com/en/copilot/concepts/agents/github-copilot-app
tags: [reference, agents, skills, specialization, copilot, okf]
timestamp: 2026-07-18T00:02:24Z
---

# Research question

OKF Studio already connects agents, scopes bundle context, exposes bounded tools, and reviews writes. The next question is how the workspace and its agents become materially better at OKF work than a general agent panel with an OKF prompt attached.

The comparison uses the GitHub Copilot app as the main product reference because it specializes a desktop agent workspace around Git and GitHub. The supporting sources cover GitHub's customization stack and Google's current OKF direction.

# Product pattern

GitHub's specialization is a stack of mutually reinforcing layers:

| Layer | GitHub implementation | OKF Studio implication |
| --- | --- | --- |
| Native domain objects | Repositories, branches, issues, pull requests, checks | Bundles, concepts, links, sources, validation issues, proposals, and revisions must be agent-addressable objects rather than prompt text |
| Persistent contract | Global and repository instructions | Keep one short OKF operating boundary active for every turn; load task detail only when needed |
| Task knowledge | Selectively loaded agent skills | Ship a curated OKF skill suite with narrow triggers, resources, examples, and measurable exit criteria |
| Specialized workers | Custom agents with separate context and tool sets | Add bounded OKF roles only where an independent context or reduced tool set improves verification |
| Tools | MCP servers and native integrations | Extend the existing read-only OKF MCP surface with deterministic health and provenance tools before adding more agent discretion |
| Policy points | Lifecycle hooks that can allow, deny, validate, and audit | Use typed Rust lifecycle policies, not user-authored shell hooks, for OKF validation and reviewed-write gates |
| Capability packs | Versioned plugins containing agents, skills, hooks, and MCP configuration | Define a signed, inspectable OKF capability-pack contract after the built-in suite proves the shape |
| Shared work surface | Canvases beside chat | Put audits, research briefs, source maps, and staged bundle plans in structured Studio surfaces that people and agents can both inspect |
| Repeated work | Scheduled or manual automations with selected tools | Add opt-in local routines with explicit bundle, agent, network, and write scope; every proposed bundle change remains staged |
| Recall | Searchable session history and retained memory | Keep local, inspectable workspace memory separate from authored bundle facts and validate it before reuse |
| OS entry | App deep links, voice input, and launch points from external tools | Add a guarded Studio URL scheme and CLI so files, scripts, and other agents can open a bundle or prefill a task without starting an agent silently |

The important part is the native object model. GitHub agents can act on issues, branches, checks, and pull requests because the application owns those objects and their lifecycle. OKF Studio should give agents comparable first-class access to concept identity, graph position, evidence, validation, provenance, and reviewed revisions. A larger system prompt cannot supply those guarantees.

# Skills and capability delivery

GitHub distinguishes persistent instructions from task skills. Instructions are added broadly. A skill is a folder with `SKILL.md` plus optional resources and scripts, selected when its description matches a task. Skills can be project-scoped or personal, and their provenance can be pinned when installed through GitHub CLI.

Studio already follows the progressive-loading part for its native agent: it exposes metadata for one canonical OKF skill and loads a requested resource through a bounded tool. The missing product layer is a suite of smaller skills, a versioned manifest, explicit provenance, task-to-skill selection, and the same observable skill delivery across native and compatible external agents.

The first suite should cover recurring OKF jobs rather than provider personas:

- inspect and answer from a bundle
- create a bundle from evidence
- enrich an existing bundle without erasing authored facts
- audit structure, graph connectivity, provenance, and navigation
- repair bounded conformance and connectivity defects
- conduct cited research and separate evidence from inference
- assess the knowledge impact of a source-system or dataset change
- migrate a bundle when the OKF specification changes

Scripts inside imported skills would create a second execution system and weaken Studio's Rust boundary. Built-in and imported skills may contain instructions, examples, templates, and declarations of required Studio tools. Executable behavior stays in typed Studio tools and policies.

# Structured work and verification

GitHub's canvas model recognizes that chat is weak for work that has shape. OKF work has several natural artifacts:

- a bundle creation inventory mapping source units to proposed concepts
- a research brief with claims, citations, conflicts, and inferences
- a health report grouped by conformance, connectivity, provenance, freshness, and navigation
- a change-impact map from an external asset to affected concepts and relationships
- a staged revision with validation results and review decisions

These artifacts should remain ordinary Studio state with deterministic schemas. The transcript explains decisions and chronology. The work surface owns current structure and actions. Agent output must not become trusted simply because it matches a JSON shape; Rust validates identities, bounds, provenance references, and revision links before the UI treats it as an artifact.

GitHub also uses separate reviewer agents and lifecycle hooks. Studio should first implement deterministic checks because they are cheaper, repeatable, and provider-independent. An optional critic pass can then inspect claims, coverage, and ambiguity. A critic receives read-only tools and cannot approve or apply its own findings.

# Memory and proactive work

GitHub's memory stores repository facts and user preferences, validates them against current state, and expires unused entries. That model is useful only after adapting its authority boundary:

- Authored bundle facts stay in OKF concepts and enter through reviewed writes.
- Workspace memory stores user preferences, dismissed findings, routine definitions, and compact task records outside the bundle.
- Every memory item is visible, attributable, editable, removable, bundle-scoped where relevant, and bounded by retention.
- A remembered statement about bundle content is a hint to re-check, never evidence for an answer or write.

GitHub automations show the value of saved recurring tasks and explicit tool selection. Studio's first routines should be local and deterministic: rescan bundle health, detect changed source fingerprints, and prepare an attention item. A routine may start an agent only when the user selected that agent and its effective scope when saving the routine. Network access stays off unless the routine names the remote source. Writes always stop in staging.

# OS and ecosystem wiring

GitHub deep links can open a specific repository, session, or automation and can prefill work from documentation or scripts. Studio should support equivalent guarded entry points:

- `okf-studio://open` selects a locally granted or user-confirmed bundle.
- `okf-studio://task` opens a named OKF workflow with a visible prefilled prompt.
- a CLI can open, validate, inspect, or start the same visible workflow.
- opening a link or CLI task never authenticates an agent, sends a prompt, fetches a source, grants edits, or applies a change.

The existing internal `--okf-mcp` helper proves that Studio can serve bounded OKF tools over stdio. Productizing that boundary for other local agents requires a grant handshake or an explicit one-shot bundle selection. Accepting an arbitrary path from command-line arguments would undo the Rust-owned grant model.

# Decisions

Adopt:

- a layered specialization stack instead of a larger universal prompt
- selectively loaded task skills with provenance and versioning
- structured work artifacts beside the transcript
- explicit local routines with selected tools and scopes
- guarded OS and CLI entry points
- inspectable memory that is never authoritative for bundle facts

Adapt:

- custom agents become capability-limited OKF roles, not branded personalities
- hooks become typed lifecycle policies owned by Rust
- plugins begin as a built-in capability-pack format with no executable scripts
- Git branches and worktrees map to staged OKF revisions and checkpoints, not repository assumptions

Reject:

- silent background agents, fetches, or writes
- provider-specific OKF behavior in the panel
- unreviewed skill scripts or project instructions
- hidden memory presented as bundle knowledge
- general shell access as an OKF feature
- cloud sync as a prerequisite for recall or automation

# Citations

- [GitHub Copilot app](https://docs.github.com/en/copilot/concepts/agents/github-copilot-app)
- [Customizing the GitHub Copilot app](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app)
- [GitHub agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [Copilot CLI customization layers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/overview)
- [GitHub Copilot app sessions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/agent-sessions)
- [GitHub canvas extensions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions)
- [GitHub Copilot automations](https://docs.github.com/en/copilot/how-tos/github-copilot-app/using-automations)
- [GitHub Copilot app deep links](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/github-copilot-app/open-with-deep-links)
- [GitHub Copilot hooks](https://docs.github.com/en/copilot/concepts/agents/hooks)
- [GitHub Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)
- [GitHub Copilot Memory](https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/agents/copilot-memory)
- [Open Knowledge Format announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
- [Open Knowledge Format specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

