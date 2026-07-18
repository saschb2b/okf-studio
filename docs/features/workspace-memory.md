---
type: Feature
title: Inspectable Workspace Memory
description: Bundle-scoped local metadata that can shape future context plans without storing knowledge, conversation bodies, or write authority.
tags: [feature, agents, memory, context, local-first]
timestamp: 2026-07-18T09:45:00Z
---

# Purpose

Studio may remember bounded workspace choices without turning agent prose into hidden knowledge. Memory lives outside the bundle and is always inspectable and deletable. It cannot edit a concept, restore a session, grant a tool, or authorize a write.

# Stored contract

The version 1 envelope supports four closed kinds: user preferences, dismissed-finding fingerprints, deterministic task records, and routine definitions. SP10 activates context preferences and task records; [Local Routines](../product/agent-specialization-roadmap.md) adds executable routine behavior later. Each item carries a portable ID, bundle root, label, kind, origin, owner, optional task/concept/finding/routine identity, exact context effect, bundle validation fingerprint, creation and validation times, last use, and retention days.

The schema has no field for authored facts, citations, prompts, responses, source bodies, staged files, or credentials. A task record is created only after Studio accepts a typed task turn. A context preference requires a separate user click after the user removes an optional concept; the card shows the exact future omission before that click. Agent-suggested preferences use the same explicit acceptance boundary.

# Attachment and invalidation

A remembered context omission attaches only to the same bundle and task while its saved bundle fingerprint matches the current deterministic fingerprint. A changed bundle leaves the item visible as stale but does not attach it. The context plan labels an active omission as `workspace preference`, so memory never changes a prompt invisibly.

Deleting a preference removes its effect from later context plans. The deletion changes no bundle file, thread pointer, transcript, staged draft, checkpoint, credential, or grant. A removal already made in the current draft remains an explicit draft choice until the task resets.

# Bounds and recovery

The local store accepts at most 256 items: 64 preferences, 96 dismissed findings, 64 task records, and 32 routine definitions. Retention is 1 to 365 days; shipped preferences retain for 180 days and task records for 30. IDs, labels, roots, fingerprints, effects, and timestamps are bounded and control-free.

Reads treat the store as untrusted. Unsupported envelopes, invalid records, expired records, and records beyond a per-kind cap are dropped. Studio writes a bounded quarantine receipt with the detection time and rejected count, then keeps the valid remainder. Corrupt memory cannot block bundle opening.

# Inspection

[Settings](../ux/settings.md) lists memory for the active bundle with its origin, owner, current or stale validation state, last validation, last use, retention, exact context effect, and delete action. Loading, empty, error, current, stale, deleting, and narrow states remain explicit.

Related boundaries: [Agent Panel](agent-panel.md), [Native OKF Tasks](native-okf-tasks.md), and [Agent System](../architecture/agent-system.md).
