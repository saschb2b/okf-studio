// The bottom status bar (VS Code pattern): a thin, full-width strip below the
// workspace. The left region describes the open bundle (validation verdict,
// then quiet facts: concept count, format version); the right region holds
// only panel toggles (Lineage, Log, Agent), so every clickable item lives in
// one predictable cluster.
//
// Urgency is inverted from a badge: conformance is the expected baseline, so it
// is shown *quietly* (dim, no colour) — "everything is fine" should not shout.
// Colour and weight are reserved for the exception: amber for warnings, red for
// errors, where they actually draw the eye. See docs/features/validation.md.

import { Check, GitBranch, History, Sparkles, TriangleAlert, Waypoints, X as XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/shared/store.tsx";
import { AGENT_PANEL_OPENER_ID } from "@/features/agent/agentPanelFocus.ts";
import { useGitRepository } from "@/features/git/gitRepositoryStore.ts";
import "./StatusBar.css";

export function StatusBar() {
  const { state, actions } = useApp();
  const bundle = state.bundle;
  const git = useGitRepository(state.activeRoot);

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
      {/* Left: the state of the open bundle — the conformance verdict, then
          quiet read-only facts (size, format version) behind a hairline. The
          right region holds only panel toggles, so clickability follows
          placement instead of hover-probing five identical-looking items. */}
      <div className="status-region">
        {bundle && (
          <button
            type="button"
            className={`status-item status-issues is-${kind}`}
            aria-label={aria}
            aria-pressed={state.panels.validation}
            title="Validation report"
            onClick={() => actions.togglePanel("validation")}
          >
            <span className="status-icon" aria-hidden="true">
              {icon}
            </span>
            <span>{label}</span>
          </button>
        )}
        {bundle && <span className="status-sep" aria-hidden="true" />}
        {bundle && (
          <span className="status-item status-muted" title="Concepts in this bundle">
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
      <div className="status-region">
        {bundle && (
          <button
            type="button"
            className={`status-item status-toggle${state.panels.git ? " is-active" : ""}`}
            aria-label="Toggle Git panel"
            aria-pressed={state.panels.git}
            title={git.snapshot?.message ?? "Git repository"}
            onClick={() => actions.togglePanel("git")}
          >
            <span className="status-icon" aria-hidden="true">
              <GitBranch size={14} />
            </span>
            <span>{git.snapshot?.availability === "ready" ? (git.snapshot.branch ?? "Git") : "Git"}</span>
            {git.snapshot?.availability === "ready" && (git.snapshot.ahead > 0 || git.snapshot.behind > 0) ? (
              <span className="status-git-counts" aria-label={`${git.snapshot.ahead} ahead, ${git.snapshot.behind} behind`}>
                {git.snapshot.ahead > 0 ? `↑${git.snapshot.ahead}` : ""}
                {git.snapshot.behind > 0 ? `↓${git.snapshot.behind}` : ""}
              </span>
            ) : null}
          </button>
        )}
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
