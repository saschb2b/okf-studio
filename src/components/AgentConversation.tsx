import { Bot, Send, Square, User } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AgentConnectionEvent,
  AgentConnectionInfo,
  AgentSessionInfo,
  AgentTurnEvent,
  AgentTurnInfo,
} from "../agent/connection.ts";
import {
  cancelAgentTurn,
  newAgentSession,
  onAgentConnectionState,
  onAgentTurnUpdate,
  promptAgent,
} from "../ipc.ts";
import "./AgentConversation.css";

interface AgentConversationProps {
  connection: AgentConnectionInfo;
  bundleRoot: string | null;
  bundleName: string | null;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AgentConversation({
  connection,
  bundleRoot,
  bundleName,
  onChangeAgent,
  onConnectionEnd,
  onOpenFolder,
}: AgentConversationProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeTurn, setActiveTurn] = useState<AgentTurnInfo | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const sessionRef = useRef<AgentSessionInfo | null>(null);
  const completedTurnsRef = useRef(new Set<string>());
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight;
  }, [messages]);

  useEffect(() => {
    let stopTurnUpdates: (() => void) | undefined;
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
      onAgentConnectionState((event) => {
        if (event.connectionId === connection.connectionId) onConnectionEnd(event);
      }),
    ]).then(
      ([stopTurns, stopConnections]) => {
        if (isDisposed) {
          stopTurns();
          stopConnections();
        } else {
          stopTurnUpdates = stopTurns;
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
        const turn = await promptAgent(connection.connectionId, session.sessionId, text);
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

  const agentName = connection.agent?.title ?? connection.agent?.name ?? "Custom agent";
  const requiresAuthentication = connection.authMethods.length > 0;

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
        <div className="agent-conversation__state" role="status">
          <h3>Authentication required</h3>
          <p>This agent advertised sign-in methods, but Studio does not handle them yet.</p>
        </div>
      )}

      {bundleRoot && !requiresAuthentication && (
        <>
          <div ref={messagesRef} className="agent-conversation__messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="agent-conversation__welcome">
                <Bot size={24} aria-hidden="true" />
                <h3>Ask about this bundle</h3>
                <p>The agent receives the bundle root as its ACP working directory.</p>
              </div>
            ) : (
              messages.map((message) => <Message key={message.id} message={message} />)
            )}
          </div>
          <form className="agent-composer" action={submitPrompt}>
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
  return (
    <article className={`agent-message agent-message--${message.role}`}>
      <span className="agent-message__icon" aria-hidden="true">
        {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
      </span>
      <div>
        <strong>{message.role === "user" ? "You" : "Agent"}</strong>
        <p>{message.text}</p>
      </div>
    </article>
  );
}
