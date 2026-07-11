---
type: Architecture Decision
title: Agent System
description: ACP agents, the native Studio Agent, scoped tools, credentials, permissions, threads, and reviewed writes.
tags: [architecture, agents, acp, security, tools]
timestamp: 2026-07-11T12:00:00Z
---

# Decision

One [Agent Panel](../features/agent-panel.md) hosts two boundaries: external agent processes over Agent Client Protocol (ACP), and a native Studio Agent backed by API or local model providers.

```mermaid
flowchart LR
  Panel[React panel] <-->|typed IPC| Host[Rust agent host]
  Host <-->|ACP over stdio| External[Claude, Codex, local agents]
  Host --> Native[Studio Agent]
  Native --> Provider[API or local model]
  Host --> Tools[Scoped OKF tools]
  Tools --> Stage[Staged tree]
  Stage --> Validate[Validate and review]
```

Rust owns processes, network, credentials, filesystem mediation, persistence, and validation. The webview renders typed state. This extends [IPC and Security](ipc-and-security.md), never direct webview filesystem/provider access.

# Boundaries

ACP standardizes capability negotiation, agent-owned auth, sessions, streaming, tools, permission requests, diffs, filesystem requests, cancellation, and optional restore. It avoids separate Claude and Codex clients.

ACP does not replace an external agent's system prompt. The native Studio Agent guarantees the packaged [OKF skill](../../.agents/skills/okf/SKILL.md), system prompt, scoped tools, validation, and staged writes. External agents receive bundle cwd, explicit resources, client permissions, and Studio OKF tools over MCP where supported.

# Components

| Component | Responsibility |
| --- | --- |
| Catalog and installer | Registry/custom metadata, pinned cache, app-scoped runtime, install/update/remove |
| ACP host | Process, transport, initialize, auth, sessions, cancellation, diagnostics, shutdown |
| Studio Agent | Provider adapter, system prompt, tool loop, compaction |
| Context service | Bundle inventory, attachments, source extraction, token budget |
| Permission service | Built-in denials, path normalization, once/thread/persistent grants |
| Change service | Staged tree, validation, diffs, atomic apply, checkpoint/restore |
| OKF tools | Read, search, traverse, propose, validate, provenance |

# Security and credentials

External agents own credentials. Studio invokes ACP-advertised methods and does not persist subscription secrets. Studio Agent API keys live in the OS credential store; settings retain only provider metadata and credential references. Secrets are redacted before diagnostics and never returned to the webview after entry.

Opening remains read-only. Client filesystem methods canonicalize paths and reject traversal, symlink escape, and access outside granted roots. Studio writes target a staged tree, validate, then apply atomically after review.

An external process may bypass client filesystem methods. Client checks do not sandbox it. Until platform enforcement exists, external write mode remains interactive and carries a containment warning. Unattended writes require enforcement.

Permission precedence is: non-overridable security rules, deny, confirm, allow, thread grant, tool default, global default. Writes outside roots, Git metadata, credentials, and packaged instructions are built-in denials.

# Installation, persistence, and network

Registry membership is not a sandbox. Studio shows publisher, repository, license, exact version, distribution, and runtime before install. Binary archives require verified digests. `npx` agents use an isolated app-managed Node runtime/cache. Installation never starts the agent.

The first catalog is a versioned JSON manifest bundled into both builds from one source file. React reads it through a generic IPC function; the desktop command parses it into Rust structs before returning it. Browser development uses the same manifest directly. Provider names, authentication methods, runtime kind, package coordinates, and pinned versions remain catalog data rather than brand-specific UI or process branches. Updating the bundled snapshot is explicit and reviewable; later remote refresh must verify a signed or pinned registry response before replacing it.

Package installation is a Rust-owned transaction. The bundled catalog pins the npm tarball URL, compressed byte count, unpacked byte count, and SHA-512 Subresource Integrity value. An explicit install request streams into an app-cache staging file with timeouts, a 64 MB hard cap, progress events, and cancellation checks. Studio rejects a size or digest mismatch, archive links, unsupported entry kinds, and every path outside the npm `package/` root. It extracts into a staging directory and renames that directory into its versioned destination only after verification. A receipt records the agent ID, version, cache path, and integrity value. Repeated requests return the matching receipt; stale or corrupt destinations are replaced. Installation does not execute package scripts or start the agent.

Studio uses no system Node fallback for catalog agents. The manifest pins the managed runtime to Node `v24.11.0` and records the official nodejs.org archive URL, SHA-256 value, byte count, archive kind, and root directory for Windows x64, Linux x64/ARM64, and macOS x64/ARM64. A preflight command selects only the compiled OS/architecture pair, rejects unsupported targets before network access, checks existing package/runtime receipts, and returns the exact remaining download footprint.

An install first ensures the managed runtime, then installs the ACP package with the same cancellation token. The runtime archive is streamed to a staging file, checked against its pinned size and SHA-256 value, and limited to 128 MB compressed and 512 MB expanded. ZIP and tar paths must remain under the pinned root. Unix Node archives may contain relative `npm` and `npx` symbolic links; Studio permits one only when its normalized target stays inside that root. Absolute or escaping links, hard links, and unsupported entry kinds fail the transaction. The verified runtime directory is renamed into its versioned cache location and recorded before package installation begins.

The React catalog calls preflight before enabling installation. It presents the runtime version and separate runtime/package byte counts, subscribes to progress only for the selected install ID, and exposes cancellation without treating a partial transaction as installed. An install receipt changes the catalog state to **Installed**, not **Connected**; no process launch is part of this command.

UI/provider settings use the existing store; credentials use the OS credential store; thread/change metadata uses a Rust-owned local store selected during implementation. Local bundle reading remains network-free. Network begins only after an explicit install, auth, remote provider prompt, URL attachment, or update action.

# IPC

Commands cover list/install/connect/authenticate/session/prompt/cancel/permission/context/review/apply/restore. Events carry install progress, connection state, session updates, permission requests, and change sets. Stable IDs let the frontend accept late cancellation updates without reopening completed requests.
