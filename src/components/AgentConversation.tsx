import { Archive as ArchiveIcon, Bot, Check, ChevronLeft, Circle, CircleAlert, CircleDot, Database, FileDown, FilePlus2, FileText, FolderPlus, History, ImageIcon, ImagePlus, ListChecks, Paperclip, Pencil, Plus, RotateCcw, Search, Send, ShieldQuestion, Sparkles, Square, TextSelect, TriangleAlert, User, WandSparkles, Wrench, X } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import type { Dispatch, SetStateAction, SubmitEvent } from "react";
import type {
  AgentConnectionEvent,
  AgentConnectionInfo,
  AgentPlanEntryInfo,
  AgentToolKind,
  AgentToolLocationInfo,
  AgentToolStatus,
  AgentPermissionEvent,
  AgentPermissionOptionInfo,
  AgentLoadedSessionInfo,
  AgentSessionInfo,
  AgentSessionHistoryInfo,
  AgentTurnEvent,
  AgentTurnInfo,
} from "../agent/connection.ts";
import type { ReaderSelectionCapture } from "../agent/readerSelection.ts";
import type { AgentThreadMetadata, AgentThreadWorkflow } from "../agent/threadMetadata.ts";
import {
  datasetChangeRequirements,
  deriveThreadTitle,
  researchExportRequirements,
  transcriptFilename,
  transcriptMarkdown,
} from "../agent/thread.ts";
import {
  cancelAgentTurn,
  authenticateAgent,
  exportAgentTranscript,
  fetchAgentSourceUrl,
  listAgentSessions,
  loadAgentThreadMetadata,
  loadAgentSession,
  newAgentSession,
  onAgentConnectionState,
  onAgentPermissionUpdate,
  onAgentTurnUpdate,
  pickAgentSourceFolder,
  pickAgentImageSources,
  pickAgentTextSources,
  promptAgent,
  removeAgentThreadMetadata,
  respondAgentPermission,
  saveAgentThreadMetadata,
} from "../ipc.ts";
import type { AgentSourceInput } from "../ipc.ts";
import { renderMarkdown } from "../markdown.ts";
import type { Issue } from "../types.ts";
import "./AgentConversation.css";

interface AgentConversationProps {
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
}

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
}

type ConversationItem = ConversationMessage | ConversationPlan | ConversationTool;

type AttachedSource = AgentSourceInput & {
  id: string;
  kind?: "issue" | "selection";
  issueKey?: string;
  issueLevel?: Issue["level"];
};

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
  | { status: "none" | "loading" }
  | { status: "ready"; metadata: readonly AgentThreadMetadata[] }
  | { status: "resuming"; metadata: readonly AgentThreadMetadata[]; sessionId: string }
  | { status: "error"; message: string; metadata?: AgentThreadMetadata };
type PendingPermission = AgentPermissionEvent & {
  update: Extract<AgentPermissionEvent["update"], { kind: "requested" }>;
};
type AgentUsage = Extract<AgentTurnEvent["update"], { kind: "usage" }>;

const THREAD_STARTERS = [
  {
    title: "Create bundle",
    description: "Turn attached evidence into a proposed OKF structure.",
    prompt: "Create a new OKF bundle from the sources I attach. First inspect the evidence, then propose the concepts, types, links, and indexes. Do not write files yet.",
    workflow: null,
    icon: WandSparkles,
  },
  {
    title: "Enhance bundle",
    description: "Find useful additions without replacing authored facts.",
    prompt: "Review this OKF bundle and the sources I attach. Propose additions or corrections without overwriting authored facts. Do not write files yet.",
    workflow: null,
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
  return THREAD_STARTERS.find((starter) =>
    starter.workflow !== null && prompt.startsWith(starter.prompt)
  )?.workflow ?? null;
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

interface ThreadTitleEditorProps {
  title: string;
  onTitleChange: (title: string) => void;
}

function ThreadTitleEditor({ title, onTitleChange }: ThreadTitleEditorProps) {
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
              <label htmlFor="agent-thread-title">Thread title</label>
              <input
                ref={inputRef}
                id="agent-thread-title"
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
}: AgentConversationProps) {
  const supportsHistory = connection.capabilities.sessionList && connection.capabilities.loadSession;
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
  const queuedEditRef = useRef<HTMLButtonElement>(null);
  const savedThreadActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    messagesElement.scrollTop = messages.length > 0 || pendingPermissions.length > 0
      ? messagesElement.scrollHeight
      : 0;
  }, [messages, pendingPermissions, savedThread.status]);

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
          session = await newAgentSession(connection.connectionId, bundleRoot);
          sessionRef.current = session;
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
        setThreadTitle((current) => current.source === "default"
          ? { source: "derived", value: nextTitle }
          : current);
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

  useEffect(() => {
    let stopTurnUpdates: (() => void) | undefined;
    let stopPermissionUpdates: (() => void) | undefined;
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
      onAgentConnectionState((event) => {
        if (event.connectionId === connection.connectionId) onConnectionEnd(event);
      }),
    ]).then(
      ([stopTurns, stopPermissions, stopConnections]) => {
        if (isDisposed) {
          stopTurns();
          stopPermissions();
          stopConnections();
        } else {
          stopTurnUpdates = stopTurns;
          stopPermissionUpdates = stopPermissions;
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

  const agentName = connection.agent?.title ?? connection.agent?.name ?? "Custom agent";
  const requiresAuthentication = !connection.authenticated && connection.authMethods.length > 0;
  const attachedIssueKeys = new Set(
    attachedSources.flatMap((source) => source.issueKey ? [source.issueKey] : []),
  );
  let composerStatus = connection.capabilities.promptImage ? "Text and images" : "Text only";
  if (activeTurn) composerStatus = "Agent is working";
  if (queuedPrompt) composerStatus = "Follow-up queued";
  if (isSubmitting) composerStatus = "Starting turn";
  const usageLabel = usage ? usageLabels(usage) : null;

  function selectStarter(prompt: string) {
    if (!promptRef.current) return;
    setPromptText(prompt);
    promptRef.current.focus();
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
    setThreadWorkflow(workflow);
    setPendingPermissions([]);
    setUsage(null);
    setQueuedPrompt(null);
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
        requestAnimationFrame(() => savedThreadActionRef.current?.focus());
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
      requestAnimationFrame(() => savedThreadActionRef.current?.focus());
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
      requestAnimationFrame(() => savedThreadActionRef.current?.focus());
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

  function changeThreadTitle(value: string) {
    setThreadTitle({ source: "custom", value });
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
      setThreadWorkflow(null);
      setMessages([]);
      setExportState({ status: "idle" });
      setActiveTurn(null);
      setPendingPermissions([]);
      setUsage(null);
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
    <section className="agent-conversation" aria-labelledby="agent-conversation-title">
      <header className="agent-conversation__toolbar">
        <div>
          <div className="agent-conversation__title-row">
            <h2 id="agent-conversation-title" title={threadTitle.value}>{threadTitle.value}</h2>
            <ThreadTitleEditor
              title={threadTitle.value}
              onTitleChange={changeThreadTitle}
            />
          </div>
          <p>{agentName} · {bundleName ?? "No bundle selected"}</p>
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
        <div className="agent-conversation__toolbar-actions">
          {supportsHistory && bundleRoot && !requiresAuthentication && (
            <button
              type="button"
              className="btn ghost agent-conversation__history-button"
              aria-label="Agent session history"
              title="Agent session history"
              onClick={() => history.status === "closed" ? void openHistory() : setHistory({ status: "closed" })}
              disabled={isSubmitting || activeTurn !== null || restoringSessionId !== null}
            >
              {history.status === "closed" ? <History aria-hidden="true" size={14} /> : <ChevronLeft aria-hidden="true" size={14} />}
              <span className="agent-conversation__action-label">
                {history.status === "closed" ? "History" : "Back"}
              </span>
            </button>
          )}
          <button
            type="button"
            className="btn ghost agent-conversation__export"
            aria-label="Export thread"
            title={messages.length === 0 ? "Send a message before exporting." : "Export thread as Markdown"}
            onClick={() => void exportTranscript()}
            disabled={
              messages.length === 0 || isSubmitting || activeTurn !== null ||
              exportState.status === "exporting"
            }
          >
            <FileDown aria-hidden="true" size={14} />
            <span className="agent-conversation__action-label">
              {exportState.status === "exporting" ? "Exporting..." : "Export"}
            </span>
          </button>
          {supportsHistory && (
            <button
              type="button"
              className="btn ghost icon"
              aria-label="Archive current thread"
              title={promptText.trim() || attachedConcepts.length > 0 || attachedSources.length > 0
                ? "Send or clear the draft before archiving."
                : messages.length === 0
                  ? "Send a message before archiving."
                  : "Archive this thread and start a new one"}
              onClick={() => void archiveThread()}
              disabled={
                messages.length === 0 || isSubmitting || activeTurn !== null ||
                queuedPrompt !== null || promptText.trim().length > 0 ||
                attachedConcepts.length > 0 || attachedSources.length > 0
              }
            >
              <ArchiveIcon aria-hidden="true" size={14} />
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            data-agent-initial-focus
            aria-label="Change"
            title="Change agent"
            onClick={onChangeAgent}
            disabled={
              isSubmitting || activeTurn !== null || authentication.status === "authenticating" ||
              exportState.status === "exporting"
            }
          >
            <Bot aria-hidden="true" size={14} />
            <span className="agent-conversation__action-label">Change</span>
          </button>
        </div>
      </header>

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
        <section className="agent-history" aria-labelledby="agent-history-title">
          <header>
            <div>
              <h3 id="agent-history-title">Agent session history</h3>
              <p>Sessions reported by this agent for the active bundle.</p>
            </div>
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
                <Bot size={24} aria-hidden="true" />
                {(savedThread.status === "ready" || savedThread.status === "resuming") &&
                  savedThread.metadata.map((metadata, index) => {
                    const isResuming = savedThread.status === "resuming" &&
                      savedThread.sessionId === metadata.sessionId;
                    const titleId = `agent-saved-thread-title-${index}`;
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
                        </div>
                        <div className="agent-saved-thread__actions">
                          <button
                            ref={index === 0 ? savedThreadActionRef : undefined}
                            type="button"
                            className="btn"
                            disabled={savedThread.status === "resuming"}
                            onClick={() => void resumeSavedThread(metadata)}
                          >
                            {isResuming ? "Resuming..." : "Resume"}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={savedThread.status === "resuming"}
                            onClick={() => void dismissSavedThread(metadata)}
                          >
                            {metadata.archived ? "Forget" : "Dismiss"}
                          </button>
                        </div>
                      </section>
                    );
                  })}
                {savedThread.status === "error" && (
                  <section className="agent-saved-thread agent-saved-thread--error">
                    <CircleAlert size={16} aria-hidden="true" />
                    <p role="alert">Saved thread unavailable. {savedThread.message}</p>
                    <div className="agent-saved-thread__actions">
                      <button
                        ref={savedThreadActionRef}
                        type="button"
                        className="btn"
                        onClick={() => void retrySavedThreadLoad()}
                      >
                        Retry
                      </button>
                      {savedThread.metadata && (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            if (savedThread.metadata) {
                              void dismissSavedThread(savedThread.metadata);
                            }
                          }}
                        >
                          {savedThread.metadata.archived ? "Forget" : "Dismiss"}
                        </button>
                      )}
                    </div>
                  </section>
                )}
                <h3>Ask about this bundle</h3>
                <p>
                  Studio attaches OKF context, read-only access to this bundle, and tools to
                  inspect concepts, trace sources, and validate structure.
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
                        onClick={() => selectStarter(starter.prompt)}
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
                    />
                  );
                })}
                {pendingPermissions.map((permission) => (
                  <PermissionCard key={permission.requestId} permission={permission} />
                ))}
              </>
            )}
          </div>
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
              <label className="sr-only" htmlFor="agent-prompt">Message the agent</label>
              <textarea
                ref={promptRef}
                id="agent-prompt"
                name="prompt"
                rows={3}
                maxLength={128 * 1024}
                placeholder="Ask about this bundle..."
                disabled={isSubmitting || queuedPrompt !== null}
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
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
                    imageSupported={connection.capabilities.promptImage}
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

type AttachmentView = "menu" | "concepts" | "issues" | "source";
type NativeSourcePicker = "files" | "folder" | "images";

interface AttachmentPickerProps {
  concepts: readonly { id: string; title: string; type: string }[];
  activeConceptId: string | null;
  attachedConcepts: readonly { id: string; title: string; type: string }[];
  issues: readonly Issue[];
  attachedIssueKeys: ReadonlySet<string>;
  sourceCount: number;
  onCaptureReaderSelection: () => ReaderSelectionCapture;
  disabled: boolean;
  imageSupported: boolean;
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
  imageSupported,
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
  const [readerSelection, setReaderSelection] = useState<ReaderSelectionCapture>({
    status: "unavailable",
    reason: "Select text in the reader first.",
  });
  const fetchRequestRef = useRef(0);
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
  if (issues.length === 0) issueExplanation = "This bundle has no validation issues.";
  else if (availableIssues.length === 0) issueExplanation = "All validation issues are attached.";
  else if (isAtLimit) issueExplanation = "The source limit has been reached.";
  const selectionExplanation = isAtLimit
    ? "The source limit has been reached."
    : readerSelection.status === "available"
      ? "Attach the selected text from the current concept"
      : readerSelection.reason;

  function close() {
    fetchRequestRef.current += 1;
    setIsOpen(false);
    setView("menu");
    setQuery("");
    setMode("paste");
    setTitle("");
    setContent("");
    setUrl("");
    setUrlError(null);
    setIsFetching(false);
  }

  function openView(nextView: AttachmentView) {
    setView(nextView);
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
                  ref={menuFirstRef}
                  type="button"
                  aria-label="Attach context"
                  disabled={attachedConcepts.length >= 8}
                  onClick={() => openView("concepts")}
                >
                  <Paperclip size={16} aria-hidden="true" />
                  <span><strong>Bundle concepts</strong><small>Attach concepts from the active bundle</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Attach reader selection"
                  title={selectionExplanation}
                  disabled={isAtLimit || readerSelection.status === "unavailable"}
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
                  disabled={isAtLimit || availableIssues.length === 0}
                  onClick={() => openView("issues")}
                >
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span><strong>Validation issue</strong><small>{issueExplanation}</small></span>
                </button>
                <button
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
  const hasRejectOption = permission.update.options.some((option) =>
    option.kind.startsWith("reject-"),
  );

  async function choose(option: AgentPermissionOptionInfo | null) {
    setStatus("submitting");
    setFailure(null);
    try {
      const accepted = await respondAgentPermission(permission.requestId, option?.optionId ?? null);
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
}

function ConversationItemView({
  item,
  onRetry,
  isRetrying,
  retryError,
}: ConversationItemViewProps) {
  if (item.role === "plan") return <PlanCard plan={item} />;
  if (item.role === "tool") return <ToolCard tool={item} />;
  return (
    <Message
      message={item}
      onRetry={onRetry}
      isRetrying={isRetrying}
      retryError={retryError}
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
}

function Message({ message, onRetry, isRetrying, retryError }: MessageProps) {
  const renderedAgentText = message.role === "agent"
    ? { __html: renderMarkdown(message.text) }
    : null;
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
        {renderedAgentText ? (
          <div
            className="markdown agent-message__markdown"
            // renderMarkdown sanitizes untrusted agent output with DOMPurify.
            dangerouslySetInnerHTML={renderedAgentText}
          />
        ) : (
          <p>{message.text}</p>
        )}
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
