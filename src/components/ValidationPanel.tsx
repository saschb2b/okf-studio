// Validation panel — the interactive view of the OKF conformance check. Lists
// each issue grouped by level (errors first), with counts; clicking an issue
// with a concept jumps to it. Report, never reject. See docs/features/validation.md.

import { useApp } from "../store.tsx";
import type { Issue, IssueLevel } from "../types.ts";
import "./chrome.css";
import "./ValidationPanel.css";

function Group({
  level,
  issues,
  onJump,
}: {
  level: IssueLevel;
  issues: Issue[];
  onJump: (conceptId: string) => void;
}) {
  if (issues.length === 0) return null;
  const heading = level === "error" ? "Errors" : "Warnings";
  return (
    <section className="vp-group" aria-label={`${heading} (${issues.length})`}>
      <h3 className={`vp-group-head ${level}`}>
        {heading}
        <span className="vp-count">{issues.length}</span>
      </h3>
      <ul className="vp-issues">
        {issues.map((issue, n) => {
          const target = issue.conceptId;
          return (
            <li key={`${level}-${n}`} className={`vp-issue ${level}`}>
              {target ? (
                <button
                  type="button"
                  className="vp-issue-body clickable"
                  aria-label={`${level}: ${issue.message}. Jump to ${target}.`}
                  onClick={() => onJump(target)}
                >
                  <span className={`vp-lvl ${level}`}>{level}</span>
                  <span className="vp-msg">{issue.message}</span>
                  <span className="vp-target">{target}</span>
                </button>
              ) : (
                <div className="vp-issue-body">
                  <span className={`vp-lvl ${level}`}>{level}</span>
                  <span className="vp-msg">{issue.message}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ValidationPanel() {
  const { state, actions } = useApp();

  const issues = state.bundle?.issues ?? [];
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  function close() {
    actions.togglePanel("validation", false);
  }

  return (
    <aside
      className="panel validation"
      role="region"
      aria-label="Validation"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <header className="panel-head">
        <b>Validation</b>
        <button
          className="btn ghost icon"
          aria-label="Close validation panel"
          onClick={close}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {issues.length === 0 ? (
        <p className="vp-conformant">
          <span className="vp-dot ok" aria-hidden="true" />
          Conformant — no issues.
        </p>
      ) : (
        <div className="vp-body">
          <Group level="error" issues={errors} onJump={actions.selectConcept} />
          <Group level="warning" issues={warnings} onJump={actions.selectConcept} />
        </div>
      )}
    </aside>
  );
}
