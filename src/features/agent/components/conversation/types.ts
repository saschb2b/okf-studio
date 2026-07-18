import type { AgentPlanEntryInfo, AgentToolContentInfo, AgentToolKind, AgentToolLocationInfo, AgentToolStatus, AgentPermissionEvent, AgentSessionConfigValueInput, AgentSessionHistoryInfo, AgentStagedValidationInfo, AgentTurnEvent } from "@/features/agent/connection.ts";
import type { AgentSourceInput } from "@/shared/ipc.ts";
import type { AgentThreadMetadata } from "@/features/agent/threadMetadata.ts";
import type { Issue } from "@/shared/types.ts";
import type { AgentArtifact } from "@/features/agent/artifact.ts";

export type StagedValidationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: AgentStagedValidationInfo }
  | { status: "error"; message: string };

export interface ConversationMessage {
  id: string;
  role: "user" | "agent" | "status";
  text: string;
  tone?: "neutral" | "warning" | "error";
  turnId?: string;
  contextSummary?: { commandName: string };
}

export interface ConversationPlan {
  id: string;
  role: "plan";
  entries: readonly AgentPlanEntryInfo[];
}

export interface ConversationTool {
  id: string;
  role: "tool";
  turnId: string;
  toolCallId: string;
  title: string;
  toolKind: AgentToolKind;
  status: AgentToolStatus | "cancelled";
  locations: readonly AgentToolLocationInfo[];
  changeState: "staged" | "not-staged" | null;
  content: readonly AgentToolContentInfo[];
}

export type ConversationItem = ConversationMessage | ConversationPlan | ConversationTool;

export type AttachedSource = AgentSourceInput & {
  id: string;
  kind?: "issue" | "selection" | "thread";
  issueKey?: string;
  issueLevel?: Issue["level"];
};

export type ThreadAttachSupport = "unsupported" | "busy" | "ready";

export type ComposerState = { status: "idle" } | { status: "error"; message: string };
export interface PromptDraft {
  text: string;
  concepts: { id: string; title: string; type: string }[];
  sources: AttachedSource[];
}
export interface PromptSubmission {
  draft: PromptDraft;
  source: "composer" | "queue" | "retry" | "compact" | "artifact";
  retryTurnId?: string;
  compactCommand?: string;
  artifactRevision?: AgentArtifact;
}
export type QueuedPrompt = PromptDraft & { id: string };
export type ThreadTitle =
  | { source: "default"; value: "New thread" }
  | { source: "derived" | "custom"; value: string };
export type ExportState =
  | { status: "idle" }
  | { status: "exporting" }
  | { status: "success"; filename: string }
  | { status: "error"; message: string };
export type AuthenticationState =
  | { status: "idle" }
  | { status: "authenticating"; methodId: string }
  | { status: "error"; methodId: string; message: string };
export type HistoryState =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "ready"; sessions: readonly AgentSessionHistoryInfo[]; hasMore: boolean }
  | { status: "error"; message: string };
export type SavedThreadState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; metadata: readonly AgentThreadMetadata[] }
  | { status: "resuming"; metadata: readonly AgentThreadMetadata[]; sessionId: string }
  | { status: "error"; message: string; metadata?: AgentThreadMetadata };
export type PendingPermission = AgentPermissionEvent & {
  update: Extract<AgentPermissionEvent["update"], { kind: "requested" }>;
};
export type AgentUsage = Extract<AgentTurnEvent["update"], { kind: "usage" }>;
export type EventStreamState =
  | { status: "ready" }
  | { status: "retrying" }
  | { status: "error"; message: string };
export type DraftSessionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };
export interface PendingSessionConfig {
  optionId: string;
  requestId: number;
  requestedValue: AgentSessionConfigValueInput;
}
export type StageFailure =
  | { owner: "grant"; message: string }
  | { owner: "proposal"; message: string }
  | {
      owner: "staging";
      operation: "discard" | "reject" | "validate" | "create";
      message: string;
      path?: string;
    }
  | { owner: "restore"; message: string };
