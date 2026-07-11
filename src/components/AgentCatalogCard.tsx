import { Cpu, RefreshCw, TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  authMethodLabel,
  runtimeLabel,
  type AgentCatalogEntry,
  type AgentDistribution,
} from "../agent/catalog.ts";
import type {
  AgentInstallPreflight,
  AgentInstallProgress,
} from "../agent/install.ts";
import {
  agentInstallPreflight,
  cancelAgentInstall,
  installAgent,
  onAgentInstallProgress,
} from "../ipc.ts";

type InstallableEntry = AgentCatalogEntry & {
  availability: "installable";
  distribution: AgentDistribution;
};

type InstallState =
  | { status: "preflighting" }
  | { status: "available"; preflight: AgentInstallPreflight; notice?: string }
  | {
      status: "installing";
      installId: string;
      progress: AgentInstallProgress;
      isCancelling: boolean;
    }
  | { status: "installed"; version: string }
  | { status: "failed"; message: string };

const phaseLabels = {
  "runtime-downloading": "Downloading managed Node",
  "runtime-extracting": "Installing managed Node",
  "package-downloading": "Downloading agent package",
  "package-extracting": "Installing agent package",
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
  if (preflight.runtimeInstalled) {
    return `Downloads ${formatBytes(preflight.packageDownloadSize)} for the agent package.`;
  }
  return `Downloads ${formatBytes(preflight.totalDownloadSize)}: managed Node ${preflight.runtimeVersion} (${formatBytes(preflight.runtimeDownloadSize)}) and the agent package (${formatBytes(preflight.packageDownloadSize)}).`;
}

function newInstallId(agentId: string): string {
  return `${agentId}-${crypto.randomUUID()}`;
}

function isInstallable(entry: AgentCatalogEntry): entry is InstallableEntry {
  return entry.availability === "installable" && entry.distribution !== null;
}

export function AgentCatalogCard({ entry }: { entry: AgentCatalogEntry }) {
  return isInstallable(entry) ? (
    <InstallableAgentCard entry={entry} />
  ) : (
    <AgentCardFrame entry={entry}>
      <button type="button" className="btn agent-catalog-card__action" disabled>
        Not available yet
      </button>
    </AgentCardFrame>
  );
}

function InstallableAgentCard({ entry }: { entry: InstallableEntry }) {
  const [state, setState] = useState<InstallState>({ status: "preflighting" });
  const requestVersion = useRef(0);
  const isMounted = useRef(true);
  const wasCancelled = useRef<boolean>(false);

  useEffect(() => {
    isMounted.current = true;
    const version = ++requestVersion.current;
    void agentInstallPreflight(entry.id).then(
      (preflight) => {
        if (!isMounted.current || requestVersion.current !== version) return;
        setState(
          preflight.packageInstalled
            ? { status: "installed", version: preflight.agentVersion }
            : { status: "available", preflight },
        );
      },
      (error: unknown) => {
        if (!isMounted.current || requestVersion.current !== version) return;
        setState({ status: "failed", message: errorMessage(error) });
      },
    );
    return () => {
      isMounted.current = false;
      requestVersion.current += 1;
    };
  }, [entry.id]);

  async function retryPreflight(notice?: string) {
    setState({ status: "preflighting" });
    const version = ++requestVersion.current;
    try {
      const preflight = await agentInstallPreflight(entry.id);
      if (!isMounted.current || requestVersion.current !== version) return;
      setState(
        preflight.packageInstalled
          ? { status: "installed", version: preflight.agentVersion }
          : { status: "available", preflight, notice },
      );
    } catch (error: unknown) {
      if (!isMounted.current || requestVersion.current !== version) return;
      setState({ status: "failed", message: errorMessage(error) });
    }
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
    setState({ status: "installing", installId, progress: initialProgress, isCancelling: false });

    let stopListening: (() => void) | undefined;
    let receiptVersion: string | undefined;
    let failure: unknown;
    try {
      stopListening = await onAgentInstallProgress((progress) => {
        if (!isMounted.current || progress.installId !== installId) return;
        setState((current) =>
          current.status === "installing"
            ? { ...current, progress }
            : current,
        );
      });
      const receipt = await installAgent(entry.id, installId);
      receiptVersion = receipt.version;
    } catch (error: unknown) {
      failure = error;
    }
    stopListening?.();

    if (!isMounted.current) return;
    if (failure !== undefined) {
      if (currentBoolean(wasCancelled)) {
        await retryPreflight("Installation cancelled. Nothing was activated.");
        return;
      }
      setState({ status: "failed", message: errorMessage(failure) });
      return;
    }
    if (receiptVersion !== undefined) {
      setState({ status: "installed", version: receiptVersion });
    }
  }

  async function cancel(installId: string) {
    wasCancelled.current = true;
    setState((current) =>
      current.status === "installing" ? { ...current, isCancelling: true } : current,
    );
    try {
      await cancelAgentInstall(installId);
    } catch (error: unknown) {
      if (isMounted.current) setState({ status: "failed", message: errorMessage(error) });
    }
  }

  return (
    <AgentCardFrame entry={entry}>
      {state.status === "preflighting" && (
        <p className="agent-catalog-card__install-state" role="status">
          <RefreshCw size={16} aria-hidden="true" /> Checking this platform…
        </p>
      )}

      {state.status === "available" && (
        <div className="agent-catalog-card__install-controls">
          <p className="agent-catalog-card__disclosure">{installDisclosure(state.preflight)}</p>
          {state.notice && <p role="status">{state.notice}</p>}
          <button
            type="button"
            className="btn agent-catalog-card__action"
            onClick={() => void install(state.preflight)}
          >
            Install
          </button>
        </div>
      )}

      {state.status === "installing" && (
        <div className="agent-catalog-card__install-controls" aria-live="polite">
          <label htmlFor={`${entry.id}-install-progress`}>
            {phaseLabels[state.progress.phase]}
          </label>
          <progress
            id={`${entry.id}-install-progress`}
            value={state.progress.downloadedBytes}
            max={Math.max(state.progress.totalBytes, 1)}
          />
          <button
            type="button"
            className="btn agent-catalog-card__action"
            disabled={state.isCancelling}
            onClick={() => void cancel(state.installId)}
          >
            {state.isCancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      )}

      {state.status === "installed" && (
        <div className="agent-catalog-card__install-controls">
          <p className="agent-catalog-card__installed" role="status">
            Installed v{state.version}. No agent has been started.
          </p>
          <button type="button" className="btn agent-catalog-card__action" disabled>
            Installed
          </button>
        </div>
      )}

      {state.status === "failed" && (
        <div className="agent-catalog-card__install-controls">
          <p className="agent-catalog-card__error" role="alert">
            Installation unavailable. {state.message}
          </p>
          <button
            type="button"
            className="btn agent-catalog-card__action"
            onClick={() => void retryPreflight()}
          >
            Retry
          </button>
        </div>
      )}
    </AgentCardFrame>
  );
}

function AgentCardFrame({
  entry,
  children,
}: {
  entry: AgentCatalogEntry;
  children: React.ReactNode;
}) {
  return (
    <article className="agent-catalog-card">
      <div className="agent-catalog-card__icon">
        {entry.runtime === "external-acp" ? (
          <TerminalSquare size={20} aria-hidden="true" />
        ) : (
          <Cpu size={20} aria-hidden="true" />
        )}
      </div>
      <div className="agent-catalog-card__title-row">
        <h3>{entry.name}</h3>
        <span className="badge">
          {entry.availability === "installable" ? "ACP" : "Planned"}
        </span>
      </div>
      <p>{entry.summary}</p>
      <dl>
        <div>
          <dt>Runs as</dt>
          <dd>{runtimeLabel(entry.runtime)}</dd>
        </div>
        <div>
          <dt>Sign in</dt>
          <dd>{entry.authMethods.map(authMethodLabel).join(" or ")}</dd>
        </div>
      </dl>
      {children}
    </article>
  );
}
