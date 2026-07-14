import { Archive as ArchiveIcon, Bot, Check, ChevronLeft, Circle, CircleAlert, CircleDot, Database, Ellipsis, FileDown, FilePlus2, FileText, FolderPlus, History, ImageIcon, ImagePlus, ListChecks, Paperclip, Pencil, Plus, RotateCcw, Search, Send, ShieldQuestion, Sparkles, Square, TextSelect, TriangleAlert, User, WandSparkles, Wrench, X } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { startTransition, useActionState, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction, SubmitEvent } from "react";
import type {
  AgentConnectionEvent,
  AgentConnectionInfo,
  AgentSecurityScopeInfo,
  AgentPlanEntryInfo,
  AgentToolKind,
  AgentToolLocationInfo,
  AgentToolStatus,
  AgentPermissionEvent,
  AgentPermissionOptionInfo,
  AgentLoadedSessionInfo,
  AgentSessionInfo,
  AgentSessionHistoryInfo,
  AgentStagedChangesInfo,
  AgentStagedFileDiff,
  AgentStagedValidationInfo,
  AgentTurnEvent,
  AgentTurnInfo,
} from "../agent/connection.ts";
import type { ReaderSelectionCapture } from "../agent/readerSelection.ts";
import { bundleProposalNarrative, parseBundleProposal } from "../agent/bundleProposal.ts";
import { StagedGraphPreview } from "./StagedGraphPreview.tsx";
import type { AgentThreadMetadata, AgentThreadWorkflow } from "../agent/threadMetadata.ts";
import {
  datasetChangeRequirements,
  deriveThreadTitle,
  previousThreadSource,
  researchExportRequirements,
  transcriptFilename,
  transcriptMarkdown,
} from "../agent/thread.ts";
import {
  agentStagedFileDiff,
  applyAgentStagedChanges,
  createAgentStagedBundle,
  cancelAgentTurn,
  authenticateAgent,
  discardAgentStagedChanges,
  discardAgentStagedFile,
  exportAgentTranscript,
  fetchAgentSourceUrl,
  listAgentSessions,
  loadAgentThreadMetadata,
  loadAgentSession,
  newAgentSession,
  onAgentConnectionState,
  onAgentPermissionUpdate,
  onAgentStageUpdate,
  onAgentTurnUpdate,
  setAgentWriteGrant,
  setAgentStageMode,
  setAgentStagedHunkSelection,
  validateAgentStagedChanges,
  pickAgentSourceFolder,
  pickAgentImageSources,
  pickAgentTextSources,
  promptAgent,
  removeAgentThreadMetadata,
  respondAgentPermission,
  restoreAgentStagedCheckpoint,
  saveAgentThreadMetadata,
} from "../ipc.ts";
import type { AgentSourceInput } from "../ipc.ts";
import { renderMarkdown } from "../markdown.ts";
import type { Issue } from "../types.ts";
import { BundleProposalPreview } from "./BundleProposalPreview.tsx";
import "./AgentConversation.css";

export interface AgentConversationProps {
  connection: AgentConnectionInfo;
  bundleRoot: string | null;
  bundleName: string | null;
  activeConcept: { id: string; title: string } | null;
  onCaptureReaderSelection: () => ReaderSelectionCapture;
  concepts: readonly { id: string; title: string; type: string }[];
  issues: readonly Issue[];
  onChangeAgent: () => void;
  onConnectionEnd: (event: AgentConnectionEvent) => void;
  onOpenFolder: () => Promise<void>;
  threadSurfaceCount: number;
  onThreadTitleChange: (title: string) => void;
  onCloseThreadSurface: () => void;
}

type StagedValidationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: AgentStagedValidationInfo }
  | { status: "error"; message: string };

interface ConversationMessage {
  id: string;
  role: "user" | "agent" | "status";
  text: string;
  tone?: "neutral" | "warning" | "error";
  turnId?: string;
}

interface ConversationPlan {
  id: string;
  role: "plan";
  entries: readonly AgentPlanEntryInfo[];
}

interface ConversationTool {
  id: string;
  role: "tool";
  turnId: string;
  toolCallId: string;
  title: string;
  toolKind: AgentToolKind;
  status: AgentToolStatus | "cancelled";
  locations: readonly AgentToolLocationInfo[];
  changeState: "staged" | "not-staged" | null;
}

type ConversationItem = ConversationMessage | ConversationPlan | ConversationTool;

type AttachedSource = AgentSourceInput & {
  id: string;
  kind?: "issue" | "selection" | "thread";
  issueKey?: string;
  issueLevel?: Issue["level"];
};

type ThreadAttachSupport = "unsupported" | "busy" | "ready";

type ComposerState = { status: "idle" } | { status: "error"; message: string };
interface PromptDraft {
  text: string;
  concepts: { id: string; title: string; type: string }[];
  sources: AttachedSource[];
}
interface PromptSubmission {
  draft: PromptDraft;
  source: "composer" | "queue" | "retry";
  retryTurnId?: string;
}
type QueuedPrompt = PromptDraft & { id: string };
type ThreadTitle =
  | { source: "default"; value: "New thread" }
  | { source: "derived" | "custom"; value: string };
type ExportState =
  | { status: "idle" }
  | { status: "exporting" }
  | { status: "success"; filename: string }
  | { status: "error"; message: string };
type AuthenticationState =
  | { status: "idle" }
  | { status: "authenticating"; methodId: string }
  | { status: "error"; methodId: string; message: string };
type HistoryState =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "ready"; sessions: readonly AgentSessionHistoryInfo[]; hasMore: boolean }
  | { status: "error"; message: string };
type SavedThreadState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; metadata: readonly AgentThreadMetadata[] }
  | { status: "resuming"; metadata: readonly AgentThreadMetadata[]; sessionId: string }
  | { status: "error"; message: string; metadata?: AgentThreadMetadata };
type PendingPermission = AgentPermissionEvent & {
  update: Extract<AgentPermissionEvent["update"], { kind: "requested" }>;
};
type AgentUsage = Extract<AgentTurnEvent["update"], { kind: "usage" }>;

const BUNDLE_PROPOSAL_INSTRUCTIONS =
  "End with exactly one fenced `okf-proposal` JSON block shaped as `{\"concepts\":[{\"path\":\"concept.md\",\"title\":\"Concept\",\"type\":\"Concept type\",\"links\":[\"related.md\"]}],\"indexes\":[{\"path\":\"index.md\",\"concepts\":[\"concept.md\"]}]}`. Use bundle-relative Markdown paths and make every index member name a proposed concept.";
const BUNDLE_GENERATION_PROMPT =
  "Generate the newest reviewed `okf-proposal` into Studio staging now. Create conformant Markdown with the proposed paths, titles, types, links, and indexes. Preserve authored facts, include source provenance where the attached evidence supports it, and use only Studio-mediated staged writes. Do not apply changes to the bundle.";

const THREAD_STARTERS = [
  {
    title: "Create bundle",
    description: "Turn attached evidence into a proposed OKF structure.",
    prompt: `Create a new OKF bundle from the sources I attach. First inspect the evidence, then propose the concepts, types, links, and indexes. Do not write files yet. ${BUNDLE_PROPOSAL_INSTRUCTIONS}`,
    workflow: "create-bundle",
    icon: WandSparkles,
  },
  {
    title: "Enhance bundle",
    description: "Find useful additions without replacing authored facts.",
    prompt: `Review this OKF bundle and the sources I attach. Propose additions or corrections without overwriting authored facts. Include only additions or changed concepts and do not write files yet. ${BUNDLE_PROPOSAL_INSTRUCTIONS}`,
    workflow: "enhance-bundle",
    icon: Sparkles,
  },
  {
    title: "Request dataset change",
    description: "Map a requested change to affected knowledge.",
    prompt: "Assess this dataset documentation and propose a change plan. Identify dependencies, validation risks, and supporting evidence. End with `## Change Plan` containing actionable steps and `## Affected Concepts` containing one bundle-relative `.md` path per bullet. Do not write files yet: ",
    workflow: "dataset-change",
    icon: Database,
  },
  {
    title: "Deep research",
    description: "Trace a question through the bundle and sources.",
    prompt: "Research this question across the active bundle and attached sources. Cite the evidence for each finding. End with `## Sources` containing one bullet per cited source and `## Inferences` containing each inference or `None.`: ",
    workflow: "deep-research",
    icon: Search,
  },
] as const;

function workflowForPrompt(prompt: string): AgentThreadWorkflow {
  return THREAD_STARTERS.find((starter) => prompt.startsWith(starter.prompt))?.workflow ?? null;
}

const MAX_THREAD_TITLE_CHARS = 80;

function usageCostLabel(cost: AgentUsage["cost"]): string | null {
  if (!cost) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cost.currency,
      maximumFractionDigits: 4,
    }).format(cost.amount);
  } catch {
    return `${cost.currency} ${cost.amount.toFixed(4).replace(/\.?0+$/, "")}`;
  }
}

function usageLabels(usage: AgentUsage): { visible: string; detail: string } {
  const cost = usageCostLabel(usage.cost);
  const used = new Intl.NumberFormat().format(usage.usedTokens);
  const size = new Intl.NumberFormat().format(usage.contextWindowTokens);
  const context = usage.contextWindowTokens > 0
    ? `${Math.min(100, Math.round((usage.usedTokens / usage.contextWindowTokens) * 100))}% context`
    : `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(usage.usedTokens)} tokens`;
  return {
    visible: cost ? `${context} · ${cost}` : context,
    detail: cost
      ? `${used} of ${size} context tokens used. Cumulative session cost: ${cost}.`
      : `${used} of ${size} context tokens used.`,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function historyDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function stagedBytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function threadDateLabel(updatedAt: number): string | null {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(updatedAt));
}

function SavedThreadWelcome({
  state,
  actionRef,
  onResume,
  onDismiss,
  onRetry,
  onStartNew,
}: {
  state: Exclude<SavedThreadState, { status: "none" }>;
  actionRef: RefObject<HTMLButtonElement | null>;
  onResume: (metadata: AgentThreadMetadata) => void;
  onDismiss: (metadata: AgentThreadMetadata) => void;
  onRetry: () => void;
  onStartNew: () => void;
}) {
  if (state.status === "loading") {
    return (
      <>
        <History size={24} aria-hidden="true" />
        <h3>Checking saved work</h3>
        <p role="status">Looking for a previous thread for this bundle and agent.</p>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <CircleAlert size={24} aria-hidden="true" />
        <h3>Saved thread unavailable</h3>
        <p role="alert">{state.message}</p>
        <div className="agent-saved-thread__recovery">
          <button
            ref={actionRef}
            type="button"
            className="btn primary"
            onClick={onRetry}
          >
            Retry
          </button>
          <button type="button" className="btn ghost" onClick={onStartNew}>
            Start new thread
          </button>
          {state.metadata && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (state.metadata) onDismiss(state.metadata);
              }}
            >
              {state.metadata.archived ? "Forget" : "Dismiss"}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <History size={24} aria-hidden="true" />
      <h3>Pick up where you left off</h3>
      <p>
        Resume saved work, or start a new thread. Starting fresh keeps the saved
        conversation available in History.
      </p>
      <div className="agent-saved-threads">
        {state.metadata.map((metadata, index) => {
          const isResuming = state.status === "resuming" &&
            state.sessionId === metadata.sessionId;
          const titleId = `agent-saved-thread-title-${index}`;
          const updatedAt = threadDateLabel(metadata.updatedAt);
          return (
            <section
              key={`${metadata.sessionId}-${metadata.archived ? "archived" : "current"}`}
              className="agent-saved-thread"
              aria-labelledby={titleId}
            >
              {metadata.archived
                ? <ArchiveIcon size={16} aria-hidden="true" />
                : <History size={16} aria-hidden="true" />}
              <div>
                <h4 id={titleId}>
                  {metadata.archived ? "Archived thread" : "Continue previous thread"}
                </h4>
                <span title={metadata.title}>{metadata.title}</span>
                {updatedAt && <small>Updated {updatedAt}</small>}
              </div>
              <div className="agent-saved-thread__actions">
                <button
                  ref={index === 0 ? actionRef : undefined}
                  type="button"
                  className="btn primary"
                  disabled={state.status === "resuming"}
                  onClick={() => onResume(metadata)}
                >
                  {isResuming ? "Resuming..." : "Resume"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={state.status === "resuming"}
                  onClick={() => onDismiss(metadata)}
                >
                  {metadata.archived ? "Forget" : "Dismiss"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <button
        type="button"
        className="btn ghost agent-saved-thread__start-new"
        disabled={state.status === "resuming"}
        onClick={onStartNew}
      >
        Start new thread
      </button>
    </>
  );
}

function EmptyThreadWelcome({
  isStudioAgent,
  onSelectStarter,
}: {
  isStudioAgent: boolean;
  onSelectStarter: (prompt: string, workflow: AgentThreadWorkflow) => void;
}) {
  return (
    <>
      <Bot size={24} aria-hidden="true" />
      <h3>{isStudioAgent ? "Chat with Studio Agent" : "Ask about this bundle"}</h3>
      <p>
        {isStudioAgent
          ? "Studio gives the model canonical OKF guidance, bounded bundle and source tools, and reviewed staging. Proposed files stay in memory until you validate, review, and apply them."
          : "Studio attaches OKF context, read-only access to this bundle, and tools to inspect concepts, trace sources, and validate structure."}
      </p>
      <div className="agent-starters" role="group" aria-label="Start a guided thread">
        {THREAD_STARTERS.map((starter) => {
          const Icon = starter.icon;
          return (
            <button
              key={starter.title}
              type="button"
              className="agent-starter"
              aria-label={`${starter.title}: ${starter.description}`}
              onClick={() => onSelectStarter(starter.prompt, starter.workflow)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>
                <strong>{starter.title}</strong>
                <small>{starter.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function sourceTooltip(source: AttachedSource): string {
  if (source.kind === "issue") return source.content;
  if (source.kind === "selection") {
    const content = Array.from(source.content);
    const excerpt = content.slice(0, 256).join("");
    return `${source.title}: ${excerpt}${content.length > 256 ? "..." : ""}`;
  }
  if (source.warning) return `${source.title}: ${source.warning}`;
  return source.title;
}

const SECURITY_PROFILE_NAMES = {
  "studio-native-mediated-v1": "Studio mediated (v1)",
  "external-interactive-unrestricted-v1": "External interactive (v1)",
  "external-linux-restricted-offline-v1": "Linux restricted offline (v1)",
} satisfies Record<AgentSecurityScopeInfo["profile"]["id"], string>;

const SECURITY_FILE_SCOPE = {
  "studio-tool-mediated-bundle": "Only bounded Studio tools can read the active bundle.",
  "host-operating-system": "Studio tools are bundle-scoped. The ACP process keeps normal OS file access.",
  "system-runtime-agent-and-read-only-bundle": "The process can read its system runtime, executable, and active bundle. Protected bundle paths are hidden.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["effectiveMounts"], string>;

const SECURITY_NETWORK_SCOPE = {
  "configured-endpoint-only": "Studio contacts only the configured model endpoint. No fetch tool is exposed.",
  "host-operating-system": "The ACP process keeps normal OS network access.",
  isolated: "The process has no host network access.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["networkPolicy"], string>;

const SECURITY_WRITE_SCOPE = {
  "reviewed-staging-only": "Writes require an interactive grant and reviewed staging.",
  "host-operating-system-permissions": "Studio-mediated writes require review. The ACP process can bypass that mediation.",
  "private-temporary-only": "Direct writes are limited to private temporary storage. Bundle changes still require reviewed staging.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["writableRoots"], string>;

const SECURITY_CREDENTIAL_SCOPE = {
  "configured-endpoint-only": "Only the configured endpoint can receive its saved API key.",
  "host-operating-system-and-launch-environment": "The process can access its launch environment and credentials available through the OS.",
  "launch-environment-only": "The process receives only the environment variables allowlisted for this launch.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["credentialExposure"], string>;

const SECURITY_STOP_LABELS = {
  disconnect: "disconnect",
  "application-exit": "app exit",
  "host-failure": "host failure",
} satisfies Record<AgentSecurityScopeInfo["profile"]["stopConditions"][number], string>;

function readableSecurityStops(labels: readonly string[]): string {
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

function securityEvidenceCopy(scope: AgentSecurityScopeInfo): string {
  if (scope.evidenceSource === "native-provider-host") {
    return "Produced by Studio's native provider host.";
  }
  if (scope.profile.id === "external-linux-restricted-offline-v1") {
    return "Produced by the ACP launcher after Bubblewrap started the process and Studio attached its process group.";
  }
  return scope.processContainment === "windows-job-object"
    ? "Produced by the ACP launcher after Job Object attachment."
    : "Produced by the ACP launcher after process-group attachment.";
}

function ThreadSecurityScope({
  bundleName,
  scope,
}: {
  bundleName: string | null;
  scope: AgentSecurityScopeInfo;
}) {
  const profile = scope.profile;
  const profileName = SECURITY_PROFILE_NAMES[profile.id];
  const fileScope = SECURITY_FILE_SCOPE[profile.effectiveMounts];
  const networkScope = SECURITY_NETWORK_SCOPE[profile.networkPolicy];
  const writeScope = SECURITY_WRITE_SCOPE[profile.writableRoots];
  const credentialScope = SECURITY_CREDENTIAL_SCOPE[profile.credentialExposure];
  const processScope = {
    "in-process": "No external ACP process runs.",
    "posix-process-group": "Studio owns the agent's POSIX process group and stops it on disconnect.",
    "windows-job-object": "Studio owns a kill-on-close Windows Job Object and stops it on disconnect.",
  }[scope.processContainment];
  const evidenceScope = securityEvidenceCopy(scope);
  const stopConditions = readableSecurityStops(
    profile.stopConditions.map((condition) => SECURITY_STOP_LABELS[condition]),
  );
  const lifetimeScope = stopConditions
    ? `Connection only. Stops on ${stopConditions}.`
    : "Connection only. No stop conditions were reported.";
  const profileScope = `${profileName}. ${profile.unattendedEligible
    ? "Eligible for unattended work."
    : "Unattended work is locked."}`;

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Thread security scope"
            title="Thread security scope"
          >
            <ShieldQuestion size={14} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover agent-security-scope"
            aria-label="Thread security scope"
            tabIndex={0}
          >
            <strong>Thread security scope</strong>
            <dl>
              <div>
                <dt>Bundle</dt>
                <dd>{bundleName ?? "No bundle selected"}</dd>
              </div>
              <div>
                <dt>Profile</dt>
                <dd>{profileScope}</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{fileScope}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{networkScope}</dd>
              </div>
              <div>
                <dt>Writes</dt>
                <dd>{writeScope}</dd>
              </div>
              <div>
                <dt>Credentials</dt>
                <dd>{credentialScope}</dd>
              </div>
              <div>
                <dt>Process</dt>
                <dd>{processScope}</dd>
              </div>
              <div>
                <dt>Lifetime</dt>
                <dd>{lifetimeScope}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{evidenceScope}</dd>
              </div>
            </dl>
            {scope.evidenceSource === "external-process-launcher" && (
              <p>This proves process-tree ownership, not a filesystem or network sandbox.</p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface ThreadTitleEditorProps {
  title: string;
  onTitleChange: (title: string) => void;
}

function ThreadTitleEditor({ title, onTitleChange }: ThreadTitleEditorProps) {
  const titleInputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) setDraft(title);
  }

  function saveTitle(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = draft.replace(/\s+/g, " ").trim();
    if (!nextTitle) return;
    onTitleChange(nextTitle);
    setIsOpen(false);
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon agent-conversation__rename"
            aria-label={`Rename thread: ${title}`}
            title="Rename thread"
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover agent-thread-title"
            aria-label="Rename thread"
            initialFocus={inputRef}
          >
            <form onSubmit={saveTitle}>
              <label htmlFor={titleInputId}>Thread title</label>
              <input
                ref={inputRef}
                id={titleInputId}
                maxLength={MAX_THREAD_TITLE_CHARS}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="agent-thread-title__actions">
                <button type="button" className="btn ghost" onClick={() => setIsOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!draft.trim()}>
                  Save title
                </button>
              </div>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ThreadSurfaceClose({
  disabled,
  onClose,
}: {
  disabled: boolean;
  onClose: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [closeState, setCloseState] = useState<"idle" | "closing">("idle");
  const [closeError, setCloseError] = useState<string | null>(null);

  async function closeThread() {
    setCloseState("closing");
    setCloseError(null);
    try {
      await onClose();
    } catch (error: unknown) {
      setCloseError(errorMessage(error));
      setCloseState("idle");
    }
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Close thread surface"
            title={disabled
              ? "Finish the current thread operation before closing it."
              : "Close this live thread surface"}
            disabled={disabled}
          >
            <X size={14} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover agent-thread-close"
            aria-label="Close thread surface"
          >
            <strong>Close this live thread?</strong>
            <p>
              Its in-memory transcript, draft, and staged review will be removed.
              Agent-owned history is not deleted.
            </p>
            {closeError && <p className="agent-thread-close__error" role="alert">{closeError}</p>}
            <div className="agent-thread-close__actions">
              <button
                type="button"
                className="btn ghost"
                disabled={closeState === "closing"}
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={closeState === "closing"}
                onClick={() => void closeThread()}
              >
                {closeState === "closing" ? "Closing..." : "Close thread"}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface ThreadActionsMenuProps {
  historyAvailable: boolean;
  historyDisabled: boolean;
  exportAvailable: boolean;
  exportDisabled: boolean;
  exportPending: boolean;
  archiveAvailable: boolean;
  archiveDisabled: boolean;
  archiveTitle: string;
  changeDisabled: boolean;
  onOpenHistory: () => void;
  onExport: () => void;
  onArchive: () => void;
  onChangeAgent: () => void;
}

function ThreadActionsMenu({
  historyAvailable,
  historyDisabled,
  exportAvailable,
  exportDisabled,
  exportPending,
  archiveAvailable,
  archiveDisabled,
  archiveTitle,
  changeDisabled,
  onOpenHistory,
  onExport,
  onArchive,
  onChangeAgent,
}: ThreadActionsMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="btn ghost icon"
        data-agent-initial-focus
        aria-label="More thread actions"
        title="More thread actions"
      >
        <Ellipsis aria-hidden="true" size={15} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Menu.Popup className="ui-popover agent-thread-actions" aria-label="Thread actions">
            {historyAvailable && (
              <Menu.Item
                className="agent-thread-actions__item"
                disabled={historyDisabled}
                onClick={onOpenHistory}
              >
                <History aria-hidden="true" size={14} />
                <span>History</span>
              </Menu.Item>
            )}
            {exportAvailable && (
              <Menu.Item
                className="agent-thread-actions__item"
                disabled={exportDisabled}
                onClick={onExport}
              >
                <FileDown aria-hidden="true" size={14} />
                <span>{exportPending ? "Exporting..." : "Export thread"}</span>
              </Menu.Item>
            )}
            {archiveAvailable && (
              <Menu.Item
                className="agent-thread-actions__item"
                disabled={archiveDisabled}
                title={archiveTitle}
                onClick={onArchive}
              >
                <ArchiveIcon aria-hidden="true" size={14} />
                <span>Archive thread</span>
              </Menu.Item>
            )}
            <Menu.Item
              className="agent-thread-actions__item"
              disabled={changeDisabled}
              onClick={onChangeAgent}
            >
              <Bot aria-hidden="true" size={14} />
              <span>Change agent</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function AgentConversation({
  connection,
  bundleRoot,
  bundleName,
  activeConcept,
  onCaptureReaderSelection,
  concepts,
  issues,
  onChangeAgent,
  onConnectionEnd,
  onOpenFolder,
  threadSurfaceCount,
  onThreadTitleChange,
  onCloseThreadSurface,
}: AgentConversationProps) {
  const conversationTitleId = useId();
  const historyTitleId = `${conversationTitleId}-history`;
  const stagedTitleId = `${conversationTitleId}-staged`;
  const bundleFolderInputId = `${conversationTitleId}-bundle-folder`;
  const promptInputId = `${conversationTitleId}-prompt`;
  const supportsHistory = connection.capabilities.sessionList && connection.capabilities.loadSession;
  const isStudioAgent = connection.protocolVersion === "studio-native/1";
  const [threadTitle, setThreadTitle] = useState<ThreadTitle>({
    source: "default",
    value: "New thread",
  });
  const [threadWorkflow, setThreadWorkflow] = useState<AgentThreadWorkflow>(null);
  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [activeTurn, setActiveTurn] = useState<AgentTurnInfo | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [authentication, setAuthentication] = useState<AuthenticationState>({ status: "idle" });
  const [history, setHistory] = useState<HistoryState>({ status: "closed" });
  const [restoringSessionId, setRestoringSessionId] = useState<string | null>(null);
  const [savedThread, setSavedThread] = useState<SavedThreadState>({ status: "none" });
  const [threadMetadataError, setThreadMetadataError] = useState<string | null>(null);
  const [retryableTurnIds, setRetryableTurnIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [retryingTurnId, setRetryingTurnId] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [stagedChanges, setStagedChanges] = useState<AgentStagedChangesInfo | null>(null);
  const [stagedValidation, setStagedValidation] = useState<StagedValidationState>({
    status: "idle",
  });
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageNotice, setStageNotice] = useState<string | null>(null);
  const [isApplyingStage, setIsApplyingStage] = useState(false);
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [freshBundleFolderName, setFreshBundleFolderName] = useState("new-okf-bundle");
  const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
  const [isSettingGrant, setIsSettingGrant] = useState(false);
  const [isPreparingGeneration, setIsPreparingGeneration] = useState(false);
  const [expandedDiff, setExpandedDiff] = useState<
    | { path: string; state: "loading" }
    | { path: string; state: "ready"; diff: AgentStagedFileDiff }
    | { path: string; state: "error"; message: string }
    | null
  >(null);
  const [rejectingStagedPath, setRejectingStagedPath] = useState<string | null>(null);
  const [selectingHunk, setSelectingHunk] = useState<{
    path: string;
    index: number;
  } | null>(null);
  const [attachedConcepts, setAttachedConcepts] = useState<
    { id: string; title: string; type: string }[]
  >([]);
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [promptText, setPromptText] = useState("");
  const [queuedPrompt, setQueuedPrompt] = useState<QueuedPrompt | null>(null);
  const [sourcePickerError, setSourcePickerError] = useState<string | null>(null);
  const [sourcePicker, setSourcePicker] = useState<"files" | "folder" | "images" | null>(null);
  const sessionRef = useRef<AgentSessionInfo | null>(null);
  const completedTurnsRef = useRef(new Set<string>());
  const failedTurnsRef = useRef(new Set<string>());
  const acceptedDraftsRef = useRef(new Map<string, PromptDraft>());
  const metadataSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const messagesRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const stagedValidationRequestRef = useRef(0);
  const stagedDiscardRef = useRef<HTMLButtonElement>(null);
  const queuedEditRef = useRef<HTMLButtonElement>(null);
  const savedThreadActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    messagesElement.scrollTop = messages.length > 0 || pendingPermissions.length > 0
      ? messagesElement.scrollHeight
      : 0;
  }, [messages, pendingPermissions, savedThread.status]);

  useEffect(() => {
    if (savedThread.status === "error") savedThreadActionRef.current?.focus();
  }, [savedThread.status]);

  async function loadSavedThread() {
    if (!bundleRoot || !supportsHistory) {
      setSavedThread({ status: "none" });
      return;
    }
    setSavedThread({ status: "loading" });
    try {
      const metadata = await loadAgentThreadMetadata(bundleRoot, connection.profileId);
      setSavedThread(metadata.length > 0 ? { status: "ready", metadata } : { status: "none" });
    } catch (error: unknown) {
      setSavedThread({ status: "error", message: errorMessage(error) });
    }
  }

  const loadSavedThreadEffect = useEffectEvent(loadSavedThread);

  useEffect(() => {
    void loadSavedThreadEffect();
  }, [bundleRoot, connection.profileId, supportsHistory]);

  function persistThreadMetadata(
    session: AgentSessionInfo,
    title: string,
    archived = false,
    workflow = threadWorkflow,
  ): Promise<AgentThreadMetadata | null> {
    if (!supportsHistory) return Promise.resolve(null);
    setThreadMetadataError(null);
    const operation = metadataSaveQueueRef.current.then(() => saveAgentThreadMetadata({
      bundleRoot: session.bundleRoot,
      profileId: connection.profileId,
      sessionId: session.sessionId,
      title,
      archived,
      workflow,
    }));
    metadataSaveQueueRef.current = operation.then(() => undefined, () => undefined);
    void operation.then(
      () => setSavedThread({ status: "none" }),
      (error: unknown) => setThreadMetadataError(errorMessage(error)),
    );
    return operation;
  }

  const [composerState, submitPrompt, isSubmitting] = useActionState<ComposerState, PromptSubmission>(
    async (_previous, { draft, source, retryTurnId }) => {
      const { text, concepts, sources: draftSources } = draft;
      if (!text) return { status: "error", message: "Enter a message." };
      if (!bundleRoot) return { status: "error", message: "Open an OKF bundle first." };
      const userMessage: ConversationMessage = {
        id: `user-${crypto.randomUUID()}`,
        role: "user",
        text,
      };
      try {
        let session = sessionRef.current;
        let startsNewSession = false;
        if (session?.bundleRoot !== bundleRoot) {
          startsNewSession = true;
          setUsage(null);
          setStagedChanges(null);
          clearStagedValidation();
          setStageError(null);
          setStageNotice(null);
          setExpandedDiff(null);
          setRejectingStagedPath(null);
          setSelectingHunk(null);
          session = await newAgentSession(connection.connectionId, bundleRoot);
          sessionRef.current = session;
          setStagedChanges(session.stagedChanges);
        }
        const contextPaths = concepts.map((concept) => `${concept.id}.md`);
        const sources = draftSources.map(
          ({ title, content, origin, mediaType, sourceDigest, warning, imageData }) => ({
            title,
            content,
            ...(origin ? { origin } : {}),
            ...(mediaType ? { mediaType } : {}),
            ...(sourceDigest ? { sourceDigest } : {}),
            ...(warning ? { warning } : {}),
            ...(imageData ? { imageData } : {}),
          }),
        );
        const turn = await promptAgent(
          connection.connectionId,
          session.sessionId,
          text,
          contextPaths,
          sources,
        );
        acceptedDraftsRef.current.set(turn.turnId, draft);
        if (failedTurnsRef.current.delete(turn.turnId)) {
          setRetryableTurnIds((current) => new Set(current).add(turn.turnId));
        }
        if (source === "retry" && retryTurnId) {
          acceptedDraftsRef.current.delete(retryTurnId);
          setRetryableTurnIds((current) => {
            const next = new Set(current);
            next.delete(retryTurnId);
            return next;
          });
          setRetryErrors((current) => {
            const next = new Map(current);
            next.delete(retryTurnId);
            return next;
          });
        }
        setMessages((current) => {
          const firstTurnItem = current.findIndex((item) =>
            item.id === `plan-${turn.turnId}` || item.id === `agent-${turn.turnId}` ||
            (item.role === "tool" && item.turnId === turn.turnId));
          if (firstTurnItem < 0) return [...current, userMessage];
          return [
            ...current.slice(0, firstTurnItem),
            userMessage,
            ...current.slice(firstTurnItem),
          ];
        });
        const nextTitle = threadTitle.source === "default"
          ? deriveThreadTitle(text, THREAD_STARTERS)
          : threadTitle.value;
        const nextWorkflow = startsNewSession ? workflowForPrompt(text) : threadWorkflow;
        if (threadTitle.source === "default") {
          setThreadTitle({ source: "derived", value: nextTitle });
          onThreadTitleChange(nextTitle);
        }
        setThreadWorkflow(nextWorkflow);
        void persistThreadMetadata(session, nextTitle, false, nextWorkflow);
        setExportState({ status: "idle" });
        if (source === "composer") {
          setAttachedConcepts([]);
          setAttachedSources([]);
          setPromptText("");
        }
        if (!completedTurnsRef.current.delete(turn.turnId)) setActiveTurn(turn);
        return { status: "idle" };
      } catch (error: unknown) {
        if (source === "queue") {
          setAttachedConcepts(concepts);
          setAttachedSources(draftSources);
          setPromptText(text);
        }
        if (source === "retry" && retryTurnId) {
          setRetryErrors((current) => new Map(current).set(retryTurnId, errorMessage(error)));
          return { status: "idle" };
        }
        return { status: "error", message: errorMessage(error) };
      } finally {
        if (source === "retry") setRetryingTurnId(null);
      }
    },
    { status: "idle" },
  );

  function startQueuedPrompt(prompt: QueuedPrompt) {
    setQueuedPrompt(null);
    startTransition(() => submitPrompt({ draft: prompt, source: "queue" }));
  }

  function composerAction(formData: FormData) {
    const promptValue = formData.get("prompt");
    const text = typeof promptValue === "string" ? promptValue.trim() : "";
    const draft: PromptDraft = {
      text,
      concepts: attachedConcepts,
      sources: attachedSources,
    };
    if (activeTurn) {
      if (!text) return;
      setQueuedPrompt({ id: crypto.randomUUID(), ...draft });
      setAttachedConcepts([]);
      setAttachedSources([]);
      setPromptText("");
      setSourcePickerError(null);
      requestAnimationFrame(() => queuedEditRef.current?.focus());
      return;
    }
    startTransition(() => submitPrompt({ draft, source: "composer" }));
  }

  const applyTerminalTurnEvent = useEffectEvent((event: AgentTurnEvent) => {
    completedTurnsRef.current.add(event.turnId);
    if (event.update.kind === "failed") {
      failedTurnsRef.current.add(event.turnId);
      if (acceptedDraftsRef.current.has(event.turnId)) {
        failedTurnsRef.current.delete(event.turnId);
        setRetryableTurnIds((current) => new Set(current).add(event.turnId));
      }
    } else {
      acceptedDraftsRef.current.delete(event.turnId);
      failedTurnsRef.current.delete(event.turnId);
    }
    if (activeTurn?.turnId !== event.turnId) return;
    setActiveTurn(null);
    setIsCancelling(false);
    if (queuedPrompt) startQueuedPrompt(queuedPrompt);
  });
  const updateStagedChangesEffect = useEffectEvent(updateStagedChanges);

  useEffect(() => {
    let stopTurnUpdates: (() => void) | undefined;
    let stopPermissionUpdates: (() => void) | undefined;
    let stopStageUpdates: (() => void) | undefined;
    let stopConnectionUpdates: (() => void) | undefined;
    let isDisposed = false;
    void Promise.all([
      onAgentTurnUpdate((event) => {
        if (event.connectionId !== connection.connectionId) return;
        if (sessionRef.current?.sessionId !== event.sessionId) return;
        if (event.update.kind === "usage") setUsage(event.update);
        else applyTurnEvent(event, setMessages);
        if (event.update.kind === "completed" || event.update.kind === "failed") {
          applyTerminalTurnEvent(event);
        }
      }),
      onAgentPermissionUpdate((event) => {
        if (event.connectionId !== connection.connectionId) return;
        if (sessionRef.current?.sessionId !== event.sessionId) return;
        setPendingPermissions((current) => applyPermissionEvent(current, event));
      }),
      onAgentStageUpdate((event) => {
        if (event.connectionId !== connection.connectionId) return;
        if (sessionRef.current?.sessionId !== event.changes.sessionId) return;
        updateStagedChangesEffect(event.changes);
      }),
      onAgentConnectionState((event) => {
        if (event.connectionId === connection.connectionId) onConnectionEnd(event);
      }),
    ]).then(
      ([stopTurns, stopPermissions, stopStages, stopConnections]) => {
        if (isDisposed) {
          stopTurns();
          stopPermissions();
          stopStages();
          stopConnections();
        } else {
          stopTurnUpdates = stopTurns;
          stopPermissionUpdates = stopPermissions;
          stopStageUpdates = stopStages;
          stopConnectionUpdates = stopConnections;
        }
      },
      (error: unknown) => {
        if (!isDisposed) {
          setMessages((current) => [
            ...current,
            { id: `listener-${crypto.randomUUID()}`, role: "agent", text: `Studio lost the agent event stream. ${errorMessage(error)}` },
          ]);
        }
      },
    );
    return () => {
      isDisposed = true;
      stopTurnUpdates?.();
      stopPermissionUpdates?.();
      stopStageUpdates?.();
      stopConnectionUpdates?.();
    };
  }, [connection.connectionId, onConnectionEnd]);

  async function stopTurn() {
    if (!activeTurn) return;
    setIsCancelling(true);
    try {
      const sent = await cancelAgentTurn(
        activeTurn.connectionId,
        activeTurn.sessionId,
        activeTurn.turnId,
      );
      if (!sent) {
        completedTurnsRef.current.add(activeTurn.turnId);
        setActiveTurn(null);
        setIsCancelling(false);
        if (queuedPrompt) startQueuedPrompt(queuedPrompt);
      }
    } catch (error: unknown) {
      setIsCancelling(false);
      setMessages((current) => [
        ...current,
        { id: `cancel-${crypto.randomUUID()}`, role: "agent", text: `Studio could not stop the turn. ${errorMessage(error)}` },
      ]);
    }
  }

  async function authenticate(methodId: string) {
    setAuthentication({ status: "authenticating", methodId });
    try {
      const authenticated = await authenticateAgent(connection.connectionId, methodId);
      if (!authenticated) {
        setAuthentication({
          status: "error",
          methodId,
          message: "The agent did not complete authentication.",
        });
      } else {
        setAuthentication({ status: "idle" });
      }
    } catch (error: unknown) {
      setAuthentication({ status: "error", methodId, message: errorMessage(error) });
    }
  }

  async function attachLocalSources(kind: "files" | "folder" | "images") {
    setSourcePicker(kind);
    setSourcePickerError(null);
    try {
      const available = 8 - attachedSources.length;
      const sources = await (kind === "files"
        ? pickAgentTextSources(available)
        : kind === "folder"
          ? pickAgentSourceFolder(available)
          : pickAgentImageSources(available));
      setAttachedSources((current) => [
        ...current,
        ...sources.slice(0, 8 - current.length).map((source) => ({
          id: crypto.randomUUID(),
          ...source,
        })),
      ]);
    } catch (error: unknown) {
      setSourcePickerError(errorMessage(error));
    } finally {
      setSourcePicker(null);
    }
  }

  async function toggleWriteGrant() {
    const session = sessionRef.current;
    if (!session || isSettingGrant) return;
    const granted = !(stagedChanges?.granted ?? false);
    setIsSettingGrant(true);
    setStageError(null);
    try {
      const changes = await setAgentWriteGrant(
        connection.connectionId,
        session.sessionId,
        granted,
        "interactive",
      );
      updateStagedChanges(changes);
    } catch (error: unknown) {
      setStageError(errorMessage(error));
    } finally {
      setIsSettingGrant(false);
    }
  }

  async function discardStagedChanges() {
    const session = sessionRef.current;
    if (!session) return;
    setStageError(null);
    try {
      const changes = await discardAgentStagedChanges(
        connection.connectionId,
        session.sessionId,
      );
      updateStagedChanges(changes);
      requestAnimationFrame(() => promptRef.current?.focus());
    } catch (error: unknown) {
      setStageError(errorMessage(error));
    }
  }

  function updateStagedChanges(changes: AgentStagedChangesInfo) {
    setStagedChanges(changes);
    if (changes.files.length > 0 && !changes.canRestore) setStageNotice(null);
    clearStagedValidation();
    setExpandedDiff((current) =>
      current && !changes.files.some((file) => file.path === current.path) ? null : current
    );
  }

  function clearStagedValidation() {
    stagedValidationRequestRef.current += 1;
    setStagedValidation({ status: "idle" });
  }

  async function toggleStagedFileReview(path: string) {
    if (expandedDiff?.path === path && expandedDiff.state === "ready") {
      setExpandedDiff(null);
      return;
    }
    const session = sessionRef.current;
    if (!session || expandedDiff?.state === "loading") return;
    const sessionId = session.sessionId;
    setStageError(null);
    setSelectingHunk(null);
    setExpandedDiff({ path, state: "loading" });
    try {
      const diff = await agentStagedFileDiff(connection.connectionId, sessionId, path);
      if (sessionRef.current?.sessionId !== sessionId) return;
      setExpandedDiff({ path, state: "ready", diff });
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId !== sessionId) return;
      setExpandedDiff({ path, state: "error", message: errorMessage(error) });
    }
  }

  async function setHunkSelection(hunkIndex: number, selected: boolean) {
    const session = sessionRef.current;
    const current = expandedDiff;
    if (!session || current?.state !== "ready" || selectingHunk) return;
    const hunk = current.diff.hunks.find((candidate) => candidate.index === hunkIndex);
    const requiresExplicitChoice = stagedChanges?.mode === "enhance" &&
      current.diff.kind === "modify";
    if (
      !hunk ||
      (hunk.selected === selected && (!requiresExplicitChoice || hunk.reviewed)) ||
      current.diff.truncated
    ) return;
    const sessionId = session.sessionId;
    setSelectingHunk({ path: current.path, index: hunkIndex });
    clearStagedValidation();
    setStageError(null);
    try {
      const diff = await setAgentStagedHunkSelection(
        connection.connectionId,
        sessionId,
        current.path,
        current.diff.revision,
        hunkIndex,
        selected,
      );
      if (sessionRef.current?.sessionId !== sessionId) return;
      setExpandedDiff({ path: current.path, state: "ready", diff });
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId !== sessionId) return;
      setExpandedDiff({ path: current.path, state: "error", message: errorMessage(error) });
    } finally {
      if (sessionRef.current?.sessionId === sessionId) setSelectingHunk(null);
    }
  }

  async function rejectStagedFile(path: string) {
    const session = sessionRef.current;
    if (!session || rejectingStagedPath) return;
    const sessionId = session.sessionId;
    setRejectingStagedPath(path);
    setStageError(null);
    try {
      const changes = await discardAgentStagedFile(
        connection.connectionId,
        sessionId,
        path,
      );
      if (sessionRef.current?.sessionId !== sessionId) return;
      updateStagedChanges(changes);
      requestAnimationFrame(() => {
        if (changes.files.length > 0) stagedDiscardRef.current?.focus();
        else promptRef.current?.focus();
      });
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId === sessionId) setStageError(errorMessage(error));
    } finally {
      if (sessionRef.current?.sessionId === sessionId) setRejectingStagedPath(null);
    }
  }

  async function validateStagedChanges() {
    const session = sessionRef.current;
    if (!session || stagedValidation.status === "loading") return;
    const sessionId = session.sessionId;
    const requestId = stagedValidationRequestRef.current + 1;
    stagedValidationRequestRef.current = requestId;
    setStageError(null);
    setStagedValidation({ status: "loading" });
    try {
      const result = await validateAgentStagedChanges(
        connection.connectionId,
        sessionId,
      );
      if (
        sessionRef.current?.sessionId !== sessionId ||
        stagedValidationRequestRef.current !== requestId
      ) return;
      setStagedValidation({ status: "ready", result });
    } catch (error: unknown) {
      if (
        sessionRef.current?.sessionId !== sessionId ||
        stagedValidationRequestRef.current !== requestId
      ) return;
      setStagedValidation({ status: "error", message: errorMessage(error) });
    }
  }

  async function applyStagedChanges() {
    const session = sessionRef.current;
    if (
      !session || activeTurn || isApplyingStage ||
      stagedValidation.status !== "ready" || stagedValidation.result.errors > 0
    ) return;
    const sessionId = session.sessionId;
    const revision = stagedValidation.result.revision;
    setIsApplyingStage(true);
    setStageError(null);
    setStageNotice(null);
    try {
      const result = await applyAgentStagedChanges(
        connection.connectionId,
        sessionId,
        revision,
      );
      if (sessionRef.current?.sessionId !== sessionId) return;
      updateStagedChanges(result.changes);
      setStageNotice(
        result.appliedFiles === 0
          ? "The rejected staged changes were cleared."
          : `Applied ${result.appliedFiles} file${result.appliedFiles === 1 ? "" : "s"} to the bundle.`,
      );
      requestAnimationFrame(() => promptRef.current?.focus());
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId !== sessionId) return;
      clearStagedValidation();
      setStageError(errorMessage(error));
    } finally {
      setIsApplyingStage(false);
    }
  }

  async function createStagedBundle() {
    const session = sessionRef.current;
    if (
      !session || activeTurn || isCreatingBundle || stagedChanges?.mode !== "create" ||
      stagedValidation.status !== "ready" || stagedValidation.result.errors > 0
    ) return;
    const sessionId = session.sessionId;
    const revision = stagedValidation.result.revision;
    setIsCreatingBundle(true);
    setStageError(null);
    setStageNotice(null);
    try {
      const result = await createAgentStagedBundle(
        connection.connectionId,
        sessionId,
        revision,
        freshBundleFolderName,
      );
      if (!result || sessionRef.current?.sessionId !== sessionId) return;
      updateStagedChanges(result.changes);
      setStageNotice(
        `Created ${result.createdFiles} file${result.createdFiles === 1 ? "" : "s"} in ${result.folderName}.`,
      );
      requestAnimationFrame(() => promptRef.current?.focus());
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId === sessionId) setStageError(errorMessage(error));
    } finally {
      setIsCreatingBundle(false);
    }
  }

  async function restoreCheckpoint() {
    const session = sessionRef.current;
    if (!session || isRestoringCheckpoint || !stagedChanges?.canRestore) return;
    const sessionId = session.sessionId;
    setIsRestoringCheckpoint(true);
    setStageError(null);
    try {
      const result = await restoreAgentStagedCheckpoint(
        connection.connectionId,
        sessionId,
      );
      if (sessionRef.current?.sessionId !== sessionId) return;
      updateStagedChanges(result.changes);
      setStageNotice(
        `Restored ${result.restoredFiles} file${result.restoredFiles === 1 ? "" : "s"} from the checkpoint.`,
      );
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId === sessionId) setStageError(errorMessage(error));
    } finally {
      setIsRestoringCheckpoint(false);
    }
  }

  function stagedReviewLabel(path: string): string {
    if (expandedDiff?.path !== path) return "Review";
    if (expandedDiff.state === "loading") return "Loading...";
    if (expandedDiff.state === "ready") return "Close";
    return "Retry";
  }

  async function loadAttachableThreads(): Promise<AgentThreadMetadata[]> {
    if (!bundleRoot || !supportsHistory) return [];
    const metadata = await loadAgentThreadMetadata(bundleRoot, connection.profileId);
    return metadata.filter((entry) => entry.sessionId !== sessionRef.current?.sessionId);
  }

  async function attachPreviousThread(metadata: AgentThreadMetadata): Promise<void> {
    if (!bundleRoot) throw new Error("Open an OKF bundle first.");
    // A saved pointer never bypasses the live allowlist: the session must
    // appear in a fresh bundle-filtered ACP listing before it is loaded.
    const page = await listAgentSessions(connection.connectionId, bundleRoot);
    const session = page.sessions.find(
      (candidate) => candidate.sessionId === metadata.sessionId,
    );
    if (!session) {
      throw new Error(page.hasMore
        ? "The saved session is not in the agent's first 50 matching sessions."
        : "The agent no longer reports this session for the active bundle.");
    }
    const loaded = await loadAgentSession(
      connection.connectionId,
      bundleRoot,
      metadata.sessionId,
    );
    const source = previousThreadSource(loaded.messages);
    if (!source) throw new Error("The previous thread replayed no text to attach.");
    setAttachedSources((current) => [...current, {
      id: crypto.randomUUID(),
      kind: "thread",
      title: `Thread: ${metadata.title}`,
      content: source.content,
      origin: "Previous thread",
      mediaType: "text/markdown",
      ...(source.truncated
        ? { warning: "Older messages were omitted to fit the source limit." }
        : {}),
    }]);
  }

  const agentName = connection.agent?.title ?? connection.agent?.name ?? "Custom agent";
  const requiresAuthentication = !connection.authenticated && connection.authMethods.length > 0;
  // A live session exists once a user message was accepted (or a restore
  // replayed one); the grant command needs that session ID.
  const hasSession = messages.some((item) => item.role === "user");
  const writeGranted = stagedChanges?.granted ?? false;
  const stagedFileCount = stagedChanges?.files.length ?? 0;
  const stagedSummary = `${stagedFileCount === 1 ? "1 file" : `${stagedFileCount} files`} · not applied to the bundle`;
  const writeGrantTitle = !hasSession
    ? "Send a message to start the session, then allow edits."
    : writeGranted
      ? "Agent edits stage for review; nothing is applied to the bundle."
      : "Writes stay denied until granted for this thread.";
  const attachedIssueKeys = new Set(
    attachedSources.flatMap((source) => source.issueKey ? [source.issueKey] : []),
  );
  let composerStatus = connection.capabilities.promptImage
    ? "Text and images"
    : isStudioAgent
      ? "Scoped tools"
      : "Text only";
  if (activeTurn) composerStatus = "Agent is working";
  if (queuedPrompt) composerStatus = "Follow-up queued";
  if (isSubmitting) composerStatus = "Starting turn";
  const usageLabel = usage ? usageLabels(usage) : null;
  const supportsBundleGeneration = threadWorkflow === "create-bundle" ||
    threadWorkflow === "enhance-bundle";
  const hasReportedWriteAttempt = messages.some(
    (item) => item.role === "tool" && item.changeState === "not-staged",
  );
  const showWriteGrant = supportsBundleGeneration || writeGranted || stagedFileCount > 0 ||
    pendingPermissions.length > 0 || hasReportedWriteAttempt;
  let latestBundleProposalMessageId: string | null = null;
  if (supportsBundleGeneration) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (item.role === "agent" && parseBundleProposal(item.text).status === "ready") {
        latestBundleProposalMessageId = item.id;
        break;
      }
    }
  }
  const threadSurfaceBusy = isSubmitting || activeTurn !== null || isCancelling ||
    authentication.status === "authenticating" || exportState.status === "exporting" ||
    restoringSessionId !== null || isApplyingStage || isCreatingBundle ||
    isRestoringCheckpoint || isSettingGrant || isPreparingGeneration ||
    rejectingStagedPath !== null || selectingHunk !== null;
  const hasArchiveBlockingDraft = promptText.trim().length > 0 ||
    attachedConcepts.length > 0 || attachedSources.length > 0;
  const archiveDisabled = messages.length === 0 || isSubmitting || activeTurn !== null ||
    queuedPrompt !== null || hasArchiveBlockingDraft;
  const archiveTitle = hasArchiveBlockingDraft
    ? "Send or clear the draft before archiving."
    : messages.length === 0
      ? "Send a message before archiving."
      : "Archive this thread and start a new one";
  const changeAgentDisabled = isSubmitting || activeTurn !== null ||
    authentication.status === "authenticating" || exportState.status === "exporting";

  function selectStarter(prompt: string, workflow: AgentThreadWorkflow) {
    if (!promptRef.current) return;
    setThreadWorkflow(workflow);
    setPromptText(prompt);
    promptRef.current.focus();
  }

  function changePromptText(value: string) {
    setPromptText(value);
    if (!value.trim() && !hasSession) setThreadWorkflow(null);
  }

  async function generateBundleProposal() {
    const session = sessionRef.current;
    if (!session || !writeGranted || activeTurn || isSubmitting || isPreparingGeneration) return;
    const mode = threadWorkflow === "create-bundle" ? "create" : "enhance";
    if (stagedFileCount > 0 && stagedChanges?.mode !== mode) return;
    setIsPreparingGeneration(true);
    setStageError(null);
    try {
      const changes = await setAgentStageMode(
        connection.connectionId,
        session.sessionId,
        mode,
      );
      if (sessionRef.current?.sessionId !== session.sessionId) return;
      updateStagedChanges(changes);
      startTransition(() => submitPrompt({
        draft: { text: BUNDLE_GENERATION_PROMPT, concepts: [], sources: [] },
        source: "composer",
      }));
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId === session.sessionId) {
        setStageError(errorMessage(error));
      }
    } finally {
      if (sessionRef.current?.sessionId === session.sessionId) {
        setIsPreparingGeneration(false);
      }
    }
  }

  function editQueuedPrompt() {
    if (!queuedPrompt) return;
    setAttachedConcepts(queuedPrompt.concepts);
    setAttachedSources(queuedPrompt.sources);
    setPromptText(queuedPrompt.text);
    setQueuedPrompt(null);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function removeQueuedPrompt() {
    setQueuedPrompt(null);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  async function exportTranscript() {
    if (messages.length === 0 || exportState.status === "exporting") return;
    if (threadWorkflow === "deep-research") {
      const requirements = researchExportRequirements(messages);
      if (requirements.length > 0) {
        const missing = requirements.length === 2
          ? "a Sources list with a cited link or bundle path and an Inferences section"
          : requirements[0] === "sources"
            ? "a Sources list with a cited link or bundle path"
            : "an Inferences section";
        setExportState({
          status: "error",
          message: `Research export needs ${missing}. Ask the agent to revise the response. Use None when it made no inference.`,
        });
        return;
      }
    }
    if (threadWorkflow === "dataset-change") {
      const requirements = datasetChangeRequirements(messages);
      if (requirements.length > 0) {
        let missing = "a Change Plan with at least one step and an Affected Concepts list with bundle paths";
        if (requirements.length === 1) {
          missing = requirements[0] === "change-plan"
            ? "a Change Plan with at least one step"
            : "an Affected Concepts list with bundle paths";
        }
        setExportState({
          status: "error",
          message: `Dataset change export needs ${missing}. Ask the agent to revise the response before review.`,
        });
        return;
      }
    }
    setExportState({ status: "exporting" });
    try {
      const filename = await exportAgentTranscript(
        transcriptFilename(threadTitle.value),
        transcriptMarkdown(threadTitle.value, bundleName, agentName, messages),
      );
      setExportState(filename ? { status: "success", filename } : { status: "idle" });
    } catch (error: unknown) {
      setExportState({ status: "error", message: `Export failed. ${errorMessage(error)}` });
    }
  }

  async function openHistory() {
    if (!bundleRoot || activeTurn || isSubmitting) return;
    setHistory({ status: "loading" });
    try {
      const page = await listAgentSessions(connection.connectionId, bundleRoot);
      setHistory({ status: "ready", sessions: page.sessions, hasMore: page.hasMore });
    } catch (error: unknown) {
      setHistory({ status: "error", message: errorMessage(error) });
    }
  }

  async function restoreSession(session: AgentSessionHistoryInfo) {
    if (!bundleRoot || restoringSessionId) return;
    setRestoringSessionId(session.sessionId);
    try {
      const loaded = await loadAgentSession(
        connection.connectionId,
        bundleRoot,
        session.sessionId,
      );
      applyRestoredSession(loaded, session.sessionId, session.title ?? "Restored thread", null);
    } catch (error: unknown) {
      setHistory({ status: "error", message: errorMessage(error) });
    } finally {
      setRestoringSessionId(null);
    }
  }

  function applyRestoredSession(
    loaded: AgentLoadedSessionInfo,
    sessionId: string,
    title: string,
    workflow: AgentThreadWorkflow,
  ) {
    sessionRef.current = loaded;
    setMessages(loaded.messages.map((message, index) => ({
      id: `history-${sessionId}-${index}`,
      role: message.role,
      text: message.text,
    })));
    setThreadTitle({ source: "custom", value: title });
    onThreadTitleChange(title);
    setThreadWorkflow(workflow);
    setPendingPermissions([]);
    setUsage(null);
    setQueuedPrompt(null);
    setStagedChanges(loaded.stagedChanges);
    setStageError(null);
    setStageNotice(null);
    setExpandedDiff(null);
    setRejectingStagedPath(null);
    setSelectingHunk(null);
    setAttachedConcepts([]);
    setAttachedSources([]);
    setPromptText("");
    setExportState({ status: "idle" });
    acceptedDraftsRef.current.clear();
    failedTurnsRef.current.clear();
    setRetryableTurnIds(new Set());
    setRetryErrors(new Map());
    setRetryingTurnId(null);
    setSavedThread({ status: "none" });
    setHistory({ status: "closed" });
    void persistThreadMetadata(loaded, title, false, workflow);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  async function resumeSavedThread(metadata: AgentThreadMetadata) {
    if (!bundleRoot || savedThread.status === "resuming") return;
    const savedMetadata = savedThread.status === "ready"
      ? savedThread.metadata
      : [metadata];
    setSavedThread({
      status: "resuming",
      metadata: savedMetadata,
      sessionId: metadata.sessionId,
    });
    try {
      const page = await listAgentSessions(connection.connectionId, bundleRoot);
      const session = page.sessions.find((candidate) => candidate.sessionId === metadata.sessionId);
      if (!session) {
        setSavedThread({
          status: "error",
          metadata,
          message: page.hasMore
            ? "The saved session is not in the agent's first 50 matching sessions. Open History to find it."
            : "The agent no longer reports this session for the active bundle.",
        });
        return;
      }
      const loaded = await loadAgentSession(
        connection.connectionId,
        bundleRoot,
        session.sessionId,
      );
      applyRestoredSession(loaded, session.sessionId, metadata.title, metadata.workflow);
    } catch (error: unknown) {
      setSavedThread({ status: "error", message: errorMessage(error), metadata });
    }
  }

  async function dismissSavedThread(metadata: AgentThreadMetadata) {
    if (!bundleRoot) return;
    try {
      await removeAgentThreadMetadata(
        bundleRoot,
        connection.profileId,
        metadata.sessionId,
      );
      await loadSavedThread();
      requestAnimationFrame(() => promptRef.current?.focus());
    } catch (error: unknown) {
      setSavedThread({ status: "error", message: errorMessage(error) });
    }
  }

  async function retrySavedThreadLoad() {
    if (savedThread.status === "error" && savedThread.metadata) {
      await resumeSavedThread(savedThread.metadata);
      return;
    }
    await loadSavedThread();
    requestAnimationFrame(() => savedThreadActionRef.current?.focus());
  }

  function startFreshThread() {
    setSavedThread({ status: "none" });
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function changeThreadTitle(value: string) {
    setThreadTitle({ source: "custom", value });
    onThreadTitleChange(value);
    const session = sessionRef.current;
    if (session) void persistThreadMetadata(session, value);
  }

  async function archiveThread() {
    const session = sessionRef.current;
    if (!session || messages.length === 0 || activeTurn || isSubmitting ||
      promptText.trim() || attachedConcepts.length > 0 || attachedSources.length > 0 ||
      queuedPrompt) return;
    try {
      const metadata = await persistThreadMetadata(
        session,
        threadTitle.value,
        true,
        threadWorkflow,
      );
      if (!metadata) return;
      sessionRef.current = null;
      completedTurnsRef.current.clear();
      failedTurnsRef.current.clear();
      acceptedDraftsRef.current.clear();
      setThreadTitle({ source: "default", value: "New thread" });
      onThreadTitleChange("New thread");
      setThreadWorkflow(null);
      setMessages([]);
      setExportState({ status: "idle" });
      setActiveTurn(null);
      setPendingPermissions([]);
      setUsage(null);
      setStagedChanges(null);
      setStageError(null);
      setStageNotice(null);
      setExpandedDiff(null);
      setRejectingStagedPath(null);
      setSelectingHunk(null);
      setIsCancelling(false);
      setHistory({ status: "closed" });
      setRestoringSessionId(null);
      setRetryableTurnIds(new Set());
      setRetryingTurnId(null);
      setRetryErrors(new Map());
      setSourcePickerError(null);
      setSourcePicker(null);
      setSavedThread({ status: "ready", metadata: [metadata] });
      requestAnimationFrame(() => savedThreadActionRef.current?.focus());
    } catch {
      // persistThreadMetadata keeps its bounded error beside the toolbar actions.
    }
  }

  async function closeThreadSurface() {
    const session = sessionRef.current;
    if (session && writeGranted) {
      await setAgentWriteGrant(
        connection.connectionId,
        session.sessionId,
        false,
        "interactive",
      );
    }
    if (session && stagedFileCount > 0) {
      await discardAgentStagedChanges(connection.connectionId, session.sessionId);
    }
    onCloseThreadSurface();
  }

  function retryAcceptedTurn(turnId: string) {
    const draft = acceptedDraftsRef.current.get(turnId);
    if (!draft || activeTurn || isSubmitting || retryingTurnId) return;
    setRetryErrors((current) => {
      const next = new Map(current);
      next.delete(turnId);
      return next;
    });
    setRetryingTurnId(turnId);
    startTransition(() => submitPrompt({ draft, source: "retry", retryTurnId: turnId }));
  }

  return (
    <section className="agent-conversation" aria-labelledby={conversationTitleId}>
      <header className="agent-conversation__toolbar">
        <h2 id={conversationTitleId} className="sr-only">{threadTitle.value}</h2>
        <div
          className="agent-conversation__toolbar-actions"
          role="toolbar"
          aria-label={`${threadTitle.value} actions`}
        >
          <ThreadTitleEditor
            title={threadTitle.value}
            onTitleChange={changeThreadTitle}
          />
          <ThreadSecurityScope bundleName={bundleName} scope={connection.securityScope} />
          {bundleRoot && !requiresAuthentication && showWriteGrant && (
            <button
              type="button"
              className={`btn ghost agent-conversation__write-grant${writeGranted ? " agent-conversation__write-grant--on" : ""}`}
              aria-pressed={writeGranted}
              aria-label="Allow edits in this thread"
              title={writeGrantTitle}
              disabled={!hasSession || isSettingGrant}
              onClick={() => void toggleWriteGrant()}
            >
              <Pencil aria-hidden="true" size={14} />
              <span className="agent-conversation__action-label">
                {writeGranted ? "Edits allowed" : "Allow edits"}
              </span>
            </button>
          )}
          {threadSurfaceCount > 1 && (
            <ThreadSurfaceClose
              disabled={threadSurfaceBusy}
              onClose={closeThreadSurface}
            />
          )}
          <ThreadActionsMenu
            historyAvailable={supportsHistory && bundleRoot !== null &&
              !requiresAuthentication && history.status === "closed"}
            historyDisabled={isSubmitting || activeTurn !== null || restoringSessionId !== null}
            exportAvailable={messages.length > 0 || exportState.status !== "idle"}
            exportDisabled={isSubmitting || activeTurn !== null || exportState.status === "exporting"}
            exportPending={exportState.status === "exporting"}
            archiveAvailable={supportsHistory && messages.length > 0}
            archiveDisabled={archiveDisabled}
            archiveTitle={archiveTitle}
            changeDisabled={changeAgentDisabled}
            onOpenHistory={() => void openHistory()}
            onExport={() => void exportTranscript()}
            onArchive={() => void archiveThread()}
            onChangeAgent={onChangeAgent}
          />
        </div>
      </header>

      {(exportState.status === "success" || exportState.status === "error" || threadMetadataError) && (
        <div className="agent-conversation__notices">
          {exportState.status === "success" && (
            <p className="agent-conversation__export-status agent-conversation__export-status--success" role="status">
              Exported {exportState.filename}
            </p>
          )}
          {exportState.status === "error" && (
            <p className="agent-conversation__export-status agent-conversation__export-status--error" role="alert">
              {exportState.message}
            </p>
          )}
          {threadMetadataError && (
            <p className="agent-conversation__export-status agent-conversation__export-status--error" role="alert">
              Thread metadata was not saved. {threadMetadataError}
            </p>
          )}
        </div>
      )}

      {!bundleRoot && (
        <div className="agent-conversation__state">
          <h3>Open a bundle to start</h3>
          <p>Sessions use one bundle root as their working directory.</p>
          <button type="button" className="btn" onClick={() => void onOpenFolder()}>
            Open folder
          </button>
        </div>
      )}

      {requiresAuthentication && (
        <div className="agent-conversation__state agent-authentication">
          <h3>Authentication required</h3>
          <p>The agent owns sign-in and credentials. Studio sends only the method you choose.</p>
          <div className="agent-authentication__methods">
            {connection.authMethods.map((method) => (
              <div key={method.id} className="agent-authentication__method">
                <div>
                  <strong>{method.name}</strong>
                  {method.description && <p>{method.description}</p>}
                </div>
                <button
                  type="button"
                  className="btn primary"
                  disabled={authentication.status === "authenticating"}
                  onClick={() => void authenticate(method.id)}
                >
                  {authentication.status === "authenticating" &&
                  authentication.methodId === method.id
                    ? "Waiting..."
                    : "Continue"}
                </button>
              </div>
            ))}
          </div>
          {authentication.status === "error" && (
            <p className="agent-authentication__error" role="alert">
              Authentication failed. {authentication.message}
            </p>
          )}
        </div>
      )}

      {bundleRoot && !requiresAuthentication && history.status !== "closed" && (
        <section className="agent-history" aria-labelledby={historyTitleId}>
          <header>
            <div>
              <h3 id={historyTitleId}>Agent session history</h3>
              <p>Sessions reported by this agent for the active bundle.</p>
            </div>
            <div className="agent-history__actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setHistory({ status: "closed" })}
              >
                <ChevronLeft aria-hidden="true" size={14} />
                Back
              </button>
              <button
                type="button"
                className="btn ghost icon"
                aria-label="Refresh agent session history"
                title="Refresh"
                disabled={history.status === "loading" || restoringSessionId !== null}
                onClick={() => void openHistory()}
              >
                <RotateCcw aria-hidden="true" size={14} />
              </button>
            </div>
          </header>
          {history.status === "loading" && <p role="status">Loading agent sessions...</p>}
          {history.status === "error" && (
            <div className="agent-history__state">
              <p role="alert">History unavailable. {history.message}</p>
              <button type="button" className="btn" onClick={() => void openHistory()}>Retry</button>
            </div>
          )}
          {history.status === "ready" && history.sessions.length === 0 && (
            <div className="agent-history__state">
              <p>This agent has no sessions for the active bundle.</p>
            </div>
          )}
          {history.status === "ready" && history.sessions.length > 0 && (
            <>
              <ul className="agent-history__list">
                {history.sessions.map((session) => {
                  const updatedAt = historyDateLabel(session.updatedAt);
                  return (
                    <li key={session.sessionId}>
                      <div>
                        <strong>{session.title ?? "Untitled session"}</strong>
                        {updatedAt && <span>{updatedAt}</span>}
                      </div>
                      <button
                        type="button"
                        className="btn"
                        disabled={restoringSessionId !== null}
                        onClick={() => void restoreSession(session)}
                      >
                        {restoringSessionId === session.sessionId ? "Restoring..." : "Restore"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {history.hasMore && (
                <p className="agent-history__limit">Showing the first 50 matching sessions.</p>
              )}
            </>
          )}
        </section>
      )}

      {bundleRoot && !requiresAuthentication && history.status === "closed" && (
        <>
          <div ref={messagesRef} className="agent-conversation__messages" aria-live="polite">
            {messages.length === 0 && pendingPermissions.length === 0 ? (
              <div className="agent-conversation__welcome">
                {savedThread.status === "none" ? (
                  <EmptyThreadWelcome
                    isStudioAgent={isStudioAgent}
                    onSelectStarter={selectStarter}
                  />
                ) : (
                  <SavedThreadWelcome
                    state={savedThread}
                    actionRef={savedThreadActionRef}
                    onResume={(metadata) => void resumeSavedThread(metadata)}
                    onDismiss={(metadata) => void dismissSavedThread(metadata)}
                    onRetry={() => void retrySavedThreadLoad()}
                    onStartNew={startFreshThread}
                  />
                )}
              </div>
            ) : (
              <>
                {messages.map((item) => {
                  const turnId = item.role === "status" ? item.turnId : undefined;
                  return (
                    <ConversationItemView
                      key={item.id}
                      item={item}
                      onRetry={
                        turnId && retryableTurnIds.has(turnId)
                          ? () => retryAcceptedTurn(turnId)
                          : undefined
                      }
                      isRetrying={turnId === retryingTurnId}
                      retryError={turnId ? retryErrors.get(turnId) ?? null : null}
                      onGenerateProposal={item.id === latestBundleProposalMessageId
                        ? () => void generateBundleProposal()
                        : undefined}
                      generationBlockedReason={item.id === latestBundleProposalMessageId
                        ? !writeGranted
                          ? "Allow edits for this thread before generating staged files."
                          : stagedFileCount > 0 && stagedChanges?.mode !== (
                              threadWorkflow === "create-bundle" ? "create" : "enhance"
                            )
                            ? "Resolve the current staged changes before generating this proposal."
                            : null
                        : null}
                      isGeneratingProposal={
                        item.id === latestBundleProposalMessageId &&
                        (isSubmitting || isPreparingGeneration)
                      }
                    />
                  );
                })}
                {pendingPermissions.map((permission) => (
                  <PermissionCard key={permission.requestId} permission={permission} />
                ))}
              </>
            )}
          </div>
          {stagedChanges && stagedChanges.files.length > 0 && (
            <section className="agent-staged" aria-labelledby={stagedTitleId}>
              <header>
                <strong id={stagedTitleId}>
                  {stagedChanges.mode === "create"
                    ? "Fresh bundle draft"
                    : stagedChanges.mode === "enhance"
                      ? "Enhancement draft"
                      : "Staged changes"}
                </strong>
                <span title={stagedSummary}>{stagedSummary}</span>
                <div className="agent-staged__actions">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={stagedValidation.status === "loading" || isApplyingStage}
                    onClick={() => void validateStagedChanges()}
                  >
                    {stagedValidation.status === "loading"
                      ? "Validating..."
                      : stagedValidation.status === "error"
                        ? "Retry validation"
                        : "Validate"}
                  </button>
                  <button
                    ref={stagedDiscardRef}
                    type="button"
                    className="btn ghost"
                    disabled={isApplyingStage}
                    onClick={() => void discardStagedChanges()}
                  >
                    Discard all
                  </button>
                </div>
              </header>
              <ul>
                {stagedChanges.files.map((file, index) => {
                  const isExpanded = expandedDiff?.path === file.path;
                  const diffId = `agent-staged-diff-${index}`;
                  return (
                    <li key={file.path}>
                      <div className="agent-staged__file-row">
                        <FileText size={14} aria-hidden="true" />
                        <span title={file.path}>{file.path}</span>
                        <small>
                          {file.kind === "create"
                            ? "New file"
                            : stagedChanges.mode === "enhance"
                              ? "Modified · explicit review required"
                              : "Modified"} · {stagedBytesLabel(file.bytes)}
                        </small>
                        <div className="agent-staged__file-actions">
                          <button
                            type="button"
                            className="btn ghost"
                            aria-label={`${stagedReviewLabel(file.path)} staged file ${file.path}`}
                            aria-expanded={isExpanded}
                            aria-controls={diffId}
                            disabled={isApplyingStage || expandedDiff?.state === "loading" || rejectingStagedPath !== null}
                            onClick={() => void toggleStagedFileReview(file.path)}
                          >
                            {stagedReviewLabel(file.path)}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={isApplyingStage || rejectingStagedPath !== null || expandedDiff?.state === "loading"}
                            aria-label={`Reject staged file ${file.path}`}
                            onClick={() => void rejectStagedFile(file.path)}
                          >
                            {rejectingStagedPath === file.path ? "Rejecting..." : "Reject"}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <section
                          id={diffId}
                          className="agent-staged__diff"
                          aria-label={`Review ${file.path}`}
                        >
                          {expandedDiff.state === "loading" && (
                            <p role="status">Loading staged diff...</p>
                          )}
                          {expandedDiff.state === "error" && (
                            <p role="alert">Diff unavailable. {expandedDiff.message}</p>
                          )}
                          {expandedDiff.state === "ready" && (
                            <>
                              <div
                                className="agent-staged__hunks"
                                aria-label={`Unified diff for ${file.path}`}
                              >
                                {expandedDiff.diff.hunks.map((hunk) => (
                                  <section
                                    key={hunk.index}
                                    className={`agent-staged__hunk${!hunk.reviewed && file.kind === "modify" && stagedChanges.mode === "enhance" ? " agent-staged__hunk--unreviewed" : ""}${hunk.selected ? "" : " agent-staged__hunk--rejected"}`}
                                    aria-labelledby={`${diffId}-hunk-${hunk.index}`}
                                  >
                                    <header>
                                      <code id={`${diffId}-hunk-${hunk.index}`}>{hunk.header}</code>
                                      <div
                                        className="agent-staged__hunk-actions"
                                        role="group"
                                        aria-label={`Hunk ${hunk.index + 1} choice`}
                                      >
                                        <button
                                          type="button"
                                          className="btn ghost"
                                          aria-pressed={
                                            hunk.selected && (
                                              hunk.reviewed || file.kind !== "modify" ||
                                              stagedChanges.mode !== "enhance"
                                            )
                                          }
                                          disabled={isApplyingStage || selectingHunk !== null}
                                          onClick={() => void setHunkSelection(hunk.index, true)}
                                        >
                                          Keep
                                        </button>
                                        <button
                                          type="button"
                                          className="btn ghost"
                                          aria-pressed={
                                            !hunk.selected && (
                                              hunk.reviewed || file.kind !== "modify" ||
                                              stagedChanges.mode !== "enhance"
                                            )
                                          }
                                          disabled={isApplyingStage || selectingHunk !== null}
                                          onClick={() => void setHunkSelection(hunk.index, false)}
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    </header>
                                    {!hunk.reviewed && file.kind === "modify" &&
                                      stagedChanges.mode === "enhance" && (
                                      <p>Choose Keep or Reject before this enhancement can validate.</p>
                                    )}
                                    <pre>
                                      {hunk.unified.split("\n").map((line, lineIndex) => {
                                        let className = "agent-staged__diff-line";
                                        if (line.startsWith("+")) {
                                          className += " agent-staged__diff-line--added";
                                        } else if (line.startsWith("-")) {
                                          className += " agent-staged__diff-line--removed";
                                        } else if (line.startsWith("@@")) {
                                          className += " agent-staged__diff-line--hunk";
                                        }
                                        return <span key={lineIndex} className={className}>{line || " "}</span>;
                                      })}
                                    </pre>
                                  </section>
                                ))}
                              </div>
                              {expandedDiff.diff.truncated && (
                                <p role="status">
                                  Diff truncated at the review limit. Hunk choices are unavailable.
                                </p>
                              )}
                            </>
                          )}
                        </section>
                      )}
                    </li>
                  );
                })}
              </ul>
              {stagedValidation.status === "loading" && (
                <p role="status">Validating the selected staged tree...</p>
              )}
              {stagedValidation.status === "error" && (
                <p className="agent-staged__validation-error" role="alert">
                  Validation blocked. {stagedValidation.message}
                </p>
              )}
              {stagedValidation.status === "ready" && (
                <section
                  className={`agent-staged__validation agent-staged__validation--${stagedValidation.result.errors === 0 ? "passed" : "failed"}`}
                >
                  <div
                    aria-label="Staged validation result"
                    role={stagedValidation.result.errors === 0 ? "status" : "alert"}
                  >
                    {stagedValidation.result.errors === 0
                      ? <Check size={14} aria-hidden="true" />
                      : <CircleAlert size={14} aria-hidden="true" />}
                    <strong>
                      {stagedValidation.result.errors === 0
                        ? "Validation passed"
                        : "Validation found errors"}
                    </strong>
                    <span>
                      {stagedValidation.result.errors} error{stagedValidation.result.errors === 1 ? "" : "s"}
                      {" · "}
                      {stagedValidation.result.warnings} warning{stagedValidation.result.warnings === 1 ? "" : "s"}
                    </span>
                  </div>
                  {stagedValidation.result.issues.length > 0 && (
                    <details>
                      <summary>Review validation issues</summary>
                      <ul>
                        {stagedValidation.result.issues.map((issue, index) => (
                          <li key={`${issue.path ?? "bundle"}-${issue.level}-${index}`}>
                            <span className={`agent-staged__validation-level agent-staged__validation-level--${issue.level}`}>
                              {issue.level}
                            </span>
                            <span>
                              {issue.path && <code>{issue.path}: </code>}
                              {issue.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {stagedValidation.result.truncated && (
                        <p>More issues were omitted at the display limit.</p>
                      )}
                    </details>
                  )}
                  <StagedGraphPreview preview={stagedValidation.result.preview} />
                  {stagedValidation.result.errors === 0 && stagedChanges.mode !== "create" && (
                    <div className="agent-staged__apply">
                      <span>
                        Studio will recheck every file before replacing the bundle contents.
                      </span>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={activeTurn !== null || isApplyingStage}
                        title={activeTurn ? "Wait for the current agent turn to finish." : undefined}
                        onClick={() => void applyStagedChanges()}
                      >
                        {isApplyingStage ? "Applying..." : "Apply changes"}
                      </button>
                    </div>
                  )}
                  {stagedValidation.result.errors === 0 && stagedChanges.mode === "create" && (
                    <div className="agent-staged__destination">
                      <p>
                        Studio creates a new folder below the parent you choose. Existing folders
                        are never merged with or replaced.
                      </p>
                      <label htmlFor={bundleFolderInputId}>Bundle folder name</label>
                      <div>
                        <input
                          id={bundleFolderInputId}
                          type="text"
                          value={freshBundleFolderName}
                          maxLength={128}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={isCreatingBundle}
                          onChange={(event) => setFreshBundleFolderName(event.target.value)}
                        />
                        <button
                          type="button"
                          className="btn primary"
                          disabled={
                            activeTurn !== null || isCreatingBundle ||
                            freshBundleFolderName.length === 0
                          }
                          onClick={() => void createStagedBundle()}
                        >
                          {isCreatingBundle ? "Creating..." : "Choose parent and create"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              <p>Review or reject staged files, then validate the selected result.</p>
            </section>
          )}
          {stageError && (
            <p className="agent-composer__error" role="alert">{stageError}</p>
          )}
          {stagedChanges?.canRestore && (
            <div className="agent-composer__checkpoint" role="status">
              <span>{stageNotice ?? "The latest apply has a restorable checkpoint."}</span>
              <button
                type="button"
                className="btn ghost"
                disabled={isRestoringCheckpoint || stagedChanges.files.length > 0}
                title={stagedChanges.files.length > 0
                  ? "Resolve the current staged changes before restoring."
                  : undefined}
                onClick={() => void restoreCheckpoint()}
              >
                {isRestoringCheckpoint ? "Restoring..." : "Restore"}
              </button>
            </div>
          )}
          {stageNotice && !stagedChanges?.canRestore && (
            <p className="agent-composer__notice" role="status">{stageNotice}</p>
          )}
          <form ref={composerRef} className="agent-composer" action={composerAction}>
            {queuedPrompt && (
              <section className="agent-queue" aria-labelledby={`queued-prompt-${queuedPrompt.id}`}>
                <div>
                  <strong id={`queued-prompt-${queuedPrompt.id}`}>Next message</strong>
                  <span>
                    {queuedPrompt.concepts.length + queuedPrompt.sources.length > 0
                      ? `${queuedPrompt.concepts.length + queuedPrompt.sources.length} attachment${queuedPrompt.concepts.length + queuedPrompt.sources.length === 1 ? "" : "s"}`
                      : "No attachments"}
                  </span>
                </div>
                <p title={queuedPrompt.text}>{queuedPrompt.text}</p>
                <div className="agent-queue__actions">
                  <button ref={queuedEditRef} type="button" className="btn ghost" onClick={editQueuedPrompt}>
                    Edit
                  </button>
                  <button type="button" className="btn ghost" onClick={removeQueuedPrompt}>
                    Remove
                  </button>
                </div>
              </section>
            )}
            {attachedConcepts.length + attachedSources.length > 0 && (
              <div className="agent-composer__context">
                {attachedConcepts.map((concept) => (
                  <span key={concept.id} className="agent-context-chip">
                    <FileText size={14} aria-hidden="true" />
                    <span title={concept.title}>{concept.title}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${concept.title} from context`}
                      disabled={isSubmitting || queuedPrompt !== null}
                      onClick={() =>
                        setAttachedConcepts((current) =>
                          current.filter((candidate) => candidate.id !== concept.id),
                        )
                      }
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {attachedSources.map((source) => (
                  <span key={source.id} className="agent-context-chip">
                    {source.warning || source.kind === "issue" ? (
                      <TriangleAlert
                        className={
                          source.issueLevel === "error"
                            ? "agent-context-chip__error-icon"
                            : "agent-context-chip__warning-icon"
                        }
                        size={14}
                        aria-hidden="true"
                      />
                    ) : source.kind === "selection" ? (
                      <TextSelect size={14} aria-hidden="true" />
                    ) : source.kind === "thread" ? (
                      <History size={14} aria-hidden="true" />
                    ) : source.imageData ? (
                      <ImageIcon size={14} aria-hidden="true" />
                    ) : (
                      <FileText size={14} aria-hidden="true" />
                    )}
                    <span title={sourceTooltip(source)}>
                      {source.title}
                      {source.warning && <span className="sr-only"> Warning: {source.warning}</span>}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${source.title} source`}
                      disabled={isSubmitting || queuedPrompt !== null}
                      onClick={() =>
                        setAttachedSources((current) =>
                          current.filter((candidate) => candidate.id !== source.id),
                        )
                      }
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {composerState.status === "error" && (
              <div className="agent-composer__error-row">
                <p className="agent-composer__error" role="alert">{composerState.message}</p>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={isSubmitting || promptText.trim().length === 0}
                  onClick={() => composerRef.current?.requestSubmit()}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}
            {sourcePickerError && (
              <p className="agent-composer__error" role="alert">{sourcePickerError}</p>
            )}
            <div className="agent-composer__input-shell">
              <label className="sr-only" htmlFor={promptInputId}>Message the agent</label>
              <textarea
                ref={promptRef}
                id={promptInputId}
                name="prompt"
                rows={3}
                maxLength={128 * 1024}
                placeholder={isStudioAgent ? "Message Studio Agent..." : "Ask about this bundle..."}
                disabled={isSubmitting || queuedPrompt !== null}
                value={promptText}
                onChange={(event) => changePromptText(event.target.value)}
              />
              <div className="agent-composer__actions">
                <div className="agent-composer__leading-actions">
                  <AttachmentPicker
                    concepts={concepts}
                    activeConceptId={activeConcept?.id ?? null}
                    attachedConcepts={attachedConcepts}
                    issues={issues}
                    attachedIssueKeys={attachedIssueKeys}
                    sourceCount={attachedSources.length}
                    onCaptureReaderSelection={onCaptureReaderSelection}
                    disabled={isSubmitting || queuedPrompt !== null}
                    bundleAttachmentsSupported={!isStudioAgent}
                    imageSupported={connection.capabilities.promptImage}
                    threadSupport={!supportsHistory ? "unsupported" : activeTurn ? "busy" : "ready"}
                    onLoadThreads={loadAttachableThreads}
                    onThreadAttach={attachPreviousThread}
                    nativePicker={sourcePicker}
                    onConceptAttach={(concept) =>
                      setAttachedConcepts((current) => [...current, concept])
                    }
                    onIssueAttach={(issue, issueKey) =>
                      setAttachedSources((current) => [
                        ...current,
                        {
                          id: crypto.randomUUID(),
                          kind: "issue",
                          issueKey,
                          issueLevel: issue.level,
                          title: `${issue.level === "error" ? "Error" : "Warning"}: ${issue.conceptId ?? "bundle"}`,
                          content: issue.message,
                          origin: issue.conceptId ? `${issue.conceptId}.md` : "Bundle validation",
                          mediaType: "text/plain",
                        },
                      ])
                    }
                    onSourceAttach={(source, kind) =>
                      setAttachedSources((current) => [
                        ...current,
                        { id: crypto.randomUUID(), kind, ...source },
                      ])
                    }
                    onNativePick={(kind) => void attachLocalSources(kind)}
                  />
                  <span className="agent-composer__status" title={composerStatus}>
                    {composerStatus}
                  </span>
                  {usageLabel && (
                    <span
                      className="agent-composer__usage"
                      aria-label={usageLabel.detail}
                      title={usageLabel.detail}
                    >
                      {usageLabel.visible}
                    </span>
                  )}
                </div>
                {activeTurn ? (
                  <div className="agent-composer__turn-actions">
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={isSubmitting || queuedPrompt !== null || promptText.trim().length === 0}
                    >
                      <Send size={14} aria-hidden="true" />
                      {queuedPrompt ? "Queued" : "Queue"}
                    </button>
                    <button type="button" className="btn" disabled={isCancelling} onClick={() => void stopTurn()}>
                      <Square size={14} aria-hidden="true" />
                      {isCancelling ? "Stopping..." : "Stop"}
                    </button>
                  </div>
                ) : (
                  <button type="submit" className="btn primary" disabled={isSubmitting}>
                    <Send size={16} aria-hidden="true" />
                    {isSubmitting ? "Sending..." : "Send"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

function validationIssueKey(issue: Issue): string {
  return JSON.stringify([issue.level, issue.conceptId, issue.message]);
}

type AttachmentView = "menu" | "concepts" | "issues" | "source" | "threads";
type NativeSourcePicker = "files" | "folder" | "images";
type ThreadPickerState =
  | { status: "loading" }
  | { status: "ready"; threads: readonly AgentThreadMetadata[] }
  | { status: "error"; message: string };

interface AttachmentPickerProps {
  concepts: readonly { id: string; title: string; type: string }[];
  activeConceptId: string | null;
  attachedConcepts: readonly { id: string; title: string; type: string }[];
  issues: readonly Issue[];
  attachedIssueKeys: ReadonlySet<string>;
  sourceCount: number;
  onCaptureReaderSelection: () => ReaderSelectionCapture;
  disabled: boolean;
  bundleAttachmentsSupported: boolean;
  imageSupported: boolean;
  threadSupport: ThreadAttachSupport;
  onLoadThreads: () => Promise<AgentThreadMetadata[]>;
  onThreadAttach: (metadata: AgentThreadMetadata) => Promise<void>;
  nativePicker: NativeSourcePicker | null;
  onConceptAttach: (concept: { id: string; title: string; type: string }) => void;
  onIssueAttach: (issue: Issue, issueKey: string) => void;
  onSourceAttach: (source: AgentSourceInput, kind?: "selection") => void;
  onNativePick: (kind: NativeSourcePicker) => void;
}

function AttachmentPicker({
  concepts,
  activeConceptId,
  attachedConcepts,
  issues,
  attachedIssueKeys,
  sourceCount,
  onCaptureReaderSelection,
  disabled,
  bundleAttachmentsSupported,
  imageSupported,
  threadSupport,
  onLoadThreads,
  onThreadAttach,
  nativePicker,
  onConceptAttach,
  onIssueAttach,
  onSourceAttach,
  onNativePick,
}: AttachmentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<AttachmentView>("menu");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"paste" | "url">("paste");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [threadPicker, setThreadPicker] = useState<ThreadPickerState>({ status: "loading" });
  const [attachingThreadId, setAttachingThreadId] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [readerSelection, setReaderSelection] = useState<ReaderSelectionCapture>({
    status: "unavailable",
    reason: "Select text in the reader first.",
  });
  const fetchRequestRef = useRef(0);
  const threadRequestRef = useRef(0);
  const menuFirstRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const isAtLimit = sourceCount >= 8;
  const canAttach = title.trim().length > 0 && content.trim().length > 0;
  const canFetch = url.trim().startsWith("https://") && !isFetching;

  useEffect(() => {
    if (!isOpen) return;
    let focusFrame = 0;
    const renderFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        if (view === "menu") {
          menuFirstRef.current?.focus();
          return;
        }
        popupRef.current
          ?.querySelector<HTMLElement>("[data-attachment-initial-focus]")
          ?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(renderFrame);
      cancelAnimationFrame(focusFrame);
    };
  }, [isOpen, mode, view]);

  const attachedIds = new Set(attachedConcepts.map((concept) => concept.id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingConcepts = concepts
    .filter((concept) => !attachedIds.has(concept.id))
    .filter((concept) =>
      normalizedQuery.length === 0
        ? true
        : `${concept.title} ${concept.id} ${concept.type}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
    )
    .sort((left, right) => {
      if (left.id === activeConceptId) return -1;
      if (right.id === activeConceptId) return 1;
      return left.title.localeCompare(right.title);
    });
  const availableIssues = issues.filter(
    (issue) => !attachedIssueKeys.has(validationIssueKey(issue)),
  );
  let issueExplanation = "Attach a validation finding to the next message.";
  if (!bundleAttachmentsSupported) {
    issueExplanation = "Use the local agent's read-only validation tool.";
  } else if (issues.length === 0) issueExplanation = "This bundle has no validation issues.";
  else if (availableIssues.length === 0) issueExplanation = "All validation issues are attached.";
  else if (isAtLimit) issueExplanation = "The source limit has been reached.";
  const selectionExplanation = !bundleAttachmentsSupported
    ? "Reader selections are not available to Studio Agent connections yet."
    : isAtLimit
      ? "The source limit has been reached."
      : readerSelection.status === "available"
        ? "Attach the selected text from the current concept"
        : readerSelection.reason;
  const threadExplanation = threadSupport === "unsupported"
    ? "This agent does not expose session history."
    : isAtLimit
      ? "The source limit has been reached."
      : threadSupport === "busy"
        ? "Wait for the active turn to finish."
        : "Attach a saved thread as source evidence";

  function close() {
    fetchRequestRef.current += 1;
    threadRequestRef.current += 1;
    setIsOpen(false);
    setView("menu");
    setQuery("");
    setMode("paste");
    setTitle("");
    setContent("");
    setUrl("");
    setUrlError(null);
    setIsFetching(false);
    setThreadPicker({ status: "loading" });
    setAttachingThreadId(null);
    setThreadError(null);
  }

  function openView(nextView: AttachmentView) {
    setView(nextView);
  }

  async function openThreads() {
    setView("threads");
    const requestId = ++threadRequestRef.current;
    setThreadPicker({ status: "loading" });
    setThreadError(null);
    try {
      const threads = await onLoadThreads();
      if (threadRequestRef.current !== requestId) return;
      setThreadPicker({ status: "ready", threads });
    } catch (error) {
      if (threadRequestRef.current !== requestId) return;
      setThreadPicker({ status: "error", message: errorMessage(error) });
    }
    // The list arrives after the subview rendered, so the mount-time focus
    // pass found nothing; move focus once results (or Back, when empty) exist.
    requestAnimationFrame(() => {
      const popup = popupRef.current;
      if (!popup || threadRequestRef.current !== requestId) return;
      const target = popup.querySelector<HTMLElement>("[data-attachment-initial-focus]")
        ?? popup.querySelector<HTMLElement>("button");
      target?.focus();
    });
  }

  async function attachThread(metadata: AgentThreadMetadata) {
    if (attachingThreadId) return;
    const requestId = ++threadRequestRef.current;
    setAttachingThreadId(metadata.sessionId);
    setThreadError(null);
    try {
      await onThreadAttach(metadata);
      if (threadRequestRef.current !== requestId) return;
      close();
    } catch (error) {
      if (threadRequestRef.current !== requestId) return;
      setAttachingThreadId(null);
      setThreadError(errorMessage(error));
    }
  }

  function attach() {
    if (!canAttach) return;
    onSourceAttach({ title: title.trim(), content });
    close();
  }

  async function fetchSource() {
    if (!canFetch) return;
    const requestId = ++fetchRequestRef.current;
    setIsFetching(true);
    setUrlError(null);
    try {
      const source = await fetchAgentSourceUrl(url.trim());
      if (fetchRequestRef.current !== requestId) return;
      onSourceAttach(source);
      close();
    } catch (error) {
      if (fetchRequestRef.current !== requestId) return;
      setUrlError(errorMessage(error));
      setIsFetching(false);
    }
  }

  function pickNative(kind: NativeSourcePicker) {
    close();
    onNativePick(kind);
  }

  const popupClass = view === "source"
    ? "ui-popover agent-attachment-picker agent-source-picker"
    : "ui-popover agent-attachment-picker";

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setIsOpen(true);
        else close();
      }}
    >
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon agent-attachment-trigger"
            aria-label="Add context or sources"
            title="Add context or sources"
            disabled={disabled || nativePicker !== null}
            onPointerDown={() => setReaderSelection(onCaptureReaderSelection())}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setReaderSelection(onCaptureReaderSelection());
              }
            }}
          >
            <Plus size={17} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup
            ref={popupRef}
            className={popupClass}
            aria-label="Add context or sources"
            initialFocus={menuFirstRef}
          >
            {view === "menu" && (
              <div className="agent-attachment-picker__menu">
                <button
                  ref={bundleAttachmentsSupported ? menuFirstRef : undefined}
                  type="button"
                  aria-label="Attach context"
                  title={bundleAttachmentsSupported
                    ? undefined
                    : "Use the local agent's read-only OKF tools."}
                  disabled={!bundleAttachmentsSupported || attachedConcepts.length >= 8}
                  onClick={() => openView("concepts")}
                >
                  <Paperclip size={16} aria-hidden="true" />
                  <span><strong>Bundle concepts</strong><small>Attach concepts from the active bundle</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Attach reader selection"
                  title={selectionExplanation}
                  disabled={!bundleAttachmentsSupported || isAtLimit || readerSelection.status === "unavailable"}
                  onClick={() => {
                    if (readerSelection.status !== "available") return;
                    onSourceAttach(readerSelection.source, "selection");
                    close();
                  }}
                >
                  <TextSelect size={16} aria-hidden="true" />
                  <span><strong>Reader selection</strong><small>{selectionExplanation}</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Attach issue"
                  title={issueExplanation}
                  disabled={!bundleAttachmentsSupported || isAtLimit || availableIssues.length === 0}
                  onClick={() => openView("issues")}
                >
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span><strong>Validation issue</strong><small>{issueExplanation}</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Attach previous thread"
                  title={threadExplanation}
                  disabled={isAtLimit || threadSupport !== "ready"}
                  onClick={() => void openThreads()}
                >
                  <History size={16} aria-hidden="true" />
                  <span><strong>Previous thread</strong><small>{threadExplanation}</small></span>
                </button>
                <button
                  ref={!bundleAttachmentsSupported ? menuFirstRef : undefined}
                  type="button"
                  aria-label="Add source"
                  disabled={isAtLimit}
                  onClick={() => openView("source")}
                >
                  <FileText size={16} aria-hidden="true" />
                  <span><strong>Text or URL</strong><small>Paste text or fetch a public HTTPS page</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Add files"
                  disabled={isAtLimit || nativePicker !== null}
                  onClick={() => pickNative("files")}
                >
                  <FilePlus2 size={16} aria-hidden="true" />
                  <span><strong>Files</strong><small>PDF, Markdown, text, HTML, CSV, or JSON</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Add folder"
                  disabled={isAtLimit || nativePicker !== null}
                  onClick={() => pickNative("folder")}
                >
                  <FolderPlus size={16} aria-hidden="true" />
                  <span><strong>Folder</strong><small>Discover supported files below one folder</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Add images"
                  title={imageSupported ? undefined : "This agent does not accept image prompts."}
                  disabled={!imageSupported || isAtLimit || nativePicker !== null}
                  onClick={() => pickNative("images")}
                >
                  <ImagePlus size={16} aria-hidden="true" />
                  <span>
                    <strong>Images</strong>
                    <small>{imageSupported ? "PNG, JPEG, or WebP" : "This agent does not accept images"}</small>
                  </span>
                </button>
              </div>
            )}

            {view === "concepts" && (
              <>
                <AttachmentPickerHeader title="Bundle concepts" onBack={() => openView("menu")} />
                <input
                  data-attachment-initial-focus
                  type="search"
                  aria-label="Search concepts to attach"
                  placeholder="Search concepts..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="agent-context-picker__results">
                  {matchingConcepts.length > 0 ? matchingConcepts.map((concept) => (
                    <button
                      key={concept.id}
                      type="button"
                      aria-label={`Add ${concept.title} to context`}
                      onClick={() => {
                        onConceptAttach(concept);
                        close();
                      }}
                    >
                      <FileText size={14} aria-hidden="true" />
                      <span><strong>{concept.title}</strong><small>{concept.id}.md</small></span>
                      {concept.id === activeConceptId && <em>Current</em>}
                    </button>
                  )) : <p>No matching concepts.</p>}
                </div>
              </>
            )}

            {view === "issues" && (
              <>
                <AttachmentPickerHeader title="Validation issues" onBack={() => openView("menu")} />
                <div className="agent-context-picker__results">
                  {availableIssues.map((issue, index) => {
                    const key = validationIssueKey(issue);
                    const severity = issue.level === "error" ? "Error" : "Warning";
                    return (
                      <button
                        key={key}
                        type="button"
                        data-attachment-initial-focus={index === 0 ? "" : undefined}
                        title={issue.message}
                        aria-label={`Attach ${severity.toLowerCase()}: ${issue.message}`}
                        onClick={() => {
                          onIssueAttach(issue, key);
                          close();
                        }}
                      >
                        <TriangleAlert
                          className={issue.level === "error"
                            ? "agent-issue-picker__error-icon"
                            : "agent-context-chip__warning-icon"}
                          size={14}
                          aria-hidden="true"
                        />
                        <span><strong>{severity}</strong><small>{issue.message}</small></span>
                        {issue.conceptId && <em>{issue.conceptId}</em>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {view === "threads" && (
              <>
                <AttachmentPickerHeader title="Previous thread" onBack={() => openView("menu")} />
                {threadPicker.status === "loading" && (
                  <p role="status">Loading saved threads...</p>
                )}
                {threadPicker.status === "error" && (
                  <>
                    <p className="agent-source-picker__error" role="alert">
                      Saved threads unavailable. {threadPicker.message}
                    </p>
                    <div className="agent-source-picker__actions">
                      <button
                        type="button"
                        className="btn"
                        data-attachment-initial-focus
                        onClick={() => void openThreads()}
                      >
                        Retry
                      </button>
                    </div>
                  </>
                )}
                {threadPicker.status === "ready" && threadPicker.threads.length === 0 && (
                  <p>No saved thread exists for this bundle and agent.</p>
                )}
                {threadPicker.status === "ready" && threadPicker.threads.length > 0 && (
                  <>
                    <p>Attach a saved thread's replayed conversation as one source.</p>
                    <div className="agent-context-picker__results">
                      {threadPicker.threads.map((metadata, index) => {
                        const updatedAt = threadDateLabel(metadata.updatedAt);
                        const detail = attachingThreadId === metadata.sessionId
                          ? "Attaching..."
                          : [metadata.archived ? "Archived" : "Current", updatedAt]
                            .filter(Boolean)
                            .join(" · ");
                        return (
                          <button
                            key={metadata.sessionId}
                            type="button"
                            data-attachment-initial-focus={index === 0 ? "" : undefined}
                            title={metadata.title}
                            aria-label={`Attach previous thread: ${metadata.title}`}
                            disabled={attachingThreadId !== null}
                            onClick={() => void attachThread(metadata)}
                          >
                            <History size={14} aria-hidden="true" />
                            <span><strong>{metadata.title}</strong><small>{detail}</small></span>
                          </button>
                        );
                      })}
                    </div>
                    {threadError && (
                      <p className="agent-source-picker__error" role="alert">{threadError}</p>
                    )}
                  </>
                )}
              </>
            )}

            {view === "source" && (
              <>
                <AttachmentPickerHeader title="Text or URL" onBack={() => openView("menu")} />
                <p>Paste text or fetch a public HTTPS page for your next message.</p>
                <div className="agent-source-picker__modes" aria-label="Source input method">
              <button
                type="button"
                className="btn ghost"
                aria-pressed={mode === "paste"}
                disabled={isFetching}
                onClick={() => {
                  setMode("paste");
                  setUrlError(null);
                }}
              >
                Paste text
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-pressed={mode === "url"}
                disabled={isFetching}
                onClick={() => setMode("url")}
              >
                Fetch URL
              </button>
                </div>
                {mode === "paste" ? (
              <>
                <label>
                  <span>Title</span>
                  <input
                    data-attachment-initial-focus
                    value={title}
                    maxLength={256}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label>
                  <span>Content</span>
                  <textarea
                    value={content}
                    rows={8}
                    maxLength={64 * 1024}
                    onChange={(event) => setContent(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <label>
                <span>HTTPS URL</span>
                <input
                  data-attachment-initial-focus
                  type="url"
                  inputMode="url"
                  value={url}
                  maxLength={2_048}
                  placeholder="https://example.com/research.html"
                  disabled={isFetching}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setUrlError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void fetchSource();
                    }
                  }}
                />
              </label>
                )}
                {urlError && <p className="agent-source-picker__error" role="alert">{urlError}</p>}
                <div className="agent-source-picker__actions">
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              {mode === "paste" ? (
                <button type="button" className="btn primary" disabled={!canAttach} onClick={attach}>
                  Attach source
                </button>
              ) : (
                <button type="button" className="btn primary" disabled={!canFetch} onClick={() => void fetchSource()}>
                  {isFetching ? "Fetching..." : "Fetch and attach"}
                </button>
              )}
                </div>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AttachmentPickerHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="agent-attachment-picker__header">
      <button
        type="button"
        className="btn ghost icon"
        aria-label="Back to add menu"
        onClick={onBack}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <h3>{title}</h3>
    </div>
  );
}

function applyPermissionEvent(
  current: PendingPermission[],
  event: AgentPermissionEvent,
): PendingPermission[] {
  if (event.update.kind === "resolved") {
    return current.filter((permission) => permission.requestId !== event.requestId);
  }
  const requested: PendingPermission = { ...event, update: event.update };
  const existingIndex = current.findIndex((permission) => permission.requestId === event.requestId);
  if (existingIndex < 0) return [...current, requested];
  return current.map((permission, index) => (index === existingIndex ? requested : permission));
}

function PermissionCard({ permission }: { permission: PendingPermission }) {
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [rememberForThread, setRememberForThread] = useState(false);
  const hasRejectOption = permission.update.options.some((option) =>
    option.kind.startsWith("reject-"),
  );

  async function choose(option: AgentPermissionOptionInfo | null) {
    setStatus("submitting");
    setFailure(null);
    try {
      const accepted = await respondAgentPermission(
        permission.requestId,
        option?.optionId ?? null,
        rememberForThread && option?.kind.endsWith("-once") === true,
      );
      if (!accepted) {
        setStatus("idle");
        setFailure("This permission request is no longer active.");
      }
    } catch (error: unknown) {
      setStatus("idle");
      setFailure(errorMessage(error));
    }
  }

  return (
    <article className="agent-permission" aria-labelledby={`permission-${permission.requestId}`}>
      <ShieldQuestion size={20} aria-hidden="true" />
      <div className="agent-permission__body">
        <h3 id={`permission-${permission.requestId}`}>Permission needed</h3>
        <p>{permission.update.title ?? "The agent wants to run a tool."}</p>
        {permission.update.canRemember && (
          <label className="agent-permission__remember">
            <input
              type="checkbox"
              checked={rememberForThread}
              disabled={status === "submitting"}
              onChange={(event) => setRememberForThread(event.target.checked)}
            />
            Remember an Allow once or Reject choice for this exact request in this thread
          </label>
        )}
        <div className="agent-permission__actions">
          {permission.update.options.map((option) => (
            <button
              key={option.optionId}
              type="button"
              className={`btn ${option.kind.startsWith("allow-") ? "primary" : "ghost"}`}
              disabled={status === "submitting"}
              onClick={() => void choose(option)}
            >
              {option.name}
            </button>
          ))}
          {!hasRejectOption && (
            <button
              type="button"
              className="btn ghost"
              disabled={status === "submitting"}
              onClick={() => void choose(null)}
            >
              Cancel
            </button>
          )}
        </div>
        {failure && <p className="agent-permission__error" role="alert">{failure}</p>}
      </div>
    </article>
  );
}

function applyTurnEvent(
  event: AgentTurnEvent,
  setMessages: Dispatch<SetStateAction<ConversationItem[]>>,
): void {
  if (event.update.kind === "usage") return;
  if (event.update.kind === "text") {
    const messageId = `agent-${event.turnId}`;
    const chunkText = event.update.text;
    setMessages((current) => {
      const index = current.findIndex((message) =>
        message.role !== "plan" && message.role !== "tool" && message.id === messageId);
      if (index < 0) return [...current, { id: messageId, role: "agent", text: chunkText }];
      return current.map((message, messageIndex) =>
        messageIndex === index && message.role !== "plan" && message.role !== "tool"
          ? { ...message, text: message.text + chunkText }
          : message,
      );
    });
  } else if (event.update.kind === "plan") {
    const planId = `plan-${event.turnId}`;
    const entries = event.update.entries;
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === planId);
      if (entries.length === 0) return current.filter((item) => item.id !== planId);
      const plan: ConversationPlan = { id: planId, role: "plan", entries };
      if (index < 0) return [...current, plan];
      return current.map((item, itemIndex) => itemIndex === index ? plan : item);
    });
  } else if (event.update.kind === "tool-call") {
    const toolUpdate = event.update;
    const itemId = `tool-${event.turnId}-${toolUpdate.toolCallId}`;
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === itemId);
      const existing = index >= 0 && current[index]?.role === "tool"
        ? current[index]
        : null;
      const tool: ConversationTool = {
        id: itemId,
        role: "tool",
        turnId: event.turnId,
        toolCallId: toolUpdate.toolCallId,
        title: toolUpdate.title ?? existing?.title ?? "Agent tool",
        toolKind: toolUpdate.toolKind ?? existing?.toolKind ?? "other",
        status: toolUpdate.status ?? existing?.status ?? "pending",
        locations: toolUpdate.locations ?? existing?.locations ?? [],
        changeState: toolUpdate.changeState ?? existing?.changeState ?? null,
      };
      if (index < 0) return [...current, tool];
      return current.map((item, itemIndex) => itemIndex === index ? tool : item);
    });
  } else if (event.update.kind === "failed") {
    const failureMessage = event.update.message;
    setMessages((current) => [
      ...finalizeToolItems(current, event.turnId, "failed"),
      {
        id: `status-${event.turnId}`,
        role: "status",
        tone: "error",
        turnId: event.turnId,
        text: `Turn failed. ${failureMessage}`,
      },
    ]);
  } else if (event.update.stopReason !== "end-turn") {
    const stopReason = event.update.stopReason;
    const notices = {
      cancelled: { text: "Turn cancelled.", tone: "neutral" },
      refusal: { text: "The agent refused this turn.", tone: "warning" },
      "max-tokens": { text: "The agent reached its token limit.", tone: "warning" },
      "max-turn-requests": {
        text: "The agent reached its turn-request limit.",
        tone: "warning",
      },
      unknown: { text: "The agent stopped for an unknown reason.", tone: "warning" },
    } as const;
    // The wire value can drift from the typed union (it once arrived as
    // snake_case and unmounted the whole app); never let this lookup throw.
    const stop = notices[stopReason in notices ? stopReason : "unknown"];
    setMessages((current) => [
      ...(stopReason === "cancelled"
        ? finalizeToolItems(current, event.turnId, "cancelled")
        : current),
      {
        id: `status-${event.turnId}`,
        role: "status",
        tone: stop.tone,
        text: stop.text,
      },
    ]);
  }
}

function finalizeToolItems(
  items: readonly ConversationItem[],
  turnId: string,
  status: "failed" | "cancelled",
): ConversationItem[] {
  return items.map((item) =>
    item.role === "tool" && item.turnId === turnId &&
      (item.status === "pending" || item.status === "in-progress")
      ? { ...item, status }
      : item);
}

interface ConversationItemViewProps {
  item: ConversationItem;
  onRetry?: () => void;
  isRetrying: boolean;
  retryError: string | null;
  onGenerateProposal?: () => void;
  generationBlockedReason: string | null;
  isGeneratingProposal: boolean;
}

function ConversationItemView({
  item,
  onRetry,
  isRetrying,
  retryError,
  onGenerateProposal,
  generationBlockedReason,
  isGeneratingProposal,
}: ConversationItemViewProps) {
  if (item.role === "plan") return <PlanCard plan={item} />;
  if (item.role === "tool") return <ToolCard tool={item} />;
  return (
    <Message
      message={item}
      onRetry={onRetry}
      isRetrying={isRetrying}
      retryError={retryError}
      onGenerateProposal={onGenerateProposal}
      generationBlockedReason={generationBlockedReason}
      isGeneratingProposal={isGeneratingProposal}
    />
  );
}

function ToolCard({ tool }: { tool: ConversationTool }) {
  const kindLabel = ({
    read: "Read",
    edit: "Edit",
    delete: "Delete",
    move: "Move",
    search: "Search",
    execute: "Command",
    think: "Reasoning",
    fetch: "Fetch",
    "switch-mode": "Mode",
    other: "Tool",
    unknown: "Tool",
  } as const)[tool.toolKind];
  const statusLabel = ({
    pending: "Pending",
    "in-progress": "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    unknown: "Status unknown",
  } as const)[tool.status];
  return (
    <article
      className={`agent-tool agent-tool--${tool.status}`}
      aria-label={`Tool: ${tool.title}`}
    >
      <span className="agent-tool__icon" aria-hidden="true">
        <Wrench size={15} />
      </span>
      <div>
        <strong>{tool.title}</strong>
        <small>{kindLabel}</small>
        {tool.changeState && (
          <small
            className={`agent-tool__change agent-tool__change--${tool.changeState}`}
            title={tool.changeState === "staged"
              ? "Studio accepted this reported change for review. It is not applied."
              : "Studio did not accept this reported change. Check the thread grant and staging limits."}
          >
            {tool.changeState === "staged" ? "Change staged for review" : "Change not staged"}
          </small>
        )}
        <ToolLocations locations={tool.locations} />
      </div>
      <small className="agent-tool__status">{statusLabel}</small>
    </article>
  );
}

function toolLocationLabel(location: AgentToolLocationInfo): string {
  return location.line === null ? location.path : `${location.path}:${location.line}`;
}

function ToolLocations({ locations }: { locations: readonly AgentToolLocationInfo[] }) {
  if (locations.length === 0) return null;
  if (locations.length === 1) {
    const label = toolLocationLabel(locations[0]);
    return (
      <small className="agent-tool__location" title={label}>
        <FileText size={12} aria-hidden="true" />
        <span>{label}</span>
      </small>
    );
  }
  return (
    <details className="agent-tool__locations">
      <summary>{locations.length} locations</summary>
      <ul>
        {locations.map((location) => {
          const label = toolLocationLabel(location);
          return <li key={label} title={label}>{label}</li>;
        })}
      </ul>
    </details>
  );
}

function PlanCard({ plan }: { plan: ConversationPlan }) {
  const completed = plan.entries.filter((entry) => entry.status === "completed").length;
  return (
    <section className="agent-plan" aria-label="Agent plan">
      <header>
        <span className="agent-plan__icon" aria-hidden="true">
          <ListChecks size={16} />
        </span>
        <div>
          <strong>Plan</strong>
          <small>{completed} of {plan.entries.length} complete</small>
        </div>
      </header>
      <ol>
        {plan.entries.map((entry, index) => {
          const status = ({
            pending: { label: "Pending", icon: Circle },
            "in-progress": { label: "In progress", icon: CircleDot },
            completed: { label: "Completed", icon: Check },
            unknown: { label: "Status unknown", icon: CircleAlert },
          } as const)[entry.status];
          const StatusIcon = status.icon;
          return (
            <li
              key={`${entry.content}-${entry.priority}-${index}`}
              className={`agent-plan__entry agent-plan__entry--${entry.status}`}
            >
              <StatusIcon size={14} aria-hidden="true" />
              <span>{entry.content}</span>
              <small title={`${entry.priority} priority`}>{status.label}</small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface MessageProps {
  message: ConversationMessage;
  onRetry?: () => void;
  isRetrying: boolean;
  retryError: string | null;
  onGenerateProposal?: () => void;
  generationBlockedReason: string | null;
  isGeneratingProposal: boolean;
}

function Message({
  message,
  onRetry,
  isRetrying,
  retryError,
  onGenerateProposal,
  generationBlockedReason,
  isGeneratingProposal,
}: MessageProps) {
  const agentNarrative = message.role === "agent"
    ? bundleProposalNarrative(message.text)
    : message.text;
  const renderedAgentText = message.role === "agent"
    ? { __html: renderMarkdown(agentNarrative) }
    : null;
  const bundleProposal = message.role === "agent"
    ? parseBundleProposal(message.text)
    : { status: "none" } as const;
  const label = message.role === "user" ? "You" : message.role === "agent" ? "Agent" : "Turn";
  return (
    <article
      className={`agent-message agent-message--${message.role}${message.tone ? ` agent-message--${message.tone}` : ""}`}
      {...(message.role === "status" ? { role: "status", "aria-label": message.text } : {})}
    >
      <span className="agent-message__icon" aria-hidden="true">
        {message.role === "user" ? (
          <User size={16} />
        ) : message.role === "agent" ? (
          <Bot size={16} />
        ) : (
          <CircleAlert size={16} />
        )}
      </span>
      <div>
        <strong>{label}</strong>
        {message.role === "agent" ? (
          agentNarrative ? (
            <div
              className="markdown agent-message__markdown"
              // renderMarkdown sanitizes untrusted agent output with DOMPurify.
              dangerouslySetInnerHTML={renderedAgentText ?? undefined}
            />
          ) : null
        ) : <p>{message.text}</p>}
        <BundleProposalPreview
          result={bundleProposal}
          onGenerate={onGenerateProposal}
          generationBlockedReason={generationBlockedReason}
          isGenerating={isGeneratingProposal}
        />
        {onRetry && (
          <div className="agent-message__actions">
            <button
              type="button"
              className="btn ghost"
              disabled={isRetrying}
              onClick={onRetry}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {isRetrying ? "Retrying..." : "Retry turn"}
            </button>
          </div>
        )}
        {retryError && (
          <p className="agent-message__retry-error" role="alert">
            Retry failed. {retryError}
          </p>
        )}
      </div>
    </article>
  );
}
