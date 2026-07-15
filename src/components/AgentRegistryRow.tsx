import { Cpu, FolderGit2, Globe, Plug, RefreshCw, TerminalSquare, Trash2, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import {
  authMethodLabel,
  catalogProfileId,
  type AgentCatalogEntry,
  type AgentDistribution,
} from "@/agent/catalog.ts";
import { useAgentConnections } from "@/agent/useAgentConnections.ts";
import type {
  AgentInstallPreflight,
  AgentInstallProgress,
} from "@/agent/install.ts";
import type { AgentConnectionInfo } from "@/agent/connection.ts";
import {
  cancelAgentInstall,
  connectCatalogAgent,
  disconnectAgent,
  installAgent,
  onAgentConnectionState,
  onAgentInstallProgress,
  openExternal,
  uninstallAgent,
} from "@/ipc.ts";

export type InstallableEntry = AgentCatalogEntry & {
  availability: "installable";
  distribution: AgentDistribution;
};

/** Preflight knowledge owned by the catalog so its filters can use it too. */
export type RowPreflight =
  | { status: "loading" }
  | { status: "ready"; preflight: AgentInstallPreflight }
  | { status: "error"; message: string };

type RowActivity =
  | { status: "idle"; notice?: string }
  | {
      status: "installing";
      installId: string;
      progress: AgentInstallProgress;
      isCancelling: boolean;
    }
  | { status: "removing" }
  | { status: "failed"; message: string };

const phaseLabels = {
  "runtime-downloading": "Downloading managed Node",
  "runtime-extracting": "Installing managed Node",
  "package-downloading": "Downloading agent package",
  "package-extracting": "Installing agent package",
  "dependencies-installing": "Installing verified dependencies",
  complete: "Verifying installation",
  cancelled: "Cancelling installation",
} satisfies Record<AgentInstallProgress["phase"], string>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function currentBoolean(ref: { current: boolean }): boolean {
  return ref.current;
}

function formatBytes(bytes: number): string {
  const unit = bytes >= 1_000_000 ? "MB" : "KB";
  const divisor = unit === "MB" ? 1_000_000 : 1_000;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
}

function installDisclosure(preflight: AgentInstallPreflight): string {
  if (preflight.packageInstalled) return `Installed v${preflight.agentVersion}.`;
  if (preflight.kind === "binary") {
    return `Downloads one ${formatBytes(preflight.packageDownloadSize)} platform archive pinned by Studio-measured checksum. It bundles its own runtime; nothing else is downloaded.`;
  }
  if (preflight.runtimeInstalled) {
    return `Downloads a ${formatBytes(preflight.packageDownloadSize)} pinned agent archive, then its production dependencies from npm. Dependency size is determined during installation.`;
  }
  return `Downloads ${formatBytes(preflight.totalDownloadSize)} in pinned archives: managed Node ${preflight.runtimeVersion} (${formatBytes(preflight.runtimeDownloadSize)}) and the agent package (${formatBytes(preflight.packageDownloadSize)}). Production dependencies are additional and resolved from npm during installation.`;
}

function newInstallId(agentId: string): string {
  return `${agentId}-${crypto.randomUUID()}`;
}

export function isInstallable(entry: AgentCatalogEntry): entry is InstallableEntry {
  return entry.availability === "installable" && entry.distribution !== null;
}

function authenticationLabel(entry: AgentCatalogEntry): string {
  if (entry.authMethods.includes("api-key") && entry.authMethods.includes("none")) {
    return "Optional API key";
  }
  return entry.authMethods.map(authMethodLabel).join(" or ");
}

function installedConnectionLabel(
  connection: AgentConnectionInfo | undefined,
  bundleRoot: string | null,
  version: string,
): string {
  if (!connection) return `Installed v${version}. No agent has been started.`;
  if (connection.bundleRoot !== bundleRoot) {
    return `Connected over ACP v${connection.protocolVersion} to another bundle.`;
  }
  return `Connected over ACP v${connection.protocolVersion}.`;
}

export function AgentRegistryRow({
  bundleRoot,
  entry,
  preflight,
  onRefreshPreflight,
  onConnected,
  onConfigure,
}: {
  bundleRoot: string | null;
  entry: AgentCatalogEntry;
  preflight?: RowPreflight;
  onRefreshPreflight?: (agentId: string) => Promise<void>;
  onConnected: (connection: AgentConnectionInfo) => void;
  onConfigure: () => void;
}) {
  if (isInstallable(entry) && preflight && onRefreshPreflight) {
    return (
      <InstallableAgentRow
        bundleRoot={bundleRoot}
        entry={entry}
        preflight={preflight}
        onRefreshPreflight={onRefreshPreflight}
        onConnected={onConnected}
      />
    );
  }
  if (entry.availability === "configurable") {
    return (
      <AgentRowFrame
        entry={entry}
        action={
          <button type="button" className="btn" onClick={onConfigure}>
            Configure
          </button>
        }
      />
    );
  }
  return (
    <AgentRowFrame
      entry={entry}
      action={
        <button type="button" className="btn" disabled>
          Not available yet
        </button>
      }
    />
  );
}

function InstallableAgentRow({
  bundleRoot,
  entry,
  preflight,
  onRefreshPreflight,
  onConnected,
}: {
  bundleRoot: string | null;
  entry: InstallableEntry;
  preflight: RowPreflight;
  onRefreshPreflight: (agentId: string) => Promise<void>;
  onConnected: (connection: AgentConnectionInfo) => void;
}) {
  const [activity, setActivity] = useState<RowActivity>({ status: "idle" });
  const [connectionState, setConnectionState] = useState<
    { status: "idle" } | { status: "connecting" } | { status: "disconnecting" } | { status: "error"; message: string }
  >({ status: "idle" });
  const connections = useAgentConnections();
  const connection = connections.find(
    (candidate) => candidate.profileId === catalogProfileId(entry.id),
  );
  const isMounted = useRef(true);
  const wasCancelled = useRef<boolean>(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let stopListening: (() => void) | undefined;
    let isDisposed = false;
    void onAgentConnectionState((event) => {
      if (event.profileId !== catalogProfileId(entry.id)) return;
      setConnectionState(
        event.status === "failed"
          ? { status: "error", message: event.message }
          : { status: "idle" },
      );
    }).then(
      (stop) => {
        if (isDisposed) stop();
        else stopListening = stop;
      },
      (error: unknown) => {
        if (!isDisposed) {
          setConnectionState({ status: "error", message: errorMessage(error) });
        }
      },
    );
    return () => {
      isDisposed = true;
      stopListening?.();
    };
  }, [entry.id]);

  async function refresh(notice?: string) {
    await onRefreshPreflight(entry.id);
    if (isMounted.current) setActivity({ status: "idle", notice });
  }

  async function install(preflight: AgentInstallPreflight) {
    const installId = newInstallId(entry.id);
    wasCancelled.current = false;
    const initialProgress: AgentInstallProgress = {
      installId,
      agentId: entry.id,
      phase: preflight.runtimeInstalled
        ? "package-downloading"
        : "runtime-downloading",
      downloadedBytes: 0,
      totalBytes: preflight.runtimeInstalled
        ? preflight.packageDownloadSize
        : preflight.runtimeDownloadSize,
    };
    setActivity({ status: "installing", installId, progress: initialProgress, isCancelling: false });

    let stopListening: (() => void) | undefined;
    let failure: unknown;
    let didInstall = false;
    try {
      stopListening = await onAgentInstallProgress((progress) => {
        if (!isMounted.current || progress.installId !== installId) return;
        setActivity((current) =>
          current.status === "installing"
            ? { ...current, progress }
            : current,
        );
      });
      await installAgent(entry.id, installId);
      didInstall = true;
    } catch (error: unknown) {
      failure = error;
    }
    stopListening?.();

    if (!isMounted.current) return;
    if (failure !== undefined) {
      if (currentBoolean(wasCancelled)) {
        await refresh("Installation cancelled. Nothing was activated.");
        return;
      }
      setActivity({ status: "failed", message: errorMessage(failure) });
      return;
    }
    if (didInstall) await refresh();
  }

  async function cancel(installId: string) {
    wasCancelled.current = true;
    setActivity((current) =>
      current.status === "installing" ? { ...current, isCancelling: true } : current,
    );
    try {
      await cancelAgentInstall(installId);
    } catch (error: unknown) {
      if (isMounted.current) setActivity({ status: "failed", message: errorMessage(error) });
    }
  }

  async function remove() {
    setActivity({ status: "removing" });
    try {
      await uninstallAgent(entry.id);
      await refresh("Removed. The pinned archive can be reinstalled at any time.");
    } catch (error: unknown) {
      if (isMounted.current) setActivity({ status: "failed", message: errorMessage(error) });
    }
  }

  async function connect() {
    if (!bundleRoot) return;
    setConnectionState({ status: "connecting" });
    try {
      const connection = await connectCatalogAgent(entry.id, bundleRoot);
      setConnectionState({ status: "idle" });
      onConnected(connection);
    } catch (error: unknown) {
      setConnectionState({ status: "error", message: errorMessage(error) });
    }
  }

  async function disconnect() {
    if (!connection) return;
    setConnectionState({ status: "disconnecting" });
    try {
      await disconnectAgent(connection.connectionId);
      setConnectionState({ status: "idle" });
    } catch (error: unknown) {
      setConnectionState({ status: "error", message: errorMessage(error) });
    }
  }

  let zone: React.ReactNode = null;
  let action: React.ReactNode = null;

  if (activity.status === "installing") {
    zone = (
      <div className="agent-row__zone" aria-live="polite">
        <label htmlFor={`${entry.id}-install-progress`}>
          {phaseLabels[activity.progress.phase]}
        </label>
        <progress
          id={`${entry.id}-install-progress`}
          value={activity.progress.downloadedBytes}
          max={Math.max(activity.progress.totalBytes, 1)}
        />
      </div>
    );
    action = (
      <button
        type="button"
        className="btn"
        disabled={activity.isCancelling}
        onClick={() => void cancel(activity.installId)}
      >
        {activity.isCancelling ? "Cancelling…" : "Cancel"}
      </button>
    );
  } else if (activity.status === "removing") {
    zone = (
      <p className="agent-row__zone agent-row__pending" role="status">
        <RefreshCw size={14} aria-hidden="true" /> Removing the cached install…
      </p>
    );
    action = (
      <button type="button" className="btn" disabled>
        Remove
      </button>
    );
  } else if (activity.status === "failed") {
    zone = (
      <p className="agent-row__zone agent-row__error" role="alert">
        {activity.message}
      </p>
    );
    action = (
      <button
        type="button"
        className="btn"
        onClick={() => {
          setActivity({ status: "idle" });
          void refresh();
        }}
      >
        Retry
      </button>
    );
  } else if (preflight.status === "loading") {
    zone = (
      <p className="agent-row__zone agent-row__pending" role="status">
        <RefreshCw size={14} aria-hidden="true" /> Checking this platform…
      </p>
    );
    action = (
      <button type="button" className="btn" disabled>
        Install
      </button>
    );
  } else if (preflight.status === "error") {
    zone = (
      <p className="agent-row__zone agent-row__error" role="alert">
        Installation unavailable. {preflight.message}
      </p>
    );
    action = (
      <button type="button" className="btn" onClick={() => void refresh()}>
        Retry
      </button>
    );
  } else if (!preflight.preflight.packageInstalled) {
    zone = (
      <div className="agent-row__zone">
        <p className="agent-row__disclosure">{installDisclosure(preflight.preflight)}</p>
        {activity.notice && <p role="status">{activity.notice}</p>}
      </div>
    );
    action = (
      <button
        type="button"
        className="btn"
        onClick={() => void install(preflight.preflight)}
      >
        Install
      </button>
    );
  } else {
    zone = (
      <div className="agent-row__zone">
        <p className="agent-row__installed" role="status">
          {installedConnectionLabel(connection, bundleRoot, preflight.preflight.agentVersion)}
        </p>
        {!connection && !bundleRoot && (
          <p className="agent-row__disclosure">Open an OKF bundle to connect.</p>
        )}
        {connectionState.status === "error" && (
          <p className="agent-row__error" role="alert">
            Connection failed. {connectionState.message}
          </p>
        )}
      </div>
    );
    action = connection ? (
      <button
        type="button"
        className="btn ghost"
        disabled={connectionState.status === "disconnecting"}
        onClick={() => void disconnect()}
      >
        <Unplug size={16} aria-hidden="true" />
        {connectionState.status === "disconnecting" ? "Disconnecting..." : "Disconnect"}
      </button>
    ) : (
      <span className="agent-row__action-pair">
        <button
          type="button"
          className="btn ghost icon"
          aria-label={`Remove ${entry.name}`}
          title={`Remove ${entry.name}`}
          onClick={() => void remove()}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn"
          aria-label={`Connect ${entry.name}`}
          disabled={!bundleRoot || connectionState.status === "connecting"}
          onClick={() => void connect()}
        >
          <Plug size={16} aria-hidden="true" />
          {connectionState.status === "connecting" ? "Connecting..." : "Connect"}
        </button>
      </span>
    );
  }

  return (
    <AgentRowFrame entry={entry} action={action}>
      {zone}
    </AgentRowFrame>
  );
}

function AgentRowFrame({
  entry,
  action,
  children,
}: {
  entry: AgentCatalogEntry;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article className="agent-row">
      <div className="agent-row__icon">
        {entry.runtime === "external-acp" ? (
          <TerminalSquare size={18} aria-hidden="true" />
        ) : (
          <Cpu size={18} aria-hidden="true" />
        )}
      </div>
      <div className="agent-row__head">
        <h3>{entry.name}</h3>
        {entry.distribution && (
          <span className="agent-row__version">v{entry.distribution.version}</span>
        )}
        {entry.availability === "planned" && <span className="badge">Soon</span>}
        {entry.runtime === "studio-native" && <span className="badge">Studio</span>}
      </div>
      <div className="agent-row__actions">{action}</div>
      <div className="agent-row__body">
        <p className="agent-row__summary">{entry.summary}</p>
        {children}
        <div className="agent-row__meta">
          <span>{authenticationLabel(entry)}</span>
          <span className="agent-row__links">
            {entry.repository && (
              <button
                type="button"
                className="btn ghost icon agent-row__link"
                aria-label={`Open the ${entry.name} repository in the browser`}
                title={entry.repository}
                onClick={() => void openExternal(entry.repository ?? "")}
              >
                <FolderGit2 size={14} aria-hidden="true" />
              </button>
            )}
            {entry.website && (
              <button
                type="button"
                className="btn ghost icon agent-row__link"
                aria-label={`Open the ${entry.name} website in the browser`}
                title={entry.website}
                onClick={() => void openExternal(entry.website ?? "")}
              >
                <Globe size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
