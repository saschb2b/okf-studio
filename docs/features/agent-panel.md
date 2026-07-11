---
type: Feature
title: Agent Panel
description: A docked workspace for connecting agents, attaching OKF context, approving tools, and reviewing knowledge changes.
tags: [feature, agents, panel, authoring, research]
timestamp: 2026-07-11T23:30:00Z
---

# Entry and first open

The opener is the final icon button at the bottom-right of the [status bar](../ux/browsing-layout.md). It toggles the panel, reports active state, and remains available without an open bundle. `Ctrl/Cmd+Shift+A` and the [Command Palette](command-palette.md) offer the same action.

First open makes no account or network request. It explains three paths and offers **Connect an agent**:

- **Subscription agent:** Claude Agent, Codex, or another ACP agent owns login and billing.
- **Studio Agent:** an API key in the OS credential store or a local compatible endpoint.
- **Custom/local agent:** an ACP command with explicit executable, arguments, and environment names.

The connection catalog distinguishes external ACP agents from Studio-managed runtimes and lists each path's credential owner. Claude Agent and Codex are the featured ACP choices. Studio API and local-model paths are visible as planned native runtimes. A bundled, versioned manifest supplies the choices through Rust IPC on desktop and the same data in browser development. Loading and retryable catalog errors have explicit states.

Browsing the catalog never downloads or starts a process. For an installable agent, a platform preflight checks the cache and discloses the exact remaining pinned Node and root-package archives before enabling **Install**. It also states that npm-resolved production dependencies are additional because their platform-specific size is not known before resolution. Installation reports its current runtime, package, or dependency phase, remains cancellable, and exposes a retry after failure. Completion says **Installed** and explicitly states that no agent has started.

An installed Claude Agent or Codex card has a separate **Connect** action. Studio starts the catalog entry with its managed Node runtime and package-relative entry point, never a shell, `npx`, or system Node. The card reports negotiation and connection failures, prevents a second connection for the same agent, and offers **Disconnect** while the process is live. A successful connection opens the same authentication and conversation surface used by custom agents.

Custom ACP profiles accept a display name, an absolute executable path, arguments as an argv list, and names of environment variables to inherit. Studio stores these profiles through Rust in its app-data directory. It never accepts a shell command string or environment values. Arguments are plain-text settings and must not contain secrets. Saving registers the profile without running it.

Each saved custom profile has an explicit **Connect** action and at most one active connection. Before the action, the catalog states that the executable runs as an external, unsandboxed process and that Studio limits only the inherited environment and ACP permission responses. While connecting, the row reports process startup and protocol negotiation. A successful handshake names the agent and selected ACP version. If the agent advertises authentication, the row marks it required before a session can start. **Disconnect** stops the child. Typed lifecycle events move a connected row to disconnected or failed when the process stops, with bounded diagnostics on failure. Removing a profile also stops its connections. Leaving and reopening the catalog preserves the live state instead of starting a duplicate process.

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

The first conversation slice activates after a catalog or custom ACP connection returns. It names the agent and active bundle, creates a bundle-scoped session on the first send, renders user and streamed agent text, and replaces **Send** with **Stop** while one turn is active. The composer is text-only and allows one live turn. A connection without an open bundle offers **Open folder**. An agent that advertises authentication shows only those methods and keeps the composer unavailable. Selecting one sends its ID to the agent, which owns the sign-in flow and all credentials. Failure stays visible for retry. Changing agents returns to the catalog without losing the live process. Connection state comes from a `useSyncExternalStore` subscription so React Compiler memoization cannot freeze a mutable module snapshot.

The empty thread states that Studio attaches OKF context on the first send and provides read-only bundle text through ACP. That first prompt keeps the user's text as its own final block and precedes it with a client-context notice, the canonical OKF skill, specification, commands, templates, and a file resource link to the active bundle's root `index.md`. Agents that advertise embedded-context support receive the four trusted skill documents as Markdown resources. Other agents receive the same documents as labelled text blocks. The bundle index remains a link because bundle content is untrusted knowledge and may change during the session. Later turns do not repeat the context. A failed first prompt retries it.

The client advertises ACP text reads and no ACP writes. Read requests must name the active session and an absolute UTF-8 file inside that session's canonical bundle root. Studio rejects traversal, symbolic-link escape, directories, binary content, and files above its documented 1 MiB response bound. ACP line and limit fields allow a bounded range. This mediation does not sandbox the external process, which still receives the bundle root as its working directory.

**Attach context** opens a searchable concept picker whether the reader shows a concept or the bundle home. The open concept sorts first and is marked **Current**; title, bundle-relative path, and type are searchable. Studio excludes concepts already attached, caps the ordered list at eight, and renders every attachment as a visible, removable chip above the composer. Navigating elsewhere does not silently replace the chosen snapshot. On send, Studio passes the ordered bundle-relative Markdown paths to Rust. Rust revalidates each path against the session root and supplies it to the agent as an ACP file resource link. The chips clear after the agent accepts the turn and remain after an error.

When the agent pauses for ACP permission, an in-thread card shows its bounded human title and exactly the choices it advertised. The card never exposes raw tool arguments or arbitrary metadata. Choosing an option disables the card while the response is sent and leaves a retryable error in place if sending fails. If no reject choice was advertised, Studio adds **Cancel**, which returns ACP `cancelled` rather than inventing a choice. **Stop** cancels every pending permission for that session before cancelling the turn. Agent switching stays disabled until the active turn ends, preventing an approval from being detached from its transcript.

This slice does not yet persist threads, render Markdown, expose tool/plan cards, or claim write access. Those arrive with the remaining [Threads and conversation](../product/studio-roadmap.md) and [OKF context and tools](../product/studio-roadmap.md) packages.

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
- permission pending: show the agent's title and choices, keep Stop available, and retain a response error for retry.

# Accessibility

The panel is a labelled complementary region. Streaming uses restrained live regions and never moves focus. Tool, diff, attachment, and permission actions are real controls with visible focus. The composer supports multiline input without ambiguous submission.
