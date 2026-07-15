// Log View: a docked peer panel rendering the bundle's reserved log.md as a
// date-grouped, newest-first timeline of rendered markdown change lines.
// See docs/features/log-view.md.
//
// Built on a NON-MODAL Base UI Dialog (modal={false}): a right-docked panel that
// never traps focus, locks scroll, or dims the rest of the app. Visibility is
// driven by the `open` prop from app state; App mounts this component
// unconditionally. Escape and the × button close it via onOpenChange.

import { X } from "lucide-react";
import { useMemo } from "react";
import type { MouseEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useApp } from "@/store.tsx";
import { renderMarkdown } from "@/markdown.ts";
import { classifyBodyLinks, classifyLink } from "@/components/reader/Reader.tsx";
import type { LogEntry } from "@/types.ts";
import "@/components/chrome.css";
import "@/components/baseui.css";
import "./LogView.css";

/** Newest group first. ISO YYYY-MM-DD sorts lexicographically; non-ISO dates
 *  keep their incoming order relative to each other, after the ISO ones. */
function newestFirst(log: LogEntry[]): LogEntry[] {
  return [...log].sort((a, b) => b.date.localeCompare(a.date));
}

/** The entry's conventional lead kind (log.md entries open with
 *  "**Creation**: …" / "**Update**" / "**Fix**" / "**Deprecation**"), driving
 *  the timeline dot's color. Compound leads ("Fix + Update") take the first
 *  word; anything else falls back to the neutral dot. */
function kindOf(entry: string): string | undefined {
  return /^\*\*(Creation|Update|Fix|Deprecation)/.exec(entry.trim())?.[1].toLowerCase();
}

export function LogView() {
  const { state, actions } = useApp();
  const bundle = state.bundle;

  // Rendered once per log change, links classified against the bundle (log.md
  // lives at the bundle root, so hrefs resolve from ""). Each entry renders
  // separately so it is its own timeline item — joined, consecutive entries
  // merge into one markdown paragraph blob. The {__html} objects must keep a
  // stable identity: React 19 diffs dangerouslySetInnerHTML by object identity
  // and re-sets innerHTML whenever it changes.
  const groups = useMemo(
    () =>
      newestFirst(bundle?.log ?? []).map((g) => ({
        date: g.date,
        entries: g.entries.map((e) => ({
          kind: kindOf(e),
          html: { __html: classifyBodyLinks(renderMarkdown(e), "", bundle) },
        })),
      })),
    [bundle],
  );

  // Delegated routing for the timeline's <a>s: a log entry links the concepts
  // it talks about, and a raw href would navigate the webview away from the
  // app. Concept/section links drive the shared selection (the panel stays
  // open, the reader updates behind it); external links open in the browser.
  function onTimelineClick(e: MouseEvent<HTMLOListElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    e.preventDefault(); // never let the webview navigate
    const link = classifyLink(href, "", bundle);
    if (link.kind === "external") {
      actions.openExternal(link.url);
    } else if (link.kind === "concept") {
      actions.selectConcept(link.id);
    } else if (link.kind === "directory") {
      const first = bundle?.concepts.find((x) => x.id.startsWith(`${link.dir}/`));
      if (first) actions.selectConcept(first.id);
    }
    // anchor/asset/unresolved: inert here — the timeline has no such targets.
  }

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
              <X size={16} aria-hidden="true" />
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
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- delegated routing for in-entry <a>s, which are natively keyboard-accessible (Enter fires a bubbling click) */}
                <ol className="log-timeline" onClick={onTimelineClick}>
                  {groups.map((g, i) => (
                    <li key={`${g.date}-${i}`} className="log-group">
                      <h3 className="log-date">{g.date}</h3>
                      <ul className="log-entries">
                        {g.entries.map((entry, j) => (
                          <li
                            key={j}
                            className="log-item"
                            data-kind={entry.kind}
                          >
                            <div
                              className="log-body markdown"
                              // Sanitized in renderMarkdown via DOMPurify before injection.
                              dangerouslySetInnerHTML={entry.html}
                            />
                          </li>
                        ))}
                      </ul>
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
