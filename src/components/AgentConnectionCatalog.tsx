import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { catalogEntries, type AgentCatalogEntry } from "../agent/catalog.ts";
import type { CustomAgentInput, CustomAgentProfile } from "../agent/custom.ts";
import { agentCatalog, customAgents, removeCustomAgent, saveCustomAgent } from "../ipc.ts";
import { AgentCatalogCard } from "./AgentCatalogCard.tsx";
import { CustomAgentProfiles } from "./CustomAgentProfiles.tsx";
import "./AgentConnectionCatalog.css";

type CatalogState =
  | { status: "loading" }
  | {
      status: "ready";
      entries: readonly AgentCatalogEntry[];
      customProfiles: readonly CustomAgentProfile[];
    }
  | { status: "error"; message: string };

async function loadCatalog(): Promise<CatalogState> {
  try {
    const [document, customProfiles] = await Promise.all([agentCatalog(), customAgents()]);
    return { status: "ready", entries: catalogEntries(document), customProfiles };
  } catch (error: unknown) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function AgentConnectionCatalog({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
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
            <AgentCatalogCard entry={entry} key={entry.id} />
          ))}
        </div>
      )}

      {state.status === "ready" && (
        <>
          <CustomAgentProfiles
            profiles={state.customProfiles}
            onProfileSave={saveProfile}
            onProfileRemove={removeProfile}
          />
          <p className="agent-catalog__notice">
            Catalog browsing and custom-command setup do not start an agent. Install runs only
            when you choose it; connecting and authentication remain separate.
          </p>
        </>
      )}
    </section>
  );
}
