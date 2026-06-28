// Log View: a docked peer panel rendering the bundle's reserved log.md as a
// date-grouped, newest-first timeline of rendered markdown change lines.
// See docs/features/log-view.md.
//
// Built on a NON-MODAL Base UI Dialog (modal={false}): a right-docked panel that
// never traps focus, locks scroll, or dims the rest of the app. Visibility is
// driven by the `open` prop from app state; App mounts this component
// unconditionally. Escape and the × button close it via onOpenChange.

import { Dialog } from "@base-ui/react/dialog";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useApp } from "../store.tsx";
import { renderMarkdown } from "../markdown.ts";
import type { LogEntry } from "../types.ts";
import "./chrome.css";
import "./baseui.css";
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
    <Dialog.Root
      modal={false}
      open={state.panels.log}
      onOpenChange={(open) => actions.togglePanel("log", open)}
      // Docked peer panel: toggled from the toolbar, so it stays open when the
      // user clicks the workspace. Only Escape, the × button, or the toolbar
      // toggle close it.
      disablePointerDismissal
    >
      <Dialog.Portal>
        {/* No Dialog.Backdrop: a non-modal docked panel must not add a scrim. */}
        <Dialog.Popup className="panel log-panel" aria-label="Change log">
          <header className="panel-head">
            <Dialog.Title className="log-title">Change Log</Dialog.Title>
            <Dialog.Close
              className="btn ghost icon"
              aria-label="Close log"
            >
              <span aria-hidden="true">×</span>
            </Dialog.Close>
          </header>

          {groups.length === 0 ? (
            <div className="log-empty">
              <p>No log.md in this bundle.</p>
              <p className="muted">
                A change log is optional — bundles without one are fine.
              </p>
            </div>
          ) : (
            <ScrollArea.Root className="ui-scrollarea log-scroll">
              <ScrollArea.Viewport className="ui-scrollarea-viewport">
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
