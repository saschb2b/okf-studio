---
type: Feature
title: Guarded External Entry Points
description: Review bounded deep-link and CLI requests before Studio opens a bundle, prepares an OKF task, or issues a one-shot read-only MCP grant.
tags: [feature, agents, cli, deep-link, mcp, security]
generated: { by: claude/unrecorded, at: 2026-07-18T14:20:00Z }
---

# Purpose

Files, scripts, launchers, and other local agents can hand work to OKF Studio without gaining agent, network, or filesystem authority. Every supported external request first becomes a visible preview. The preview shows the decoded target, action, concept, task, attachments, inert prompt draft, and the names of unsupported fields that Studio omitted.

Parsing, filesystem confirmation, bundle opening, and task preparation are separate steps. Receiving a request never connects or authenticates an agent, submits a prompt, fetches a source, grants edits, stages a change, or applies a revision.

# Why this exists

OKF work often begins outside Studio: in a terminal, a file browser, a script, or another local agent. Requiring the user to reopen the bundle, find the same concept, and reconstruct the intended task breaks that handoff. Direct deep links and command-line automation would remove the friction, but they would also turn untrusted text and paths into ambient filesystem or agent authority.

The preview contract preserves the useful handoff while keeping the decision inside Studio. A caller can name work, but the user still sees the decoded request and controls folder access, task start, and any later write. The one-shot MCP grant provides the same balance for local agents: bounded OKF reads without a reusable bundle-path capability.

# Shared request contract

The installed desktop application registers `okf-studio://` through Tauri's static installer configuration. The supported forms are:

```text
okf-studio://open?bundle=<absolute-path>&concept=<concept-id>
okf-studio://inspect?bundle=<absolute-path>&concept=<concept-id>
okf-studio://validate?bundle=<absolute-path>
okf-studio://task?bundle=<absolute-path>&task=<task-id>&concept=<concept-id>&prompt=<draft>
```

The executable exposes the same visible workflow through:

```text
okf-viewer open <absolute-path> [--concept <concept-id>] [--prompt <draft>]
okf-viewer inspect <absolute-path> [--concept <concept-id>] [--prompt <draft>]
okf-viewer validate <absolute-path> [--prompt <draft>]
okf-viewer task <absolute-path> --task <task-id> [--concept <concept-id>] [--prompt <draft>]
```

The CLI is a desktop entry point, not a headless validator or agent runner. `validate` opens the bundle and its Validation surface. `task` opens the ordinary [Native OKF Task](native-okf-tasks.md) launcher, where the user reviews capability and context before any prompt can start.

Task IDs are closed to the installed curated task set. Inputs must be Unicode, normalized absolute paths. The parser rejects credentials in the URL authority, ports, fragments, extra path components, duplicate fields, control characters, relative paths, `.` and `..` components, unsupported task IDs, oversize fields, and more than the bounded field count. Unknown deep-link fields are not interpreted; only their bounded names cross to the preview. `--attachment` is likewise shown as omitted because an external request cannot attach a file.

# Grant and launch boundary

Continue asks Rust to resolve the exact target. A path already covered by a persisted folder grant can proceed. Any other path requires a native operating-system confirmation that shows the decoded path. Approval grants only that folder for the ordinary scan. Cancellation discards the request.

The pending queue holds at most 16 requests. An identical launch is ignored for five seconds, and recent duplicate fingerprints are bounded. The raw link, each decoded field, the prompt draft, and the omitted-field list have independent caps. Prompt text remains inert preview text. For a task request it appears again as an editable untrusted draft in the ordinary task launcher and is added to the curated task prompt only when the user chooses **Start task**. It is never inserted into the Agent composer or sent on receipt or folder approval.

On Windows and Linux, Tauri's single-instance integration forwards installed scheme launches to the existing Studio window. The scheme is registered statically so the installer owns removal. Studio does not add a permanent background service, tray process, global shortcut, file association, or operating-system content index.

# One-shot OKF MCP grants

Settings offers **Use this bundle from another agent** for the active bundle. The explicit action returns a standard MCP descriptor for Studio's existing read-only OKF server. Its descriptor contains an opaque grant record and nonce instead of a bundle path. The grant expires after 60 seconds and is atomically consumed before the MCP helper parses the bundle, so replay and stale records fail.

The server exposes the same bounded inventory, read, search, source, traversal, validation, and knowledge-health tools used by ACP sessions. It exposes no arbitrary path, shell, network, staging, or Apply operation. The receiving local agent still has its own operating-system access; the grant constrains Studio's MCP server, not that separate process.

# Verification

Rust tests cover hostile schemes, encoded traversal, repeated and oversize fields, CLI parity, unsupported attachments, duplicate launches, exact one-shot grant consumption, replay, hostile grant paths, and tokens. Storybook MCP covers link and CLI previews, untrusted prompt and omitted-field disclosure, native-confirmation waiting, errors, ready and expiring MCP grants, and 360-pixel layouts. The narrow external-request footer stays visible while its details scroll.

Related boundaries are specified in [IPC & Security](../architecture/ipc-and-security.md) and [Agent System](../architecture/agent-system.md).
