// The bottom status bar (VS Code pattern): a thin, full-width strip below the
// workspace. Bundle identity and health live together in the title bar's
// Bundle details action. This strip now has one job: persistent workspace-panel
// toggles, aligned in one predictable cluster.

import { GitBranch, History, Sparkles, Waypoints } from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import { AGENT_PANEL_OPENER_ID } from "@/features/agent/agentPanelFocus.ts";
import { useGitRepository } from "@/features/git/gitRepositoryStore.ts";
import { GIT_PANEL_OPENER_ID } from "@/features/git/gitPanelFocus.ts";
import "./StatusBar.css";

export function StatusBar() {
  const { state, actions } = useApp();
  const bundle = state.bundle;
  const git = useGitRepository(state.activeRoot);

  return (
    <footer className="status-bar">
      <div className="status-region">
        {bundle && (
          <button
            id={GIT_PANEL_OPENER_ID}
            type="button"
            className={`status-item status-toggle${state.panels.git ? " is-active" : ""}`}
            aria-label="Toggle Git panel"
            aria-pressed={state.panels.git}
            title={git.snapshot?.message ?? "Git repository (Ctrl+Shift+G)"}
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
