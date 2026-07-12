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

export interface AgentPlanEntryInfo {
  content: string;
  priority: "high" | "medium" | "low" | "unknown";
  status: "pending" | "in-progress" | "completed" | "unknown";
}

export type AgentToolKind =
  | "read" | "edit" | "delete" | "move" | "search" | "execute"
  | "think" | "fetch" | "switch-mode" | "other" | "unknown";
export type AgentToolStatus =
  | "pending" | "in-progress" | "completed" | "failed" | "unknown";

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
    | { kind: "plan"; entries: readonly AgentPlanEntryInfo[] }
    | {
        kind: "tool-call";
        toolCallId: string;
        title: string | null;
        toolKind: AgentToolKind | null;
        status: AgentToolStatus | null;
      }
    | {
        kind: "usage";
        usedTokens: number;
        contextWindowTokens: number;
        cost: { amount: number; currency: string } | null;
      }
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
