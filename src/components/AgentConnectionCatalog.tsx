import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { catalogEntries, type AgentCatalogEntry } from "../agent/catalog.ts";
import type { AgentConnectionInfo, AgentSecurityHostStatus } from "../agent/connection.ts";
import type { CustomAgentInput, CustomAgentProfile } from "../agent/custom.ts";
import type { LocalModelProfile, LocalModelProfileInput } from "../agent/local.ts";
import {
  agentCatalog,
  agentSecurityHostStatus,
  customAgents,
  localModelProfiles,
  removeCustomAgent,
  removeLocalModelProfile,
  saveCustomAgent,
  saveLocalModelProfile,
} from "../ipc.ts";
import { AgentCatalogCard } from "./AgentCatalogCard.tsx";
import { CustomAgentProfiles } from "./CustomAgentProfiles.tsx";
import { LocalModelProfiles } from "./LocalModelProfiles.tsx";
import "./AgentConnectionCatalog.css";

type CatalogState =
  | { status: "loading" }
  | {
      status: "ready";
      entries: readonly AgentCatalogEntry[];
      customProfiles: readonly CustomAgentProfile[];
      localProfiles: readonly LocalModelProfile[];
    }
  | { status: "error"; message: string };

type SecurityHostState =
  | { status: "loading" }
  | { status: "ready"; value: AgentSecurityHostStatus }
  | { status: "error" };

async function loadCatalog(): Promise<CatalogState> {
  try {
    const [document, customProfiles, localProfiles] = await Promise.all([
      agentCatalog(),
      customAgents(),
      localModelProfiles(),
    ]);
    return { status: "ready", entries: catalogEntries(document), customProfiles, localProfiles };
  } catch (error: unknown) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadSecurityHost(): Promise<SecurityHostState> {
  try {
    return { status: "ready", value: await agentSecurityHostStatus() };
  } catch {
    return { status: "error" };
  }
}

function securityHostCopy(status: AgentSecurityHostStatus): {
  summary: string;
  detail: string;
} {
  if (status.launchProfileAvailable) {
    return {
      summary: "Restricted offline profile available",
      detail: "Saved custom ACP commands can use the verified Linux host with read-only bundle access and no host network.",
    };
  }
  switch (status.state) {
    case "ready":
      return {
        summary: "Linux backend ready",
        detail: "System Bubblewrap passed Studio's no-network namespace probe, but no restricted launch profile is available in this build.",
      };
    case "not-found":
      return {
        summary: "Bubblewrap not found",
        detail: "Install Bubblewrap from the Linux distribution's package manager. Studio does not download or substitute a sandbox executable.",
      };
    case "setuid-rejected":
      return {
        summary: "Setuid Bubblewrap rejected",
        detail: "Studio requires a non-setuid system Bubblewrap binary and will not run the privileged variant.",
      };
    case "untrusted-binary":
      return {
        summary: "Bubblewrap binary rejected",
        detail: "The discovered binary is not root-owned, is writable by another account, carries file capabilities, or is not executable by ordinary users.",
      };
    case "probe-failed":
      return {
        summary: "Bubblewrap probe failed",
        detail: "The binary could not create the required mount, network, IPC, PID, and UTS namespaces within three seconds. Studio will not fall back to an unrestricted launch.",
      };
    case "unsupported-platform":
      if (status.platform === "windows") {
        return {
          summary: "No native Windows restricted host",
          detail: "A Windows Job Object controls process lifetime only. WSL plus Bubblewrap is not integrated, so restricted external-agent profiles remain unavailable.",
        };
      }
      if (status.platform === "macos") {
        return {
          summary: "macOS restricted host not implemented",
          detail: "Studio has not integrated or verified a Seatbelt profile for external ACP processes.",
        };
      }
      return {
        summary: "Restricted host unsupported",
        detail: "Studio has no verified confinement backend for this platform.",
      };
  }
}

function securityHostSummary(state: SecurityHostState): string {
  switch (state.status) {
    case "loading":
      return "Checking";
    case "error":
      return "Check failed";
    case "ready":
      return securityHostCopy(state.value).summary;
  }
}

export function AgentConnectionCatalog({
  bundleRoot,
  onBack,
  onConnectionAvailable,
  onConnected,
}: {
  bundleRoot: string | null;
  onBack: () => void;
  onConnectionAvailable: (connection: AgentConnectionInfo) => void;
  onConnected: (connection: AgentConnectionInfo) => void;
}) {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [securityHost, setSecurityHost] = useState<SecurityHostState>({ status: "loading" });
  const [localFormOpen, setLocalFormOpen] = useState(false);
  const requestVersion = useRef(0);
  const hostRequestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    void loadCatalog().then((next) => {
      if (requestVersion.current === version) setState(next);
    });
    const hostVersion = ++hostRequestVersion.current;
    void loadSecurityHost().then((next) => {
      if (hostRequestVersion.current === hostVersion) setSecurityHost(next);
    });
    return () => {
      requestVersion.current += 1;
      hostRequestVersion.current += 1;
    };
  }, []);

  function retry() {
    setState({ status: "loading" });
    const version = ++requestVersion.current;
    void loadCatalog().then((next) => {
      if (requestVersion.current === version) setState(next);
    });
  }

  function retrySecurityHost() {
    setSecurityHost({ status: "loading" });
    const version = ++hostRequestVersion.current;
    void loadSecurityHost().then((next) => {
      if (hostRequestVersion.current === version) setSecurityHost(next);
    });
  }

  async function saveProfile(input: CustomAgentInput) {
    const profile = await saveCustomAgent(input);
    setState((current) =>
      current.status === "ready"
        ? { ...current, customProfiles: [...current.customProfiles, profile] }
        : current,
    );
  }

  async function removeProfile(profileId: string) {
    await removeCustomAgent(profileId);
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            customProfiles: current.customProfiles.filter((profile) => profile.id !== profileId),
          }
        : current,
    );
  }

  async function saveLocalProfile(input: LocalModelProfileInput) {
    const profile = await saveLocalModelProfile(input);
    setState((current) =>
      current.status === "ready"
        ? { ...current, localProfiles: [...current.localProfiles, profile] }
        : current,
    );
  }

  async function removeLocalProfile(profileId: string) {
    await removeLocalModelProfile(profileId);
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            localProfiles: current.localProfiles.filter((profile) => profile.id !== profileId),
          }
        : current,
    );
  }

  return (
    <section className="agent-catalog" aria-labelledby="agent-catalog-title">
      <div className="agent-catalog__intro">
        <button
          type="button"
          className="btn ghost agent-catalog__back"
          onClick={onBack}
          data-agent-catalog-focus
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        <h2 id="agent-catalog-title">Choose how agents run</h2>
        <p>
          External agents keep their own login, billing, models, and settings.
          Studio runtimes use scoped OKF tools managed by this app.
        </p>
      </div>

      {state.status === "loading" && (
        <div className="agent-catalog__state" role="status">
          <RefreshCw size={20} aria-hidden="true" />
          <span>Loading connection catalog…</span>
        </div>
      )}

      {state.status === "error" && (
        <div className="agent-catalog__state" role="alert">
          <p>Studio could not load the connection catalog. {state.message}</p>
          <button type="button" className="btn" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <div className="agent-catalog__list">
          {state.entries.map((entry) => (
            <AgentCatalogCard
              bundleRoot={bundleRoot}
              entry={entry}
              key={entry.id}
              onConnected={onConnected}
              onConfigure={() => setLocalFormOpen(true)}
            />
          ))}
        </div>
      )}

      {state.status === "ready" && (
        <>
          <LocalModelProfiles
            profiles={state.localProfiles}
            formOpen={localFormOpen}
            onFormOpenChange={setLocalFormOpen}
            onProfileSave={saveLocalProfile}
            onProfileRemove={removeLocalProfile}
            onConnected={onConnected}
          />
          <CustomAgentProfiles
            bundleRoot={bundleRoot}
            profiles={state.customProfiles}
            restrictedOfflineAvailable={
              securityHost.status === "ready" && securityHost.value.launchProfileAvailable
            }
            onProfileSave={saveProfile}
            onProfileRemove={removeProfile}
            onConnected={onConnectionAvailable}
          />
          <details className="agent-catalog__security-host">
            <summary>Restricted agent host: {securityHostSummary(securityHost)}</summary>
            {securityHost.status === "loading" && (
              <p role="status">Checking the local confinement backend without starting an agent.</p>
            )}
            {securityHost.status === "error" && (
              <div>
                <p role="alert">Studio could not check the local confinement backend.</p>
                <button type="button" className="btn" onClick={retrySecurityHost}>Retry</button>
              </div>
            )}
            {securityHost.status === "ready" && (
              <p>{securityHostCopy(securityHost.value).detail}</p>
            )}
          </details>
          <p className="agent-catalog__notice">
            Browsing and saving do not start an agent. Installation, connection, and
            authentication each require a separate explicit action.
          </p>
        </>
      )}
    </section>
  );
}
