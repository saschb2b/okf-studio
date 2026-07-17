import type { AgentSessionHistoryInfo } from "@/features/agent/connection.ts";
import type { HistoryState } from "@/features/agent/components/conversation/types.ts";
import { historyDateLabel } from "@/features/agent/components/conversation/helpers.ts";
import { ChevronLeft, RotateCcw, Search } from "lucide-react";
import { useId } from "react";
import "./AgentSessionHistory.css";

export function AgentSessionHistory({
  state,
  query,
  pendingSessionId,
  importDisabledReason,
  onQueryChange,
  onBack,
  onRefresh,
  onImport,
}: {
  state: Exclude<HistoryState, { status: "closed" }>;
  query: string;
  pendingSessionId: string | null;
  importDisabledReason: string | null;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onRefresh: () => void;
  onImport: (session: AgentSessionHistoryInfo) => void;
}) {
  const titleId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sessions = state.status === "ready"
    ? state.sessions.filter((session) =>
      (session.title ?? "Untitled session").toLocaleLowerCase().includes(normalizedQuery)
    )
    : [];
  const importBlocked = pendingSessionId !== null || importDisabledReason !== null;

  return (
    <section className="agent-history" aria-labelledby={titleId}>
      <header>
        <div>
          <h3 id={titleId}>Import agent session</h3>
          <p>Fresh, bundle-scoped sessions reported by this agent.</p>
        </div>
        <div className="agent-history__actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            <ChevronLeft aria-hidden="true" size={14} />
            Back
          </button>
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Refresh agent session history"
            title="Refresh"
            disabled={state.status === "loading" || pendingSessionId !== null}
            onClick={onRefresh}
          >
            <RotateCcw aria-hidden="true" size={14} />
          </button>
        </div>
      </header>

      {state.status === "ready" && state.sessions.length > 0 && (
        <label className="agent-history__search">
          <Search aria-hidden="true" size={14} />
          <span className="sr-only">Search agent sessions</span>
          <input
            type="search"
            value={query}
            placeholder="Search sessions"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
      )}

      {state.status === "loading" && <p role="status">Loading agent sessions...</p>}
      {state.status === "error" && (
        <div className="agent-history__state">
          <p role="alert">History unavailable. {state.message}</p>
          <button type="button" className="btn" onClick={onRefresh}>Retry</button>
        </div>
      )}
      {state.status === "ready" && state.sessions.length === 0 && (
        <div className="agent-history__state">
          <p>This agent has no sessions for the active bundle.</p>
        </div>
      )}
      {state.status === "ready" && state.sessions.length > 0 && sessions.length === 0 && (
        <div className="agent-history__state">
          <p>No bundle-scoped sessions match “{query.trim()}”.</p>
        </div>
      )}
      {state.status === "ready" && sessions.length > 0 && (
        <>
          <ul className="agent-history__list">
            {sessions.map((session) => {
              const updatedAt = historyDateLabel(session.updatedAt);
              const isPending = pendingSessionId === session.sessionId;
              return (
                <li key={session.sessionId}>
                  <div>
                    <strong>{session.title ?? "Untitled session"}</strong>
                    {updatedAt && <span>{updatedAt}</span>}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={importBlocked}
                    title={importDisabledReason ?? undefined}
                    onClick={() => onImport(session)}
                  >
                    {isPending ? "Importing..." : "Import"}
                  </button>
                </li>
              );
            })}
          </ul>
          {state.hasMore && (
            <p className="agent-history__limit">Showing the first 50 matching sessions.</p>
          )}
        </>
      )}
    </section>
  );
}
