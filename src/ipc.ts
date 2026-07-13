// IPC layer: the only place the frontend talks to the backend. In a Tauri
// window it calls Rust commands and plugins; in a browser or test it falls back
// to an in-memory mock, so the UI runs and tests pass without the backend.

import type {
  Bundle,
  BundleRoot,
  RecentBundle,
  RemoteSource,
  Settings,
} from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import catalog from "./agent/catalog.json";
import type { AgentCatalogDocument } from "./agent/catalog.ts";
import type { CustomAgentInput, CustomAgentProfile } from "./agent/custom.ts";
import type {
  LocalModelProbe,
  LocalModelProfile,
  LocalModelProfileInput,
} from "./agent/local.ts";
import type {
  AgentConnectionEvent,
  AgentCheckpointRestoreInfo,
  AgentConnectionInfo,
  AgentPermissionEvent,
  AgentLoadedSessionInfo,
  AgentSessionInfo,
  AgentSessionHistoryPage,
  AgentStagedApplyInfo,
  AgentStagedChangesInfo,
  AgentStagedCreateInfo,
  AgentStagedFileDiff,
  AgentStagedFileInfo,
  AgentStagedValidationInfo,
  AgentStageEvent,
  AgentTurnEvent,
  AgentTurnInfo,
} from "./agent/connection.ts";
import type {
  AgentInstallPreflight,
  AgentInstallProgress,
  AgentInstallReceipt,
} from "./agent/install.ts";
import {
  createAgentThreadMetadata,
  parseAgentThreadMetadata,
  removeAgentThreadMetadata as removeThreadMetadata,
  upsertAgentThreadMetadata,
} from "./agent/threadMetadata.ts";
import type { AgentThreadMetadata, AgentThreadWorkflow } from "./agent/threadMetadata.ts";
import {
  MOCK_ASSETS,
  MOCK_BUNDLE,
  MOCK_FOLDER,
  MOCK_RECENTS,
  MOCK_ROOTS,
} from "./mock/fixture.ts";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Diagnostic sink: mirror a message to the host terminal (`pnpm tauri dev`).
 * Best-effort and fire-and-forget — the webview console is invisible there,
 * so crash forensics (uncaught errors, heap samples) also route through this.
 */
export function logToHost(message: string): void {
  console.warn(message);
  if (!isTauri()) return;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("frontend_log", { message }))
    .catch(() => {
      /* diagnostics must never throw */
    });
}

export async function agentCatalog(): Promise<AgentCatalogDocument> {
  if (!isTauri()) return catalog as AgentCatalogDocument;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AgentCatalogDocument>("agent_catalog");
}

let mockCustomAgents: CustomAgentProfile[] = [];
let mockLocalModelProfiles: LocalModelProfile[] = [];
const activeAgentConnectionsById = new Map<string, AgentConnectionInfo>();
let activeAgentConnectionSnapshot: readonly AgentConnectionInfo[] = [];
const activeAgentConnectionSubscribers = new Set<() => void>();
type AgentConnectionHandler = (event: AgentConnectionEvent) => void;
const agentConnectionHandlers = new Set<AgentConnectionHandler>();
let agentConnectionListener: Promise<() => void> | undefined;
type AgentTurnHandler = (event: AgentTurnEvent) => void;
const agentTurnHandlers = new Set<AgentTurnHandler>();
type AgentPermissionHandler = (event: AgentPermissionEvent) => void;
const agentPermissionHandlers = new Set<AgentPermissionHandler>();
type AgentStageHandler = (event: AgentStageEvent) => void;
const agentStageHandlers = new Set<AgentStageHandler>();
type MockStagedFile = AgentStagedFileInfo & {
  content: string;
  hunkSelected: boolean;
  hunkReviewed: boolean;
};
const mockStagedChanges = new Map<
  string,
  {
    granted: boolean;
    mode: "edit" | "enhance" | "create";
    canRestore: boolean;
    files: MockStagedFile[];
  }
>();
const mockBundleCheckpoints = new Map<string, number>();
const mockCancelledTurns = new Set<string>();
const mockFailedOncePrompts = new Set<string>();
interface MockAgentSession {
  profileId: string;
  bundleRoot: string;
  title: string;
  updatedAt: string;
  messages: AgentLoadedSessionInfo["messages"];
}
const mockAgentSessions = new Map<string, MockAgentSession>();
const mockPermissionResponses = new Map<
  string,
  { turnId: string; optionIds: ReadonlySet<string>; resolve: (optionId: string | null) => void }
>();

export async function customAgents(): Promise<readonly CustomAgentProfile[]> {
  if (!isTauri()) return mockCustomAgents;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CustomAgentProfile[]>("custom_agents");
}

export async function saveCustomAgent(
  input: CustomAgentInput,
): Promise<CustomAgentProfile> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<CustomAgentProfile>("save_custom_agent", { input });
  }
  const profile = { ...input, id: `custom-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}` };
  mockCustomAgents = [...mockCustomAgents, profile];
  return profile;
}

export async function removeCustomAgent(profileId: string): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const removed = await invoke<boolean>("remove_custom_agent", { profileId });
    if (removed) forgetProfileConnections(profileId);
    return removed;
  }
  for (const [connectionId, info] of activeAgentConnectionsById) {
    if (info.profileId !== profileId) continue;
    activeAgentConnectionsById.delete(connectionId);
    emitMockAgentConnection({
      connectionId,
      profileId,
      status: "disconnected",
      message: null,
    });
  }
  const previousLength = mockCustomAgents.length;
  mockCustomAgents = mockCustomAgents.filter((profile) => profile.id !== profileId);
  for (const [sessionId, session] of mockAgentSessions) {
    if (session.profileId === profileId) mockAgentSessions.delete(sessionId);
  }
  return mockCustomAgents.length !== previousLength;
}

export async function localModelProfiles(): Promise<readonly LocalModelProfile[]> {
  if (!isTauri()) return mockLocalModelProfiles;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LocalModelProfile[]>("local_model_profiles");
}

export async function saveLocalModelProfile(
  input: LocalModelProfileInput,
): Promise<LocalModelProfile> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<LocalModelProfile>("save_local_model_profile", { input });
  }
  const duplicate = mockLocalModelProfiles.some(
    (profile) => profile.provider === input.provider && profile.baseUrl === input.baseUrl,
  );
  if (duplicate) throw new Error("That provider endpoint is already configured.");
  const profile = {
    ...input,
    id: `local-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
  };
  mockLocalModelProfiles = [...mockLocalModelProfiles, profile];
  return profile;
}

export async function removeLocalModelProfile(profileId: string): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("remove_local_model_profile", { profileId });
  }
  const previousLength = mockLocalModelProfiles.length;
  mockLocalModelProfiles = mockLocalModelProfiles.filter(
    (profile) => profile.id !== profileId,
  );
  return mockLocalModelProfiles.length !== previousLength;
}

export async function testLocalModelEndpoint(
  input: LocalModelProfileInput,
): Promise<LocalModelProbe> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<LocalModelProbe>("test_local_model_endpoint", { input });
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (input.baseUrl.includes("unreachable")) {
    throw new Error("Studio could not reach the endpoint. Check that its server is running.");
  }
  return {
    provider: input.provider,
    baseUrl: input.baseUrl,
    models:
      input.provider === "ollama"
        ? ["qwen3:8b", "gemma3:4b"]
        : ["local-instruct", "local-tool-model"],
  };
}

export async function connectCustomAgent(profileId: string): Promise<AgentConnectionInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<AgentConnectionInfo>("connect_custom_agent", { profileId });
    activeAgentConnectionsById.set(info.connectionId, info);
    publishAgentConnections();
    return info;
  }
  const profile = mockCustomAgents.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error("Custom agent profile was not found.");
  await new Promise((resolve) => setTimeout(resolve, 80));
  const info: AgentConnectionInfo = {
    connectionId: `connection-${crypto.randomUUID()}`,
    profileId,
    protocolVersion: "1",
    agent: { name: "browser-acp", title: profile.name, version: "0.0.0-dev" },
    authMethods: profile.name.includes("Auth")
      ? [{ id: "browser-login", name: "Sign in with browser", description: "The agent opens its own sign-in flow." }]
      : [],
    authenticated: !profile.name.includes("Auth"),
    capabilities: {
      loadSession: true,
      promptImage: true,
      promptAudio: false,
      promptEmbeddedContext: false,
      mcpHttp: false,
      mcpSse: false,
      sessionList: true,
      sessionResume: false,
      sessionClose: false,
    },
  };
  activeAgentConnectionsById.set(info.connectionId, info);
  publishAgentConnections();
  return info;
}

export async function connectCatalogAgent(agentId: string): Promise<AgentConnectionInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<AgentConnectionInfo>("connect_catalog_agent", { agentId });
    activeAgentConnectionsById.set(info.connectionId, info);
    publishAgentConnections();
    return info;
  }
  if (!mockInstalledAgents.has(agentId)) throw new Error("Install this agent before connecting it.");
  const entry = (catalog as AgentCatalogDocument).entries.find(
    (candidate) => candidate.id === agentId,
  );
  if (!entry?.distribution) throw new Error("This agent is not installable yet.");
  await new Promise((resolve) => setTimeout(resolve, 80));
  const profileId = `catalog-${agentId}`;
  if ([...activeAgentConnectionsById.values()].some((info) => info.profileId === profileId)) {
    throw new Error("This catalog agent already has an active connection.");
  }
  const info: AgentConnectionInfo = {
    connectionId: `connection-${crypto.randomUUID()}`,
    profileId,
    protocolVersion: "1",
    agent: { name: agentId, title: entry.name, version: entry.distribution.version },
    authMethods: [{
      id: "browser-login",
      name: "Sign in with browser",
      description: "The agent opens its own sign-in flow.",
    }],
    authenticated: false,
    capabilities: {
      loadSession: false,
      promptImage: false,
      promptAudio: false,
      promptEmbeddedContext: false,
      mcpHttp: false,
      mcpSse: false,
      sessionList: false,
      sessionResume: false,
      sessionClose: false,
    },
  };
  activeAgentConnectionsById.set(info.connectionId, info);
  publishAgentConnections();
  return info;
}

export function activeAgentConnections(): readonly AgentConnectionInfo[] {
  return activeAgentConnectionSnapshot;
}

export function subscribeAgentConnections(subscriber: () => void): () => void {
  activeAgentConnectionSubscribers.add(subscriber);
  return () => activeAgentConnectionSubscribers.delete(subscriber);
}

export async function newAgentSession(
  connectionId: string,
  bundleRoot: string,
): Promise<AgentSessionInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentSessionInfo>("new_agent_session", { connectionId, bundleRoot });
  }
  const connection = activeAgentConnectionsById.get(connectionId);
  if (!connection) {
    throw new Error("Agent connection was not found.");
  }
  if (!connection.authenticated) throw new Error("Authenticate the agent before creating a session.");
  const sessionId = `session-${crypto.randomUUID()}`;
  const stagedState = {
    granted: false,
    mode: "edit" as const,
    canRestore: mockBundleCheckpoints.has(bundleRoot),
    files: [],
  };
  const session: AgentSessionInfo = {
    connectionId,
    sessionId,
    bundleRoot,
    stagedChanges: {
      sessionId,
      ...stagedState,
    },
  };
  mockStagedChanges.set(session.sessionId, stagedState);
  mockAgentSessions.set(session.sessionId, {
    profileId: connection.profileId,
    bundleRoot,
    title: "Untitled session",
    updatedAt: new Date().toISOString(),
    messages: [],
  });
  return session;
}

export async function listAgentSessions(
  connectionId: string,
  bundleRoot: string,
): Promise<AgentSessionHistoryPage> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentSessionHistoryPage>("list_agent_sessions", { connectionId, bundleRoot });
  }
  const connection = activeAgentConnectionsById.get(connectionId);
  if (!connection) throw new Error("Agent connection was not found.");
  if (!connection.capabilities.sessionList) {
    throw new Error("This agent did not advertise session history support.");
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  const liveSessions = [...mockAgentSessions.entries()]
    .filter(([, session]) =>
      session.profileId === connection.profileId && session.bundleRoot === bundleRoot
    )
    .map(([sessionId, session]) => ({
      sessionId,
      title: session.title,
      updatedAt: session.updatedAt,
    }));
  return {
    sessions: [
      ...liveSessions,
      {
        sessionId: "mock-session-research",
        title: "Trace bundle evidence",
        updatedAt: "2026-07-11T18:24:00Z",
      },
      {
        sessionId: "mock-session-validation",
        title: "Resolve validation warnings",
        updatedAt: "2026-07-10T09:12:00Z",
      },
    ],
    hasMore: false,
  };
}

export async function loadAgentSession(
  connectionId: string,
  bundleRoot: string,
  sessionId: string,
): Promise<AgentLoadedSessionInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentLoadedSessionInfo>("load_agent_session", {
      connectionId,
      bundleRoot,
      sessionId,
    });
  }
  const connection = activeAgentConnectionsById.get(connectionId);
  if (!connection) throw new Error("Agent connection was not found.");
  if (!connection.capabilities.loadSession) {
    throw new Error("This agent did not advertise session restore support.");
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  // Mirrors Rust: a restored session never inherits a write grant or files.
  const stagedState = {
    granted: false,
    mode: "edit" as const,
    canRestore: mockBundleCheckpoints.has(bundleRoot),
    files: [],
  };
  const stagedChanges: AgentStagedChangesInfo = {
    sessionId,
    ...stagedState,
  };
  mockStagedChanges.set(sessionId, stagedState);
  const liveSession = mockAgentSessions.get(sessionId);
  if (liveSession?.profileId === connection.profileId &&
    liveSession.bundleRoot === bundleRoot) {
    return {
      connectionId,
      sessionId,
      bundleRoot,
      messages: liveSession.messages,
      stagedChanges,
    };
  }
  return {
    connectionId,
    sessionId,
    bundleRoot,
    stagedChanges,
    messages: [
      { role: "user", text: "Trace the evidence behind the bundle's product principles." },
      { role: "agent", text: "I traced the principles through the product overview and architecture concepts." },
    ],
  };
}

export async function authenticateAgent(
  connectionId: string,
  methodId: string,
): Promise<boolean> {
  const current = activeAgentConnectionsById.get(connectionId);
  if (!current) throw new Error("Agent connection was not found.");
  if (!current.authMethods.some((method) => method.id === methodId)) {
    throw new Error("Authentication method was not advertised by the agent.");
  }
  const authenticated = isTauri()
    ? await import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke<boolean>("authenticate_agent", { connectionId, methodId }),
      )
    : await new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 80));
  if (authenticated) {
    const latest = activeAgentConnectionsById.get(connectionId);
    if (latest) {
      activeAgentConnectionsById.set(connectionId, { ...latest, authenticated: true });
      publishAgentConnections();
    }
  }
  return authenticated;
}

export async function promptAgent(
  connectionId: string,
  sessionId: string,
  text: string,
  contextPaths: readonly string[] = [],
  sources: readonly AgentSourceInput[] = [],
): Promise<AgentTurnInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentTurnInfo>("prompt_agent", {
      connectionId,
      sessionId,
      text,
      contextPaths,
      sources,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  if (text.startsWith("Reject:")) {
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    throw new Error("The browser mock rejected this prompt before starting a turn.");
  }
  const info = { connectionId, sessionId, turnId: `turn-${crypto.randomUUID()}` };
  const mockSession = mockAgentSessions.get(sessionId);
  if (mockSession) {
    mockSession.title = text.replace(/\s+/gu, " ").trim().slice(0, 80) || "Untitled session";
    mockSession.updatedAt = new Date().toISOString();
    mockSession.messages = [...mockSession.messages, { role: "user", text }];
  }
  mockCancelledTurns.delete(info.turnId);
  void emitMockTurn(info, text);
  return info;
}

export async function exportAgentTranscript(
  suggestedName: string,
  markdown: string,
): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string | null>("export_agent_transcript", { suggestedName, markdown });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  if (markdown.includes("> Export fail:")) {
    throw new Error("The browser mock could not save the transcript.");
  }
  return suggestedName;
}

export interface AgentSourceInput {
  title: string;
  content: string;
  origin?: string;
  mediaType?: string;
  sourceDigest?: string;
  warning?: string;
  imageData?: string;
}

export async function pickAgentTextSources(limit: number): Promise<AgentSourceInput[]> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentSourceInput[]>("pick_agent_text_sources", { limit });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  return [{
    title: "research-report.pdf",
    content: "## Page 1\n\nQuarterly research findings.",
    origin: "research-report.pdf",
    mediaType: "application/pdf",
    sourceDigest: "a".repeat(64),
    warning: "1 of 3 pages had no extractable text. OCR was not used.",
  }].slice(0, Math.max(0, limit));
}

export async function pickAgentSourceFolder(limit: number): Promise<AgentSourceInput[]> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentSourceInput[]>("pick_agent_source_folder", { limit });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  return [
    {
      title: "data/findings.csv",
      content: "## CSV columns\n\n- Column 1: finding\n- Column 2: status\n\n## Rows 1-1\n\n| Row | Column 1: finding | Column 2: status |\n| ---: | --- | --- |\n| 1 | Schema drift | confirmed |\n",
      origin: "data/findings.csv",
      mediaType: "text/csv",
      sourceDigest: "b".repeat(64),
    },
    {
      title: "config/settings.json",
      content: "## JSON structure\n\nPaths use JSON Pointer. `(root)` identifies the complete document.\n\n## Nodes 1-5\n\n| Node | JSON Pointer | Type | Value |\n| ---: | --- | --- | --- |\n| 1 | (root) | object | 2 properties |\n| 2 | /mode | string | \"research\" |\n| 3 | /sources | array | 2 items |\n| 4 | /sources/0 | string | \"csv\" |\n| 5 | /sources/1 | string | \"pdf\" |\n",
      origin: "config/settings.json",
      mediaType: "application/json",
      sourceDigest: "c".repeat(64),
    },
  ].slice(0, Math.max(0, limit));
}

export async function pickAgentImageSources(limit: number): Promise<AgentSourceInput[]> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentSourceInput[]>("pick_agent_image_sources", { limit });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  return [{
    title: "architecture.png",
    content: "",
    origin: "architecture.png",
    mediaType: "image/png",
    sourceDigest: "3c7474b4239ada3342d87f25ec8849eb8473ee35c5471452482686098b49e81b",
    imageData: "iVBORw0KGgppbWFnZQ==",
  }].slice(0, Math.max(0, limit));
}

export async function fetchAgentSourceUrl(url: string): Promise<AgentSourceInput> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentSourceInput>("fetch_agent_source_url", { url });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  return {
    title: "research.html",
    content: "# Remote research\n\nFetched evidence.",
    origin: "https://example.com/research.html",
    mediaType: "text/html",
    sourceDigest: "d".repeat(64),
  };
}

export async function cancelAgentTurn(
  connectionId: string,
  sessionId: string,
  turnId: string,
): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("cancel_agent_turn", { connectionId, sessionId, turnId });
  }
  mockCancelledTurns.add(turnId);
  for (const [requestId, pending] of mockPermissionResponses) {
    if (pending.turnId !== turnId) continue;
    mockPermissionResponses.delete(requestId);
    pending.resolve(null);
  }
  return true;
}

export async function respondAgentPermission(
  requestId: string,
  optionId: string | null,
): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("respond_agent_permission", { requestId, optionId });
  }
  const pending = mockPermissionResponses.get(requestId);
  if (!pending) return false;
  if (optionId !== null && !pending.optionIds.has(optionId)) {
    throw new Error("Permission option was not offered by the agent.");
  }
  mockPermissionResponses.delete(requestId);
  pending.resolve(optionId);
  return true;
}

export async function onAgentTurnUpdate(handler: AgentTurnHandler): Promise<() => void> {
  if (!isTauri()) {
    agentTurnHandlers.add(handler);
    return () => agentTurnHandlers.delete(handler);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<AgentTurnEvent>("agent-turn-update", (event) => handler(event.payload));
}

export async function onAgentPermissionUpdate(
  handler: AgentPermissionHandler,
): Promise<() => void> {
  if (!isTauri()) {
    agentPermissionHandlers.add(handler);
    return () => agentPermissionHandlers.delete(handler);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<AgentPermissionEvent>("agent-permission-update", (event) => handler(event.payload));
}

export async function onAgentStageUpdate(handler: AgentStageHandler): Promise<() => void> {
  if (!isTauri()) {
    agentStageHandlers.add(handler);
    return () => agentStageHandlers.delete(handler);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<AgentStageEvent>("agent-stage-update", (event) => handler(event.payload));
}

export async function setAgentWriteGrant(
  connectionId: string,
  sessionId: string,
  granted: boolean,
  mode: "interactive" | "unattended",
): Promise<AgentStagedChangesInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedChangesInfo>("set_agent_write_grant", {
      connectionId,
      sessionId,
      granted,
      mode,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  if (granted && mode === "unattended") {
    throw new Error(
      "Unattended writes denied: external ACP agents are not running in an enforcement-capable sandbox. Use the interactive thread grant.",
    );
  }
  const state = mockStageState(sessionId);
  state.granted = granted;
  return emitMockStage(connectionId, sessionId);
}

export async function discardAgentStagedChanges(
  connectionId: string,
  sessionId: string,
): Promise<AgentStagedChangesInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedChangesInfo>("discard_agent_staged_changes", {
      connectionId,
      sessionId,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const state = mockStageState(sessionId);
  state.files = [];
  return emitMockStage(connectionId, sessionId);
}

export async function setAgentStageMode(
  connectionId: string,
  sessionId: string,
  mode: "edit" | "enhance" | "create",
): Promise<AgentStagedChangesInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedChangesInfo>("set_agent_stage_mode", {
      connectionId,
      sessionId,
      mode,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const state = mockStageState(sessionId);
  if (state.files.length > 0 && state.mode !== mode) {
    throw new Error("Resolve the current staged changes before changing the staging mode.");
  }
  state.mode = mode;
  return emitMockStage(connectionId, sessionId);
}

function mockStageState(sessionId: string): {
  granted: boolean;
  mode: "edit" | "enhance" | "create";
  canRestore: boolean;
  files: MockStagedFile[];
} {
  let state = mockStagedChanges.get(sessionId);
  if (!state) {
    state = { granted: false, mode: "edit", canRestore: false, files: [] };
    mockStagedChanges.set(sessionId, state);
  }
  return state;
}

function emitMockStage(connectionId: string, sessionId: string): AgentStagedChangesInfo {
  const state = mockStageState(sessionId);
  const changes: AgentStagedChangesInfo = {
    sessionId,
    granted: state.granted,
    mode: state.mode,
    canRestore: state.mode !== "create" && state.canRestore,
    files: state.files.map(({ path, bytes, kind }) => ({ path, bytes, kind })),
  };
  for (const handler of agentStageHandlers) handler({ connectionId, changes });
  return changes;
}

export async function agentStagedFileDiff(
  connectionId: string,
  sessionId: string,
  path: string,
): Promise<AgentStagedFileDiff> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedFileDiff>("agent_staged_file_diff", {
      connectionId,
      sessionId,
      path,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const file = mockStageState(sessionId).files.find((candidate) => candidate.path === path);
  if (!file) throw new Error("This file is not staged.");
  const added = file.content.split("\n").map((line) => `+${line}`).join("\n");
  const revision = `mock:${path}:${file.content.length}`;
  return {
    path,
    kind: file.kind,
    revision,
    hunks: [{
      index: 0,
      header: "@@ -0,0 +1 @@",
      unified: `${added}\n`,
      selected: file.hunkSelected,
      reviewed: file.hunkReviewed,
    }],
    truncated: false,
  };
}

export async function setAgentStagedHunkSelection(
  connectionId: string,
  sessionId: string,
  path: string,
  revision: string,
  hunkIndex: number,
  selected: boolean,
): Promise<AgentStagedFileDiff> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedFileDiff>("set_agent_staged_hunk_selection", {
      connectionId,
      sessionId,
      path,
      revision,
      hunkIndex,
      selected,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const file = mockStageState(sessionId).files.find((candidate) => candidate.path === path);
  if (!file) throw new Error("This file is not staged.");
  if (revision !== `mock:${path}:${file.content.length}` || hunkIndex !== 0) {
    throw new Error("The staged diff changed. Review the file again.");
  }
  file.hunkSelected = selected;
  file.hunkReviewed = true;
  return agentStagedFileDiff(connectionId, sessionId, path);
}

export async function validateAgentStagedChanges(
  connectionId: string,
  sessionId: string,
): Promise<AgentStagedValidationInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedValidationInfo>("validate_agent_staged_changes", {
      connectionId,
      sessionId,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const state = mockStageState(sessionId);
  if (state.files.length === 0) throw new Error("There are no staged changes to validate.");
  const unreviewed = state.files.find((file) => (
    state.mode === "enhance" && file.kind === "modify" && !file.hunkReviewed
  ));
  if (unreviewed) {
    throw new Error(
      `Review ${unreviewed.path} and choose Keep or Reject for 1 hunk before validating this enhancement.`,
    );
  }
  const issues = state.files.flatMap((file) => {
    if (
      !file.hunkSelected ||
      !file.path.toLowerCase().endsWith(".md") ||
      file.path.toLowerCase().endsWith("index.md") ||
      file.content.includes("type:")
    ) return [];
    return [{
      path: file.path,
      level: "error" as const,
      message: "Missing required frontmatter field: type.",
    }];
  });
  const preview = mockStagedGraphPreview(state);
  return {
    sessionId,
    revision: `mock-${state.files.map((file) => (
      `${file.path}:${file.content.length}:${file.hunkSelected ? "keep" : "reject"}`
    )).join("|")}`,
    errors: issues.length,
    warnings: 0,
    issues,
    truncated: false,
    preview,
  };
}

function mockStagedGraphPreview(state: ReturnType<typeof mockStageState>): AgentStagedValidationInfo["preview"] {
  const concepts = new Map<string, {
    id: string;
    title: string;
    conceptType: string;
    staged: boolean;
    links: string[];
  }>();
  if (state.mode !== "create") {
    for (const concept of MOCK_BUNDLE.concepts) {
      concepts.set(concept.id, {
        id: concept.id,
        title: concept.title,
        conceptType: concept.type,
        staged: false,
        links: [...concept.links],
      });
    }
  }
  for (const file of state.files) {
    const lowerPath = file.path.toLowerCase();
    if (!lowerPath.endsWith(".md") || lowerPath.endsWith("index.md")) continue;
    const id = file.path.slice(0, -3).replaceAll("\\", "/");
    if (!file.hunkSelected) {
      if (file.kind === "create") concepts.delete(id);
      continue;
    }
    const titleMatch = /^#\s+(.+)$/m.exec(file.content);
    const typeMatch = /^type:\s*(.+)$/m.exec(file.content);
    const title = titleMatch?.[1]?.trim() ?? id.split("/").at(-1) ?? id;
    const conceptType = typeMatch?.[1]?.trim() ?? "";
    concepts.set(id, {
      id,
      title: title.slice(0, 256),
      conceptType: conceptType.slice(0, 256),
      staged: true,
      links: mockMarkdownConceptLinks(file.path, file.content),
    });
  }
  const ordered = [...concepts.values()].sort((left, right) => left.id.localeCompare(right.id));
  const includedNodes = ordered.slice(0, 128);
  const includedIds = new Set(includedNodes.map((node) => node.id));
  const allEdges = ordered.flatMap((node) => node.links.map((target) => ({
    source: node.id,
    target,
  })));
  const edges = allEdges
    .filter((edge) => includedIds.has(edge.source) && includedIds.has(edge.target))
    .slice(0, 512);
  return {
    nodes: includedNodes.map((node) => ({
      id: node.id,
      title: node.title,
      conceptType: node.conceptType,
      staged: node.staged,
    })),
    edges,
    totalNodes: ordered.length,
    totalEdges: allEdges.length,
    truncated: ordered.length > includedNodes.length || allEdges.length > edges.length,
  };
}

function mockMarkdownConceptLinks(sourcePath: string, content: string): string[] {
  const base = sourcePath.replaceAll("\\", "/").split("/").slice(0, -1);
  const links = new Set<string>();
  for (const match of content.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/gi)) {
    const href = match[1];
    if (!href || /^(?:[a-z]+:|\/)/i.test(href)) continue;
    const parts = [...base];
    for (const part of href.split("/")) {
      if (part === "." || part === "") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    const path = parts.join("/");
    links.add(path.slice(0, -3));
  }
  return [...links];
}

export async function applyAgentStagedChanges(
  connectionId: string,
  sessionId: string,
  revision: string,
): Promise<AgentStagedApplyInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedApplyInfo>("apply_agent_staged_changes", {
      connectionId,
      sessionId,
      revision,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const state = mockStageState(sessionId);
  if (state.mode === "create") {
    throw new Error(
      "Fresh bundle drafts cannot be applied to the active bundle. Choose a destination instead.",
    );
  }
  const validation = await validateAgentStagedChanges(connectionId, sessionId);
  if (validation.revision !== revision) {
    throw new Error("The staged changes or bundle files changed. Validate them again.");
  }
  if (validation.errors > 0) {
    throw new Error(
      `Apply blocked: staged validation found ${validation.errors} error${validation.errors === 1 ? "" : "s"}.`,
    );
  }
  const appliedFiles = state.files.filter((file) => file.hunkSelected).length;
  state.files = [];
  state.canRestore = appliedFiles > 0;
  const bundleRoot = mockAgentSessions.get(sessionId)?.bundleRoot;
  if (bundleRoot && appliedFiles > 0) mockBundleCheckpoints.set(bundleRoot, appliedFiles);
  const changes = emitMockStage(connectionId, sessionId);
  return { sessionId, revision, appliedFiles, changes };
}

export async function createAgentStagedBundle(
  connectionId: string,
  sessionId: string,
  revision: string,
  folderName: string,
): Promise<AgentStagedCreateInfo | null> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedCreateInfo | null>("create_agent_staged_bundle", {
      connectionId,
      sessionId,
      revision,
      folderName,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  validateMockBundleFolderName(folderName);
  const state = mockStageState(sessionId);
  if (state.mode !== "create") {
    throw new Error("Only a fresh bundle draft can create a new destination.");
  }
  const validation = await validateAgentStagedChanges(connectionId, sessionId);
  if (validation.revision !== revision) {
    throw new Error("The staged draft changed. Validate it again before creating the bundle.");
  }
  if (validation.errors > 0) {
    throw new Error(
      `Bundle creation blocked: staged validation found ${validation.errors} error${validation.errors === 1 ? "" : "s"}.`,
    );
  }
  const createdFiles = state.files.filter((file) => file.hunkSelected).length;
  if (createdFiles === 0) throw new Error("No selected draft files remain to create.");
  state.files = [];
  const changes = emitMockStage(connectionId, sessionId);
  return { sessionId, revision, folderName, createdFiles, changes };
}

function validateMockBundleFolderName(folderName: string): void {
  let characterCount = 0;
  let invalidCharacter = false;
  for (const character of folderName) {
    characterCount += 1;
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 32 || codePoint === 127 || '<>:"/\\|?*'.includes(character)) {
      invalidCharacter = true;
    }
  }
  const deviceStem = folderName.split(".", 1)[0]?.toUpperCase() ?? "";
  const reservedDevice = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceStem);
  if (
    folderName.length === 0 || characterCount > 128 ||
    folderName.trim() !== folderName || folderName === "." || folderName === ".." ||
    folderName.endsWith(".") || invalidCharacter
  ) {
    throw new Error(
      "Use a folder name of 1 to 128 characters without path separators, control characters, surrounding spaces, or reserved punctuation.",
    );
  }
  if (reservedDevice) {
    throw new Error("Choose a folder name that is portable across Windows, macOS, and Linux.");
  }
}

export async function restoreAgentStagedCheckpoint(
  connectionId: string,
  sessionId: string,
): Promise<AgentCheckpointRestoreInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentCheckpointRestoreInfo>("restore_agent_staged_checkpoint", {
      connectionId,
      sessionId,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const state = mockStageState(sessionId);
  if (!state.canRestore) {
    throw new Error("There is no restorable checkpoint for this thread.");
  }
  if (state.files.length > 0) {
    throw new Error("Discard or apply the current staged changes before restoring.");
  }
  state.canRestore = false;
  const bundleRoot = mockAgentSessions.get(sessionId)?.bundleRoot;
  const restoredFiles = bundleRoot ? (mockBundleCheckpoints.get(bundleRoot) ?? 1) : 1;
  if (bundleRoot) mockBundleCheckpoints.delete(bundleRoot);
  const changes = emitMockStage(connectionId, sessionId);
  return { sessionId, restoredFiles, changes };
}

export async function discardAgentStagedFile(
  connectionId: string,
  sessionId: string,
  path: string,
): Promise<AgentStagedChangesInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentStagedChangesInfo>("discard_agent_staged_file", {
      connectionId,
      sessionId,
      path,
    });
  }
  if (!activeAgentConnectionsById.has(connectionId)) {
    throw new Error("Agent connection was not found.");
  }
  const state = mockStageState(sessionId);
  if (!state.files.some((candidate) => candidate.path === path)) {
    throw new Error("This file is not staged.");
  }
  state.files = state.files.filter((candidate) => candidate.path !== path);
  return emitMockStage(connectionId, sessionId);
}

/** Browser-mock agent write: `Stage: <path>` prompts stage one file. */
function mockStageWrite(info: AgentTurnInfo, text: string): string | null {
  if (!text.startsWith("Stage:")) return null;
  const state = mockStageState(info.sessionId);
  if (!state.granted) {
    return "Bundle write denied: writes require the Allow edits in this thread grant.";
  }
  const path = text.slice("Stage:".length).trim() || "proposals/draft.md";
  const content = path.endsWith("valid.md")
    ? `---\ntype: note\n---\n# Draft\n\nStaged by the browser mock for ${path}.`
    : `# Draft\n\nStaged by the browser mock for ${path}.`;
  const existing = state.files.find((file) => file.path === path);
  if (existing) {
    existing.content = `${existing.content}\n\nRevised.`;
    existing.bytes = existing.content.length;
    existing.hunkSelected = true;
    existing.hunkReviewed = false;
  } else {
    const conceptId = path.toLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
    const kind = state.mode !== "create" && MOCK_BUNDLE.concepts.some(
      (concept) => concept.id === conceptId,
    ) ? "modify" : "create";
    state.files.push({
      path,
      bytes: content.length,
      kind,
      content,
      hunkSelected: true,
      hunkReviewed: false,
    });
  }
  emitMockStage(info.connectionId, info.sessionId);
  return `Browser ACP staged: ${path}`;
}

function mockBundleGeneration(info: AgentTurnInfo, text: string): string | null {
  if (!text.startsWith("Generate the newest reviewed `okf-proposal` into Studio staging now.")) {
    return null;
  }
  const state = mockStageState(info.sessionId);
  if (!state.granted) {
    return "Bundle generation denied: writes require the Allow edits in this thread grant.";
  }
  const generated: { path: string; content: string; kind: "create" | "modify" }[] =
    state.mode === "enhance" ? [
      {
        path: "product/overview.md",
        kind: "modify",
        content: "---\ntype: Product\n---\n# Overview\n\nExisting product facts, with a proposed evidence note.\n\nSee [New insight](new-insight.md).",
      },
      {
        path: "product/new-insight.md",
        kind: "create",
        content: "---\ntype: Insight\n---\n# New insight\n\nA proposed addition linked to [Overview](overview.md).",
      },
      {
        path: "enhancements/index.md",
        kind: "create",
        content: "---\nokf_version: 0.1\n---\n# Enhancements\n\n- [New insight](../product/new-insight.md)",
      },
    ] : [
    {
      path: "overview.md",
      kind: "create",
      content: "---\ntype: Product\n---\n# Product overview\n\nSee [Agent system](agent-system.md).",
    },
    {
      path: "agent-system.md",
      kind: "create",
      content: "---\ntype: Architecture\n---\n# Agent system\n\nA proposed architecture concept.",
    },
    {
      path: "index.md",
      kind: "create",
      content: "---\nokf_version: 0.1\n---\n# Generated knowledge\n\n- [Product overview](overview.md)\n- [Agent system](agent-system.md)",
    },
  ];
  for (const file of generated) {
    const existing = state.files.find((candidate) => candidate.path === file.path);
    if (existing) {
      existing.content = file.content;
      existing.bytes = file.content.length;
      existing.hunkSelected = true;
      existing.hunkReviewed = false;
    } else {
      state.files.push({
        path: file.path,
        bytes: file.content.length,
        kind: file.kind,
        content: file.content,
        hunkSelected: true,
        hunkReviewed: false,
      });
    }
  }
  emitMockStage(info.connectionId, info.sessionId);
  return `Generated ${generated.length} proposed files in Studio staging.`;
}

function mockAgentResponse(text: string): string {
  if (text.startsWith("Create a new OKF bundle from the sources I attach") ||
    text.startsWith("Review this OKF bundle and the sources I attach")) {
    if (text.includes("Malformed proposal")) {
      return "I could not serialize the structure.\n\n```okf-proposal\n{not json}\n```";
    }
    const enhancement = text.startsWith("Review this OKF bundle and the sources I attach");
    const proposal = enhancement ? {
      concepts: [
        {
          path: "product/overview.md",
          title: "Overview",
          type: "Product",
          links: ["product/new-insight.md"],
        },
        {
          path: "product/new-insight.md",
          title: "New insight",
          type: "Insight",
          links: ["product/overview.md"],
        },
      ],
      indexes: [{ path: "enhancements/index.md", concepts: ["product/new-insight.md"] }],
    } : {
      concepts: [
        {
          path: "overview.md",
          title: "Product overview",
          type: "Product",
          links: ["agent-system.md"],
        },
        {
          path: "agent-system.md",
          title: "Agent system",
          type: "Architecture",
          links: [],
        },
      ],
      indexes: [{ path: "index.md", concepts: ["overview.md", "agent-system.md"] }],
    };
    return "I inspected the available evidence and mapped a small structure for review.\n\n" +
      "```okf-proposal\n" +
      JSON.stringify(proposal, null, 2) +
      "\n```";
  }
  if (text.startsWith("Research this question across the active bundle")) {
    if (text.includes("Omit research sections")) {
      return "**Finding:** Missing required sections.";
    }
    return "**Finding:** The bundle documents its product and architecture decisions.\n\n" +
      "## Sources\n\n- [Product overview](product/overview.md)\n\n" +
      "## Inferences\n\nNone.";
  }
  if (text.startsWith("Assess this dataset documentation and propose a change plan")) {
    if (text.includes("Omit change sections")) {
      return "The requested change needs review.";
    }
    return "The change is bounded to the documented product scope.\n\n" +
      "## Change Plan\n\n1. Review the current definition.\n2. Update the documented scope.\n3. Run OKF validation.\n\n" +
      "## Affected Concepts\n\n- `product/overview.md` - update the product definition";
  }
  return `Browser ACP received: ${text}`;
}

async function emitMockTurn(info: AgentTurnInfo, text: string): Promise<void> {
  const generatesBundle = text.startsWith(
    "Generate the newest reviewed `okf-proposal` into Studio staging now.",
  );
  const reportsChange = text.startsWith("Stage:") || generatesBundle;
  const changeState = reportsChange
    ? (mockStageState(info.sessionId).granted ? "staged" : "not-staged")
    : null;
  await new Promise((resolve) => setTimeout(resolve, 0));
  emitAgentTurn({
    ...info,
    update: {
      kind: "plan",
      entries: [
        { content: "Inspect the bundle and attachments", priority: "high", status: "in-progress" },
        { content: "Draft the response", priority: "medium", status: "pending" },
      ],
    },
  });
  emitAgentTurn({
    ...info,
    update: {
      kind: "tool-call",
      toolCallId: `search-${info.turnId}`,
      title: generatesBundle
        ? "Generate staged bundle files"
        : reportsChange ? "Edit the bundle" : "Search the bundle",
      toolKind: reportsChange ? "edit" : "search",
      status: "in-progress",
      changeState,
      locations: reportsChange
        ? []
        : [
            { path: "product/overview.md", line: 12 },
            { path: "features/agent-panel.md", line: 49 },
          ],
    },
  });
  emitAgentTurn({
    ...info,
    update: {
      kind: "usage",
      usedTokens: 2_400,
      contextWindowTokens: 128_000,
      cost: { amount: 0.04, currency: "USD" },
    },
  });
  const delaySteps = text.includes("Run a long investigation") ? 100 : 1;
  for (let step = 0; step < delaySteps; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (mockCancelledTurns.has(info.turnId)) break;
  }
  if (mockCancelledTurns.has(info.turnId)) {
    emitAgentTurn({ ...info, update: { kind: "completed", stopReason: "cancelled" } });
    mockCancelledTurns.delete(info.turnId);
    return;
  }
  if (text.includes("Edit:")) {
    const requestId = `permission-${crypto.randomUUID()}`;
    const optionId = await new Promise<string | null>((resolve) => {
      mockPermissionResponses.set(requestId, {
        turnId: info.turnId,
        optionIds: new Set(["allow-once", "reject-once"]),
        resolve,
      });
      emitAgentPermission({
        requestId,
        connectionId: info.connectionId,
        sessionId: info.sessionId,
        update: {
          kind: "requested",
          toolCallId: `tool-${info.turnId}`,
          title: "Write bundle files",
          options: [
            { optionId: "allow-once", name: "Allow once", kind: "allow-once" },
            { optionId: "reject-once", name: "Reject", kind: "reject-once" },
          ],
        },
      });
    });
    emitAgentPermission({
      requestId,
      connectionId: info.connectionId,
      sessionId: info.sessionId,
      update: { kind: "resolved", optionId },
    });
    if (optionId === null || optionId === "reject-once") {
      emitAgentTurn({ ...info, update: { kind: "completed", stopReason: "cancelled" } });
      mockCancelledTurns.delete(info.turnId);
      return;
    }
  }
  const shouldFailOnce = text.includes("Fail once:") && !mockFailedOncePrompts.has(text);
  if (shouldFailOnce) mockFailedOncePrompts.add(text);
  if (text.includes("Fail:") || shouldFailOnce) {
    emitAgentTurn({
      ...info,
      update: {
        kind: "text",
        text: "The agent started a response before the connection failed.",
        messageId: `message-${info.turnId}`,
      },
    });
    emitAgentTurn({
      ...info,
      update: { kind: "failed", message: "The mock agent connection closed." },
    });
    return;
  }
  emitAgentTurn({
    ...info,
    update: {
      kind: "plan",
      entries: [
        { content: "Inspect the bundle and attachments", priority: "high", status: "completed" },
        { content: "Draft the response", priority: "medium", status: "in-progress" },
      ],
    },
  });
  emitAgentTurn({
    ...info,
    update: {
      kind: "tool-call",
      toolCallId: `search-${info.turnId}`,
      title: null,
      toolKind: null,
      status: "completed",
      locations: null,
      changeState,
    },
  });
  emitAgentTurn({
    ...info,
    update: {
      kind: "usage",
      usedTokens: 4_200,
      contextWindowTokens: 128_000,
      cost: { amount: 0.08, currency: "USD" },
    },
  });
  const responseText = mockStageWrite(info, text) ?? mockBundleGeneration(info, text) ??
    mockAgentResponse(text);
  emitAgentTurn({
    ...info,
    update: {
      kind: "text",
      text: responseText,
      messageId: `message-${info.turnId}`,
    },
  });
  emitAgentTurn({
    ...info,
    update: {
      kind: "plan",
      entries: [
        { content: "Inspect the bundle and attachments", priority: "high", status: "completed" },
        { content: "Draft the response", priority: "medium", status: "completed" },
      ],
    },
  });
  emitAgentTurn({ ...info, update: { kind: "completed", stopReason: "end-turn" } });
  const mockSession = mockAgentSessions.get(info.sessionId);
  if (mockSession) {
    mockSession.updatedAt = new Date().toISOString();
    mockSession.messages = [
      ...mockSession.messages,
      { role: "agent", text: responseText },
    ];
  }
}

function emitAgentPermission(event: AgentPermissionEvent): void {
  for (const handler of agentPermissionHandlers) handler(event);
}

function emitAgentTurn(event: AgentTurnEvent): void {
  for (const handler of agentTurnHandlers) handler(event);
}

export async function disconnectAgent(connectionId: string): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const disconnected = await invoke<boolean>("disconnect_agent", { connectionId });
    if (disconnected) activeAgentConnectionsById.delete(connectionId);
    if (disconnected) publishAgentConnections();
    return disconnected;
  }
  const info = activeAgentConnectionsById.get(connectionId);
  if (!info) return false;
  activeAgentConnectionsById.delete(connectionId);
  emitMockAgentConnection({
    connectionId,
    profileId: info.profileId,
    status: "disconnected",
    message: null,
  });
  return true;
}

export async function onAgentConnectionState(
  handler: AgentConnectionHandler,
): Promise<() => void> {
  if (!isTauri()) {
    agentConnectionHandlers.add(handler);
    return () => agentConnectionHandlers.delete(handler);
  }
  agentConnectionHandlers.add(handler);
  agentConnectionListener ??= import("@tauri-apps/api/event").then(({ listen }) =>
    listen<AgentConnectionEvent>("agent-connection-state", (event) => {
      receiveAgentConnectionEvent(event.payload);
    }),
  );
  try {
    await agentConnectionListener;
  } catch (error: unknown) {
    agentConnectionListener = undefined;
    agentConnectionHandlers.delete(handler);
    throw error;
  }
  return () => agentConnectionHandlers.delete(handler);
}

function emitMockAgentConnection(event: AgentConnectionEvent): void {
  receiveAgentConnectionEvent(event);
}

function receiveAgentConnectionEvent(event: AgentConnectionEvent): void {
  activeAgentConnectionsById.delete(event.connectionId);
  publishAgentConnections();
  for (const handler of agentConnectionHandlers) handler(event);
}

function forgetProfileConnections(profileId: string): void {
  let didChange = false;
  for (const [connectionId, info] of activeAgentConnectionsById) {
    if (info.profileId !== profileId) continue;
    activeAgentConnectionsById.delete(connectionId);
    didChange = true;
  }
  if (didChange) publishAgentConnections();
}

function publishAgentConnections(): void {
  activeAgentConnectionSnapshot = [...activeAgentConnectionsById.values()];
  for (const subscriber of activeAgentConnectionSubscribers) subscriber();
}

export async function agentInstallPreflight(
  agentId: string,
): Promise<AgentInstallPreflight> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentInstallPreflight>("agent_install_preflight", { agentId });
  }

  const document = catalog as AgentCatalogDocument;
  const entry = document.entries.find((candidate) => candidate.id === agentId);
  if (!entry?.distribution) throw new Error("This agent is not installable yet.");
  const runtime = document.nodeRuntime.distributions.find(
    (distribution) => distribution.target === browserTarget(),
  );
  if (!runtime) throw new Error("Managed Node is not available on this platform.");
  return {
    agentId,
    agentVersion: entry.distribution.version,
    target: runtime.target,
    runtimeVersion: document.nodeRuntime.version,
    packageDownloadSize: entry.distribution.downloadSize,
    runtimeDownloadSize: runtime.downloadSize,
    totalDownloadSize: entry.distribution.downloadSize + runtime.downloadSize,
    packageInstalled: mockInstalledAgents.has(agentId),
    runtimeInstalled: false,
  };
}

type AgentInstallProgressHandler = (progress: AgentInstallProgress) => void;

const mockInstallProgressHandlers = new Set<AgentInstallProgressHandler>();
const mockCancelledInstalls = new Set<string>();
const mockInstalledAgents = new Set<string>();

export async function onAgentInstallProgress(
  handler: AgentInstallProgressHandler,
): Promise<() => void> {
  if (!isTauri()) {
    mockInstallProgressHandlers.add(handler);
    return () => mockInstallProgressHandlers.delete(handler);
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<AgentInstallProgress>("agent-install-progress", (event) =>
    handler(event.payload),
  );
}

export async function installAgent(
  agentId: string,
  installId: string,
): Promise<AgentInstallReceipt> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AgentInstallReceipt>("install_agent", { agentId, installId });
  }

  const preflight = await agentInstallPreflight(agentId);
  const phases: AgentInstallProgress["phase"][] = [
    "runtime-downloading",
    "runtime-extracting",
    "package-downloading",
    "package-extracting",
    "dependencies-installing",
    "complete",
  ];
  mockCancelledInstalls.delete(installId);

  for (const phase of phases) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (mockCancelledInstalls.has(installId)) {
      emitMockInstallProgress({
        installId,
        agentId,
        phase: "cancelled",
        downloadedBytes: 0,
        totalBytes: preflight.totalDownloadSize,
      });
      throw new Error("Installation cancelled.");
    }
    emitMockInstallProgress({
      installId,
      agentId,
      phase,
      downloadedBytes: phase === "complete" ? preflight.totalDownloadSize : 0,
      totalBytes: preflight.totalDownloadSize,
    });
  }

  const entry = (catalog as AgentCatalogDocument).entries.find(
    (candidate) => candidate.id === agentId,
  );
  if (!entry?.distribution) throw new Error("This agent is not installable yet.");
  mockInstalledAgents.add(agentId);
  return {
    agentId,
    version: entry.distribution.version,
    packageDir: `mock-agent-cache/${agentId}/${entry.distribution.version}`,
    integrity: entry.distribution.integrity,
    dependencyLockSha256: "mock-dependency-lock-sha256",
    entrypointSha256: "mock-entrypoint-sha256",
    alreadyInstalled: false,
  };
}

export async function cancelAgentInstall(installId: string): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("cancel_agent_install", { installId });
  }
  mockCancelledInstalls.add(installId);
  return true;
}

function emitMockInstallProgress(progress: AgentInstallProgress): void {
  for (const handler of mockInstallProgressHandlers) handler(progress);
}

function browserTarget(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  const arch = userAgent.includes("arm64") || userAgent.includes("aarch64")
    ? "aarch64"
    : "x86_64";
  if (userAgent.includes("windows")) return `windows-${arch}`;
  if (userAgent.includes("macintosh") || userAgent.includes("mac os")) {
    return `macos-${arch}`;
  }
  return `linux-${arch}`;
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return MOCK_FOLDER;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Open a folder of OKF bundles",
  });
  return typeof picked === "string" ? picked : null;
}

/**
 * Fetch a remote bundle source into a local cache directory and return that
 * directory's path — which the caller then treats exactly like a picked folder
 * (scan → open → watch → recents). This is a *user-initiated* network call (the
 * app makes no automatic ones); the Rust command applies https-only, size-cap,
 * and archive-extraction containment guards. Off-Tauri it resolves to the mock
 * folder after a short delay, so the dialog's fetch progress is exercised in dev.
 */
export async function fetchRemoteBundle(
  source: RemoteSource,
): Promise<{ folder: string }> {
  if (!isTauri()) {
    await new Promise((r) => setTimeout(r, 600));
    return { folder: MOCK_FOLDER };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const folder = await invoke<string>("fetch_remote_bundle", { source });
  return { folder };
}

export async function scanBundles(
  folder: string,
  maxDepth = 8,
): Promise<BundleRoot[]> {
  if (!isTauri()) return MOCK_ROOTS;
  const { invoke } = await import("@tauri-apps/api/core");
  // Tauri maps `maxDepth` to the command's `max_depth` argument.
  return invoke<BundleRoot[]>("scan_bundles", { folder, maxDepth });
}

export async function readBundle(root: string): Promise<Bundle> {
  if (!isTauri()) return MOCK_BUNDLE;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Bundle>("read_bundle", { root });
}

/**
 * Read one companion asset's text (an ODSF `*.example.html` preview or a
 * `styles/*.css` it links) for the design-system renderer. `rel` is a
 * bundle-relative path; the Rust core guards against escaping the bundle root
 * and only serves text assets. Resolves to `null` when the asset is absent or
 * not permitted, so the caller degrades gracefully. Off-Tauri it serves the
 * in-memory mock so previews render in the browser and tests.
 */
export async function readAsset(
  root: string,
  rel: string,
): Promise<string | null> {
  if (!isTauri()) return MOCK_ASSETS[rel.replace(/^\/+/, "")] ?? null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("read_asset", { root, rel });
}

/**
 * Read a *local* bundle image as a `data:` URL so the reader renders it inline
 * with no network fetch (the offline stance). Resolves to `null` when the image
 * is absent, not an image type, or escapes the bundle root. Off-Tauri it encodes
 * the in-memory mock asset so images render in the browser and tests.
 */
export async function readAssetDataUrl(
  root: string,
  rel: string,
): Promise<string | null> {
  if (!isTauri()) {
    const key = rel.replace(/^\/+/, "");
    const text = MOCK_ASSETS[key];
    if (!text) return null;
    const mime = key.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png";
    return `data:${mime};base64,${btoa(text)}`;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("read_asset_data_url", { root, rel });
}

/** Open an external URL in the OS browser (never fetched in-app). */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

// --- Settings & recent bundles, persisted via the store plugin ---

const STORE_FILE = "okf-viewer.json";
const RECENTS_KEY = "recentBundles";
const AGENT_THREADS_KEY = "agentThreads";
const MOCK_AGENT_THREADS_KEY = "okf-studio:agent-threads";
const RECENTS_CAP = 12;

async function store() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load(STORE_FILE);
}

export async function loadSettings(): Promise<Settings> {
  if (!isTauri()) return DEFAULT_SETTINGS;
  const s = await (await store()).get<Partial<Settings>>("settings");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!isTauri()) return;
  const st = await store();
  await st.set("settings", settings);
  await st.save();
}

// Off-Tauri, recents live in memory, seeded from the fixture so the switcher's
// recent rows (pins, hover actions) render in browser dev and tests too.
let mockRecents: RecentBundle[] | null = null;

async function readRecents(): Promise<RecentBundle[]> {
  if (!isTauri()) return (mockRecents ??= MOCK_RECENTS.map((r) => ({ ...r })));
  return (await (await store()).get<RecentBundle[]>(RECENTS_KEY)) ?? [];
}

async function writeRecents(next: RecentBundle[]): Promise<void> {
  if (!isTauri()) {
    mockRecents = next;
    return;
  }
  const st = await store();
  await st.set(RECENTS_KEY, next);
  await st.save();
}

async function readAgentThreads(): Promise<AgentThreadMetadata[]> {
  if (!isTauri()) {
    try {
      return parseAgentThreadMetadata(JSON.parse(localStorage.getItem(MOCK_AGENT_THREADS_KEY) ?? "[]"));
    } catch {
      return [];
    }
  }
  return parseAgentThreadMetadata(await (await store()).get<unknown>(AGENT_THREADS_KEY));
}

async function writeAgentThreads(next: readonly AgentThreadMetadata[]): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(MOCK_AGENT_THREADS_KEY, JSON.stringify(next));
    return;
  }
  const st = await store();
  await st.set(AGENT_THREADS_KEY, next);
  await st.save();
}

export async function loadAgentThreadMetadata(
  bundleRoot: string,
  profileId: string,
): Promise<AgentThreadMetadata[]> {
  const threads = await readAgentThreads();
  return threads.filter((thread) =>
    thread.bundleRoot === bundleRoot && thread.profileId === profileId
  );
}

export async function saveAgentThreadMetadata(
  input: Omit<AgentThreadMetadata, "updatedAt" | "archived" | "workflow"> & {
    archived?: boolean;
    workflow?: AgentThreadWorkflow;
  },
): Promise<AgentThreadMetadata> {
  const metadata = createAgentThreadMetadata(input);
  await writeAgentThreads(upsertAgentThreadMetadata(await readAgentThreads(), metadata));
  return metadata;
}

export async function removeAgentThreadMetadata(
  bundleRoot: string,
  profileId: string,
  sessionId?: string,
): Promise<void> {
  await writeAgentThreads(
    removeThreadMetadata(await readAgentThreads(), bundleRoot, profileId, sessionId),
  );
}

export async function recentBundles(): Promise<RecentBundle[]> {
  return readRecents();
}

/** Keep every pinned entry; cap the unpinned tail of a newest-first list. */
function capRecents(list: RecentBundle[]): RecentBundle[] {
  let unpinned = 0;
  return list.filter((r) => (r.pinned ? true : ++unpinned <= RECENTS_CAP));
}

/** Record a freshly-opened bundle at the top of recents (dedup by root). */
export async function pushRecentBundle(
  entry: Omit<RecentBundle, "ts" | "pinned">,
): Promise<RecentBundle[]> {
  const prev = await readRecents();
  const pinned = prev.find((r) => r.root === entry.root)?.pinned ?? false;
  const next = capRecents([
    { ...entry, ts: Date.now(), pinned },
    ...prev.filter((r) => r.root !== entry.root),
  ]);
  await writeRecents(next);
  return next;
}

export async function pinBundle(root: string): Promise<RecentBundle[]> {
  const prev = await readRecents();
  const next = prev.map((r) =>
    r.root === root ? { ...r, pinned: !r.pinned } : r,
  );
  await writeRecents(next);
  return next;
}

export async function forgetBundle(root: string): Promise<RecentBundle[]> {
  const prev = await readRecents();
  const next = prev.filter((r) => r.root !== root);
  await writeRecents(next);
  return next;
}

// --- Live reload: watch the open folder ---

export interface BundleChanged {
  root: string;
  conceptIds: string[];
}

/** Begin watching a folder. Returns a disposer that stops the watch. */
export async function startWatch(
  folder: string,
  onChanged: (e: BundleChanged) => void,
): Promise<() => void> {
  if (!isTauri())
    return () => {
      /* nothing to watch off-Tauri */
    };
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<BundleChanged>("bundle-changed", (ev) =>
    onChanged(ev.payload),
  );
  await invoke("start_watch", { folder });
  return () => {
    unlisten();
    void invoke("stop_watch").catch(() => {
      /* best-effort cleanup */
    });
  };
}
