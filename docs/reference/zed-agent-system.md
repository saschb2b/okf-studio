---
type: Reference
title: Zed Agent System Research
description: Primary-source findings from Zed and ACP that inform OKF Studio's agent architecture and UX.
resource: https://github.com/zed-industries/zed
tags: [reference, zed, acp, agents, research]
timestamp: 2026-07-17T18:46:40Z
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
| Registry browser with search, install filter, and remove | ACP Registry section with the same states driving rows, filters, and uninstall |
| New-thread popover naming agents, then Add More Agents | Connection-strip plus menu: new thread, one-step connect for installed agents, catalog entry |

# Agent Panel follow-up audit

The 2026-07-14 follow-up compared Zed's current Agent Panel documentation with source commit `f7cf09b`. It also checked ACP's stabilized session configuration contract against the `agent-client-protocol` 1.2.0 and schema 1.4.0 already pinned by Studio. The result separates protocol-backed gaps from Zed-native behavior that an external agent may not support.

| Zed behavior | Studio status | Decision |
| --- | --- | --- |
| Agent-provided model, mode, reasoning, model-configuration, custom select, and boolean controls | Missing | Add an ACP-driven control rail in [WP10B](../product/studio-roadmap.md#wp10b-agent-advertised-session-controls). Do not invent a selector when an agent does not advertise it. |
| Searchable, grouped option pickers with descriptions, favorites, and keyboard cycling | Missing | Add after the basic selector contract in WP10B. Keep the agent's order and current value authoritative. |
| A bounded activity shelf above the composer for permission, plan, changed files, and queued messages | Split across the transcript and composer | Adapt in [WP10C](../product/studio-roadmap.md#wp10c-docked-live-work-shelf). The shelf owns live work; the transcript owns durable chronology. |
| Collapsible plan summary showing the current task, completed count, and remaining count | Plan exists only as a transcript card | Move the live replacement plan into the shelf and retain its terminal snapshot for export. |
| Context usage, cost, automatic compaction, and **New From Summary** | Usage and cost ship; context recovery does not | Add explicit context-pressure recovery in [WP10D](../product/studio-roadmap.md#wp10d-thread-navigation-and-context-lifecycle). Use an agent command when advertised; do not claim client-side compaction for an external agent. |
| Thread navigation, copy-response actions, open-as-Markdown, editable prompts, and checkpoints | Export ships; the rest is missing or partial | Add safe navigation and copy surfaces in WP10D. Defer edit-and-resubmit until Studio can pair it with a trustworthy rewind boundary. |
| Follow agent locations in the editor | Tool locations are display-only | Adapt to bundle-relative concept navigation in WP10D. Never follow an absolute or outside-bundle path. |
| Background completion or attention notifications with thread identity | Missing | Add opt-in desktop attention in [WP10E](../product/studio-roadmap.md#wp10e-attention-and-thread-scale). |
| Searchable thread history, imported ACP sessions, quick recent-thread switching, and project grouping | One saved and one archived pointer per bundle; parallel live threads ship | Expand bundle-scoped history and switching in WP10E when the agent advertises session list and load. |
| Zed-native profiles, Skills manager, provider feedback, terminal threads, and Git worktree isolation | Not applicable to an OKF workspace or not portable over ACP | Do not copy. Studio keeps its packaged OKF skill, reviewed-write boundary, and bundle scope instead of growing editor-specific surfaces. |

## Session configuration contract

ACP stabilized session config options on 2026-02-04. An agent may return an ordered set of select or boolean options when a session is created, loaded, resumed, or forked. Categories such as `mode`, `model`, `model_config`, and `thought_level` are placement hints, not correctness requirements. Custom or future categories remain renderable without name-based vendor logic.

The client sends `session/set_config_option` with the session, option, and value IDs. The response replaces the complete option set because changing a model may add, remove, or alter reasoning choices. The agent may send the same full replacement through `session/update`. Studio must therefore validate and replace one bounded snapshot, serialize overlapping changes, and keep the last confirmed snapshot visible if a request fails. Legacy session modes are a fallback only when no config option set exists; rendering both would duplicate mode controls.

Zed's current source adds three useful presentation choices on top of the protocol: it preserves agent order, rebuilds every picker when the option IDs change, and lets users search and favorite large model lists. The control row wraps, while option descriptions live in tooltips or a documentation aside instead of widening every button.

## Protocol dependency audit

The 2026-07-17 recheck used ACP's current v1 documentation and Studio's pinned `agent-client-protocol` 1.2.0 with schema 1.4.0.

ACP Authentication Methods remains a Draft RFD. The Rust SDK exposes `env_var` and `terminal` only through its default-disabled `unstable_auth_methods` feature and labels both variants as outside the specification. Studio must not advertise terminal capability, collect environment credentials, or restart an agent around those fields until the RFD is completed and the stable SDK exposes them without the unstable feature.

ACP v1 permission requests carry a `toolCallId` that is unique only within one session. Their remaining scope is agent-controlled presentation or per-call data: title, kind, raw input, locations, and choice labels. The protocol has no stable tool-definition identity that survives a new session. Studio can therefore remember only the exact bounded request inside one live thread. A cross-session rule may ship when stable ACP supplies an identity and scope that Studio can display and compare without trusting those agent-controlled fields.

## Live-work shelf contract

Zed renders the activity surface immediately above the message editor. A permission request comes first, followed by the live plan, changed-file review, and queued messages, with dividers only between present sections. Each section has a one-line disclosure summary and a bounded scroll area. This establishes a useful ownership rule for Studio:

- Live, actionable state stays docked beside its recovery or decision.
- Transcript entries explain what happened and never compete with the live control.
- Collapsing a section changes presentation only; it does not cancel, approve, reject, or forget work.
- Blocking permission and failure state outrank progress summaries.
- The shelf has a maximum height so the transcript and composer remain reachable at 360px.

Studio will adapt changed files to its stricter staged OKF transaction rather than copy Zed's editor diff model.

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
- The ACP Registry snapshot checked on 2026-07-11 distributed Claude Agent as `@agentclientprotocol/claude-agent-acp@0.58.1` and Codex as `@agentclientprotocol/codex-acp@1.1.2`. Both are pinned `npx` packages, so a self-contained client needs an app-managed runtime or declared prerequisite.
- The registry recheck on 2026-07-14 counted roughly forty agents in two distribution shapes. `npx` entries (Claude Agent 0.59.0, Codex, Gemini CLI, Qwen Code, GitHub Copilot, Cline, Auggie CLI, Factory Droid) can be pinned by tarball SHA-512 and installed script-free; their loader shims resolve platform packages at run time. Most `binary` entries (Kimi CLI, OpenCode, Cursor, Devin, Junie, Amp, Mistral Vibe) publish no archive checksum — only Goose does — so Studio pins binary agents by measuring archive digests itself at snapshot time instead of trusting or skipping upstream. Registry `env` values that disable self-update are required for pinned installs and became catalog `environmentDefaults`.
- Cursor's versioned archives bottom out in `node(.exe) index.js` behind bash, cmd, and PowerShell shims that also set `CURSOR_INVOKED_AS`. Zed runs the registry `cmd` as published; Studio spawns the bundled Node and pinned `index.js` directly so no shell enters the launch path, and reproduces the shim's environment variable through catalog defaults. The direct launch was proven against the real Windows archive with an ACP v1 initialize round-trip before pinning.
- Zed's managed `NodeRuntime` currently pins Node `v24.11.0`, downloads the matching nodejs.org archive for the host platform, and keeps its binary and npm paths inside Zed's managed installation directory. Studio adopts the managed-runtime boundary and adds catalog-pinned archive checksums and preflight size disclosure.
- Zed separates `agent_ui`, `agent_servers`, `acp_thread`, native agent logic, and project registry/process stores. The UI consumes connection traits and stores rather than implementing the protocol.
- Zed's current Agent Panel preserves multi-line queued messages while a turn is active. Studio adopts the visible follow-up pattern but keeps its first queue slice to one frontend-owned snapshot because ACP itself still permits one live prompt turn per session.
- The official Rust SDK checked on 2026-07-11 is `agent-client-protocol` 1.2.0 with schema artifact 1.4.0. Its current API composes typed `Client` and `Agent` builders over `ConnectTo` transports. ACP wire compatibility remains protocol v1 and must be negotiated independently of those artifact versions.
- ACP session config options were stabilized on 2026-02-04 and are present in Studio's pinned schema. They cover agent-provided model, mode, thought level, model configuration, custom select, and boolean options without provider-specific fields.
- ACP available-command updates are complete session snapshots, not a method the client polls. GitHub Copilot CLI's official ACP server advertises `/compact` and states that clients invoke an advertised command by sending its slash name as the ordinary single text prompt. Studio uses that portable boundary and does not infer a compaction command from a description.
- Zed's current config-option view replaces its selector set after every update, supports grouped and searchable choices, and keeps favorites as a client preference. It uses the semantic category only for placement, icons, and keyboard actions.
- Zed's current activity surface docks permission, live plan, changed files, and queued messages above the composer. Plan and queue lists have bounded internal scrolling; the transcript keeps completed plan snapshots separately.

# Studio host decision

Studio profiles describe effective resources instead of a command prefix or provider promise. The current native-mediated and external-interactive profiles make the shipped boundaries visible but do not unlock unattended work. A later enforced external profile must fail closed when its platform host cannot start or prove the declared policy; it must not follow Zed's native-tool fallback to an unsandboxed process because the external process itself is the trust boundary.

Studio selected system Bubblewrap for the first Linux backend. The initial preflight is stricter than Zed's documented non-setuid requirement: it also requires a canonical root-owned binary with no file capabilities, no group or world write access, and ordinary read and execute access. It proves that the binary can create the required namespace set, including nested-user-namespace denial, within a deadline. The compiled launch branch follows Bubblewrap's empty-root model instead of read-only binding the whole host. It adds selected system runtime mounts, exact app runtime mounts, one Rust-granted bundle, protected-path masks, private temporary filesystems, and a closed network choice. No profile selects this branch yet. Authentication and network selection must be explicit before Claude or Codex can use it without losing subscription login or provider access. Ubuntu AppArmor can distinguish the system path from a copied or vendored binary. macOS requires a separately tested Seatbelt profile. Windows may offer WSL plus Bubblewrap as an opt-in profile, but a native Job Object remains lifecycle ownership only.

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
- [Zed Agent Panel thread view](https://github.com/zed-industries/zed/blob/main/crates/agent_ui/src/conversation_view/thread_view.rs)
- [Zed ACP config option view](https://github.com/zed-industries/zed/blob/main/crates/agent_ui/src/config_options.rs)
- [Zed Parallel Agents](https://github.com/zed-industries/zed/blob/main/docs/src/ai/parallel-agents.md)
- [ACP architecture](https://agentclientprotocol.com/get-started/architecture)
- [ACP Registry](https://agentclientprotocol.com/get-started/registry)
- [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication)
- [ACP Authentication Methods draft](https://agentclientprotocol.com/rfds/auth-methods)
- [ACP sessions](https://agentclientprotocol.com/protocol/v1/session-setup)
- [ACP prompt turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- [ACP tools and permissions](https://agentclientprotocol.com/protocol/v1/tool-calls)
- [ACP filesystem](https://agentclientprotocol.com/protocol/v1/file-system)
- [ACP Rust library](https://agentclientprotocol.com/libraries/rust)
- [ACP session config options](https://agentclientprotocol.com/rfds/session-config-options)
- [ACP session config stabilization](https://agentclientprotocol.com/announcements/session-config-options-stabilized)
- [GitHub Copilot CLI ACP server](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server)
