import { Bot, CircleAlert, Database, FileDown, FilePlus2, FileText, FolderPlus, ImageIcon, ImagePlus, Paperclip, Pencil, RotateCcw, Search, Send, ShieldQuestion, Sparkles, Square, TriangleAlert, User, WandSparkles, X } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import type { Dispatch, SetStateAction, SubmitEvent } from "react";
import type {
  AgentConnectionEvent,
  AgentConnectionInfo,
  AgentPermissionEvent,
  AgentPermissionOptionInfo,
  AgentSessionInfo,
  AgentTurnEvent,
  AgentTurnInfo,
} from "../agent/connection.ts";
import { deriveThreadTitle, transcriptFilename, transcriptMarkdown } from "../agent/thread.ts";
import {
  cancelAgentTurn,
  authenticateAgent,
  exportAgentTranscript,
  fetchAgentSourceUrl,
  newAgentSession,
  onAgentConnectionState,
  onAgentPermissionUpdate,
  onAgentTurnUpdate,
  pickAgentSourceFolder,
  pickAgentImageSources,
  pickAgentTextSources,
  promptAgent,
  respondAgentPermission,
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
}

type AttachedSource = AgentSourceInput & {
  id: string;
  kind?: "issue";
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
  source: "composer" | "queue";
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
type PendingPermission = AgentPermissionEvent & {
  update: Extract<AgentPermissionEvent["update"], { kind: "requested" }>;
};

const THREAD_STARTERS = [
  {
    title: "Create bundle",
    description: "Turn attached evidence into a proposed OKF structure.",
    prompt: "Create a new OKF bundle from the sources I attach. First inspect the evidence, then propose the concepts, types, links, and indexes. Do not write files yet.",
    icon: WandSparkles,
  },
  {
    title: "Enhance bundle",
    description: "Find useful additions without replacing authored facts.",
    prompt: "Review this OKF bundle and the sources I attach. Propose additions or corrections without overwriting authored facts. Do not write files yet.",
    icon: Sparkles,
  },
  {
    title: "Request dataset change",
    description: "Map a requested change to affected knowledge.",
    prompt: "Assess this dataset documentation and propose a change plan. Identify affected concepts, dependencies, validation risks, and supporting evidence. Do not write files yet.",
    icon: Database,
  },
  {
    title: "Deep research",
    description: "Trace a question through the bundle and sources.",
    prompt: "Research this question across the active bundle and attached sources. Cite the evidence for each finding and label any inference: ",
    icon: Search,
  },
] as const;

const MAX_THREAD_TITLE_CHARS = 80;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sourceTooltip(source: AttachedSource): string {
  if (source.kind === "issue") return source.content;
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
  concepts,
  issues,
  onChangeAgent,
  onConnectionEnd,
  onOpenFolder,
}: AgentConversationProps) {
  const [threadTitle, setThreadTitle] = useState<ThreadTitle>({
    source: "default",
    value: "New thread",
  });
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [activeTurn, setActiveTurn] = useState<AgentTurnInfo | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [authentication, setAuthentication] = useState<AuthenticationState>({ status: "idle" });
  const [attachedConcepts, setAttachedConcepts] = useState<
    { id: string; title: string; type: string }[]
  >([]);
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [promptText, setPromptText] = useState("");
  const [queuedPrompt, setQueuedPrompt] = useState<QueuedPrompt | null>(null);
  const [sourcePickerError, setSourcePickerError] = useState<string | null>(null);
  const [sourcePicker, setSourcePicker] = useState<"files" | "folder" | "images" | null>(null);
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false);
  const [contextQuery, setContextQuery] = useState("");
  const sessionRef = useRef<AgentSessionInfo | null>(null);
  const completedTurnsRef = useRef(new Set<string>());
  const messagesRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const queuedEditRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight;
  }, [messages, pendingPermissions]);

  const [composerState, submitPrompt, isSubmitting] = useActionState<ComposerState, PromptSubmission>(
    async (_previous, { draft, source }) => {
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
        if (session?.bundleRoot !== bundleRoot) {
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
        setMessages((current) => [...current, userMessage]);
        setThreadTitle((current) => current.source === "default"
          ? { source: "derived", value: deriveThreadTitle(text, THREAD_STARTERS) }
          : current);
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
        return { status: "error", message: errorMessage(error) };
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
        applyTurnEvent(event, setMessages);
        if (event.update.kind !== "text") applyTerminalTurnEvent(event);
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
    setExportState({ status: "exporting" });
    try {
      const filename = await exportAgentTranscript(
        transcriptFilename(threadTitle.value),
        transcriptMarkdown(threadTitle.value, bundleName, agentName, messages),
      );
      setExportState(filename ? { status: "success", filename } : { status: "idle" });
    } catch (error: unknown) {
      setExportState({ status: "error", message: errorMessage(error) });
    }
  }

  return (
    <section className="agent-conversation" aria-labelledby="agent-conversation-title">
      <header className="agent-conversation__toolbar">
        <div>
          <div className="agent-conversation__title-row">
            <h2 id="agent-conversation-title" title={threadTitle.value}>{threadTitle.value}</h2>
            <ThreadTitleEditor
              title={threadTitle.value}
              onTitleChange={(value) => setThreadTitle({ source: "custom", value })}
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
              Export failed. {exportState.message}
            </p>
          )}
        </div>
        <div className="agent-conversation__toolbar-actions">
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
            {exportState.status === "exporting" ? "Exporting..." : "Export"}
          </button>
          <button
            type="button"
            className="btn ghost"
            data-agent-initial-focus
            onClick={onChangeAgent}
            disabled={
              isSubmitting || activeTurn !== null || authentication.status === "authenticating" ||
              exportState.status === "exporting"
            }
          >
            Change
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

      {bundleRoot && !requiresAuthentication && (
        <>
          <div ref={messagesRef} className="agent-conversation__messages" aria-live="polite">
            {messages.length === 0 && pendingPermissions.length === 0 ? (
              <div className="agent-conversation__welcome">
                <Bot size={24} aria-hidden="true" />
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
                {messages.map((message) => <Message key={message.id} message={message} />)}
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
              <div className="agent-composer__context-actions">
                <ContextPicker
                  concepts={concepts}
                  activeConceptId={activeConcept?.id ?? null}
                  attachedConcepts={attachedConcepts}
                  isOpen={isContextPickerOpen}
                  query={contextQuery}
                  disabled={isSubmitting || queuedPrompt !== null}
                  onOpenChange={(open) => {
                    setIsContextPickerOpen(open);
                    if (!open) setContextQuery("");
                  }}
                  onQueryChange={setContextQuery}
                  onAttach={(concept) => {
                    setAttachedConcepts((current) => [...current, concept]);
                    setIsContextPickerOpen(false);
                    setContextQuery("");
                  }}
                />
                <ValidationIssuePicker
                  issues={issues}
                  attachedIssueKeys={attachedIssueKeys}
                  sourceCount={attachedSources.length}
                  disabled={isSubmitting || queuedPrompt !== null}
                  onAttach={(issue, issueKey) =>
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
                />
                <SourcePicker
                  sourceCount={attachedSources.length}
                  disabled={isSubmitting || queuedPrompt !== null}
                  onAttach={(source) =>
                    setAttachedSources((current) => [
                      ...current,
                      { id: crypto.randomUUID(), ...source },
                    ])
                  }
                />
                <button
                  type="button"
                  className="btn ghost agent-context-attach"
                  disabled={
                    isSubmitting ||
                    queuedPrompt !== null ||
                    sourcePicker !== null ||
                    attachedSources.length >= 8
                  }
                  onClick={() => void attachLocalSources("files")}
                >
                  <FilePlus2 size={14} aria-hidden="true" />
                  {sourcePicker === "files" ? "Selecting..." : "Add files"}
                </button>
                <button
                  type="button"
                  className="btn ghost agent-context-attach"
                  disabled={
                    isSubmitting ||
                    queuedPrompt !== null ||
                    sourcePicker !== null ||
                    attachedSources.length >= 8
                  }
                  onClick={() => void attachLocalSources("folder")}
                >
                  <FolderPlus size={14} aria-hidden="true" />
                  {sourcePicker === "folder" ? "Selecting..." : "Add folder"}
                </button>
                <button
                  type="button"
                  className="btn ghost agent-context-attach"
                  title={
                    connection.capabilities.promptImage
                      ? undefined
                      : "This agent does not accept image prompts."
                  }
                  disabled={
                    !connection.capabilities.promptImage ||
                    isSubmitting ||
                    queuedPrompt !== null ||
                    sourcePicker !== null ||
                    attachedSources.length >= 8
                  }
                  onClick={() => void attachLocalSources("images")}
                >
                  <ImagePlus size={14} aria-hidden="true" />
                  {sourcePicker === "images" ? "Selecting..." : "Add images"}
                </button>
              </div>
            </div>
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
            <div className="agent-composer__actions">
              <span>{composerStatus}</span>
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
          </form>
        </>
      )}
    </section>
  );
}

interface SourcePickerProps {
  sourceCount: number;
  disabled: boolean;
  onAttach: (source: AgentSourceInput) => void;
}

interface ValidationIssuePickerProps {
  issues: readonly Issue[];
  attachedIssueKeys: ReadonlySet<string>;
  sourceCount: number;
  disabled: boolean;
  onAttach: (issue: Issue, issueKey: string) => void;
}

function validationIssueKey(issue: Issue): string {
  return JSON.stringify([issue.level, issue.conceptId, issue.message]);
}

function ValidationIssuePicker({
  issues,
  attachedIssueKeys,
  sourceCount,
  disabled,
  onAttach,
}: ValidationIssuePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const availableIssues = issues.filter(
    (issue) => !attachedIssueKeys.has(validationIssueKey(issue)),
  );
  const isAtLimit = sourceCount >= 8;
  let label = "Attach issue";
  let explanation: string | undefined;
  if (issues.length === 0) {
    label = "No validation issues";
    explanation = "This bundle has no validation issues.";
  } else if (availableIssues.length === 0) {
    label = "Issues attached";
    explanation = "All validation issues are already attached.";
  } else if (isAtLimit) {
    label = "Source limit reached";
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost agent-context-attach"
            title={explanation}
            disabled={disabled || isAtLimit || availableIssues.length === 0}
          >
            <TriangleAlert size={14} aria-hidden="true" />
            {label}
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
            className="ui-popover agent-context-picker agent-issue-picker"
            aria-label="Attach validation issue"
          >
            <div className="agent-context-picker__results">
              {availableIssues.map((issue) => {
                const key = validationIssueKey(issue);
                const severity = issue.level === "error" ? "Error" : "Warning";
                return (
                  <button
                    key={key}
                    type="button"
                    title={issue.message}
                    aria-label={`Attach ${severity.toLowerCase()}: ${issue.message}`}
                    onClick={() => {
                      onAttach(issue, key);
                      setIsOpen(false);
                    }}
                  >
                    <TriangleAlert
                      className={
                        issue.level === "error"
                          ? "agent-issue-picker__error-icon"
                          : "agent-context-chip__warning-icon"
                      }
                      size={14}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{severity}</strong>
                      <small>{issue.message}</small>
                    </span>
                    {issue.conceptId && <em>{issue.conceptId}</em>}
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SourcePicker({ sourceCount, disabled, onAttach }: SourcePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"paste" | "url">("paste");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const fetchRequestRef = useRef(0);
  const isAtLimit = sourceCount >= 8;
  const canAttach = title.trim().length > 0 && content.trim().length > 0;
  const canFetch = url.trim().startsWith("https://") && !isFetching;

  function close() {
    fetchRequestRef.current += 1;
    setIsOpen(false);
    setMode("paste");
    setTitle("");
    setContent("");
    setUrl("");
    setUrlError(null);
    setIsFetching(false);
  }

  function attach() {
    if (!canAttach) return;
    onAttach({ title: title.trim(), content });
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
      onAttach(source);
      close();
    } catch (error) {
      if (fetchRequestRef.current !== requestId) return;
      setUrlError(errorMessage(error));
      setIsFetching(false);
    }
  }

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
            className="btn ghost agent-context-attach"
            disabled={disabled || isAtLimit}
          >
            <FileText size={14} aria-hidden="true" />
            {isAtLimit ? "Source limit reached" : "Add source"}
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
          <Popover.Popup className="ui-popover agent-source-picker" aria-label="Add text source">
            <div>
              <h3>Add text source</h3>
              <p>Paste text or fetch a public HTTPS page for your next message.</p>
            </div>
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
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- opening this explicit form should focus its first field
                    autoFocus
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
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- switching to this explicit form should focus its field
                  autoFocus
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface ContextPickerProps {
  concepts: readonly { id: string; title: string; type: string }[];
  activeConceptId: string | null;
  attachedConcepts: readonly { id: string; title: string; type: string }[];
  isOpen: boolean;
  query: string;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onAttach: (concept: { id: string; title: string; type: string }) => void;
}

function ContextPicker({
  concepts,
  activeConceptId,
  attachedConcepts,
  isOpen,
  query,
  disabled,
  onOpenChange,
  onQueryChange,
  onAttach,
}: ContextPickerProps) {
  const attachedIds = new Set(attachedConcepts.map((concept) => concept.id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = concepts
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
  const isAtLimit = attachedConcepts.length >= 8;

  return (
    <Popover.Root open={isOpen} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost agent-context-attach"
            disabled={disabled || isAtLimit}
          >
            <Paperclip size={14} aria-hidden="true" />
            {isAtLimit ? "Context limit reached" : "Attach context"}
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
          <Popover.Popup className="ui-popover agent-context-picker" aria-label="Attach concept context">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- opening this explicit picker should focus its search field
              autoFocus
              type="search"
              aria-label="Search concepts to attach"
              placeholder="Search concepts..."
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            <div className="agent-context-picker__results">
              {matches.length > 0 ? (
                matches.map((concept) => (
                  <button
                    key={concept.id}
                    type="button"
                    onClick={() => onAttach(concept)}
                    aria-label={`Add ${concept.title} to context`}
                  >
                    <FileText size={14} aria-hidden="true" />
                    <span>
                      <strong>{concept.title}</strong>
                      <small>{concept.id}.md</small>
                    </span>
                    {concept.id === activeConceptId && <em>Current</em>}
                  </button>
                ))
              ) : (
                <p>No matching concepts.</p>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
  setMessages: Dispatch<SetStateAction<ConversationMessage[]>>,
): void {
  if (event.update.kind === "text") {
    const messageId = `agent-${event.turnId}`;
    const chunkText = event.update.text;
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === messageId);
      if (index < 0) return [...current, { id: messageId, role: "agent", text: chunkText }];
      return current.map((message, messageIndex) =>
        messageIndex === index ? { ...message, text: message.text + chunkText } : message,
      );
    });
  } else if (event.update.kind === "failed") {
    const failureMessage = event.update.message;
    setMessages((current) => [
      ...current,
      {
        id: `status-${event.turnId}`,
        role: "status",
        tone: "error",
        text: `Turn failed. ${failureMessage}`,
      },
    ]);
  } else if (event.update.stopReason !== "end-turn") {
    const stop = ({
      cancelled: { text: "Turn cancelled.", tone: "neutral" },
      refusal: { text: "The agent refused this turn.", tone: "warning" },
      "max-tokens": { text: "The agent reached its token limit.", tone: "warning" },
      "max-turn-requests": {
        text: "The agent reached its turn-request limit.",
        tone: "warning",
      },
      unknown: { text: "The agent stopped for an unknown reason.", tone: "warning" },
    } as const)[event.update.stopReason];
    setMessages((current) => [
      ...current,
      {
        id: `status-${event.turnId}`,
        role: "status",
        tone: stop.tone,
        text: stop.text,
      },
    ]);
  }
}

function Message({ message }: { message: ConversationMessage }) {
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
      </div>
    </article>
  );
}
