---
type: Feature
title: Access Hints
description: Show intended audience, sensitivity, and handling guidance without turning metadata into authorization.
tags: [feature, privacy, profiles, audience, sensitivity, agents]
generated: { by: claude/unrecorded, at: 2026-07-23T22:30:00Z }
audience: [maintainers, agent-builders]
sensitivity: public
handling_notes: These labels are public examples, not an authorization policy.
---

# User job

A maintainer needs to communicate intended handling while reading, asking an agent, reviewing a staged change, or preparing a recipient bundle. The label must remain useful without pretending that Markdown metadata can stop a process that already has filesystem access.

# Advisory profile

The optional `io.okf.access` profile defines three concept fields:

| Field | Accepted form | Meaning |
| --- | --- | --- |
| `audience` | One string or up to 16 strings | People or groups the author expects to receive the concept |
| `sensitivity` | A string | An authored handling label |
| `handling_notes` | A string up to 512 characters | Short instructions a reviewer should consider |

Studio recognizes `public`, `internal`, `confidential`, and `restricted` as an ordered projection vocabulary. Matching is case-insensitive. The authored spelling stays visible. Any other value also stays visible, receives an advisory diagnostic, and has no automatic rank.

Audience entries are trimmed, deduplicated, limited to 128 characters each, and rendered as text. Empty, non-string, control-bearing, or excess values do not stop the concept from opening. Studio reports the bounded problem beside the remaining valid hints.

# Where hints appear

The [Concept Reader](concept-reader.md) shows a handling notice below the reliability advice. The notice names the intended audience, authored sensitivity, handling notes, and any unknown value.

A named OKF task copies the same bounded projection into each context object. The context card shows the hints before acceptance and states that they do not grant or remove access. A hint never silently removes a concept or evidence source from ordinary agent context.

After an agent stages a file, isolated validation parses the selected staged tree and returns the hints with its bounded graph preview. The staged review names every changed concept that carries guidance next to the diff, validation, and profile checks. Apply authority still comes only from the existing thread grant, complete hunk review where required, revision-bound validation, and the user's Apply action.

# Authority boundary

These fields are routing and review hints:

- they do not grant a folder, file, agent tool, network request, or Apply capability
- they do not change operating-system permissions or encryption
- they do not hide evidence from a context plan
- they do not prove that the author classified the concept correctly.

The root [`.okfignore`](ignore-rules.md) can reduce what Studio reads, but it is also not access control. A [Recipient Projection](recipient-projections.md) uses recognized hints only to propose a least-disclosure copy. The user still reviews its exact inclusion and omission plan before any destination write.

# Determinism and compatibility

Rust and TypeScript share the same known vocabulary, limits, unknown-value behavior, and fixtures. Access fields remain ordinary preserved producer metadata. A bundle that does not declare the profile still opens, and a concept without these fields renders no notice.

Related behavior: [Advisory Profiles](advisory-profiles.md), [Profile-Aware Authoring](profile-aware-authoring.md), [Agent Panel](agent-panel.md), [Ignore Rules](ignore-rules.md), and [IPC and Security](../architecture/ipc-and-security.md).
