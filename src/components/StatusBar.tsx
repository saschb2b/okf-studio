// The bottom status bar (VS Code pattern): a thin, full-width strip below the
// workspace. It houses the validation issue indicator at the left and, at the
// right, low-frequency toggles (the Log panel) plus quiet bundle context.
//
// Urgency is inverted from a badge: conformance is the expected baseline, so it
// is shown *quietly* (dim, no colour) — "everything is fine" should not shout.
// Colour and weight are reserved for the exception: amber for warnings, red for
// errors, where they actually draw the eye. See docs/features/validation.md.

import { useApp } from "../store.tsx";
import "./StatusBar.css";

export function StatusBar() {
  const { state, actions } = useApp();
  const bundle = state.bundle;

  const errors = bundle?.issues.filter((i) => i.level === "error").length ?? 0;
  const warns = bundle?.issues.filter((i) => i.level === "warning").length ?? 0;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  let kind: "ok" | "warn" | "error" = "ok";
  let icon = "✓";
  let label = "Conformant";
  if (errors > 0) {
    kind = "error";
    icon = "✕";
    label = warns > 0 ? `${plural(errors, "error")}, ${plural(warns, "warning")}` : plural(errors, "error");
  } else if (warns > 0) {
    kind = "warn";
    icon = "⚠";
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
            className={`status-item status-toggle${state.panels.log ? " is-active" : ""}`}
            aria-label="Toggle log panel"
            aria-pressed={state.panels.log}
            title="Change log (L)"
            onClick={() => actions.togglePanel("log")}
          >
            <span className="status-icon" aria-hidden="true">
              ≣
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
      </div>
    </footer>
  );
}
