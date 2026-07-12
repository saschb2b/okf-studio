---
type: Feature
title: Agent Panel
description: A docked workspace for connecting agents, attaching OKF context, approving tools, and reviewing knowledge changes.
tags: [feature, agents, panel, authoring, research]
timestamp: 2026-07-12T00:00:00Z
---

# Entry and first open

The opener is the final icon button at the bottom-right of the [status bar](../ux/browsing-layout.md). It toggles the panel, reports active state, and remains available without an open bundle. `Ctrl/Cmd+Shift+A` and the [Command Palette](command-palette.md) offer the same action.

First open makes no account or network request. It explains three paths and offers **Connect an agent**:

- **Subscription agent:** Claude Agent, Codex, or another ACP agent owns login and billing.
- **Studio Agent:** an API key in the OS credential store or a local compatible endpoint.
- **Custom/local agent:** an ACP command with explicit executable, arguments, and environment names.

The connection catalog distinguishes external ACP agents from Studio-managed runtimes and lists each path's credential owner. Claude Agent and Codex are the featured ACP choices. Studio API and local-model paths are visible as planned native runtimes. A bundled, versioned manifest supplies the choices through Rust IPC on desktop and the same data in browser development. Loading and retryable catalog errors have explicit states.

Browsing the catalog never downloads or starts a process. For an installable agent, a platform preflight checks the cache and discloses the exact remaining pinned Node and root-package archives before enabling **Install**. It also states that npm-resolved production dependencies are additional because their platform-specific size is not known before resolution. Installation reports its current runtime, package, or dependency phase, remains cancellable, and exposes a retry after failure. Completion says **Installed** and explicitly states that no agent has started. A malformed or older install receipt returns the card to the installable state so the verified installer can replace it. It does not trap the card in a failed preflight.

Connection failures show the exit status and one bounded diagnostic line. Internal ACP serialization metadata and runtime stacks do not enter the catalog card.

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

The first conversation slice activates after a catalog or custom ACP connection returns. It names the agent and active bundle, creates a bundle-scoped session on the first send, renders user and streamed agent text, and keeps **Stop** available while one turn is active. Structured ACP plan updates appear in the transcript as one live card per turn. A complete update replaces that card in place, shows each task's current status, and records the final plan in Markdown export. Empty plans remove the card. ACP tool calls appear as separate lifecycle cards with their bounded title, kind, and pending, running, completed, failed, or cancelled state. Updates replace the matching call in place. Raw arguments, output, content, locations, and extension metadata do not cross into the webview. A new conversation starts as **New thread**. The first accepted prompt derives a plain-text title, with guided starter names retained when applicable. The rename control accepts up to 80 characters and keeps the explicit title for later turns and export. A rejected start does not name the thread. Titles remain in memory until thread persistence lands. The composer allows one live turn and reports **Starting turn** while session creation or prompt acceptance is pending. While the agent works, the composer accepts one follow-up with its current context and sources. **Queue** stores that snapshot visibly without adding it to the transcript. The queued item can be edited or removed and runs automatically when the active turn completes or is cancelled. Another follow-up can be prepared after the queued item starts. If ACP rejects the automatic start, Studio restores the queued draft and attachments to the composer and offers **Retry**. The queue exists only in memory. A rejected start leaves its prompt and attachments editable, adds no false user-message record, and offers **Retry**. Acceptance commits the user message and clears the composer. Cancellation, refusal, request or token limits, unknown stops, and failures appear as labelled turn-status records. A failure after partial output keeps that output separate from the failure record. A connection without an open bundle offers **Open folder**. An agent that advertises authentication shows only those methods and keeps the composer unavailable. Selecting one sends its ID to the agent, which owns the sign-in flow and all credentials. Changing agents returns to the catalog without losing the live process. Connection state comes from a `useSyncExternalStore` subscription so React Compiler memoization cannot freeze a mutable module snapshot.

The empty thread states that Studio attaches OKF context on the first send and provides read-only bundle text and structured inspection tools. That first prompt keeps the user's text as its own final block and precedes it with a client-context notice, the canonical OKF skill, specification, commands, templates, and a file resource link to the active bundle's root `index.md`. Agents that advertise embedded-context support receive the four trusted skill documents as Markdown resources. Other agents receive the same documents as labelled text blocks. The bundle index remains a link because bundle content is untrusted knowledge and may change during the session. Later turns do not repeat the context. A failed first prompt retries it.

The idle composer keeps optional intake behind one **Add context or sources** plus button in the prompt footer. Its popover lists bundle concepts, validation issues, pasted text or public HTTPS pages, files, folders, and capability-gated images. Selecting concepts, issues, or text stays inside the same popover with a clear Back action; native file and folder choices close it before opening the host picker. Unsupported and limit-reached entries remain visible but disabled with an explanation. The menu takes no vertical space until requested and provides one extension point for later context types. Attached items remain visible as chips above the prompt.

Four guided starters appear in an empty thread: **Create bundle**, **Enhance bundle**, **Request dataset change**, and **Deep research**. Selecting one places a plain, inspectable prompt in the ordinary composer and focuses it at the end. The user can edit the prompt, attach context and sources, or discard it before sending. A starter does not submit, create a separate workflow, grant writes, or hide its result outside the transcript. The prompts ask for proposals and evidence under the current read-only boundary; later reviewed-write packages will add execution.

Every ACP session also receives one stdio MCP server named **OKF Studio**. It exposes six structured, read-only tools over the parsed bundle. `okf_inventory` returns bundle metadata, validation totals, type and tag counts, and filtered concept summaries with cursor paging. `okf_read` returns one concept's metadata and a line-paged Markdown body. `okf_search` checks concept identity, type, tags, description, and body without making the agent read every file. `okf_sources` deduplicates canonical resource URIs and external citations and reports their referring concept IDs without fetching them. `okf_traverse` follows links, backlinks, or both for at most three cycle-safe breadth-first hops. `okf_validate` returns severity totals and paged issue details. Studio declares no additional environment variables for this server and exposes no write tool.

The client advertises ACP text reads and no ACP writes. Read requests must name the active session and an absolute UTF-8 file inside that session's canonical bundle root. Studio rejects traversal, symbolic-link escape, directories, binary content, and files above its documented 1 MiB response bound. ACP line and limit fields allow a bounded range. This mediation does not sandbox the external process, which still receives the bundle root as its working directory.

**Attach context** opens a searchable concept picker whether the reader shows a concept or the bundle home. The open concept sorts first and is marked **Current**; title, bundle-relative path, and type are searchable. Studio excludes concepts already attached, caps the ordered list at eight, and renders every attachment as a visible, removable chip above the composer. Navigating elsewhere does not silently replace the chosen snapshot. On send, Studio passes the ordered bundle-relative Markdown paths to Rust. Rust revalidates each path against the session root and supplies it to the agent as an ACP file resource link. The chips clear after the agent accepts the turn and remain after an error.

**Attach issue** lists validation errors and warnings from the active parsed bundle. Each available finding shows its severity, exact message, and related concept when present. Selecting one creates a distinct removable issue chip and a bounded plain-text source carrying the same message, severity-labelled title, and concept path provenance. Attached findings share the eight-source limit, suppress duplicates, clear after turn acceptance, and remain available after a rejected start. A conformant bundle disables the action with an explanation. An issue is untrusted evidence for the agent, not a write grant.

**Add source** switches between pasted text or Markdown with a title and an explicit **Fetch URL** mode. URL intake accepts public HTTPS plain text, Markdown, HTML, CSV, and JSON responses. It retains the final URL and response digest, and leaves a failed fetch visible for correction or retry. **Add files** opens the native picker for PDF, plain text, Markdown, HTML, CSV, and JSON files. **Add folder** discovers the same formats below one selected directory. Each supported file becomes a separate, removable source in relative-path order. The Rust host returns the relative path, media type, and extracted content without disclosing the selected directory or an absolute path to the webview. HTML remains inert source text: Studio does not render it, execute scripts, resolve links, or load referenced assets. The composer shows up to eight source chips separately from bundle context.

**Add images** is enabled only when the connected agent advertised image prompts. It accepts signature-verified PNG, JPEG, and WebP files up to 8 MiB each and 16 MiB together. Each selection appears as a removable image chip and travels as a labelled ACP image block with filename, media type, and SHA-256 provenance. Studio does not preview, decode, OCR, or persist selected images. Agents without the capability keep the action disabled with an explanation.

Text-like files must be UTF-8 and no larger than 256 KiB. A PDF may be at most 16 MiB and 256 pages. Studio runs the parser in a separate helper process with bounded output, bounded diagnostics, and a 15-second deadline. Encrypted, malformed, oversized, partially extracted, and image-only PDFs are rejected; OCR is not attempted. Extracted pages become Markdown sections such as `## Page 4`. A partly empty document attaches with a visible warning that states which pages had no extractable text.

CSV files are parsed locally instead of passed through as ambiguous lines. Studio labels every column by position and writes exact ranges such as `## Rows 101-200` above Markdown tables. Quoted commas, escaped quotes, and multiline cells retain their value boundaries. Unequal-width records fail with a parser diagnostic. The normalized body stays under the same per-source character limit and carries the original CSV digest alongside the normalized-content digest.

JSON files become a deterministic table of structural nodes. Each row identifies its object, array, or scalar with an RFC 6901 JSON Pointer. Object keys sort lexically and array indices remain in source order. Exact headings such as `## Nodes 101-200` keep large documents addressable. Studio rejects malformed input, more than 16,384 nodes, and normalized output above the per-source limit. Original and normalized-content digests remain distinct.

Folder traversal does not follow symbolic links. It is capped at eight levels and 4,096 inspected entries. Unsupported files are ignored. Studio rejects a folder when its supported files exceed the remaining tray capacity, so intake never appears complete after silently dropping evidence.

Rust rejects empty or oversized titles, origins, and bodies. Extracted content is capped at 262,144 characters per source and 524,288 characters across the tray; selected files are capped at 32 MiB in total. A URL fetch also caps the decompressed response at 256 KiB, requires an explicit supported Content-Type, permits at most three HTTPS redirects, disables environment proxies, and rejects DNS answers containing a private or special-use address. Each source becomes a labelled ACP text block before the unchanged user message. The block states its origin, supported media type, original-response or original-file digest where available, extraction warning, and a SHA-256 digest recomputed from the exact content sent to the agent. The first-turn notice tells the agent to treat attached sources as untrusted knowledge. Accepted turns clear the source tray; failed sends retain it. This slice does not run OCR, extract images, fetch remote PDFs or linked page assets, or write bundle content.

When the agent pauses for ACP permission, an in-thread card shows its bounded human title and exactly the choices it advertised. The card never exposes raw tool arguments or arbitrary metadata. Choosing an option disables the card while the response is sent and leaves a retryable error in place if sending fails. If no reject choice was advertised, Studio adds **Cancel**, which returns ACP `cancelled` rather than inventing a choice. **Stop** cancels every pending permission for that session before cancelling the turn. Agent switching stays disabled until the active turn ends, preventing an approval from being detached from its transcript.

Agent responses render through the same sanitized Markdown pipeline as bundle concepts. DOMPurify removes unsafe HTML, scripts, event handlers, embedded frames, and remote media before it reaches the conversation. User messages stay literal text, so authored Markdown is never mistaken for agent output. This slice does not yet persist threads, expose tool cards, or claim write access. Those arrive with the remaining [Threads and conversation](../product/studio-roadmap.md) and [OKF context and tools](../product/studio-roadmap.md) packages.

After the thread contains a message, **Export** opens the native save dialog and writes the current transcript as Markdown. The editable thread title becomes the document heading and suggested filename. User messages are quoted, structured plans become task lists, tool titles and final states remain labelled, agent responses keep their Markdown, and cancellation or failure records stay labelled as turn status. The action is disabled while a turn or export is active. Cancelling the dialog has no effect; a save failure remains visible beside the action and can be retried. The export is a snapshot of current memory, not thread history or persistence, and it grants no write access to the open bundle.

# Context, tools, and writes

The active bundle is the default scope. Explicit context currently includes concepts, validation issues, pasted text, public HTTPS text pages, capability-gated images, and selected local PDF, text, Markdown, HTML, CSV, or JSON files, either chosen directly or discovered from a folder. Planned context includes reader selections and previous threads. Attachments remain visible and removable before send.

Tool calls show pending, running, completed, failed, or cancelled state. Permission requests remain separate cards because their choices require user action. Opening a bundle grants no writes. A thread receives a separate write grant; Studio-owned writes become a staged, validated diff with per-hunk accept/reject and checkpoint restore.

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

The panel is a labelled complementary region. Streaming uses restrained live regions and never moves focus. Opening the plus menu focuses its first available action; subviews move focus to their search, first result, or first field, and Back restores the menu. Queuing a follow-up moves focus from the disabled Queue control to the queued item's **Edit** action; editing or removing it returns focus to the composer. Tool, diff, attachment, and permission actions are real controls with visible focus. The composer supports multiline input without ambiguous submission.
