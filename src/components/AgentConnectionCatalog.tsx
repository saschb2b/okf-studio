import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { catalogEntries, type AgentCatalogEntry } from "../agent/catalog.ts";
import { agentCatalog } from "../ipc.ts";
import { AgentCatalogCard } from "./AgentCatalogCard.tsx";
import "./AgentConnectionCatalog.css";

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; entries: readonly AgentCatalogEntry[] }
  | { status: "error"; message: string };

async function loadCatalog(): Promise<CatalogState> {
  try {
    const document = await agentCatalog();
    return { status: "ready", entries: catalogEntries(document) };
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
        <p className="agent-catalog__notice">
          Catalog browsing does not download or start an agent. Install runs only
          when you choose it; connecting and authentication remain separate.
        </p>
      )}
    </section>
  );
}
