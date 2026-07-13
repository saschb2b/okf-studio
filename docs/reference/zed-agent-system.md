---
type: Reference
title: Zed Agent System Research
description: Primary-source findings from Zed and ACP that inform OKF Studio's agent architecture and UX.
resource: https://github.com/zed-industries/zed
tags: [reference, zed, acp, agents, research]
timestamp: 2026-07-13T21:19:01Z
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
- Zed combines its native-agent tool permissions with terminal sandboxing. Native Windows terminal isolation currently requires WSL and Bubblewrap.
- Zed's native sandbox covers its terminal and fetch tools, not the whole agent process. Linux uses a runnable non-setuid system Bubblewrap, macOS uses Seatbelt through `sandbox-exec`, and Windows gets this path only inside WSL. Zed can warn and continue without the native tool sandbox when its platform prerequisite is unavailable.
- Zed's native default permits broad reads, project writes outside protected Git metadata, and temporary writes while denying outbound network and local IPC. Linux and macOS can approve individual HTTP or HTTPS hosts through a proxy; WSL network approval is all or nothing.
- Zed does not currently provide generic process confinement for external ACP agents; its repository still tracks that as an open feature request. Studio therefore copies the visible-scope principle, not a nonexistent external-agent sandbox.
- The external-agent sandbox discussion remained open on 2026-07-13. Its most concrete current proposal separates execution isolation, visible resource policy, and reusable profiles. This is community design input, not a shipped Zed contract.
- A provider may bring its own sandbox. Codex ACP has exercised Codex's Landlock path on Linux, for example, but that provider-owned behavior cannot prove containment for another ACP executable or for the host process itself.
- Zed stores provider keys in the system keychain.
- Zed Skills apply to its native agent, not automatically to external agents.
- The ACP Registry snapshot checked on 2026-07-11 distributes Claude Agent as `@agentclientprotocol/claude-agent-acp@0.58.1` and Codex as `@agentclientprotocol/codex-acp@1.1.2`. Both are pinned `npx` packages, so a self-contained client needs an app-managed runtime or declared prerequisite.
- Zed's managed `NodeRuntime` currently pins Node `v24.11.0`, downloads the matching nodejs.org archive for the host platform, and keeps its binary and npm paths inside Zed's managed installation directory. Studio adopts the managed-runtime boundary and adds catalog-pinned archive checksums and preflight size disclosure.
- Zed separates `agent_ui`, `agent_servers`, `acp_thread`, native agent logic, and project registry/process stores. The UI consumes connection traits and stores rather than implementing the protocol.
- Zed's current Agent Panel preserves multi-line queued messages while a turn is active. Studio adopts the visible follow-up pattern but keeps its first queue slice to one frontend-owned snapshot because ACP itself still permits one live prompt turn per session.
- The official Rust SDK checked on 2026-07-11 is `agent-client-protocol` 1.2.0 with schema artifact 1.4.0. Its current API composes typed `Client` and `Agent` builders over `ConnectTo` transports. ACP wire compatibility remains protocol v1 and must be negotiated independently of those artifact versions.

# Studio host decision

Studio profiles describe effective resources instead of a command prefix or provider promise. The current native-mediated and external-interactive profiles make the shipped boundaries visible but do not unlock unattended work. A later enforced external profile must fail closed when its platform host cannot start or prove the declared policy; it must not follow Zed's native-tool fallback to an unsandboxed process because the external process itself is the trust boundary.

Studio selected system Bubblewrap for the first Linux backend. The initial preflight is stricter than Zed's documented non-setuid requirement: it also requires a canonical root-owned binary with no file capabilities, no group or world write access, and ordinary read and execute access. It then proves that the binary can create the namespace set needed for the planned no-network host within a deadline. Passing this check does not enable a launch profile. Bubblewrap remains a low-level construction tool, so the later launcher must supply and verify the complete mount and protected-path policy. Ubuntu AppArmor can distinguish the system path from a copied or vendored binary. macOS requires a separately tested Seatbelt profile. Windows may offer WSL plus Bubblewrap as an opt-in profile, but a native Job Object remains lifecycle ownership only. Authentication bootstrap network access must be separate from the work profile so signing in does not silently turn a restricted thread into a full-network one.

# Citations

- [Zed Agent Panel](https://github.com/zed-industries/zed/blob/main/docs/src/ai/agent-panel.md)
- [Zed External Agents](https://github.com/zed-industries/zed/blob/main/docs/src/ai/external-agents.md)
- [Zed subscriptions](https://github.com/zed-industries/zed/blob/main/docs/src/ai/use-an-existing-subscription.md)
- [Zed local models](https://github.com/zed-industries/zed/blob/main/docs/src/ai/use-a-local-model.md)
- [Zed tool permissions](https://github.com/zed-industries/zed/blob/main/docs/src/ai/tool-permissions.md)
- [Zed sandboxing](https://github.com/zed-industries/zed/blob/main/docs/src/ai/sandboxing.md)
- [Zed external-agent sandboxing request](https://github.com/zed-industries/zed/discussions/40482)
- [Bubblewrap](https://github.com/containers/bubblewrap)
- [Ubuntu AppArmor and Bubblewrap path behavior](https://github.com/openai/codex/issues/14919)
- [Codex ACP Landlock integration issue](https://github.com/zed-industries/zed/issues/43021)
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
