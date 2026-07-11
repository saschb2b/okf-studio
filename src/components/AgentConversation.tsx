import { Bot, FileText, Paperclip, Send, ShieldQuestion, Square, User, X } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { useActionState, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AgentConnectionEvent,
  AgentConnectionInfo,
  AgentPermissionEvent,
  AgentPermissionOptionInfo,
  AgentSessionInfo,
  AgentTurnEvent,
  AgentTurnInfo,
} from "../agent/connection.ts";
import {
  cancelAgentTurn,
  authenticateAgent,
  newAgentSession,
  onAgentConnectionState,
  onAgentPermissionUpdate,
  onAgentTurnUpdate,
  promptAgent,
  respondAgentPermission,
} from "../ipc.ts";
import { renderMarkdown } from "../markdown.ts";
import "./AgentConversation.css";

interface AgentConversationProps {
  connection: AgentConnectionInfo;
  bundleRoot: string | null;
  bundleName: string | null;
  activeConcept: { id: string; title: string } | null;
  concepts: readonly { id: string; title: string; type: string }[];
  onChangeAgent: () => void;
  onConnectionEnd: (event: AgentConnectionEvent) => void;
  onOpenFolder: () => Promise<void>;
}

interface ConversationMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}

type ComposerState = { status: "idle" } | { status: "error"; message: string };
type AuthenticationState =
  | { status: "idle" }
  | { status: "authenticating"; methodId: string }
  | { status: "error"; methodId: string; message: string };
type PendingPermission = AgentPermissionEvent & {
  update: Extract<AgentPermissionEvent["update"], { kind: "requested" }>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AgentConversation({
  connection,
  bundleRoot,
  bundleName,
  activeConcept,
  concepts,
  onChangeAgent,
  onConnectionEnd,
  onOpenFolder,
}: AgentConversationProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeTurn, setActiveTurn] = useState<AgentTurnInfo | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [authentication, setAuthentication] = useState<AuthenticationState>({ status: "idle" });
  const [attachedConcepts, setAttachedConcepts] = useState<
    { id: string; title: string; type: string }[]
  >([]);
  const [attachedSources, setAttachedSources] = useState<
    { id: string; title: string; content: string }[]
  >([]);
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false);
  const [contextQuery, setContextQuery] = useState("");
  const sessionRef = useRef<AgentSessionInfo | null>(null);
  const completedTurnsRef = useRef(new Set<string>());
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight;
  }, [messages, pendingPermissions]);

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
        if (event.update.kind !== "text") {
          completedTurnsRef.current.add(event.turnId);
          setActiveTurn((turn) => (turn?.turnId === event.turnId ? null : turn));
          setIsCancelling(false);
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

  const [composerState, submitPrompt, isSubmitting] = useActionState<ComposerState, FormData>(
    async (_previous, formData) => {
      const promptValue = formData.get("prompt");
      const text = typeof promptValue === "string" ? promptValue.trim() : "";
      if (!text) return { status: "error", message: "Enter a message." };
      if (!bundleRoot) return { status: "error", message: "Open an OKF bundle first." };
      const userMessage: ConversationMessage = {
        id: `user-${crypto.randomUUID()}`,
        role: "user",
        text,
      };
      setMessages((current) => [...current, userMessage]);
      try {
        let session = sessionRef.current;
        if (session?.bundleRoot !== bundleRoot) {
          session = await newAgentSession(connection.connectionId, bundleRoot);
          sessionRef.current = session;
        }
        const contextPaths = attachedConcepts.map((concept) => `${concept.id}.md`);
        const sources = attachedSources.map(({ title, content }) => ({ title, content }));
        const turn = await promptAgent(
          connection.connectionId,
          session.sessionId,
          text,
          contextPaths,
          sources,
        );
        setAttachedConcepts([]);
        setAttachedSources([]);
        if (!completedTurnsRef.current.delete(turn.turnId)) setActiveTurn(turn);
        return { status: "idle" };
      } catch (error: unknown) {
        return { status: "error", message: errorMessage(error) };
      }
    },
    { status: "idle" },
  );

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

  const agentName = connection.agent?.title ?? connection.agent?.name ?? "Custom agent";
  const requiresAuthentication = !connection.authenticated && connection.authMethods.length > 0;

  return (
    <section className="agent-conversation" aria-labelledby="agent-conversation-title">
      <header className="agent-conversation__toolbar">
        <div>
          <h2 id="agent-conversation-title">{agentName}</h2>
          <p>{bundleName ?? "No bundle selected"}</p>
        </div>
        <button
          type="button"
          className="btn ghost"
          data-agent-initial-focus
          onClick={onChangeAgent}
          disabled={
            isSubmitting || activeTurn !== null || authentication.status === "authenticating"
          }
        >
          Change
        </button>
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
          <form className="agent-composer" action={submitPrompt}>
            <div className="agent-composer__context">
              {attachedConcepts.map((concept) => (
                <span key={concept.id} className="agent-context-chip">
                  <FileText size={14} aria-hidden="true" />
                  <span title={concept.title}>{concept.title}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${concept.title} from context`}
                    disabled={isSubmitting || activeTurn !== null}
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
                  <FileText size={14} aria-hidden="true" />
                  <span title={source.title}>{source.title}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${source.title} source`}
                    disabled={isSubmitting || activeTurn !== null}
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
              <ContextPicker
                concepts={concepts}
                activeConceptId={activeConcept?.id ?? null}
                attachedConcepts={attachedConcepts}
                isOpen={isContextPickerOpen}
                query={contextQuery}
                disabled={isSubmitting || activeTurn !== null}
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
              <SourcePicker
                sourceCount={attachedSources.length}
                disabled={isSubmitting || activeTurn !== null}
                onAttach={(source) =>
                  setAttachedSources((current) => [
                    ...current,
                    { id: crypto.randomUUID(), ...source },
                  ])
                }
              />
            </div>
            <label className="sr-only" htmlFor="agent-prompt">Message the agent</label>
            <textarea
              id="agent-prompt"
              name="prompt"
              rows={3}
              maxLength={128 * 1024}
              placeholder="Ask about this bundle..."
              disabled={isSubmitting || activeTurn !== null}
            />
            {composerState.status === "error" && (
              <p className="agent-composer__error" role="alert">{composerState.message}</p>
            )}
            <div className="agent-composer__actions">
              <span>{activeTurn ? "Agent is working" : "Text only"}</span>
              {activeTurn ? (
                <button type="button" className="btn" disabled={isCancelling} onClick={() => void stopTurn()}>
                  <Square size={14} aria-hidden="true" />
                  {isCancelling ? "Stopping..." : "Stop"}
                </button>
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
  onAttach: (source: { title: string; content: string }) => void;
}

function SourcePicker({ sourceCount, disabled, onAttach }: SourcePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const isAtLimit = sourceCount >= 8;
  const canAttach = title.trim().length > 0 && content.trim().length > 0;

  function close() {
    setIsOpen(false);
    setTitle("");
    setContent("");
  }

  function attach() {
    if (!canAttach) return;
    onAttach({ title: title.trim(), content });
    close();
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
              <p>Pasted text or Markdown. Sent with your next message.</p>
            </div>
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
            <div className="agent-source-picker__actions">
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              <button type="button" className="btn primary" disabled={!canAttach} onClick={attach}>
                Attach source
              </button>
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
      { id: `agent-${event.turnId}`, role: "agent", text: `Agent turn failed. ${failureMessage}` },
    ]);
  } else if (event.update.stopReason !== "end-turn") {
    const stopMessage = {
      cancelled: "Turn cancelled.",
      refusal: "The agent refused this turn.",
      "max-tokens": "The agent reached its token limit.",
      "max-turn-requests": "The agent reached its turn-request limit.",
      unknown: "The agent stopped for an unknown reason.",
    }[event.update.stopReason];
    setMessages((current) => [
      ...current,
      { id: `stop-${event.turnId}`, role: "agent", text: stopMessage },
    ]);
  }
}

function Message({ message }: { message: ConversationMessage }) {
  const renderedAgentText = message.role === "agent"
    ? { __html: renderMarkdown(message.text) }
    : null;
  return (
    <article className={`agent-message agent-message--${message.role}`}>
      <span className="agent-message__icon" aria-hidden="true">
        {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
      </span>
      <div>
        <strong>{message.role === "user" ? "You" : "Agent"}</strong>
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
