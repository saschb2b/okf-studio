---
type: Feature
title: Agent Panel
description: A docked workspace for connecting agents, attaching OKF context, approving tools, and reviewing knowledge changes.
tags: [feature, agents, panel, authoring, research]
timestamp: 2026-07-11T15:00:00Z
---

# Entry and first open

The opener is the final icon button at the bottom-right of the [status bar](../ux/browsing-layout.md). It toggles the panel, reports active state, and remains available without an open bundle. `Ctrl/Cmd+Shift+A` and the [Command Palette](command-palette.md) offer the same action.

First open makes no account or network request. It explains three paths and offers **Connect an agent**:

- **Subscription agent:** Claude Agent, Codex, or another ACP agent owns login and billing.
- **Studio Agent:** an API key in the OS credential store or a local compatible endpoint.
- **Custom/local agent:** an ACP command with explicit executable, arguments, and environment names.

The connection catalog distinguishes external ACP agents from Studio-managed runtimes and lists each path's credential owner. Claude Agent and Codex are the featured ACP choices. Studio API and local-model paths are visible as planned native runtimes. A bundled, versioned manifest supplies the choices through Rust IPC on desktop and the same data in browser development. Loading and retryable catalog errors have explicit states.

Browsing the catalog never downloads or starts a process. For an installable agent, a platform preflight checks the cache and discloses the exact remaining managed Node and package download before enabling **Install**. Installation reports its current runtime or package phase, remains cancellable, and exposes a retry after failure. Completion says **Installed** and explicitly states that no agent has started; connection and authentication are later, separate actions.

Custom ACP profiles accept a display name, an absolute executable path, arguments as an argv list, and names of environment variables to inherit. Studio stores these profiles through Rust in its app-data directory. It never accepts a shell command string or environment values. Arguments are plain-text settings and must not contain secrets. Saving registers the profile without running it.

Each saved custom profile has an explicit **Connect** action and at most one active connection. Before the action, the catalog states that the executable runs as an external, unsandboxed process and that Studio limits only the inherited environment and ACP permission responses. While connecting, the row reports process startup and protocol negotiation. A successful handshake names the agent and selected ACP version; advertised authentication methods remain visible as a limitation until Studio implements their flow. **Disconnect** stops the child. Typed lifecycle events move a connected row to disconnected or failed when the process stops, with bounded diagnostics on failure. Removing a profile also stops its connections. Leaving and reopening the catalog preserves the live state instead of starting a duplicate process.

# Layout and focus

The panel docks right and reduces workspace width. It does not cover the graph or reader. Width and visibility persist. At narrow widths it becomes the active center surface with a direct route back.

The divider accepts pointer dragging and keyboard resizing. `ArrowLeft` widens the panel, `ArrowRight` narrows it, Shift changes the step, and Enter, Home, End, or double-click restores the default width. Width is clamped between 320 and 560 pixels.

Keyboard opening focuses the first useful control. Closing returns focus to the opener. Pointer opening does not steal focus until the user activates a panel control.

# Thread anatomy

- toolbar: title, agent, connection state, new thread, history, actions;
- conversation: plans, messages, tools, permissions, citations, and errors;
- change summary above the composer when edits are staged;
- composer: attachments, `@` context, agent/model, capability status, send, queue, stop;
- later thread list for parallel work.

Only advertised capabilities appear. Unsupported restore, model, usage, retry, or logout actions are not implied.

# Context, tools, and writes

The active bundle is the default scope. Explicit context may include a concept, directory, selection, validation issue, source, previous thread, or URL. Attachments remain visible and removable before send.

Tool calls show pending, permission, running, completed, failed, or cancelled state. Opening a bundle grants no writes. A thread receives a separate write grant; Studio-owned writes become a staged, validated diff with per-hunk accept/reject and checkpoint restore.

# Required states

- no connections: explain paths and show Connect an agent;
- installing: agent/version/source/progress/cancel/disk impact;
- authentication required: only advertised methods and clear credential owner;
- offline: retain installed local paths and identify network-dependent actions;
- crashed: preserve transcript, bounded redacted diagnostics, restart;
- no bundle: allow setup and offer Open folder for bundle tools;
- read-only thread: research works and write attempts explain the grant.

# Accessibility

The panel is a labelled complementary region. Streaming uses restrained live regions and never moves focus. Tool, diff, attachment, and permission actions are real controls with visible focus. The composer supports multiline input without ambiguous submission.
