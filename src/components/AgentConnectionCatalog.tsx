import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { catalogEntries, type AgentCatalogEntry } from "../agent/catalog.ts";
import type { CustomAgentInput, CustomAgentProfile } from "../agent/custom.ts";
import type { LocalModelProfile, LocalModelProfileInput } from "../agent/local.ts";
import {
  agentCatalog,
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

export function AgentConnectionCatalog({
  onBack,
  onConnected,
}: {
  onBack: () => void;
  onConnected: () => void;
}) {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [localFormOpen, setLocalFormOpen] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    void loadCatalog().then((next) => {
      if (requestVersion.current === version) setState(next);
    });
    return () => {
      requestVersion.current += 1;
    };
  }, []);

  function retry() {
    setState({ status: "loading" });
    const version = ++requestVersion.current;
    void loadCatalog().then((next) => {
      if (requestVersion.current === version) setState(next);
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
          />
          <CustomAgentProfiles
            profiles={state.customProfiles}
            onProfileSave={saveProfile}
            onProfileRemove={removeProfile}
          />
          <p className="agent-catalog__notice">
            Browsing and saving do not start an agent. Installation, connection, and
            authentication each require a separate explicit action.
          </p>
        </>
      )}
    </section>
  );
}
