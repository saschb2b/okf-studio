// Validation panel — the interactive view of the OKF conformance check. Lists
// each issue grouped by level (errors first), with counts; clicking an issue
// with a concept jumps to it. Report, never reject. See docs/features/validation.md.
//
// Built on a NON-MODAL Base UI Dialog (modal={false}): a right-docked panel that
// never traps focus, locks scroll, or dims the rest of the app. Visibility is
// driven by the `open` prop from app state; App mounts this component
// unconditionally. Escape and the × button close it via onOpenChange.

import { X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useApp } from "@/store.tsx";
import type { Issue, IssueLevel } from "@/types.ts";
import "./chrome.css";
import "./baseui.css";
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
            <li key={`${level}-${n}`} className="vp-issue">
              {target ? (
                <button
                  type="button"
                  className="vp-issue-body clickable"
                  aria-label={`${level}: ${issue.message}. Jump to ${target}.`}
                  onClick={() => onJump(target)}
                >
                  <span className={`vp-issue-dot ${level}`} aria-hidden="true" />
                  <span className="vp-msg">{issue.message}</span>
                  <span className="vp-target">{target}</span>
                </button>
              ) : (
                <div className="vp-issue-body">
                  <span className={`vp-issue-dot ${level}`} aria-hidden="true" />
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

  return (
    <Dialog.Root
      modal={false}
      open={state.panels.validation}
      onOpenChange={(open) => actions.togglePanel("validation", open)}
      // Docked peer panel: toggled from the toolbar, so it stays open when the
      // user clicks the workspace or jumps to a concept (which moves focus out).
      // Only Escape, the × button, or the toolbar toggle close it.
      disablePointerDismissal
    >
      <Dialog.Portal>
        {/* No Dialog.Backdrop: a non-modal docked panel must not add a scrim. */}
        <Dialog.Popup className="panel validation" aria-label="Validation">
          <header className="panel-head">
            <Dialog.Title render={<b />}>Validation</Dialog.Title>
            <Dialog.Close
              className="btn ghost icon"
              aria-label="Close validation panel"
            >
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>

          {issues.length === 0 ? (
            <p className="vp-conformant">
              <span className="vp-dot ok" aria-hidden="true" />
              Conformant — no issues.
            </p>
          ) : (
            <ScrollArea.Root className="ui-scrollarea vp-scroll">
              <ScrollArea.Viewport className="ui-scrollarea-viewport">
                <div className="vp-body">
                  <Group
                    level="error"
                    issues={errors}
                    onJump={(id) => {
                      actions.selectConcept(id);
                    }}
                  />
                  <Group
                    level="warning"
                    issues={warnings}
                    onJump={(id) => {
                      actions.selectConcept(id);
                    }}
                  />
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar
                className="ui-scrollarea-scrollbar"
                orientation="vertical"
              >
                <ScrollArea.Thumb className="ui-scrollarea-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
