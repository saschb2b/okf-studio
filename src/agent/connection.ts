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

export interface AgentSecurityScopeInfo {
  evidenceSource: "native-provider-host" | "external-process-launcher";
  processContainment: "in-process" | "posix-process-group" | "windows-job-object";
  profile: AgentSecurityProfileInfo;
}

export interface AgentSecurityProfileInfo {
  id: "studio-native-mediated-v1" | "external-interactive-unrestricted-v1";
  effectiveMounts: "studio-tool-mediated-bundle" | "host-operating-system";
  writableRoots: "reviewed-staging-only" | "host-operating-system-permissions";
  networkPolicy: "configured-endpoint-only" | "host-operating-system";
  credentialExposure:
    | "configured-endpoint-only"
    | "host-operating-system-and-launch-environment";
  lifetime: "connection";
  stopConditions: readonly ("disconnect" | "application-exit" | "host-failure")[];
  unattendedEligible: boolean;
}

export interface AgentConnectionInfo {
  connectionId: string;
  profileId: string;
  protocolVersion: string;
  agent: AgentImplementationInfo | null;
  authMethods: readonly AgentAuthMethodInfo[];
  authenticated: boolean;
  capabilities: AgentCapabilityInfo;
  securityScope: AgentSecurityScopeInfo;
}

export interface AgentSessionInfo {
  connectionId: string;
  sessionId: string;
  bundleRoot: string;
  stagedChanges: AgentStagedChangesInfo | null;
}

export interface AgentSessionHistoryInfo {
  sessionId: string;
  title: string | null;
  updatedAt: string | null;
}

export interface AgentSessionHistoryPage {
  sessions: readonly AgentSessionHistoryInfo[];
  hasMore: boolean;
}

export interface AgentHistoryMessage {
  role: "user" | "agent";
  text: string;
}

export interface AgentLoadedSessionInfo extends AgentSessionInfo {
  messages: readonly AgentHistoryMessage[];
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

export interface AgentToolLocationInfo {
  path: string;
  line: number | null;
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
        canRemember: boolean;
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
        locations: readonly AgentToolLocationInfo[] | null;
        changeState: "staged" | "not-staged" | null;
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

export interface AgentStagedFileInfo {
  path: string;
  bytes: number;
  kind: "create" | "modify";
}

export interface AgentStagedChangesInfo {
  sessionId: string;
  granted: boolean;
  mode: "edit" | "enhance" | "create";
  canRestore: boolean;
  files: readonly AgentStagedFileInfo[];
}

export interface AgentStageEvent {
  connectionId: string;
  changes: AgentStagedChangesInfo;
}

export interface AgentStagedFileDiff {
  path: string;
  kind: "create" | "modify";
  revision: string;
  hunks: readonly AgentStagedDiffHunk[];
  truncated: boolean;
}

export interface AgentStagedDiffHunk {
  index: number;
  header: string;
  unified: string;
  selected: boolean;
  reviewed: boolean;
}

export interface AgentStagedValidationIssue {
  path: string | null;
  level: "error" | "warning";
  message: string;
}

export interface AgentStagedValidationInfo {
  sessionId: string;
  revision: string;
  errors: number;
  warnings: number;
  issues: readonly AgentStagedValidationIssue[];
  truncated: boolean;
  preview: AgentStagedGraphPreview;
}

export interface AgentStagedGraphPreview {
  nodes: readonly AgentStagedGraphNode[];
  edges: readonly AgentStagedGraphEdge[];
  totalNodes: number;
  totalEdges: number;
  truncated: boolean;
}

export interface AgentStagedGraphNode {
  id: string;
  title: string;
  conceptType: string;
  staged: boolean;
}

export interface AgentStagedGraphEdge {
  source: string;
  target: string;
}

export interface AgentStagedApplyInfo {
  sessionId: string;
  revision: string;
  appliedFiles: number;
  changes: AgentStagedChangesInfo;
}

export interface AgentStagedCreateInfo {
  sessionId: string;
  revision: string;
  folderName: string;
  createdFiles: number;
  changes: AgentStagedChangesInfo;
}

export interface AgentCheckpointRestoreInfo {
  sessionId: string;
  restoredFiles: number;
  changes: AgentStagedChangesInfo;
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
