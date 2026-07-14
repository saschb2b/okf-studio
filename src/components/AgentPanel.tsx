import { ArrowLeft, CircleAlert, PanelRightClose, Plus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import type { AgentConnectionInfo } from "../agent/connection.ts";
import { AGENT_PANEL_CLAMP, useApp } from "../store.tsx";
import { captureReaderSelection } from "../agent/readerSelection.ts";
import { useAgentConnections } from "../agent/useAgentConnections.ts";
import { focusAgentPanelOpener } from "../agentPanelFocus.ts";
import { AgentConnectionCatalog } from "./AgentConnectionCatalog.tsx";
import { AgentConversation } from "./AgentConversation.tsx";
import type { AgentConversationProps } from "./AgentConversation.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import "./AgentPanel.css";

export function AgentPanel() {
  const { state, actions } = useApp();
  const allConnections = useAgentConnections();
  const connections = allConnections.filter(
    (connection) => connection.bundleRoot === null || connection.bundleRoot === state.activeRoot,
  );
  const activeConcept = state.bundle?.concepts.find(
    (concept) => concept.id === state.activeConceptId,
  ) ?? null;
  const panelRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<"empty" | "catalog" | "conversation">("empty");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectionFailure, setConnectionFailure] = useState<ConnectionFailure | null>(null);
  const [resetToken, setResetToken] = useState(0);
  if (!state.panels.agent) return null;

  const width =
    state.agentPanelWidth === null
      ? "var(--agent-panel-default)"
      : `${state.agentPanelWidth}px`;

  function closePanel() {
    actions.togglePanel("agent", false);
    focusAgentPanelOpener();
  }

  function openCatalog() {
    setView("catalog");
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-agent-catalog-focus]")?.focus();
    });
  }

  function closeCatalog() {
    setView(connections.length > 0 ? "conversation" : "empty");
    requestAnimationFrame(() => {
      focusVisiblePanelContent(panelRef.current);
    });
  }

  const selectedConnection = connections.find(
    (connection) => connection.connectionId === selectedConnectionId,
  ) ?? connections.at(0);
  const visibleView = view === "catalog"
    ? "catalog"
    : selectedConnection
      ? "conversation"
      : "empty";

  // Land on a safe view and remount the failed subtree. Thread UI state is
  // lost, but saved-thread metadata lets the user resume the conversation.
  function resetPanel() {
    setView(selectedConnection ? "conversation" : "empty");
    setResetToken((token) => token + 1);
    requestAnimationFrame(() => {
      focusVisiblePanelContent(panelRef.current);
    });
  }

  return (
    <>
      <AgentPanelDivider panelRef={panelRef} />
      <aside
        ref={panelRef}
        className="agent-panel"
        aria-label="Agent panel"
        style={{ "--agent-panel-width": width } as React.CSSProperties}
      >
        <header className="agent-panel__head">
          <span className="agent-panel__title">
            <Sparkles size={16} aria-hidden="true" />
            Agent
          </span>
          <button
            type="button"
            className="btn ghost agent-panel__close"
            aria-label="Close agent panel and return to workspace"
            onClick={closePanel}
          >
            <ArrowLeft className="agent-panel__back-icon" size={16} />
            <span className="agent-panel__back-label">Workspace</span>
            <PanelRightClose className="agent-panel__close-icon" size={16} />
          </button>
        </header>
        <ErrorBoundary
          resetKey={resetToken}
          fallback={
            <div className="agent-panel__empty" role="alert">
              <span className="agent-panel__mark" aria-hidden="true">
                <CircleAlert size={24} />
              </span>
              <h2>The agent panel hit an error</h2>
              <p>
                The rest of Studio is unaffected. Reset the panel to continue;
                a saved thread can be resumed from the conversation view.
              </p>
              <button type="button" className="btn primary" onClick={resetPanel}>
                Reset panel
              </button>
            </div>
          }
        >
          {connectionFailure && visibleView !== "catalog" && (
            <div className="agent-panel__connection-failure" role="alert">
              <CircleAlert size={16} aria-hidden="true" />
              <div>
                <strong>{connectionFailure.agentName} stopped</strong>
                <p title={connectionFailure.message}>{connectionFailure.message}</p>
              </div>
              <div className="agent-panel__connection-failure-actions">
                <button type="button" className="btn" onClick={openCatalog}>
                  Review connections
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setConnectionFailure(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {visibleView === "catalog" && (
            <AgentConnectionCatalog
              bundleRoot={state.activeRoot}
              onBack={closeCatalog}
              onConnectionAvailable={(connection) => {
                if (connectionFailure?.profileId === connection.profileId) {
                  setConnectionFailure(null);
                }
                setSelectedConnectionId(connection.connectionId);
              }}
              onConnected={(connection) => {
                if (connectionFailure?.profileId === connection.profileId) {
                  setConnectionFailure(null);
                }
                setSelectedConnectionId(connection.connectionId);
                setView("conversation");
              }}
            />
          )}
          {connections.length > 0 && (
            <div
              className="agent-panel__conversation-stack"
              hidden={visibleView !== "conversation"}
            >
              <nav className="agent-panel__connections" aria-label="Agent connections">
                {connections.map((connection) => {
                  const label = connectionLabel(connection);
                  const selected = connection.connectionId === selectedConnection?.connectionId;
                  return (
                    <button
                      type="button"
                      className="btn ghost agent-panel__connection"
                      key={connection.connectionId}
                      aria-label={`Switch to ${label}`}
                      aria-pressed={selected}
                      title={label}
                      onClick={() => setSelectedConnectionId(connection.connectionId)}
                    >
                      <span className="agent-panel__connection-label">{label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="btn ghost agent-panel__connection agent-panel__connection--add"
                  aria-label="Connect another agent"
                  title="Connect another agent"
                  onClick={openCatalog}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </nav>
              {connections.map((connection) => (
                <ConnectionThreads
                  key={`${connection.connectionId}:${state.activeRoot ?? "no-bundle"}`}
                  connection={connection}
                  bundleRoot={state.activeRoot}
                  bundleName={state.bundle?.name ?? null}
                  activeConcept={activeConcept}
                  onCaptureReaderSelection={() => captureReaderSelection(activeConcept)}
                  concepts={state.bundle?.concepts ?? []}
                  issues={state.bundle?.issues ?? []}
                  onChangeAgent={openCatalog}
                  onConnectionEnd={(event) => {
                    if (event.status === "failed") {
                      setConnectionFailure({
                        profileId: event.profileId,
                        agentName: connectionLabel(connection),
                        message: event.message,
                      });
                    }
                    setSelectedConnectionId((current) =>
                      current === connection.connectionId ? null : current,
                    );
                  }}
                  onOpenFolder={() => actions.openFolder()}
                  hidden={connection.connectionId !== selectedConnection?.connectionId}
                />
              ))}
            </div>
          )}
          {visibleView === "empty" && (
            <div className="agent-panel__empty">
              <span className="agent-panel__mark" aria-hidden="true">
                <Sparkles size={24} />
              </span>
              <h2>Connect an agent</h2>
              <p>
                Use an existing subscription, an API-backed Studio Agent, or a
                local model. Nothing connects until you choose.
              </p>
              <button
                type="button"
                className="btn primary"
                data-agent-initial-focus
                onClick={openCatalog}
              >
                Connect an agent
              </button>
            </div>
          )}
        </ErrorBoundary>
      </aside>
    </>
  );
}

const MAX_THREAD_SURFACES = 8;

interface ThreadSurface {
  id: string;
  ordinal: number;
  title: string;
}

interface ConnectionFailure {
  profileId: string;
  agentName: string;
  message: string;
}

type ConnectionThreadsProps = Omit<
  AgentConversationProps,
  "threadSurfaceCount" | "onThreadTitleChange" | "onCloseThreadSurface"
> & {
  hidden: boolean;
};

function ConnectionThreads({
  connection,
  hidden,
  ...conversationProps
}: ConnectionThreadsProps) {
  const [surfaces, setSurfaces] = useState<ThreadSurface[]>(() => [newThreadSurface(1)]);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState(() => surfaces[0].id);
  const threadNavRef = useRef<HTMLElement>(null);
  const selectedSurface = surfaces.find((surface) => surface.id === selectedSurfaceId) ?? surfaces[0];
  const connectionName = connectionLabel(connection);

  function addThreadSurface() {
    if (surfaces.length >= MAX_THREAD_SURFACES) return;
    const ordinal = Math.max(...surfaces.map((surface) => surface.ordinal)) + 1;
    const surface = newThreadSurface(ordinal);
    setSurfaces((current) => [...current, surface]);
    setSelectedSurfaceId(surface.id);
    requestAnimationFrame(() => {
      threadNavRef.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus();
    });
  }

  function closeThreadSurface(surfaceId: string) {
    if (surfaces.length <= 1) return;
    const remaining = surfaces.filter((surface) => surface.id !== surfaceId);
    setSurfaces(remaining);
    if (selectedSurfaceId === surfaceId) setSelectedSurfaceId(remaining[0].id);
    requestAnimationFrame(() => {
      threadNavRef.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus();
    });
  }

  function renameThreadSurface(surfaceId: string, title: string) {
    setSurfaces((current) => current.map((surface) =>
      surface.id === surfaceId ? { ...surface, title } : surface,
    ));
  }

  return (
    <div className="agent-panel__conversation" hidden={hidden}>
      <nav
        ref={threadNavRef}
        className="agent-panel__threads"
        aria-label={`${connectionName} threads`}
      >
        {surfaces.map((surface) => {
          const selected = surface.id === selectedSurface.id;
          const label = `Thread ${surface.ordinal}: ${surface.title}`;
          return (
            <button
              type="button"
              className="btn ghost agent-panel__thread"
              key={surface.id}
              aria-label={`Switch to ${label}`}
              aria-pressed={selected}
              title={label}
              onClick={() => setSelectedSurfaceId(surface.id)}
            >
              <span className="agent-panel__thread-number" aria-hidden="true">
                {surface.ordinal}
              </span>
              <span className="agent-panel__thread-label">{surface.title}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="btn ghost agent-panel__thread agent-panel__thread--add"
          aria-label={`Start another thread with ${connectionName}`}
          title={surfaces.length >= MAX_THREAD_SURFACES
            ? `Studio keeps at most ${MAX_THREAD_SURFACES} live threads per connection.`
            : `Start another thread with ${connectionName}`}
          disabled={surfaces.length >= MAX_THREAD_SURFACES}
          onClick={addThreadSurface}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </nav>
      {surfaces.map((surface) => (
        <div
          className="agent-panel__thread-surface"
          key={surface.id}
          hidden={surface.id !== selectedSurface.id}
        >
          <AgentConversation
            {...conversationProps}
            connection={connection}
            threadSurfaceCount={surfaces.length}
            onThreadTitleChange={(title) => renameThreadSurface(surface.id, title)}
            onCloseThreadSurface={() => closeThreadSurface(surface.id)}
          />
        </div>
      ))}
    </div>
  );
}

function newThreadSurface(ordinal: number): ThreadSurface {
  return {
    id: crypto.randomUUID(),
    ordinal,
    title: "New thread",
  };
}

function connectionLabel(connection: AgentConnectionInfo): string {
  return connection.agent?.title ?? connection.agent?.name ?? "Agent";
}

function focusVisiblePanelContent(panel: HTMLElement | null): void {
  const visibleConversation = panel?.querySelector<HTMLElement>(
    ".agent-panel__conversation:not([hidden]) .agent-panel__thread-surface:not([hidden]) [data-agent-initial-focus]",
  );
  const emptyAction = panel?.querySelector<HTMLElement>(
    ".agent-panel__empty [data-agent-initial-focus]",
  );
  (visibleConversation ?? emptyAction)?.focus();
}

function AgentPanelDivider({
  panelRef,
}: {
  panelRef: React.RefObject<HTMLElement | null>;
}) {
  const { state, actions } = useApp();
  const cleanupRef = useRef<(() => void) | null>(null);
  const valueNow =
    state.agentPanelWidth ??
    Math.round((AGENT_PANEL_CLAMP.min + AGENT_PANEL_CLAMP.max) / 2);

  useEffect(() => () => cleanupRef.current?.(), []);

  function current(): number {
    if (state.agentPanelWidth !== null) return state.agentPanelWidth;
    const rendered = panelRef.current?.getBoundingClientRect().width ?? 0;
    return rendered > 0
      ? rendered
      : Math.round((AGENT_PANEL_CLAMP.min + AGENT_PANEL_CLAMP.max) / 2);
  }

  function clamp(width: number): number {
    return Math.min(
      AGENT_PANEL_CLAMP.max,
      Math.max(AGENT_PANEL_CLAMP.min, width),
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const right =
      panelRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    let latest: number | null = null;
    const move = (pointerEvent: PointerEvent) => {
      latest = clamp(right - pointerEvent.clientX);
      panelRef.current?.style.setProperty(
        "--agent-panel-width",
        `${latest}px`,
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      cleanupRef.current = null;
      if (latest !== null) actions.setAgentPanelWidth(latest);
    };
    cleanupRef.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      actions.setAgentPanelWidth(current() + step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      actions.setAgentPanelWidth(current() - step);
    } else if (
      event.key === "Home" ||
      event.key === "End" ||
      event.key === "Enter"
    ) {
      event.preventDefault();
      actions.setAgentPanelWidth(null);
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- WAI-ARIA window splitter
    <div
      className="agent-panel-divider"
      role="separator"
      aria-label="Resize agent panel"
      aria-orientation="vertical"
      aria-valuemin={AGENT_PANEL_CLAMP.min}
      aria-valuemax={AGENT_PANEL_CLAMP.max}
      aria-valuenow={valueNow}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => actions.setAgentPanelWidth(null)}
      onKeyDown={onKeyDown}
    />
  );
}
