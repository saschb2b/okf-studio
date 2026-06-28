// The top chrome bar: Open Folder, back/forward history, the current bundle
// name, and the right-side cluster (Log toggle, validation badge, Settings).
// See docs/ux/browsing-layout.md.

import { useApp } from "../store.tsx";
import "./chrome.css";
import "./TopBar.css";

export function TopBar() {
  const { state, actions } = useApp();

  const errors =
    state.bundle?.issues.filter((i) => i.level === "error").length ?? 0;
  const warns =
    state.bundle?.issues.filter((i) => i.level === "warning").length ?? 0;
  const badgeKind = errors ? "error" : warns ? "warn" : "ok";
  const badgeLabel = errors
    ? `${errors} error${errors === 1 ? "" : "s"}`
    : warns
      ? `${warns} warning${warns === 1 ? "" : "s"}`
      : "conformant";
  const badgeAria = errors
    ? `Validation: ${errors} error${errors === 1 ? "" : "s"}`
    : warns
      ? `Validation: ${warns} warning${warns === 1 ? "" : "s"}`
      : "Validation: conformant, no issues";

  const canBack = state.back.length > 0;
  const canForward = state.fwd.length > 0;

  return (
    <header className="topbar">
      <button
        className="btn"
        aria-label="Open folder"
        onClick={() => void actions.openFolder()}
      >
        Open Folder…
      </button>

      <div className="topbar-nav">
        <button
          className="btn ghost icon"
          aria-label="Go back"
          disabled={!canBack}
          onClick={() => actions.back()}
        >
          ←
        </button>
        <button
          className="btn ghost icon"
          aria-label="Go forward"
          disabled={!canForward}
          onClick={() => actions.forward()}
        >
          →
        </button>
      </div>

      <span className="topbar-title" title={state.bundle?.name ?? "OKF Viewer"}>
        {state.bundle?.name ?? "OKF Viewer"}
      </span>

      <div className="topbar-spacer" />

      {state.bundle && (
        <div className="topbar-actions">
          <button
            className={`btn ghost ${state.panels.log ? "active" : ""}`}
            aria-label="Toggle log panel"
            aria-pressed={state.panels.log}
            onClick={() => actions.togglePanel("log")}
          >
            Log
          </button>

          <button
            className={`badge ${badgeKind}`}
            aria-label={badgeAria}
            aria-pressed={state.panels.validation}
            onClick={() => actions.togglePanel("validation")}
          >
            {badgeLabel}
          </button>

          <button
            className="btn ghost icon"
            aria-label="Open settings"
            onClick={() => actions.setSettingsOpen(true)}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      )}
    </header>
  );
}
