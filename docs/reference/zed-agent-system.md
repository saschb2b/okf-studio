---
type: Reference
title: Zed Agent System Research
description: Primary-source findings from Zed and ACP that inform OKF Studio's agent architecture and UX.
resource: https://github.com/zed-industries/zed
tags: [reference, zed, acp, agents, research]
timestamp: 2026-07-12T00:00:00Z
---

# Adopted patterns

| Pattern | Studio use |
| --- | --- |
| Status-bar agent opener | Stable [Agent Panel](../features/agent-panel.md) entry |
| Agent path separate from model provider | ACP subscriptions distinct from Studio API/local providers |
| On-demand ACP subprocess over stdio | Provider-neutral Claude, Codex, and local integration |
| Agent-advertised auth and capabilities | No subscription credential capture or fictional UI actions |
| Concurrent sessions and streamed structured updates | Threads with plans, tools, locations, diffs, usage, and cancellation |
| Visible queued messages during active work | One editable in-memory follow-up that starts at the next idle boundary |
| Once/always permission options | Typed Studio approvals and narrow persisted rules |
| Resources, cwd, mentions, and MCP context | Bundle context and Studio OKF tools |
| Checkpoints and hunk review | Staged, conformant write transactions |
| Native skills plus project trust | Packaged Studio skill; no unreviewed project instructions |
| Pinned registry distributions | Discoverable catalog with app-owned runtime/cache |

# Constraints learned

- Zed keeps its native agent separate from External Agents; external agents own runtime, auth, model, tools, and native configuration.
- ACP assumes a trusted process. Protocol permissions do not sandbox it.
- Zed combines permissions with OS sandboxing. Native Windows terminal isolation currently requires WSL and Bubblewrap.
- Zed stores provider keys in the system keychain.
- Zed Skills apply to its native agent, not automatically to external agents.
- The ACP Registry snapshot checked on 2026-07-11 distributes Claude Agent as `@agentclientprotocol/claude-agent-acp@0.58.1` and Codex as `@agentclientprotocol/codex-acp@1.1.2`. Both are pinned `npx` packages, so a self-contained client needs an app-managed runtime or declared prerequisite.
- Zed's managed `NodeRuntime` currently pins Node `v24.11.0`, downloads the matching nodejs.org archive for the host platform, and keeps its binary and npm paths inside Zed's managed installation directory. Studio adopts the managed-runtime boundary and adds catalog-pinned archive checksums and preflight size disclosure.
- Zed separates `agent_ui`, `agent_servers`, `acp_thread`, native agent logic, and project registry/process stores. The UI consumes connection traits and stores rather than implementing the protocol.
- Zed's current Agent Panel preserves multi-line queued messages while a turn is active. Studio adopts the visible follow-up pattern but keeps its first queue slice to one frontend-owned snapshot because ACP itself still permits one live prompt turn per session.
- The official Rust SDK checked on 2026-07-11 is `agent-client-protocol` 1.2.0 with schema artifact 1.4.0. Its current API composes typed `Client` and `Agent` builders over `ConnectTo` transports. ACP wire compatibility remains protocol v1 and must be negotiated independently of those artifact versions.

# Citations

- [Zed Agent Panel](https://github.com/zed-industries/zed/blob/main/docs/src/ai/agent-panel.md)
- [Zed External Agents](https://github.com/zed-industries/zed/blob/main/docs/src/ai/external-agents.md)
- [Zed subscriptions](https://github.com/zed-industries/zed/blob/main/docs/src/ai/use-an-existing-subscription.md)
- [Zed local models](https://github.com/zed-industries/zed/blob/main/docs/src/ai/use-a-local-model.md)
- [Zed tool permissions](https://github.com/zed-industries/zed/blob/main/docs/src/ai/tool-permissions.md)
- [Zed sandboxing](https://github.com/zed-industries/zed/blob/main/docs/src/ai/sandboxing.md)
- [Zed skills](https://github.com/zed-industries/zed/blob/main/docs/src/ai/skills.md)
- [Zed agent server trait](https://github.com/zed-industries/zed/blob/main/crates/agent_servers/src/agent_servers.rs)
- [Zed ACP connection](https://github.com/zed-industries/zed/blob/main/crates/agent_servers/src/acp.rs)
- [Zed queued-message panel fixes](https://github.com/zed-industries/zed/pull/53696)
- [ACP architecture](https://agentclientprotocol.com/get-started/architecture)
- [ACP Registry](https://agentclientprotocol.com/get-started/registry)
- [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication)
- [ACP sessions](https://agentclientprotocol.com/protocol/v1/session-setup)
- [ACP prompt turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- [ACP tools and permissions](https://agentclientprotocol.com/protocol/v1/tool-calls)
- [ACP filesystem](https://agentclientprotocol.com/protocol/v1/file-system)
- [ACP Rust library](https://agentclientprotocol.com/libraries/rust)
