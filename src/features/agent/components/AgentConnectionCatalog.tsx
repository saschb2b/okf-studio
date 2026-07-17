import { ArrowLeft, RefreshCw, Search, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { catalogEntries, type AgentCatalogEntry } from "@/features/agent/catalog.ts";
import type { AgentConnectionInfo, AgentSecurityHostStatus } from "@/features/agent/connection.ts";
import type { CustomAgentInput, CustomAgentProfile } from "@/features/agent/custom.ts";
import type { LocalModelProfile, LocalModelProfileInput } from "@/features/agent/local.ts";
import {
  agentCatalog,
  agentInstallPreflight,
  agentSecurityHostStatus,
  customAgents,
  localModelProfiles,
  openExternal,
  removeCustomAgent,
  removeLocalModelProfile,
  saveCustomAgent,
  saveLocalModelProfile,
} from "@/shared/ipc.ts";
import { AgentRegistryRow, isInstallable, type RowPreflight } from "@/features/agent/components/AgentRegistryRow.tsx";
import { CustomAgentProfiles } from "@/features/agent/components/CustomAgentProfiles.tsx";
import { LocalModelProfiles } from "@/features/agent/components/LocalModelProfiles.tsx";
import "./AgentConnectionCatalog.css";

const ACP_REGISTRY_URL = "https://agentclientprotocol.com/get-started/registry";

type CatalogState =
  | { status: "loading" }
  | {
      status: "ready";
      entries: readonly AgentCatalogEntry[];
      customProfiles: readonly CustomAgentProfile[];
      localProfiles: readonly LocalModelProfile[];
    }
  | { status: "error"; message: string };

export type SecurityHostState =
  | { status: "loading" }
  | { status: "ready"; value: AgentSecurityHostStatus }
  | { status: "error" };

type RegistryFilter = "all" | "installed" | "not-installed";

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

async function loadPreflight(agentId: string): Promise<RowPreflight> {
  try {
    return { status: "ready", preflight: await agentInstallPreflight(agentId) };
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

function isInstalled(entry: AgentCatalogEntry, preflight: RowPreflight | undefined): boolean {
  return preflight?.status === "ready" && preflight.preflight.packageInstalled;
}

function matchesFilter(
  entry: AgentCatalogEntry,
  preflight: RowPreflight | undefined,
  filter: RegistryFilter,
): boolean {
  if (filter === "all") return true;
  const installed = isInstalled(entry, preflight);
  return filter === "installed" ? installed : !installed;
}

function matchesQuery(entry: AgentCatalogEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const packageName =
    entry.distribution?.kind === "npm" ? entry.distribution.package : "";
  return [entry.name, entry.summary, entry.id, packageName]
    .some((value) => value.toLowerCase().includes(needle));
}

function securityHostCopy(status: AgentSecurityHostStatus): {
  summary: string;
  detail: string;
} {
  if (status.launchProfileAvailable) {
    if (status.platform === "windows") {
      return {
        summary: "Restricted offline profile available",
        detail: "Saved self-contained ACP executables can run in a fresh offline AppContainer. Bundle access stays behind Studio's bounded file tools.",
      };
    }
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
      if (status.platform === "windows") {
        return {
          summary: "AppContainer probe failed",
          detail: "Windows could not create and inspect the restricted AppContainer profile. Studio will not fall back to an unrestricted launch.",
        };
      }
      return {
        summary: "Bubblewrap probe failed",
        detail: "The binary could not create the required mount, network, IPC, PID, and UTS namespaces within three seconds. Studio will not fall back to an unrestricted launch.",
      };
    case "unsupported-platform":
      if (status.platform === "windows") {
        return {
          summary: "Windows desktop host required",
          detail: "AppContainer enforcement is available in the Windows desktop app. Browser preview cannot start a restricted external agent.",
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

export function AgentSecurityHostDisclosure({
  state,
  onRetry,
}: {
  state: SecurityHostState;
  onRetry: () => void;
}) {
  return (
    <details className="agent-catalog__security-host">
      <summary>Restricted agent host: {securityHostSummary(state)}</summary>
      {state.status === "loading" && (
        <p role="status">Checking the local confinement backend without starting an agent.</p>
      )}
      {state.status === "error" && (
        <div>
          <p role="alert">Studio could not check the local confinement backend.</p>
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        </div>
      )}
      {state.status === "ready" && <p>{securityHostCopy(state.value).detail}</p>}
    </details>
  );
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
  const [preflights, setPreflights] = useState<Record<string, RowPreflight>>({});
  const [securityHost, setSecurityHost] = useState<SecurityHostState>({ status: "loading" });
  const [localFormOpen, setLocalFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RegistryFilter>("all");
  const [loadToken, setLoadToken] = useState(0);
  const requestVersion = useRef(0);
  const hostRequestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    void loadCatalog().then(async (next) => {
      if (requestVersion.current !== version) return;
      setState(next);
      if (next.status !== "ready") return;
      const installable = next.entries.filter(isInstallable);
      setPreflights(Object.fromEntries(
        installable.map((entry) => [entry.id, { status: "loading" }]),
      ));
      const results = await Promise.all(
        installable.map(async (entry) => [entry.id, await loadPreflight(entry.id)] as const),
      );
      if (requestVersion.current !== version) return;
      setPreflights(Object.fromEntries(results));
    });
    return () => {
      requestVersion.current += 1;
    };
  }, [loadToken]);

  useEffect(() => {
    const hostVersion = ++hostRequestVersion.current;
    void loadSecurityHost().then((next) => {
      if (hostRequestVersion.current === hostVersion) setSecurityHost(next);
    });
    return () => {
      hostRequestVersion.current += 1;
    };
  }, []);

  function retry() {
    setState({ status: "loading" });
    setLoadToken((token) => token + 1);
  }

  async function refreshPreflight(agentId: string) {
    const version = requestVersion.current;
    const next = await loadPreflight(agentId);
    if (requestVersion.current !== version) return;
    setPreflights((current) => ({ ...current, [agentId]: next }));
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

  const registryEntries = state.status === "ready"
    ? state.entries.filter((entry) => entry.runtime === "external-acp")
    : [];
  const visibleRegistryEntries = registryEntries.filter(
    (entry) => matchesFilter(entry, preflights[entry.id], filter) && matchesQuery(entry, query),
  );
  const studioEntry = state.status === "ready"
    ? state.entries.find((entry) => entry.runtime === "studio-native")
    : undefined;

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
        <>
          <section className="agent-registry" aria-labelledby="agent-registry-title">
            <div className="agent-registry__heading">
              <h3 id="agent-registry-title">ACP Registry</h3>
              <button
                type="button"
                className="btn ghost agent-registry__learn-more"
                onClick={() => void openExternal(ACP_REGISTRY_URL)}
              >
                Learn more
                <SquareArrowOutUpRight size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="agent-registry__toolbar">
              <div className="agent-registry__search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder="Search agents…"
                  aria-label="Search agents"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div
                className="agent-registry__filters"
                role="group"
                aria-label="Filter agents by install state"
              >
                {([
                  ["all", "All"],
                  ["installed", "Installed"],
                  ["not-installed", "Not installed"],
                ] as const).map(([value, label]) => (
                  <button
                    type="button"
                    className="btn ghost agent-registry__filter"
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {visibleRegistryEntries.length > 0 ? (
              <div className="agent-registry__list">
                {visibleRegistryEntries.map((entry) => (
                  <AgentRegistryRow
                    bundleRoot={bundleRoot}
                    entry={entry}
                    key={entry.id}
                    preflight={preflights[entry.id]}
                    onRefreshPreflight={refreshPreflight}
                    onConnected={onConnected}
                    onConfigure={() => setLocalFormOpen(true)}
                  />
                ))}
              </div>
            ) : (
              <p className="agent-registry__empty" role="status">
                {query.trim()
                  ? `No agents match "${query.trim()}".`
                  : filter === "installed"
                    ? "No agents are installed yet."
                    : "Every catalog agent is already installed."}
              </p>
            )}
          </section>

          {studioEntry && (
            <section className="agent-catalog__studio" aria-label="Built into Studio">
              <AgentRegistryRow
                bundleRoot={bundleRoot}
                entry={studioEntry}
                onConnected={onConnected}
                onConfigure={() => setLocalFormOpen(true)}
              />
            </section>
          )}

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
          <AgentSecurityHostDisclosure state={securityHost} onRetry={retrySecurityHost} />
          <p className="agent-catalog__notice">
            Browsing and saving do not start an agent. Installation, connection, and
            authentication each require a separate explicit action.
          </p>
        </>
      )}
    </section>
  );
}
