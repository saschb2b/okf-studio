// The bottom status bar (VS Code pattern): a thin, full-width strip below the
// workspace. It houses the validation issue indicator at the left and, at the
// right, low-frequency toggles (the Log panel) plus quiet bundle context.
//
// Urgency is inverted from a badge: conformance is the expected baseline, so it
// is shown *quietly* (dim, no colour) — "everything is fine" should not shout.
// Colour and weight are reserved for the exception: amber for warnings, red for
// errors, where they actually draw the eye. See docs/features/validation.md.

import { Check, History, Sparkles, TriangleAlert, Waypoints, X as XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/shared/store.tsx";
import { AGENT_PANEL_OPENER_ID } from "@/features/agent/agentPanelFocus.ts";
import "./StatusBar.css";

export function StatusBar() {
  const { state, actions } = useApp();
  const bundle = state.bundle;

  const errors = bundle?.issues.filter((i) => i.level === "error").length ?? 0;
  const warns = bundle?.issues.filter((i) => i.level === "warning").length ?? 0;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  let kind: "ok" | "warn" | "error" = "ok";
  let icon: ReactNode = <Check size={14} aria-hidden="true" />;
  let label = "Conformant";
  if (errors > 0) {
    kind = "error";
    icon = <XIcon size={14} aria-hidden="true" />;
    label = warns > 0 ? `${plural(errors, "error")}, ${plural(warns, "warning")}` : plural(errors, "error");
  } else if (warns > 0) {
    kind = "warn";
    icon = <TriangleAlert size={14} aria-hidden="true" />;
    label = plural(warns, "warning");
  }
  const aria =
    errors > 0 || warns > 0 ? `Validation: ${label}` : "Validation: conformant, no issues";

  return (
    <footer className="status-bar">
      <div className="status-region">
        {bundle && (
          <button
            type="button"
            className={`status-item status-issues is-${kind}`}
            aria-label={aria}
            aria-pressed={state.panels.validation}
            onClick={() => actions.togglePanel("validation")}
          >
            <span className="status-icon" aria-hidden="true">
              {icon}
            </span>
            <span>{label}</span>
          </button>
        )}
      </div>
      <div className="status-region">
        {bundle && (
          <button
            type="button"
            className={`status-item status-toggle${state.panels.lineage ? " is-active" : ""}`}
            aria-label="Toggle lineage panel"
            aria-pressed={state.panels.lineage}
            title="Trace lineage (T)"
            onClick={() => actions.togglePanel("lineage")}
          >
            <span className="status-icon" aria-hidden="true">
              <Waypoints size={14} />
            </span>
            <span>Lineage</span>
          </button>
        )}
        {bundle && (
          <button
            type="button"
            className={`status-item status-toggle${state.panels.log ? " is-active" : ""}`}
            aria-label="Toggle log panel"
            aria-pressed={state.panels.log}
            title="Change log (L)"
            onClick={() => actions.togglePanel("log")}
          >
            <span className="status-icon" aria-hidden="true">
              <History size={14} />
            </span>
            <span>Log</span>
          </button>
        )}
        {bundle && (
          <span className="status-item status-muted">
            {plural(bundle.concepts.length, "concept")}
          </span>
        )}
        {/* Format version(s), read-only — a property of the data, not the app. */}
        {bundle && (bundle.odsfVersion ?? bundle.okfVersion) !== null && (
          <span className="status-item status-muted" title="Bundle format version">
            {[
              bundle.odsfVersion ? `ODSF ${bundle.odsfVersion}` : null,
              bundle.okfVersion ? `OKF ${bundle.okfVersion}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        <button
          id={AGENT_PANEL_OPENER_ID}
          type="button"
          className={`status-item status-toggle${state.panels.agent ? " is-active" : ""}`}
          aria-label="Toggle agent panel"
          aria-pressed={state.panels.agent}
          title="Agent panel (Ctrl+Shift+A)"
          onClick={() => actions.togglePanel("agent")}
        >
          <span className="status-icon" aria-hidden="true">
            <Sparkles size={14} />
          </span>
          <span>Agent</span>
        </button>
      </div>
    </footer>
  );
}
