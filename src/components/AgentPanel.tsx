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
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import "./AgentPanel.css";

export function AgentPanel() {
  const { state, actions } = useApp();
  const connections = useAgentConnections();
  const activeConcept = state.bundle?.concepts.find(
    (concept) => concept.id === state.activeConceptId,
  ) ?? null;
  const panelRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<"empty" | "catalog" | "conversation">("empty");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
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
          {visibleView === "catalog" && (
            <AgentConnectionCatalog
              onBack={closeCatalog}
              onConnectionAvailable={(connection) => {
                setSelectedConnectionId(connection.connectionId);
              }}
              onConnected={(connection) => {
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
                <div
                  className="agent-panel__conversation"
                  key={connection.connectionId}
                  hidden={connection.connectionId !== selectedConnection?.connectionId}
                >
                  <AgentConversation
                    key={`${connection.connectionId}:${state.activeRoot ?? "no-bundle"}`}
                    connection={connection}
                    bundleRoot={state.activeRoot}
                    bundleName={state.bundle?.name ?? null}
                    activeConcept={activeConcept}
                    onCaptureReaderSelection={() => captureReaderSelection(activeConcept)}
                    concepts={state.bundle?.concepts ?? []}
                    issues={state.bundle?.issues ?? []}
                    onChangeAgent={openCatalog}
                    onConnectionEnd={() => {
                      setSelectedConnectionId((current) =>
                        current === connection.connectionId ? null : current,
                      );
                    }}
                    onOpenFolder={() => actions.openFolder()}
                  />
                </div>
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

function connectionLabel(connection: AgentConnectionInfo): string {
  return connection.agent?.title ?? connection.agent?.name ?? "Agent";
}

function focusVisiblePanelContent(panel: HTMLElement | null): void {
  const visibleConversation = panel?.querySelector<HTMLElement>(
    ".agent-panel__conversation:not([hidden]) [data-agent-initial-focus]",
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
