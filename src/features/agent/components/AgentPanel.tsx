import { ArrowLeft, CircleAlert, PanelRightClose, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import type * as React from "react";
import type { AgentConnectionInfo, AgentSessionHistoryInfo } from "@/features/agent/connection.ts";
import { agentPanelClamp, useApp } from "@/shared/store.tsx";
import { captureReaderSelection } from "@/features/agent/readerSelection.ts";
import { useAgentConnections } from "@/features/agent/useAgentConnections.ts";
import { focusAgentPanelOpener } from "@/features/agent/agentPanelFocus.ts";
import {
  agentRestoreStatus,
  maybeRestoreLastAgentConnection,
  subscribeAgentRestore,
} from "@/shared/ipc.ts";
import { AgentConnectionCatalog } from "@/features/agent/components/AgentConnectionCatalog.tsx";
import { AgentConversation } from "@/features/agent/components/AgentConversation.tsx";
import type { AgentConversationProps } from "@/features/agent/components/AgentConversation.tsx";
import { ErrorBoundary } from "@/features/shell/components/ErrorBoundary.tsx";
import { NewAgentThreadMenu } from "@/features/agent/components/NewAgentThreadMenu.tsx";
import { ThreadStatusIndicator, threadStatusLabel } from "@/features/agent/components/conversation/ThreadStatusIndicator.tsx";
import { ThreadSwitcher } from "@/features/agent/components/conversation/ThreadSwitcher.tsx";
import { OkfTaskLauncher } from "@/features/agent/components/OkfTaskLauncher.tsx";
import type { OkfTaskLauncherStatus } from "@/features/agent/components/OkfTaskLauncher.tsx";
import {
  bundleContextFingerprint,
  createOkfContextPlan,
  type OkfTaskId,
  type OkfTaskKickoff,
} from "@/features/agent/taskContext.ts";
import {
  kickoffForOkfOrigin,
  tasksForOkfOrigin,
} from "@/features/agent/taskLauncher.ts";
import { aggregateThreadStatus } from "@/features/agent/threadStatus.ts";
import type { AgentThreadStatus } from "@/features/agent/threadStatus.ts";
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
  const [connectionStatuses, setConnectionStatuses] = useState(
    () => new Map<string, AgentThreadStatus>(),
  );
  const [resetToken, setResetToken] = useState(0);
  // Each ConnectionThreads registers how to open one more thread surface so
  // the agent popover can start a thread on an already-connected agent.
  const threadOpeners = useRef(new Map<string, (kickoff?: OkfTaskKickoff) => void>());
  const launcherRequest = state.okfTaskLauncher;
  const launcherTasks = launcherRequest ? tasksForOkfOrigin(launcherRequest.origin) : [];
  const [launcherSelection, setLauncherSelection] = useState<{
    requestId: string;
    taskId: OkfTaskId;
  } | null>(null);
  const [launcherSuspension, setLauncherSuspension] = useState<{
    requestId: string;
    reason: "connection" | "authentication";
  } | null>(null);

  // Restore the most recent explicitly connected agent once, when the panel
  // first has an open bundle after launch. An explicit Disconnect forgot the
  // entry, so this only ever continues a connection the user chose to keep.
  // The attempt and its status live in the connection store; the restored
  // connection then appears through the ordinary connections subscription.
  const restoreState = useSyncExternalStore(subscribeAgentRestore, agentRestoreStatus);
  const panelOpen = state.panels.agent;
  const activeRoot = state.activeRoot;
  useEffect(() => {
    if (panelOpen && activeRoot) maybeRestoreLastAgentConnection(activeRoot);
  }, [panelOpen, activeRoot]);
  if (!state.panels.agent) return null;

  const width =
    state.agentPanelWidth === null
      ? "var(--agent-panel-default)"
      : `${state.agentPanelWidth}px`;

  function closePanel() {
    if (launcherRequest) actions.closeOkfTaskLauncher({ restoreFocus: false });
    setLauncherSuspension(null);
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
    setLauncherSuspension(null);
    requestAnimationFrame(() => {
      focusVisiblePanelContent(panelRef.current);
    });
  }

  const selectedConnection = connections.find(
    (connection) => connection.connectionId === selectedConnectionId,
  ) ?? connections.at(0);

  function requestNewThread(connectionId: string, kickoff?: OkfTaskKickoff) {
    setSelectedConnectionId(connectionId);
    setView("conversation");
    threadOpeners.current.get(connectionId)?.(kickoff);
  }

  function registerThreadOpener(
    connectionId: string,
    open: ((kickoff?: OkfTaskKickoff) => void) | null,
  ) {
    if (open) threadOpeners.current.set(connectionId, open);
    else threadOpeners.current.delete(connectionId);
  }
  const visibleView = view === "catalog"
    ? "catalog"
    : selectedConnection
      ? "conversation"
      : "empty";
  const selectedLauncherTask = launcherRequest
    && launcherSelection?.requestId === launcherRequest.requestId
    && launcherTasks.includes(launcherSelection.taskId)
    ? launcherSelection.taskId
    : undefined;
  const preferredLauncherTask = launcherRequest?.preferredTaskId
    && launcherTasks.includes(launcherRequest.preferredTaskId)
    ? launcherRequest.preferredTaskId
    : undefined;
  const launcherTaskId = selectedLauncherTask ?? preferredLauncherTask ?? launcherTasks.at(0);
  const launcherSuspended = launcherRequest
    && launcherSuspension?.requestId === launcherRequest.requestId
    ? launcherSuspension
    : null;
  const launcherHidden = launcherSuspended?.reason === "connection"
    || (launcherSuspended?.reason === "authentication" && !selectedConnection?.authenticated);
  const launcherPlan = launcherRequest && launcherTaskId && state.activeRoot && state.bundle
    ? createLauncherPlan(launcherRequest.origin, launcherTaskId, state.activeRoot, state.bundle)
    : undefined;
  const launcherFingerprint = state.activeRoot && state.bundle
    ? bundleContextFingerprint(state.activeRoot, state.bundle.concepts, state.bundle.issues)
    : null;
  const launcherStatus: OkfTaskLauncherStatus = !launcherRequest || launcherTasks.length === 0
    ? "unsupported"
    : connections.length === 0
      ? "first-use"
      : selectedConnection && !selectedConnection.authenticated && selectedConnection.authMethods.length > 0
        ? "authentication"
        : launcherFingerprint !== launcherRequest.openedBundleFingerprint
          ? "stale"
          : launcherPlan?.omissions.some((omission) => omission.reason === "budget-exceeded")
            ? "overflow"
            : selectedConnection && ["running", "waiting"].includes(
              connectionStatuses.get(selectedConnection.connectionId) ?? "idle",
            )
              ? "active-thread-conflict"
              : "ready";

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
                setLauncherSuspension(null);
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
                  const status = connectionStatuses.get(connection.connectionId) ?? "idle";
                  const selected = connection.connectionId === selectedConnection?.connectionId;
                  return (
                    <button
                      type="button"
                      className="btn ghost agent-panel__connection"
                      key={connection.connectionId}
                      aria-label={`Switch to ${label}, ${threadStatusLabel(status)}`}
                      aria-pressed={selected}
                      title={label}
                      onFocus={revealSwitcherItem}
                      onClick={() => setSelectedConnectionId(connection.connectionId)}
                    >
                      <ThreadStatusIndicator status={status} />
                      <span className="agent-panel__connection-label">{label}</span>
                    </button>
                  );
                })}
                <NewAgentThreadMenu
                  bundleRoot={state.activeRoot}
                  connections={connections}
                  onNewThread={requestNewThread}
                  onConnected={(connection) => {
                    if (connectionFailure?.profileId === connection.profileId) {
                      setConnectionFailure(null);
                    }
                    setSelectedConnectionId(connection.connectionId);
                    setView("conversation");
                  }}
                  onOpenCatalog={openCatalog}
                />
              </nav>
              {connections.map((connection) => (
                <ConnectionThreads
                  key={`${connection.connectionId}:${state.activeRoot ?? "no-bundle"}`}
                  onRegisterThreadOpener={registerThreadOpener}
                  connection={connection}
                  bundleRoot={state.activeRoot}
                  bundleName={state.bundle?.name ?? null}
                  activeConcept={activeConcept}
                  onCaptureReaderSelection={() => captureReaderSelection(activeConcept)}
                  concepts={state.bundle?.concepts ?? []}
                  onOpenConcept={(conceptId) => actions.selectConcept(conceptId)}
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
                  notificationsEnabled={state.settings.agentNotifications}
                  notificationSound={state.settings.agentNotificationSound}
                  onConnectionStatusChange={(status) => {
                    setConnectionStatuses((current) => {
                      if (current.get(connection.connectionId) === status) return current;
                      const next = new Map(current);
                      next.set(connection.connectionId, status);
                      return next;
                    });
                  }}
                  hidden={connection.connectionId !== selectedConnection?.connectionId}
                />
              ))}
            </div>
          )}
          {visibleView === "empty" && restoreState === "restoring" && (
            <div className="agent-panel__empty" role="status">
              <span className="agent-panel__mark" aria-hidden="true">
                <RefreshCw size={24} />
              </span>
              <h2>Reconnecting your last agent</h2>
              <p>Restoring the connection this panel had when Studio closed.</p>
            </div>
          )}
          {visibleView === "empty" && restoreState !== "restoring" && (
            <div className="agent-panel__empty">
              <span className="agent-panel__mark" aria-hidden="true">
                <Sparkles size={24} />
              </span>
              {connectionFailure ? (
                <>
                  <h2>Your bundle is still open</h2>
                  <p>Agent activity stopped. Browsing and reading are unaffected.</p>
                </>
              ) : (
                <>
                  <h2>Connect an agent</h2>
                  {restoreState === "failed" && (
                    <p role="alert">
                      The last agent could not be reconnected. Its install,
                      profile, or endpoint may have changed.
                    </p>
                  )}
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
                </>
              )}
            </div>
          )}
        </ErrorBoundary>
      </aside>
      {launcherRequest
        && launcherTaskId
        && !launcherHidden
        && (
        <OkfTaskLauncher
          open
          origin={launcherRequest.origin}
          status={launcherStatus}
          tasks={launcherTasks}
          selectedTaskId={launcherTaskId}
          plan={launcherPlan}
          connectionName={selectedConnection ? connectionLabel(selectedConnection) : undefined}
          onTaskChange={(taskId) => setLauncherSelection({
            requestId: launcherRequest.requestId,
            taskId,
          })}
          onClose={() => {
            setLauncherSuspension(null);
            actions.closeOkfTaskLauncher();
          }}
          onConnect={() => {
            setLauncherSuspension({
              requestId: launcherRequest.requestId,
              reason: "connection",
            });
            openCatalog();
          }}
          onAuthenticate={() => {
            setLauncherSuspension({
              requestId: launcherRequest.requestId,
              reason: "authentication",
            });
            setView("conversation");
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>("[data-agent-authentication-method]")?.focus();
            });
          }}
          onRefresh={() => actions.openOkfTaskLauncher(launcherRequest.origin, {
            preferredTaskId: launcherTaskId,
            returnFocusId: launcherRequest.returnFocusId,
          })}
          onStart={() => {
            if (!selectedConnection) return;
            requestNewThread(
              selectedConnection.connectionId,
              kickoffForOkfOrigin(launcherTaskId, launcherRequest.origin),
            );
            setLauncherSuspension(null);
            actions.closeOkfTaskLauncher({ restoreFocus: false });
          }}
        />
      )}
    </>
  );
}

const MAX_THREAD_SURFACES = 8;

interface ThreadSurface {
  id: string;
  ordinal: number;
  title: string;
  initialPrompt: string;
  initialSession?: AgentSessionHistoryInfo;
  initialKickoff?: OkfTaskKickoff;
  status: AgentThreadStatus;
}

interface ConnectionFailure {
  profileId: string;
  agentName: string;
  message: string;
}

type ConnectionThreadsProps = Omit<
  AgentConversationProps,
  | "threadSurfaceCount"
  | "onThreadTitleChange"
  | "onCloseThreadSurface"
  | "initialPrompt"
  | "initialSession"
  | "onStartFreshThread"
  | "onImportSession"
  | "onThreadStatusChange"
> & {
  hidden: boolean;
  onRegisterThreadOpener: (
    connectionId: string,
    open: ((kickoff?: OkfTaskKickoff) => void) | null,
  ) => void;
  onConnectionStatusChange: (status: AgentThreadStatus) => void;
};

function ConnectionThreads({
  connection,
  hidden,
  onRegisterThreadOpener,
  onConnectionStatusChange,
  ...conversationProps
}: ConnectionThreadsProps) {
  const [surfaces, setSurfaces] = useState<ThreadSurface[]>(() => [newThreadSurface(1)]);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState(() => surfaces[0].id);
  const threadNavRef = useRef<HTMLElement>(null);
  const selectedSurface = surfaces.find((surface) => surface.id === selectedSurfaceId) ?? surfaces[0];
  const connectionName = connectionLabel(connection);
  const connectionStatus = aggregateThreadStatus(surfaces.map((surface) => surface.status));
  const reportConnectionStatus = useEffectEvent(onConnectionStatusChange);
  useEffect(() => {
    reportConnectionStatus(connectionStatus);
  }, [connectionStatus]);

  function addThreadSurface(
    initialPrompt = "",
    initialSession?: AgentSessionHistoryInfo,
    initialKickoff?: OkfTaskKickoff,
  ) {
    if (surfaces.length >= MAX_THREAD_SURFACES) return;
    const ordinal = Math.max(...surfaces.map((surface) => surface.ordinal)) + 1;
    const surface = newThreadSurface(ordinal, initialPrompt, initialSession, initialKickoff);
    setSurfaces((current) => [...current, surface]);
    setSelectedSurfaceId(surface.id);
    requestAnimationFrame(() => {
      threadNavRef.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus();
    });
  }

  // Keep the panel's registry pointing at the latest closure; runs after every
  // render on purpose so the opener never captures stale surface state.
  useEffect(() => {
    onRegisterThreadOpener(
      connection.connectionId,
      (kickoff) => addThreadSurface("", undefined, kickoff),
    );
    return () => onRegisterThreadOpener(connection.connectionId, null);
  });

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

  function updateThreadStatus(surfaceId: string, status: AgentThreadStatus) {
    setSurfaces((current) => current.map((surface) =>
      surface.id === surfaceId && surface.status !== status ? { ...surface, status } : surface,
    ));
  }

  return (
    <div className="agent-panel__conversation" hidden={hidden}>
      <ThreadSwitcher
        navRef={threadNavRef}
        agentName={connectionName}
        threads={surfaces}
        selectedThreadId={selectedSurface.id}
        maxReached={surfaces.length >= MAX_THREAD_SURFACES}
        onSelect={setSelectedSurfaceId}
        onAdd={() => addThreadSurface()}
      />
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
            initialPrompt={surface.initialPrompt}
            initialSession={surface.initialSession}
            initialKickoff={surface.initialKickoff}
            onStartFreshThread={(initialPrompt) => addThreadSurface(initialPrompt)}
            onImportSession={(session) => addThreadSurface("", session)}
            onThreadTitleChange={(title) => renameThreadSurface(surface.id, title)}
            onThreadStatusChange={(status) => updateThreadStatus(surface.id, status)}
            onCloseThreadSurface={() => closeThreadSurface(surface.id)}
          />
        </div>
      ))}
    </div>
  );
}

function newThreadSurface(
  ordinal: number,
  initialPrompt = "",
  initialSession?: AgentSessionHistoryInfo,
  initialKickoff?: OkfTaskKickoff,
): ThreadSurface {
  return {
    id: crypto.randomUUID(),
    ordinal,
    title: "New thread",
    initialPrompt,
    ...(initialSession ? { initialSession } : {}),
    ...(initialKickoff ? { initialKickoff } : {}),
    status: "idle",
  };
}

function createLauncherPlan(
  origin: import("@/features/agent/taskLauncher.ts").OkfTaskOrigin,
  taskId: OkfTaskId,
  bundleRoot: string,
  bundle: import("@/shared/types.ts").Bundle,
) {
  const conceptId = "conceptId" in origin
    ? origin.conceptId
    : origin.kind === "validation-finding"
      ? origin.issue.conceptId
      : null;
  const concept = conceptId
    ? bundle.concepts.find((candidate) => candidate.id === conceptId) ?? null
    : null;
  const kickoff = kickoffForOkfOrigin(taskId, origin);
  return createOkfContextPlan({
    taskId,
    bundleRoot,
    concepts: bundle.concepts,
    activeConcept: concept ? { id: concept.id, title: concept.title } : null,
    attachedConcepts: [],
    sources: (kickoff.sources ?? []).map((source, index) => ({
      id: `${origin.id}-${index}`,
      ...source,
    })),
    issues: origin.kind === "validation-finding" ? [origin.issue] : bundle.issues,
  });
}

function connectionLabel(connection: AgentConnectionInfo): string {
  return connection.agent?.title ?? connection.agent?.name ?? "Agent";
}

function revealSwitcherItem(event: React.FocusEvent<HTMLButtonElement>): void {
  event.currentTarget.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
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
  const panelClamp = agentPanelClamp(state);
  const valueNow =
    state.agentPanelWidth ??
    Math.round((panelClamp.min + panelClamp.max) / 2);

  useEffect(() => () => cleanupRef.current?.(), []);

  function current(): number {
    if (state.agentPanelWidth !== null) return state.agentPanelWidth;
    const rendered = panelRef.current?.getBoundingClientRect().width ?? 0;
    return rendered > 0
      ? rendered
      : Math.round((panelClamp.min + panelClamp.max) / 2);
  }

  function clamp(width: number): number {
    return Math.min(panelClamp.max, Math.max(panelClamp.min, width));
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
      aria-valuemin={panelClamp.min}
      aria-valuemax={panelClamp.max}
      aria-valuenow={valueNow}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => actions.setAgentPanelWidth(null)}
      onKeyDown={onKeyDown}
    />
  );
}
