export interface AgentImplementationInfo {
  name: string;
  title: string | null;
  version: string;
}

export interface AgentAuthMethodInfo {
  id: string;
  name: string;
  description: string | null;
}

export interface AgentCapabilityInfo {
  loadSession: boolean;
  promptImage: boolean;
  promptAudio: boolean;
  promptEmbeddedContext: boolean;
  mcpHttp: boolean;
  mcpSse: boolean;
  sessionList: boolean;
  sessionResume: boolean;
  sessionClose: boolean;
}

export interface AgentConnectionInfo {
  connectionId: string;
  profileId: string;
  protocolVersion: string;
  agent: AgentImplementationInfo | null;
  authMethods: readonly AgentAuthMethodInfo[];
  authenticated: boolean;
  capabilities: AgentCapabilityInfo;
}

export interface AgentSessionInfo {
  connectionId: string;
  sessionId: string;
  bundleRoot: string;
}

export interface AgentTurnInfo {
  connectionId: string;
  sessionId: string;
  turnId: string;
}

export type AgentPermissionOptionKind =
  | "allow-once"
  | "allow-always"
  | "reject-once"
  | "reject-always"
  | "unknown";

export interface AgentPermissionOptionInfo {
  optionId: string;
  name: string;
  kind: AgentPermissionOptionKind;
}

export interface AgentPermissionEvent {
  requestId: string;
  connectionId: string;
  sessionId: string;
  update:
    | {
        kind: "requested";
        toolCallId: string;
        title: string | null;
        options: readonly AgentPermissionOptionInfo[];
      }
    | { kind: "resolved"; optionId: string | null };
}

export interface AgentTurnEvent extends AgentTurnInfo {
  update:
    | { kind: "text"; text: string; messageId: string | null }
    | {
        kind: "completed";
        stopReason: "end-turn" | "max-tokens" | "max-turn-requests" | "refusal" | "cancelled" | "unknown";
      }
    | { kind: "failed"; message: string };
}

export type AgentConnectionEvent =
  | {
      connectionId: string;
      profileId: string;
      status: "disconnected";
      message: null;
    }
  | {
      connectionId: string;
      profileId: string;
      status: "failed";
      message: string;
    };
