// Log View: a docked peer panel rendering the bundle's reserved log.md as a
// date-grouped, newest-first timeline of rendered markdown change lines.
// The parent (App) mounts this only when state.panels.log is true.
// See docs/features/log-view.md.

import { useApp } from "../store.tsx";
import { renderMarkdown } from "../markdown.ts";
import type { LogEntry } from "../types.ts";
import "./LogView.css";

/** Newest group first. ISO YYYY-MM-DD sorts lexicographically; non-ISO dates
 *  keep their incoming order relative to each other, after the ISO ones. */
function newestFirst(log: LogEntry[]): LogEntry[] {
  return [...log].sort((a, b) => b.date.localeCompare(a.date));
}

/** Render a date group's raw markdown lines as one sanitized HTML block so
 *  authored bullets / links / emphasis render as a proper list. */
function renderEntries(entries: string[]): string {
  return renderMarkdown(entries.join("\n"));
}

export function LogView() {
  const { state, actions } = useApp();
  const log = state.bundle?.log ?? [];
  const groups = newestFirst(log);

  return (
    <aside className="panel log-panel" aria-label="Change log">
      <header>
        <h2 className="log-title">Change Log</h2>
        <button
          type="button"
          className="btn ghost"
          aria-label="Close log"
          onClick={() => actions.togglePanel("log", false)}
        >
          ×
        </button>
      </header>

      {groups.length === 0 ? (
        <div className="log-empty">
          <p>No log.md in this bundle.</p>
          <p className="muted">A change log is optional — bundles without one are fine.</p>
        </div>
      ) : (
        <ol className="log-timeline">
          {groups.map((g, i) => (
            <li key={`${g.date}-${i}`} className="log-entry">
              <h3 className="log-date">{g.date}</h3>
              <div
                className="log-body markdown"
                // Sanitized in renderMarkdown via DOMPurify before injection.
                dangerouslySetInnerHTML={{ __html: renderEntries(g.entries) }}
              />
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
