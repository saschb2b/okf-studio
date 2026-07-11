import { ArrowLeft, Box, Cpu, KeyRound, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import {
  AGENT_CATALOG,
  authMethodLabel,
  runtimeLabel,
  type AgentCatalogEntry,
} from "../agent/catalog.ts";
import "./AgentConnectionCatalog.css";

const icons: Record<AgentCatalogEntry["id"], ReactNode> = {
  "claude-agent": <TerminalSquare size={20} aria-hidden="true" />,
  codex: <Box size={20} aria-hidden="true" />,
  "studio-api": <KeyRound size={20} aria-hidden="true" />,
  "local-model": <Cpu size={20} aria-hidden="true" />,
};

export function AgentConnectionCatalog({ onBack }: { onBack: () => void }) {
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

      <div className="agent-catalog__list">
        {AGENT_CATALOG.map((entry) => (
          <article className="agent-catalog-card" key={entry.id}>
            <div className="agent-catalog-card__icon">{icons[entry.id]}</div>
            <div className="agent-catalog-card__body">
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
            </div>
            <button
              type="button"
              className="btn agent-catalog-card__action"
              disabled
              title="Installation is added in the next Studio work package"
            >
              {entry.availability === "installable" ? "Install" : "Not available yet"}
            </button>
          </article>
        ))}
      </div>

      <p className="agent-catalog__notice">
        Catalog browsing does not download or start an agent. Installation is
        disabled until Studio can verify packages and isolate its agent cache.
      </p>
    </section>
  );
}
