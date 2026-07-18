import type { AgentAvailableCommandInfo, AgentConnectionEvent, AgentConnectionInfo, AgentLoadedSessionInfo, AgentSessionConfigOption, AgentSessionConfigValueInput, AgentSessionInfo, AgentSessionHistoryInfo, AgentStagedChangesInfo, AgentStagedFileDiff, AgentTurnEvent, AgentTurnInfo, AgentWriteGrantMode } from "@/features/agent/connection.ts";
import type { AgentSessionConfigFailure } from "@/features/agent/components/AgentSessionControls.tsx";
import type { AgentThreadMetadata } from "@/features/agent/threadMetadata.ts";
import type { AcceptedOkfContextManifest, OkfTaskId, OkfTaskKickoff } from "@/features/agent/taskContext.ts";
import { acceptOkfContextPlan, createOkfContextPlan } from "@/features/agent/taskContext.ts";
import type { Issue } from "@/shared/types.ts";
import type { ReaderSelectionCapture } from "@/features/agent/readerSelection.ts";
import { AgentLiveWorkShelf } from "@/features/agent/components/AgentLiveWorkShelf.tsx";
import { AgentSessionControls } from "@/features/agent/components/AgentSessionControls.tsx";
import { Check, CircleAlert, FileText, History, ImageIcon, RotateCcw, Send, Sparkles, Square, TextSelect, TriangleAlert, X } from "lucide-react";
import { StagedGraphPreview } from "@/features/agent/components/StagedGraphPreview.tsx";
import { agentStagedFileDiff, applyAgentStagedChanges, consumeRestoredConnection, createAgentStagedBundle, cancelAgentTurn, authenticateAgent, discardAgentStagedChanges, discardAgentStagedFile, listAgentSessions, loadAgentThreadMetadata, loadAgentSession, newAgentSession, onAgentAvailableCommandsUpdate, onAgentConnectionState, onAgentPermissionUpdate, onAgentSessionConfigUpdate, onAgentStageUpdate, onAgentTurnUpdate, setAgentWriteGrant, setAgentStageMode, setAgentStagedHunkSelection, validateAgentArtifact, validateAgentStagedChanges, pickAgentSourceFolder, pickAgentImageSources, pickAgentTextSources, promptAgent, removeAgentThreadMetadata, restoreAgentStagedCheckpoint, saveAgentThreadMetadata, setAgentSessionConfigOption } from "@/shared/ipc.ts";
import { deriveThreadTitle, previousThreadSource, transcriptMarkdown } from "@/features/agent/thread.ts";
import { parseBundleProposal } from "@/features/agent/bundleProposal.ts";
import { startTransition, useActionState, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import "./AgentConversation.css";
import type { StagedValidationState, ConversationMessage, ConversationPlan, ConversationItem, AttachedSource, ComposerState, PromptDraft, PromptSubmission, QueuedPrompt, ThreadTitle, AuthenticationState, HistoryState, SavedThreadState, PendingPermission, AgentUsage, EventStreamState, DraftSessionState, PendingSessionConfig, StageFailure } from "@/features/agent/components/conversation/types.ts";
import { BUNDLE_GENERATION_PROMPT, THREAD_STARTERS, usageLabels, errorMessage, stagedBytesLabel, sourceTooltip } from "@/features/agent/components/conversation/helpers.ts";
import { SavedThreadWelcome, EmptyThreadWelcome, ThreadSecurityScope, ThreadTitleEditor, ThreadSurfaceClose, ThreadActionsMenu } from "@/features/agent/components/conversation/ThreadChrome.tsx";
import { AttachmentPicker } from "@/features/agent/components/conversation/AttachmentPicker.tsx";
import { applyPermissionEvent, PermissionCard, applyTurnEvent, ConversationItemView, planProgressLabel, LivePlan } from "@/features/agent/components/conversation/items.tsx";
import { useTranscriptExport } from "@/features/agent/components/conversation/useTranscriptExport.ts";
import { TranscriptSurface } from "@/features/agent/components/conversation/TranscriptSurface.tsx";
import { ThreadMarkdownView } from "@/features/agent/components/conversation/ThreadMarkdownView.tsx";
import { ContextPressureNotice } from "@/features/agent/components/conversation/ContextPressureNotice.tsx";
import { QueuedPromptCard } from "@/features/agent/components/conversation/QueuedPromptCard.tsx";
import { AgentSessionHistory } from "@/features/agent/components/conversation/AgentSessionHistory.tsx";
import { WriteGrantControl } from "@/features/agent/components/conversation/WriteGrantControl.tsx";
import { OkfContextPlanCard } from "@/features/agent/components/conversation/OkfContextPlanCard.tsx";
import { SourceInventory } from "@/features/agent/components/conversation/SourceInventory.tsx";
import { AgentArtifactWorkspace } from "@/features/agent/components/AgentArtifactWorkspace.tsx";
import type { AgentArtifactWorkspaceState } from "@/features/agent/components/AgentArtifactWorkspace.tsx";
import {
  agentArtifactEnvelopeText,
  artifactRevisionPrompt,
} from "@/features/agent/artifact.ts";
import type { AgentThreadStatus } from "@/features/agent/threadStatus.ts";
import { threadAttentionTransition } from "@/features/agent/threadStatus.ts";
import { sendAgentThreadNotification } from "@/shared/platform/notifications.ts";
import {
  findContextRecoveryCommand,
  freshThreadContextDraft,
  markContextSummary,
} from "@/features/agent/components/conversation/contextRecovery.ts";
import { useAppActions } from "@/shared/store.tsx";


export interface AgentConversationProps {
  connection: AgentConnectionInfo;
  bundleRoot: string | null;
  bundleName: string | null;
  activeConcept: { id: string; title: string } | null;
  onCaptureReaderSelection: () => ReaderSelectionCapture;
  concepts: readonly {
    id: string;
    title: string;
    type: string;
    body?: string;
    links?: readonly string[];
    timestamp?: string | null;
  }[];
  onOpenConcept: (conceptId: string) => void;
  issues: readonly Issue[];
  onChangeAgent: () => void;
  onConnectionEnd: (event: AgentConnectionEvent) => void;
  onOpenFolder: () => Promise<void>;
  threadSurfaceCount: number;
  onThreadTitleChange: (title: string) => void;
  onCloseThreadSurface: () => void;
  initialPrompt?: string;
  initialKickoff?: OkfTaskKickoff;
  initialSession?: AgentSessionHistoryInfo;
  onStartFreshThread: (initialPrompt: string) => void;
  onImportSession: (session: AgentSessionHistoryInfo) => void;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  onThreadStatusChange: (status: AgentThreadStatus) => void;
}


export function AgentConversation({
  connection,
  bundleRoot,
  bundleName,
  activeConcept,
  onCaptureReaderSelection,
  concepts,
  onOpenConcept,
  issues,
  onChangeAgent,
  onConnectionEnd,
  onOpenFolder,
  threadSurfaceCount,
  onThreadTitleChange,
  onCloseThreadSurface,
  initialPrompt = "",
  initialKickoff,
  initialSession,
  onStartFreshThread,
  onImportSession,
  notificationsEnabled,
  notificationSound,
  onThreadStatusChange,
}: AgentConversationProps) {
  const appActions = useAppActions();
  const conversationTitleId = useId();
  const stagedTitleId = `${conversationTitleId}-staged`;
  const bundleFolderInputId = `${conversationTitleId}-bundle-folder`;
  const promptInputId = `${conversationTitleId}-prompt`;
  const supportsHistory = connection.capabilities.sessionList && connection.capabilities.loadSession;
  const isStudioAgent = connection.protocolVersion === "studio-native/1";
  const conceptIds = concepts.map((concept) => concept.id);
  const [threadTitle, setThreadTitle] = useState<ThreadTitle>({
    source: "default",
    value: "New thread",
  });
  const [threadTaskId, setThreadTaskId] = useState<OkfTaskId | null>(
    initialKickoff?.taskId ?? null,
  );
  const [acceptedContextManifest, setAcceptedContextManifest] =
    useState<AcceptedOkfContextManifest | null>(null);
  const [removedContextIds, setRemovedContextIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [artifactWorkspace, setArtifactWorkspace] = useState<AgentArtifactWorkspaceState>({
    status: "empty",
  });
  const artifactWorkspaceRef = useRef<AgentArtifactWorkspaceState>(artifactWorkspace);
  const artifactOriginMessageRef = useRef<string | null>(null);
  const artifactValidationRequestRef = useRef(0);
  const [artifactValidationAttempt, setArtifactValidationAttempt] = useState(0);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [markdownViewOpen, setMarkdownViewOpen] = useState(false);
  const [activeTurn, setActiveTurn] = useState<AgentTurnInfo | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [availableCommands, setAvailableCommands] = useState<
    readonly AgentAvailableCommandInfo[]
  >([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [turnControlError, setTurnControlError] = useState<string | null>(null);
  const [authentication, setAuthentication] = useState<AuthenticationState>({ status: "idle" });
  const [history, setHistory] = useState<HistoryState>({ status: "closed" });
  const [historyQuery, setHistoryQuery] = useState("");
  const [importingSessionId, setImportingSessionId] = useState<string | null>(null);
  const [savedThread, setSavedThread] = useState<SavedThreadState>({ status: "none" });
  const [draftSessionState, setDraftSessionState] = useState<DraftSessionState>({
    status: "idle",
  });
  const [sessionConfigOptions, setSessionConfigOptions] = useState<
    readonly AgentSessionConfigOption[]
  >([]);
  const [pendingSessionConfig, setPendingSessionConfig] =
    useState<PendingSessionConfig | null>(null);
  const [sessionConfigFailure, setSessionConfigFailure] =
    useState<AgentSessionConfigFailure | null>(null);
  const [eventStreamState, setEventStreamState] = useState<EventStreamState>({
    status: "ready",
  });
  const [eventStreamAttempt, setEventStreamAttempt] = useState(0);
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
  const [stageError, setStageError] = useState<StageFailure | null>(null);
  const [stageNotice, setStageNotice] = useState<string | null>(null);
  const [isApplyingStage, setIsApplyingStage] = useState(false);
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [freshBundleFolderName, setFreshBundleFolderName] = useState("new-okf-bundle");
  const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
  const [isSettingGrant, setIsSettingGrant] = useState(false);
  const [writeGrantPreference, setWriteGrantPreference] =
    useState<AgentWriteGrantMode>("interactive");
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
  >(() => {
    const kickoffIds = new Set(initialKickoff?.contextConceptIds ?? []);
    return concepts
      .filter((concept) => kickoffIds.has(concept.id))
      .map(({ id, title, type }) => ({ id, title, type }));
  });
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>(() =>
    (initialKickoff?.sources ?? []).map((source) => ({
      id: crypto.randomUUID(),
      ...source,
    })),
  );
  const [promptText, setPromptText] = useState(initialKickoff?.prompt ?? initialPrompt);
  const [queuedPrompt, setQueuedPrompt] = useState<QueuedPrompt | null>(null);
  const [sourcePickerError, setSourcePickerError] = useState<string | null>(null);
  const [sourcePicker, setSourcePicker] = useState<"files" | "folder" | "images" | null>(null);
  const contextPlan = bundleRoot && threadTaskId
    ? createOkfContextPlan({
        taskId: threadTaskId,
        bundleRoot,
        concepts,
        activeConcept,
        attachedConcepts,
        sources: attachedSources,
        issues,
        removedIds: removedContextIds,
      })
    : null;
  const contextPlanIsStale = contextPlan !== null && acceptedContextManifest !== null &&
    acceptedContextManifest.bundleFingerprint !== contextPlan.bundleFingerprint;
  const availableCommandsBySessionRef = useRef(
    new Map<string, readonly AgentAvailableCommandInfo[]>(),
  );
  const contextRecoveryTurnsRef = useRef(new Map<string, string>());
  const sessionRef = useRef<AgentSessionInfo | null>(null);
  const draftSessionPromiseRef = useRef<{
    bundleRoot: string;
    promise: Promise<AgentSessionInfo>;
  } | null>(null);
  const sessionConfigRequestRef = useRef(0);
  const draftSessionRequestRef = useRef(0);
  const bundleRootRef = useRef(bundleRoot);
  const connectionIdRef = useRef(connection.connectionId);
  const completedTurnsRef = useRef(new Set<string>());
  const failedTurnsRef = useRef(new Set<string>());
  const acceptedDraftsRef = useRef(new Map<string, PromptDraft>());
  const metadataSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const stagedValidationRequestRef = useRef(0);
  const stagedDiscardRef = useRef<HTMLButtonElement>(null);
  const queuedEditRef = useRef<HTMLButtonElement>(null);
  const notificationStatusRef = useRef<AgentThreadStatus>("idle");
  const savedThreadActionRef = useRef<HTMLButtonElement>(null);
  const initialSessionLoadStartedRef = useRef(false);
  let artifactMessageId: string | null = null;
  let artifactEnvelope: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (item.role !== "agent") continue;
    const envelope = agentArtifactEnvelopeText(item.text);
    if (!envelope) continue;
    artifactMessageId = item.id;
    artifactEnvelope = envelope;
    break;
  }

  bundleRootRef.current = bundleRoot;
  connectionIdRef.current = connection.connectionId;

  useEffect(() => {
    if (savedThread.status === "error") savedThreadActionRef.current?.focus();
  }, [savedThread.status]);

  async function loadSavedThread() {
    if (!bundleRoot || !supportsHistory || initialSession) {
      setSavedThread({ status: "none" });
      return;
    }
    setSavedThread({ status: "loading" });
    try {
      const metadata = await loadAgentThreadMetadata(bundleRoot, connection.profileId);
      const current = metadata.find((entry) => !entry.archived);
      const archived = metadata.find((entry) => entry.archived);
      const continuationChoices = [current, archived].filter(
        (entry): entry is AgentThreadMetadata => entry !== undefined,
      );
      setSavedThread(continuationChoices.length > 0
        ? { status: "ready", metadata: continuationChoices }
        : { status: "none" });
    } catch (error: unknown) {
      setSavedThread({ status: "error", message: errorMessage(error) });
    }
  }

  const loadSavedThreadEffect = useEffectEvent(loadSavedThread);

  useEffect(() => {
    void loadSavedThreadEffect();
  }, [bundleRoot, connection.profileId, supportsHistory, initialSession?.sessionId]);

  useEffect(() => {
    sessionRef.current = null;
    draftSessionPromiseRef.current = null;
    draftSessionRequestRef.current += 1;
    sessionConfigRequestRef.current += 1;
    setSessionConfigOptions([]);
    setAvailableCommands([]);
    availableCommandsBySessionRef.current.clear();
    contextRecoveryTurnsRef.current.clear();
    setPendingSessionConfig(null);
    setSessionConfigFailure(null);
    setWriteGrantPreference("interactive");
    setDraftSessionState({ status: "idle" });
    setThreadTaskId(null);
    setAcceptedContextManifest(null);
    setRemovedContextIds(new Set());
    const emptyArtifact: AgentArtifactWorkspaceState = { status: "empty" };
    artifactWorkspaceRef.current = emptyArtifact;
    artifactOriginMessageRef.current = null;
    artifactValidationRequestRef.current += 1;
    setArtifactWorkspace(emptyArtifact);
    setArtifactOpen(false);
  }, [bundleRoot, connection.connectionId]);

  useEffect(() => {
    if (!bundleRoot || !artifactMessageId || !artifactEnvelope) {
      if (messages.length === 0) {
        const emptyArtifact: AgentArtifactWorkspaceState = { status: "empty" };
        artifactWorkspaceRef.current = emptyArtifact;
        artifactOriginMessageRef.current = null;
        setArtifactWorkspace(emptyArtifact);
        setArtifactOpen(false);
      }
      return;
    }
    const requestId = ++artifactValidationRequestRef.current;
    const current = artifactWorkspaceRef.current;
    if (current.status === "empty" || current.status === "invalid" || current.status === "loading") {
      const loading: AgentArtifactWorkspaceState = { status: "loading" };
      artifactWorkspaceRef.current = loading;
      setArtifactWorkspace(loading);
    }
    void validateAgentArtifact(bundleRoot, artifactEnvelope).then(
      (result) => {
        if (artifactValidationRequestRef.current !== requestId) return;
        const previous = artifactWorkspaceRef.current;
        if (result.status === "none") return;
        if (result.status === "invalid") {
          const next: AgentArtifactWorkspaceState =
            previous.status === "ready" || previous.status === "stale"
              ? {
                  status: "stale",
                  artifact: previous.artifact,
                  sentRevision: previous.sentRevision,
                  message: `${result.message} The new output remains labelled prose in the conversation.`,
                }
              : { status: "invalid", message: result.message };
          artifactWorkspaceRef.current = next;
          setArtifactWorkspace(next);
          setArtifactOpen(true);
          return;
        }
        const previousArtifact = previous.status === "ready" || previous.status === "stale"
          ? previous.artifact
          : null;
        const sentRevision = previous.status === "ready" || previous.status === "stale"
          ? previous.sentRevision
          : null;
        const fromNewMessage = artifactOriginMessageRef.current !== null &&
          artifactOriginMessageRef.current !== artifactMessageId;
        const olderThanCurrent = previousArtifact?.artifactId === result.artifact.artifactId &&
          fromNewMessage && result.artifact.revision <= previousArtifact.revision;
        const missesSentRevision = previousArtifact?.artifactId === result.artifact.artifactId &&
          sentRevision !== null && result.artifact.revision > previousArtifact.revision &&
          result.artifact.parentRevision !== sentRevision;
        if (previousArtifact && (olderThanCurrent || missesSentRevision)) {
          const stale: AgentArtifactWorkspaceState = {
            status: "stale",
            artifact: previousArtifact,
            sentRevision,
            message: olderThanCurrent
              ? `The agent returned revision ${result.artifact.revision} after revision ${previousArtifact.revision}.`
              : `The agent update does not continue from sent revision ${sentRevision}.`,
          };
          artifactWorkspaceRef.current = stale;
          setArtifactWorkspace(stale);
          setArtifactOpen(true);
          return;
        }
        const ready: AgentArtifactWorkspaceState = {
          status: "ready",
          artifact: result.artifact,
          sentRevision,
        };
        artifactOriginMessageRef.current = artifactMessageId;
        artifactWorkspaceRef.current = ready;
        setArtifactWorkspace(ready);
        setArtifactOpen(true);
      },
      (error: unknown) => {
        if (artifactValidationRequestRef.current !== requestId) return;
        const invalid: AgentArtifactWorkspaceState = {
          status: "invalid",
          message: `Studio could not validate this artifact. ${errorMessage(error)}`,
        };
        artifactWorkspaceRef.current = invalid;
        setArtifactWorkspace(invalid);
        setArtifactOpen(true);
      },
    );
  }, [artifactEnvelope, artifactMessageId, artifactValidationAttempt, bundleRoot, messages.length]);

  function persistThreadMetadata(
    session: AgentSessionInfo,
    title: string,
    archived = false,
    taskId = threadTaskId,
    contextManifest = acceptedContextManifest,
  ): Promise<AgentThreadMetadata | null> {
    if (!supportsHistory) return Promise.resolve(null);
    setThreadMetadataError(null);
    const operation = metadataSaveQueueRef.current.then(() => saveAgentThreadMetadata({
      bundleRoot: session.bundleRoot,
      profileId: connection.profileId,
      sessionId: session.sessionId,
      title,
      archived,
      taskId,
      contextManifest,
    }));
    metadataSaveQueueRef.current = operation.then(() => undefined, () => undefined);
    void operation.then(
      () => setSavedThread({ status: "none" }),
      (error: unknown) => setThreadMetadataError(errorMessage(error)),
    );
    return operation;
  }

  function adoptSession(session: AgentSessionInfo) {
    sessionConfigRequestRef.current += 1;
    sessionRef.current = session;
    setSessionConfigOptions(session.configOptions);
    setAvailableCommands(availableCommandsBySessionRef.current.get(session.sessionId) ?? []);
    setPendingSessionConfig(null);
    setSessionConfigFailure(null);
    setDraftSessionState({ status: "idle" });
    setStagedChanges(session.stagedChanges);
  }

  async function ensureSession(): Promise<AgentSessionInfo> {
    if (!bundleRoot) throw new Error("Open an OKF bundle first.");
    const current = sessionRef.current;
    if (current?.bundleRoot === bundleRoot) return current;
    const pending = draftSessionPromiseRef.current;
    if (pending?.bundleRoot === bundleRoot) return pending.promise;

    const requestedRoot = bundleRoot;
    const requestedConnectionId = connection.connectionId;
    const requestId = ++draftSessionRequestRef.current;
    setDraftSessionState({ status: "loading" });
    const promise = newAgentSession(requestedConnectionId, requestedRoot);
    draftSessionPromiseRef.current = { bundleRoot: requestedRoot, promise };
    try {
      const session = await promise;
      if (bundleRootRef.current !== requestedRoot ||
        connectionIdRef.current !== requestedConnectionId) {
        throw new Error("The active bundle or agent changed while the session was starting.");
      }
      const activeSession = sessionRef.current;
      if (activeSession?.bundleRoot === requestedRoot) return activeSession;
      adoptSession(session);
      return session;
    } catch (error: unknown) {
      if (bundleRootRef.current === requestedRoot &&
        connectionIdRef.current === requestedConnectionId) {
        setDraftSessionState({ status: "error", message: errorMessage(error) });
      }
      throw error;
    } finally {
      if (draftSessionRequestRef.current === requestId) {
        draftSessionPromiseRef.current = null;
      }
    }
  }

  const prepareDraftSessionEffect = useEffectEvent(async () => {
    try {
      await ensureSession();
    } catch {
      // The bounded retry state is rendered beside the composer.
    }
  });

  // Start the draft session as soon as authentication and the bundle allow, so
  // the agent-advertised model, mode, and reasoning controls are visible
  // whenever the composer is. Saved work resumes automatically below and
  // brings its own session; the draft also covers its failure card so the
  // controls stay available beside the recovery actions.
  useEffect(() => {
    const requiresAuth = !connection.authenticated && connection.authMethods.length > 0;
    if (!bundleRoot || requiresAuth || initialSession ||
      (savedThread.status !== "none" && savedThread.status !== "error") ||
      sessionRef.current?.bundleRoot === bundleRoot) return;
    void prepareDraftSessionEffect();
  }, [
    bundleRoot,
    connection.authenticated,
    connection.authMethods.length,
    connection.connectionId,
    initialSession,
    savedThread.status,
  ]);

  // Zed-style continuation, scoped to launch restore: when this connection was
  // just restored automatically, its first surface resumes the current saved
  // thread on its own instead of waiting behind a Resume card. Failures fall
  // back to the explicit recovery card; archived threads, reconnects, and
  // user-created surfaces keep their deliberate choice.
  const autoResumeEffect = useEffectEvent(() => {
    if (savedThread.status !== "ready") return;
    const requiresAuth = !connection.authenticated && connection.authMethods.length > 0;
    if (requiresAuth) return;
    const current = savedThread.metadata.find((entry) => !entry.archived);
    if (!current) return;
    if (!consumeRestoredConnection(connection.connectionId)) return;
    void resumeSavedThread(current);
  });
  useEffect(() => {
    autoResumeEffect();
  }, [savedThread.status, connection.authenticated, connection.connectionId]);

  async function loadInitialSession() {
    const requiresAuth = !connection.authenticated && connection.authMethods.length > 0;
    if (!bundleRoot || !initialSession || requiresAuth || initialSessionLoadStartedRef.current) {
      return;
    }
    initialSessionLoadStartedRef.current = true;
    setDraftSessionState({ status: "loading" });
    try {
      const loaded = await loadAgentSession(
        connection.connectionId,
        bundleRoot,
        initialSession.sessionId,
      );
      applyRestoredSession(
        loaded,
        initialSession.sessionId,
        initialSession.title ?? "Imported session",
        null,
        null,
      );
    } catch (error: unknown) {
      setDraftSessionState({
        status: "error",
        message: `Import failed. ${errorMessage(error)}`,
      });
    }
  }

  const loadInitialSessionEffect = useEffectEvent(loadInitialSession);

  useEffect(() => {
    void loadInitialSessionEffect();
  }, [
    bundleRoot,
    connection.authenticated,
    connection.authMethods.length,
    connection.connectionId,
    initialSession?.sessionId,
  ]);

  function retryDraftSession() {
    if (initialSession) {
      initialSessionLoadStartedRef.current = false;
      void loadInitialSession();
      return;
    }
    void ensureSession().catch(() => undefined);
  }

  const [composerState, submitPrompt, isSubmitting] = useActionState<ComposerState, PromptSubmission>(
    async (_previous, { draft, source, retryTurnId, compactCommand, artifactRevision }) => {
      const { text, concepts: draftConcepts, sources: draftSources } = draft;
      if (!text) return { status: "error", message: "Enter a message." };
      if (!bundleRoot) return { status: "error", message: "Open an OKF bundle first." };
      const userMessage: ConversationMessage = {
        id: `user-${crypto.randomUUID()}`,
        role: "user",
        text,
      };
      try {
        let session = sessionRef.current;
        if (session?.bundleRoot !== bundleRoot) {
          setUsage(null);
          setStagedChanges(null);
          clearStagedValidation();
          setStageError(null);
          setStageNotice(null);
          setExpandedDiff(null);
          setRejectingStagedPath(null);
          setSelectingHunk(null);
          session = await ensureSession();
        }
        const plan = threadTaskId
          ? createOkfContextPlan({
              taskId: threadTaskId,
              bundleRoot,
              concepts,
              activeConcept,
              attachedConcepts: draftConcepts,
              sources: draftSources,
              issues,
              removedIds: removedContextIds,
            })
          : null;
        if (plan && acceptedContextManifest &&
          acceptedContextManifest.bundleFingerprint !== plan.bundleFingerprint) {
          return {
            status: "error",
            message: "The bundle changed after this context was accepted. Review the refreshed context plan before sending.",
          };
        }
        const acceptedPlan = plan ? acceptOkfContextPlan(plan) : null;
        const contextPaths = plan
          ? plan.objects.map((object) => object.path)
          : draftConcepts.map((concept) => `${concept.id}.md`);
        const selectedSourceIds = plan ? new Set(plan.sources.map((source) => source.id)) : null;
        const sources = draftSources.filter((source) =>
          selectedSourceIds === null || selectedSourceIds.has(source.id)
        ).map(
          ({ title, content, origin, mediaType, sourceDigest, warning, imageData, adapterReceipt }) => ({
            title,
            content,
            ...(origin ? { origin } : {}),
            ...(mediaType ? { mediaType } : {}),
            ...(sourceDigest ? { sourceDigest } : {}),
            ...(warning ? { warning } : {}),
            ...(imageData ? { imageData } : {}),
            ...(adapterReceipt ? { adapterReceipt } : {}),
          }),
        );
        const scopedPaths = isStudioAgent ? [] : contextPaths;
        const turn = threadTaskId && acceptedPlan
          ? await promptAgent(
              connection.connectionId,
              session.sessionId,
              text,
              scopedPaths,
              sources,
              { taskId: threadTaskId, contextManifest: acceptedPlan },
            )
          : await promptAgent(
              connection.connectionId,
              session.sessionId,
              text,
              scopedPaths,
              sources,
            );
        if (source === "compact" && compactCommand) {
          contextRecoveryTurnsRef.current.set(turn.turnId, compactCommand);
        }
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
            item.id === `plan-${turn.turnId}` ||
            (item.role === "agent" && item.turnId === turn.turnId) ||
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
        if (threadTitle.source === "default") {
          setThreadTitle({ source: "derived", value: nextTitle });
          onThreadTitleChange(nextTitle);
        }
        if (acceptedPlan) setAcceptedContextManifest(acceptedPlan);
        if (source === "artifact" && artifactRevision) {
          const sent: AgentArtifactWorkspaceState = {
            status: "ready",
            artifact: artifactRevision,
            sentRevision: artifactRevision.revision,
          };
          artifactWorkspaceRef.current = sent;
          setArtifactWorkspace(sent);
        }
        void persistThreadMetadata(session, nextTitle, false, threadTaskId, acceptedPlan);
        resetExport();
        if (source === "composer") {
          setAttachedConcepts([]);
          setAttachedSources([]);
          setPromptText("");
        }
        if (!completedTurnsRef.current.delete(turn.turnId)) setActiveTurn(turn);
        return { status: "idle" };
      } catch (error: unknown) {
        if (source === "queue") {
          setAttachedConcepts(draftConcepts);
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
    if (contextPlanIsStale) return;
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

  function sendArtifactRevision(
    artifact: Extract<AgentArtifactWorkspaceState, { status: "ready" | "stale" }>["artifact"],
    intent: "continue" | "export",
  ) {
    if (isSubmitting || activeTurn !== null) return;
    const exportInstruction = intent === "export"
      ? "\n\nExport this artifact as a conformant Markdown concept through reviewed staging. Do not write directly to the bundle."
      : "";
    const draft: PromptDraft = {
      text: `${artifactRevisionPrompt(artifact)}${exportInstruction}`,
      concepts: [],
      sources: [],
    };
    startTransition(() => submitPrompt({
      draft,
      source: "artifact",
      artifactRevision: artifact,
    }));
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
    const recoveryCommand = contextRecoveryTurnsRef.current.get(event.turnId);
    if (recoveryCommand && event.update.kind === "completed" &&
      event.update.stopReason === "end-turn") {
      setMessages((current) => markContextSummary(current, event.turnId, recoveryCommand));
    }
    if (event.update.kind === "completed" || event.update.kind === "failed") {
      contextRecoveryTurnsRef.current.delete(event.turnId);
    }
    if (activeTurn?.turnId !== event.turnId) return;
    setActiveTurn(null);
    setIsCancelling(false);
    setTurnControlError(null);
    if (queuedPrompt) startQueuedPrompt(queuedPrompt);
  });
  const updateStagedChangesEffect = useEffectEvent(updateStagedChanges);
  const reportConnectionEnd = useEffectEvent(onConnectionEnd);

  useEffect(() => {
    let stopUpdates: (() => void)[] = [];
    let isDisposed = false;
    void Promise.allSettled([
      onAgentTurnUpdate((event) => {
        if (event.connectionId !== connection.connectionId) return;
        if (sessionRef.current?.sessionId !== event.sessionId) return;
        if (event.update.kind === "capability-use") {
          const capabilityUse = event.update;
          setActiveTurn((current) => {
            if (current?.turnId !== event.turnId) return current;
            return {
              ...current,
              capabilityContext: current.capabilityContext.map((capability) =>
                capability.capabilityId === capabilityUse.capabilityId &&
                  capability.version === capabilityUse.version &&
                  !capability.observedResourceIds.includes(capabilityUse.resourceId)
                  ? {
                      ...capability,
                      observedResourceIds: [
                        ...capability.observedResourceIds,
                        capabilityUse.resourceId,
                      ],
                    }
                  : capability,
              ),
            };
          });
        } else if (event.update.kind === "usage") setUsage(event.update);
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
      onAgentSessionConfigUpdate((event) => {
        if (event.connectionId !== connection.connectionId) return;
        const session = sessionRef.current;
        if (session?.sessionId !== event.sessionId) return;
        sessionRef.current = { ...session, configOptions: event.configOptions };
        setSessionConfigOptions(event.configOptions);
        setPendingSessionConfig((current) => {
          if (!current) return null;
          return event.configOptions.some((option) => option.id === current.optionId)
            ? current
            : null;
        });
        setSessionConfigFailure((current) => {
          if (!current) return null;
          return event.configOptions.some((option) => option.id === current.optionId)
            ? current
            : null;
        });
      }),
      onAgentAvailableCommandsUpdate((event) => {
        if (event.connectionId !== connection.connectionId) return;
        availableCommandsBySessionRef.current.set(event.sessionId, event.commands);
        if (sessionRef.current?.sessionId === event.sessionId) {
          setAvailableCommands(event.commands);
        }
      }),
      onAgentConnectionState((event) => {
        if (event.connectionId === connection.connectionId) reportConnectionEnd(event);
      }),
    ]).then((results) => {
      const activeStops: (() => void)[] = [];
      let failure: unknown;
      let hasFailure = false;
      for (const result of results) {
        if (result.status === "fulfilled") activeStops.push(result.value);
        else {
          hasFailure = true;
          failure ??= result.reason;
        }
      }
      if (isDisposed || hasFailure) {
        for (const stop of activeStops) stop();
      } else {
        stopUpdates = activeStops;
        setEventStreamState((current) =>
          current.status === "ready" ? current : { status: "ready" },
        );
      }
      if (!isDisposed && hasFailure) {
        setEventStreamState({ status: "error", message: errorMessage(failure) });
      }
    });
    return () => {
      isDisposed = true;
      for (const stop of stopUpdates) stop();
    };
  }, [connection.connectionId, eventStreamAttempt]);

  function retryEventStream() {
    if (eventStreamState.status === "retrying") return;
    setEventStreamState({ status: "retrying" });
    setEventStreamAttempt((attempt) => attempt + 1);
  }

  async function stopTurn() {
    if (!activeTurn) return;
    setIsCancelling(true);
    setTurnControlError(null);
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
        setTurnControlError(null);
        if (queuedPrompt) startQueuedPrompt(queuedPrompt);
      }
    } catch (error: unknown) {
      setIsCancelling(false);
      setTurnControlError(errorMessage(error));
    }
  }

  function runContextRecovery(command: AgentAvailableCommandInfo) {
    if (isSubmitting || activeTurn || queuedPrompt) return;
    startTransition(() => submitPrompt({
      draft: { text: `/${command.name}`, concepts: [], sources: [] },
      source: "compact",
      compactCommand: command.name,
    }));
  }

  function startFreshFromContext() {
    if (isSubmitting || activeTurn || queuedPrompt || threadSurfaceCount >= 8) return;
    onStartFreshThread(freshThreadContextDraft(
      threadTitle.value,
      bundleName,
      messages,
    ));
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
        stagedChanges?.grantMode ?? writeGrantPreference,
      );
      updateStagedChanges(changes);
    } catch (error: unknown) {
      setStageError({ owner: "grant", message: errorMessage(error) });
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
      setStageError({
        owner: "staging",
        operation: "discard",
        message: errorMessage(error),
      });
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
      if (sessionRef.current?.sessionId === sessionId) {
        setStageError({
          owner: "staging",
          operation: "reject",
          path,
          message: errorMessage(error),
        });
      }
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
      setStageError({
        owner: "staging",
        operation: "validate",
        message: errorMessage(error),
      });
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
      if (sessionRef.current?.sessionId === sessionId) {
        setStageError({
          owner: "staging",
          operation: "create",
          message: errorMessage(error),
        });
      }
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
      if (sessionRef.current?.sessionId === sessionId) {
        setStageError({ owner: "restore", message: errorMessage(error) });
      }
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
  const { exportState, exportTranscript, resetExport } = useTranscriptExport({
    messages,
    threadTaskId,
    threadTitle,
    bundleName,
    agentName,
  });
  const requiresAuthentication = !connection.authenticated && connection.authMethods.length > 0;
  // A live session exists once a user message was accepted (or a restore
  // replayed one); the grant command needs that session ID.
  const hasSession = messages.some((item) => item.role === "user");
  const writeGranted = stagedChanges?.granted ?? false;
  const activeWriteGrantMode = stagedChanges?.grantMode ?? null;
  const stagedFileCount = stagedChanges?.files.length ?? 0;
  const latestStatusMessage = [...messages].reverse().find((item) => item.role === "status");
  const threadStatus: AgentThreadStatus = pendingPermissions.length > 0
    ? "waiting"
    : activeTurn !== null
      ? "running"
      : latestStatusMessage?.role === "status" && latestStatusMessage.tone === "error"
        ? "failed"
        : stagedFileCount > 0
          ? "staged"
          : "idle";
  const reportThreadStatus = useEffectEvent((status: AgentThreadStatus) => {
    const previous = notificationStatusRef.current;
    notificationStatusRef.current = status;
    onThreadStatusChange(status);
    const kind = threadAttentionTransition(previous, status);
    if (!notificationsEnabled || !kind) return;
    void sendAgentThreadNotification({
      kind,
      threadTitle: threadTitle.value,
      agentName,
      sound: notificationSound,
    });
  });
  useEffect(() => {
    reportThreadStatus(threadStatus);
  }, [threadStatus]);
  const stagedSummary = `${stagedFileCount === 1 ? "1 file" : `${stagedFileCount} files`} · not applied to the bundle`;
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
  const contextRecoveryCommand = findContextRecoveryCommand(availableCommands);
  const supportsBundleGeneration = threadTaskId === "okf-create" ||
    threadTaskId === "okf-enrich";
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
    importingSessionId !== null || isApplyingStage || isCreatingBundle ||
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
  const livePlanId = activeTurn ? `plan-${activeTurn.turnId}` : null;
  const livePlan = livePlanId
    ? messages.find(
        (item): item is ConversationPlan => item.role === "plan" && item.id === livePlanId,
      ) ?? null
    : null;
  const hasLiveWork = pendingPermissions.length > 0 || livePlan !== null ||
    stagedFileCount > 0 || stagedChanges?.canRestore === true || stageNotice !== null ||
    queuedPrompt !== null;
  const hasCollapsibleLiveWork = livePlan !== null || stagedFileCount > 0 ||
    stagedChanges?.canRestore === true || stageNotice !== null || queuedPrompt !== null;
  const liveWorkSummary = [
    pendingPermissions.length > 0
      ? `${pendingPermissions.length} decision${pendingPermissions.length === 1 ? "" : "s"}`
      : null,
    livePlan ? planProgressLabel(livePlan) : null,
    stagedFileCount > 0
      ? `${stagedFileCount} staged file${stagedFileCount === 1 ? "" : "s"}`
      : stagedChanges?.canRestore ? "Restore available" : null,
    queuedPrompt ? "1 queued message" : null,
  ].filter((part): part is string => part !== null).join(" · ");

  function selectStarter(kickoff: OkfTaskKickoff) {
    if (!promptRef.current) return;
    setThreadTaskId(kickoff.taskId);
    setAcceptedContextManifest(null);
    setRemovedContextIds(new Set());
    setPromptText(kickoff.prompt);
    promptRef.current.focus();
  }

  function changePromptText(value: string) {
    setPromptText(value);
    if (!value.trim() && !hasSession) {
      setThreadTaskId(null);
      setAcceptedContextManifest(null);
      setRemovedContextIds(new Set());
    }
  }

  function removeContextPlanItem(kind: "bundle-object" | "source", id: string) {
    setRemovedContextIds((current) => new Set(current).add(`${kind}:${id}`));
    if (kind === "bundle-object") {
      setAttachedConcepts((current) => current.filter((concept) => concept.id !== id));
    } else {
      setAttachedSources((current) => current.filter((source) => source.id !== id));
    }
  }

  function acceptRefreshedContextPlan() {
    if (!contextPlan) return;
    const accepted = acceptOkfContextPlan(contextPlan);
    setAcceptedContextManifest(accepted);
    const session = sessionRef.current;
    if (session) {
      void persistThreadMetadata(session, threadTitle.value, false, threadTaskId, accepted);
    }
  }

  function retryStagingFailure() {
    if (stageError?.owner !== "staging") return;
    switch (stageError.operation) {
      case "discard":
        void discardStagedChanges();
        break;
      case "reject":
        if (stageError.path) void rejectStagedFile(stageError.path);
        break;
      case "validate":
        void validateStagedChanges();
        break;
      case "create":
        void createStagedBundle();
        break;
    }
  }

  const stagingRetryLabel = stageError?.owner === "staging"
    ? {
        discard: "Retry discard",
        reject: "Retry reject",
        validate: "Validate again",
        create: "Retry create",
      }[stageError.operation]
    : null;
  const stagingRetryDisabled = stageError?.owner === "staging" && (
    isApplyingStage || isCreatingBundle || stagedValidation.status === "loading" ||
    rejectingStagedPath !== null ||
    (stageError.operation === "reject" && !stageError.path)
  );

  async function generateBundleProposal() {
    const session = sessionRef.current;
    if (!session || !writeGranted || activeTurn || isSubmitting || isPreparingGeneration) return;
    const mode = threadTaskId === "okf-create" ? "create" : "enhance";
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
        setStageError({ owner: "proposal", message: errorMessage(error) });
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

  async function importSession(session: AgentSessionHistoryInfo) {
    if (!bundleRoot || importingSessionId || threadSurfaceCount >= 8) return;
    setImportingSessionId(session.sessionId);
    try {
      const page = await listAgentSessions(connection.connectionId, bundleRoot);
      const freshSession = page.sessions.find(
        (candidate) => candidate.sessionId === session.sessionId,
      );
      if (!freshSession) {
        throw new Error(page.hasMore
          ? "That session is not in the agent's first 50 matching sessions anymore."
          : "The agent no longer reports that session for the active bundle.");
      }
      onImportSession(freshSession);
      setHistory({ status: "closed" });
      setHistoryQuery("");
    } catch (error: unknown) {
      setHistory({ status: "error", message: errorMessage(error) });
    } finally {
      setImportingSessionId(null);
    }
  }

  function applyRestoredSession(
    loaded: AgentLoadedSessionInfo,
    sessionId: string,
    title: string,
    taskId: OkfTaskId | null,
    contextManifest: AcceptedOkfContextManifest | null,
  ) {
    adoptSession(loaded);
    setMessages(loaded.messages.map((message, index) => ({
      id: `history-${sessionId}-${index}`,
      role: message.role,
      text: message.text,
    })));
    setThreadTitle({ source: "custom", value: title });
    onThreadTitleChange(title);
    setThreadTaskId(taskId);
    setAcceptedContextManifest(contextManifest);
    setRemovedContextIds(new Set());
    setPendingPermissions([]);
    setUsage(null);
    setQueuedPrompt(null);
    setStageError(null);
    setStageNotice(null);
    setExpandedDiff(null);
    setRejectingStagedPath(null);
    setSelectingHunk(null);
    setAttachedConcepts([]);
    setAttachedSources([]);
    setPromptText("");
    resetExport();
    acceptedDraftsRef.current.clear();
    failedTurnsRef.current.clear();
    setRetryableTurnIds(new Set());
    setRetryErrors(new Map());
    setRetryingTurnId(null);
    setSavedThread({ status: "none" });
    setHistory({ status: "closed" });
    void persistThreadMetadata(loaded, title, false, taskId, contextManifest);
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
      applyRestoredSession(
        loaded,
        session.sessionId,
        metadata.title,
        metadata.taskId,
        metadata.contextManifest,
      );
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
    setThreadTaskId(null);
    setAcceptedContextManifest(null);
    setRemovedContextIds(new Set());
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
        threadTaskId,
        acceptedContextManifest,
      );
      if (!metadata) return;
      sessionRef.current = null;
      sessionConfigRequestRef.current += 1;
      setSessionConfigOptions([]);
      setAvailableCommands([]);
      availableCommandsBySessionRef.current.delete(session.sessionId);
      setPendingSessionConfig(null);
      setSessionConfigFailure(null);
      setDraftSessionState({ status: "idle" });
      completedTurnsRef.current.clear();
      failedTurnsRef.current.clear();
      acceptedDraftsRef.current.clear();
      setThreadTitle({ source: "default", value: "New thread" });
      onThreadTitleChange("New thread");
      setThreadTaskId(null);
      setAcceptedContextManifest(null);
      setRemovedContextIds(new Set());
      setMessages([]);
      resetExport();
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
      setImportingSessionId(null);
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
        activeWriteGrantMode ?? writeGrantPreference,
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

  async function changeSessionConfig(
    option: AgentSessionConfigOption,
    requestedValue: AgentSessionConfigValueInput,
  ) {
    const session = sessionRef.current;
    if (!session || pendingSessionConfig) return;
    const requestId = ++sessionConfigRequestRef.current;
    setPendingSessionConfig({ optionId: option.id, requestId, requestedValue });
    setSessionConfigFailure(null);
    try {
      const snapshot = await setAgentSessionConfigOption(
        connection.connectionId,
        session.sessionId,
        option.id,
        requestedValue,
      );
      if (sessionRef.current?.sessionId !== session.sessionId ||
        sessionConfigRequestRef.current !== requestId) return;
      sessionRef.current = { ...session, configOptions: snapshot.configOptions };
      setSessionConfigOptions(snapshot.configOptions);
      setPendingSessionConfig(null);
    } catch (error: unknown) {
      if (sessionRef.current?.sessionId !== session.sessionId ||
        sessionConfigRequestRef.current !== requestId) return;
      setPendingSessionConfig(null);
      setSessionConfigFailure({
        optionId: option.id,
        requestedValue,
        message: errorMessage(error),
      });
    }
  }

  function retrySessionConfig() {
    if (!sessionConfigFailure) return;
    const option = sessionConfigOptions.find(
      (candidate) => candidate.id === sessionConfigFailure.optionId,
    );
    if (option) void changeSessionConfig(option, sessionConfigFailure.requestedValue);
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
          {artifactWorkspace.status !== "empty" && (
            <button
              type="button"
              className="btn ghost"
              aria-pressed={artifactOpen}
              onClick={() => setArtifactOpen((open) => !open)}
            >
              <FileText size={14} aria-hidden="true" />
              <span className="agent-conversation__action-label">
                {artifactOpen ? "Conversation" : "Work artifact"}
              </span>
            </button>
          )}
          <ThreadSecurityScope bundleName={bundleName} scope={connection.securityScope} />
          {bundleRoot && !requiresAuthentication && showWriteGrant && (
            <WriteGrantControl
              granted={writeGranted}
              activeMode={activeWriteGrantMode}
              preferredMode={writeGrantPreference}
              unattendedEligible={connection.securityScope.profile.unattendedEligible}
              disabled={!hasSession}
              pending={isSettingGrant}
              onPreferredModeChange={setWriteGrantPreference}
              onToggle={() => void toggleWriteGrant()}
            />
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
            historyDisabled={isSubmitting || activeTurn !== null || importingSessionId !== null}
            exportAvailable={messages.length > 0 || exportState.status !== "idle"}
            exportDisabled={isSubmitting || activeTurn !== null || exportState.status === "exporting"}
            exportPending={exportState.status === "exporting"}
            markdownAvailable={messages.length > 0}
            markdownDisabled={isSubmitting || activeTurn !== null}
            archiveAvailable={supportsHistory && messages.length > 0}
            archiveDisabled={archiveDisabled}
            archiveTitle={archiveTitle}
            changeDisabled={changeAgentDisabled}
            onOpenHistory={() => void openHistory()}
            onOpenMarkdown={() => setMarkdownViewOpen(true)}
            onExport={() => void exportTranscript()}
            onArchive={() => void archiveThread()}
            onChangeAgent={onChangeAgent}
          />
        </div>
      </header>

      {markdownViewOpen && (
        <ThreadMarkdownView
          title={threadTitle.value}
          markdown={transcriptMarkdown(
            threadTitle.value,
            bundleName,
            agentName,
            messages,
          )}
          onClose={() => setMarkdownViewOpen(false)}
        />
      )}

      {(exportState.status === "success" || exportState.status === "error" ||
        threadMetadataError !== null || stageError?.owner === "grant") && (
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
          {stageError?.owner === "grant" && (
            <div className="agent-operation-error">
              <p role="alert" title={stageError.message}>
                Edit access failed. {stageError.message}
              </p>
              <button
                type="button"
                className="btn ghost"
                disabled={isSettingGrant}
                onClick={() => void toggleWriteGrant()}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {isSettingGrant ? "Retrying..." : "Retry edit access"}
              </button>
            </div>
          )}
        </div>
      )}

      {eventStreamState.status !== "ready" && (
        <div
          className="agent-session-failure"
          role={eventStreamState.status === "error" ? "alert" : "status"}
        >
          <CircleAlert size={16} aria-hidden="true" />
          <div>
            <strong>
              {eventStreamState.status === "error"
                ? "Agent updates paused"
                : "Reconnecting agent updates"}
            </strong>
            <p title={eventStreamState.status === "error" ? eventStreamState.message : undefined}>
              {eventStreamState.status === "error"
                ? eventStreamState.message
                : "Opening a fresh event stream for this thread."}
            </p>
          </div>
          <button
            type="button"
            className="btn"
            disabled={eventStreamState.status === "retrying"}
            onClick={retryEventStream}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {eventStreamState.status === "retrying" ? "Reconnecting..." : "Retry updates"}
          </button>
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
                  data-agent-authentication-method
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
        <AgentSessionHistory
          state={history}
          query={historyQuery}
          pendingSessionId={importingSessionId}
          importDisabledReason={threadSurfaceCount >= 8
            ? "Close a live thread before importing another session."
            : null}
          onQueryChange={setHistoryQuery}
          onBack={() => {
            setHistory({ status: "closed" });
            setHistoryQuery("");
          }}
          onRefresh={() => void openHistory()}
          onImport={(session) => void importSession(session)}
        />
      )}

      {bundleRoot && !requiresAuthentication && history.status === "closed" && (
        <>
          {artifactOpen ? (
            <AgentArtifactWorkspace
              state={artifactWorkspace}
              selectedConceptId={activeConcept?.id}
              sending={isSubmitting || activeTurn !== null}
              onShowConversation={() => setArtifactOpen(false)}
              onRetry={() => setArtifactValidationAttempt((attempt) => attempt + 1)}
              onOpenConcept={onOpenConcept}
              onSendRevision={sendArtifactRevision}
            />
          ) : (
            <TranscriptSurface
              key={messages.find((item) => item.role === "user")?.id ?? "new-thread"}
              hasItems={messages.length > 0}
              hasUserMessage={hasSession}
              contentVersion={messages}
            >
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
                  if (item.id === livePlanId) return null;
                  const turnId = item.role === "status" ? item.turnId : undefined;
                  return (
                    <div
                      key={item.id}
                      className="agent-conversation__item"
                      data-transcript-role={item.role}
                    >
                      <ConversationItemView
                        item={item}
                        conceptIds={conceptIds}
                        onOpenConcept={onOpenConcept}
                        onRetry={
                          turnId && retryableTurnIds.has(turnId) &&
                            activeTurn === null && !isSubmitting
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
                                threadTaskId === "okf-create" ? "create" : "enhance"
                              )
                              ? "Resolve the current staged changes before generating this proposal."
                              : null
                          : null}
                        generationError={
                          item.id === latestBundleProposalMessageId &&
                          stageError?.owner === "proposal"
                            ? stageError.message
                            : null
                        }
                        isGeneratingProposal={
                          item.id === latestBundleProposalMessageId &&
                          (isSubmitting || isPreparingGeneration)
                        }
                      />
                    </div>
                  );
                })}
              </>
            )}
            </TranscriptSurface>
          )}
          {!artifactOpen && hasLiveWork && (
            <AgentLiveWorkShelf
              summary={liveWorkSummary}
              collapsible={hasCollapsibleLiveWork}
              blockingContent={pendingPermissions.length > 0 ? (
                <div className="agent-live-work__permissions">
                  {pendingPermissions.map((permission) => (
                    <PermissionCard key={permission.requestId} permission={permission} />
                  ))}
                </div>
              ) : undefined}
            >
              {livePlan && <LivePlan plan={livePlan} />}
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
              {stageError?.owner === "staging" && stagingRetryLabel && (
                <div className="agent-staged__operation-error">
                  <p role="alert" title={stageError.message}>
                    Staging action failed. {stageError.message}
                  </p>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={stagingRetryDisabled}
                    onClick={retryStagingFailure}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {stagingRetryLabel}
                  </button>
                </div>
              )}
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
          {stagedChanges?.canRestore && (
            <div className={`agent-composer__checkpoint${
              stageError?.owner === "restore" ? " agent-composer__checkpoint--error" : ""
            }`}>
              <span
                role={stageError?.owner === "restore" ? "alert" : "status"}
                title={stageError?.owner === "restore" ? stageError.message : undefined}
              >
                {stageError?.owner === "restore"
                  ? `Restore failed. ${stageError.message}`
                  : stageNotice ?? "The latest apply has a restorable checkpoint."}
              </span>
              <button
                type="button"
                className="btn ghost"
                disabled={isRestoringCheckpoint || stagedChanges.files.length > 0}
                title={stagedChanges.files.length > 0
                  ? "Resolve the current staged changes before restoring."
                  : undefined}
                onClick={() => void restoreCheckpoint()}
              >
                {isRestoringCheckpoint
                  ? "Restoring..."
                  : stageError?.owner === "restore"
                    ? "Retry restore"
                    : "Restore"}
              </button>
            </div>
          )}
          {stageNotice && !stagedChanges?.canRestore && (
            <p className="agent-composer__notice" role="status">{stageNotice}</p>
          )}
            {queuedPrompt && (
              <QueuedPromptCard
                prompt={queuedPrompt}
                recallButtonRef={queuedEditRef}
                onRecall={editQueuedPrompt}
                onRemove={removeQueuedPrompt}
              />
            )}
            </AgentLiveWorkShelf>
          )}
          <form ref={composerRef} className="agent-composer" action={composerAction}>
            {contextPlan && (messages.length === 0 || contextPlanIsStale) && (
              <OkfContextPlanCard
                plan={contextPlan}
                stale={contextPlanIsStale}
                disabled={isSubmitting || activeTurn !== null}
                onRemove={removeContextPlanItem}
                onAcceptRefresh={acceptRefreshedContextPlan}
              />
            )}
            {messages.length > 0 && acceptedContextManifest && !contextPlanIsStale && (
              <details className="okf-context-plan-disclosure">
                <summary>
                  Accepted OKF task context · {acceptedContextManifest.bundleFingerprint}
                </summary>
                <OkfContextPlanCard
                  plan={acceptedContextManifest}
                  stale={false}
                  disabled
                  editable={false}
                  onRemove={() => undefined}
                  onAcceptRefresh={() => undefined}
                />
              </details>
            )}
            {attachedConcepts.length + attachedSources.length > 0 && (
              <SourceInventory sources={attachedSources} />
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
                      id={`source-okf-task-${source.id}`}
                      type="button"
                      aria-label={`Start OKF work from ${source.title}`}
                      disabled={isSubmitting || queuedPrompt !== null}
                      onClick={() => appActions.openOkfTaskLauncher({
                        kind: "source",
                        id: `source:${source.id}`,
                        title: source.title,
                        source,
                      }, { returnFocusId: `source-okf-task-${source.id}` })}
                    >
                      <Sparkles size={14} aria-hidden="true" />
                    </button>
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
            {turnControlError && activeTurn && (
              <div className="agent-composer__error-row">
                <p
                  className="agent-composer__error agent-turn-control-error"
                  role="alert"
                  title={`Stop failed. ${turnControlError}`}
                >
                  Stop failed. {turnControlError}
                </p>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={isCancelling}
                  onClick={() => void stopTurn()}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Retry stop
                </button>
              </div>
            )}
            {draftSessionState.status === "error" && (
              <div className="agent-composer__error-row">
                <p className="agent-composer__error" role="alert">
                  {initialSession
                    ? draftSessionState.message
                    : `Session choices unavailable. ${draftSessionState.message}`}
                </p>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={retryDraftSession}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  {initialSession ? "Retry import" : "Retry session"}
                </button>
              </div>
            )}
            {usage && (
              <ContextPressureNotice
                usage={usage}
                recoveryCommand={contextRecoveryCommand}
                busy={isSubmitting || activeTurn !== null || queuedPrompt !== null}
                canStartFresh={threadSurfaceCount < 8}
                onRunCommand={runContextRecovery}
                onStartFresh={startFreshFromContext}
              />
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
                onKeyDown={(event) => {
                  // Zed-style submission: Enter sends (or queues during a
                  // turn), Shift+Enter inserts a newline, and an active IME
                  // composition keeps Enter for itself.
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing
                  ) {
                    return;
                  }
                  event.preventDefault();
                  if (promptText.trim().length === 0) return;
                  event.currentTarget.form?.requestSubmit();
                }}
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
                <AgentSessionControls
                  options={sessionConfigOptions}
                  pendingOptionId={pendingSessionConfig?.optionId ?? null}
                  failure={sessionConfigFailure}
                  favoriteScope={connection.profileId}
                  disabled={isSubmitting || queuedPrompt !== null || draftSessionState.status === "loading"}
                  onChange={(option, value) => void changeSessionConfig(option, value)}
                  onRetry={retrySessionConfig}
                />
                {activeTurn ? (
                  <div className="agent-composer__turn-actions">
                    <button
                      type="submit"
                      className="btn primary icon"
                      aria-label={queuedPrompt ? "Queued" : "Queue"}
                      title={queuedPrompt ? "Queued" : "Queue"}
                      disabled={isSubmitting || queuedPrompt !== null ||
                        promptText.trim().length === 0 || contextPlanIsStale}
                    >
                      <Send size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn icon"
                      aria-label={isCancelling ? "Stopping..." : "Stop"}
                      title={isCancelling ? "Stopping..." : "Stop"}
                      disabled={isCancelling}
                      onClick={() => void stopTurn()}
                    >
                      <Square size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="submit"
                    className="btn primary icon"
                    aria-label={isSubmitting ? "Sending..." : "Send"}
                    title={isSubmitting ? "Sending..." : "Send"}
                    disabled={isSubmitting || contextPlanIsStale}
                  >
                    <Send size={16} aria-hidden="true" />
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
