---
type: Feature
title: Structured Agent Work
description: Rust-validated OKF plans, reports, research, impact maps, migrations, inventories, and staged revisions that remain inspectable beside the conversation.
tags: [feature, agents, artifacts, planning, research, review]
timestamp: 2026-07-18T05:45:00Z
---

# Purpose

An agent response can contain useful work that should stay active after the prose around it scrolls away. Studio recognizes seven OKF work kinds: source inventory, bundle plan, health report, research brief, change-impact map, migration plan, and staged revision. The current artifact opens as a dedicated surface inside the docked [Agent Panel](agent-panel.md), beside the graph and reader. The transcript remains the chronological record and keeps the original agent response unchanged.

# Trust boundary

An agent emits one bounded JSON object in an `okf-artifact` fence. Rust parses the newest complete fence and rejects unknown fields, unsupported schema or enum values, invalid identifiers, unsafe concept paths, duplicate IDs, unresolved source references, invalid external URLs, missing citation targets, excessive counts or text, and invalid revision ancestry. The object must carry the exact fingerprint returned by the current [Knowledge Health](knowledge-health.md) summary. A changed bundle makes the object stale instead of silently retargeting it.

Bundle sources must name current bundle-relative concept paths. Attachment sources use the bounded attachment ID already supplied for the turn. External sources require HTTPS. Research briefs with external evidence require claim-level citations. Complete artifacts require the fields defined by their kind; partial artifacts list what remains missing. Planning artifacts alone may advertise editable fields.

The producing transcript message and turn, selected task, and accepted context manifest remain attached through the surrounding thread record. Capability selection, resource delivery, tool availability, and artifact validation remain separate evidence. A valid artifact does not prove that an external agent followed its delivered capability.

# Lifecycle

Studio shows loading, empty, partial, valid, invalid, stale, and large states. Invalid output remains labelled prose in the transcript and offers another validation attempt. If a later response fails validation, Studio retains the last valid artifact and labels the rejected update. A response based on an older revision, or one that does not continue from the revision the user sent, cannot replace current work.

Concept paths in the artifact select the ordinary reader. Changing the reader selection highlights the matching artifact concept, so graph, reader, and work surface share one concept identity. Large artifacts keep the validated object but render at most 100 work items at once and report the omitted count.

# User revisions and export

Editable planning fields change only local artifact state. Studio sends nothing until the user chooses **Send revision** or **Export through staging**. A sent revision increments the artifact revision, names its parent, and crosses the ordinary prompt boundary as explicit user context. The surface reports the sent revision while it waits for a valid continuation.

Export is not a direct file write. The agent receives an instruction to turn the artifact into a conformant Markdown concept through the existing reviewed staging tools. Validation, diff review, Apply, and Restore remain unchanged. An artifact can describe a staged revision, but it cannot approve or apply one.

# Isolation and verification

The `AgentArtifactWorkspace` Storybook component covers ready, loading, empty, partial, invalid, stale, large, and 360-pixel states. Its interaction checks cover concept selection, local field edits, explicit send, retry, stale read-only behavior, focus, overflow, and revision handling. Storybook MCP is the required isolation screen; whole-panel integration remains a separate check.

Related architecture: [Agent System](../architecture/agent-system.md). Related product sequence: [OKF Agent Specialization](../product/agent-specialization-roadmap.md).
