// Keyboard-shortcuts overlay — the in-app cheat sheet promised by
// docs/ux/keyboard-shortcuts.md. Toggled with `?` (and from the command
// palette), built on Base UI's Dialog.
//
// This mirrors the documented keymap, and the mirror is the point: the previous
// version had drifted, missing the Git panel, agent-thread switching, and the
// Git commit binding entirely, and showing only half of the modified-click pair.
// When a shortcut changes, it changes in three places — keys.ts (or the owning
// component), the spec, and here.

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { useApp } from "@/shared/store.tsx";
import { altKey, modKey, shiftKey } from "@/shared/platform/platform.ts";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./ShortcutsHelp.css";

const mod = modKey;

interface Shortcut {
  /** The chord, one token per cap. */
  keys: string[];
  /** An equivalent chord, shown after "or". */
  alt?: string[];
  label: string;
  /** The condition that makes the binding live, where there is one. */
  note?: string;
}
interface Group {
  title: string;
  items: Shortcut[];
}

// Tokens that name a pointer action rather than a key. They read as words, not
// as caps: "click" on a keycap is a category error.
const POINTER = new Set(["click", "drag", "scroll"]);

const GROUPS: Group[] = [
  {
    title: "Global",
    items: [
      { keys: [mod, "O"], label: "Open folder" },
      { keys: [mod, shiftKey, "O"], label: "Open from URL" },
      { keys: [mod, "P"], label: "Bundle switcher" },
      { keys: [mod, "K"], alt: ["/"], label: "Search and commands" },
      { keys: [mod, ","], label: "Settings" },
      { keys: ["?"], label: "Keyboard shortcuts" },
      { keys: ["Esc"], label: "Close dialog, or deselect" },
    ],
  },
  {
    title: "Layout and reading",
    items: [
      { keys: [mod, "1"], label: "Graph only" },
      { keys: [mod, "2"], label: "Split" },
      { keys: [mod, "3"], label: "Reader only" },
      { keys: ["\\"], label: "Cycle layout" },
      { keys: ["["], label: "Toggle sidebar" },
      { keys: ["]"], label: "Toggle reader" },
      { keys: [mod, "+"], label: "Bigger reader text" },
      { keys: [mod, "-"], label: "Smaller reader text" },
      { keys: [mod, "0"], label: "Reset text size" },
    ],
  },
  {
    title: "Navigate",
    items: [
      { keys: ["↑", "↓"], label: "Move through results" },
      { keys: ["Enter"], label: "Open highlighted result" },
      { keys: [altKey, "←"], label: "Back" },
      { keys: [altKey, "→"], label: "Forward" },
    ],
  },
  {
    title: "Tabs",
    items: [
      { keys: [mod, "T"], label: "New tab" },
      { keys: [mod, "W"], label: "Close tab" },
      { keys: ["Ctrl", "Tab"], label: "Next tab" },
      { keys: ["Ctrl", shiftKey, "Tab"], label: "Previous tab" },
      { keys: [mod, "click"], label: "Open link in a tab", note: `add ${shiftKey} to switch to it` },
    ],
  },
  {
    title: "Visualizations",
    items: [
      { keys: ["V"], label: "Next visualization" },
      { keys: [altKey, "↑"], label: "Up one level", note: "treemap, sunburst, circles" },
      { keys: ["+"], alt: ["-"], label: "Zoom graph" },
      { keys: ["F"], label: "Fit graph to view" },
    ],
  },
  {
    title: "Panels and tools",
    items: [
      { keys: ["O"], label: "Bundle home" },
      { keys: ["T"], label: "Trace lineage" },
      { keys: ["L"], label: "Toggle log" },
      { keys: ["R"], label: "Re-scan folder" },
      { keys: [mod, shiftKey, "A"], label: "Agent panel" },
      { keys: [mod, shiftKey, "G"], label: "Git panel" },
      { keys: [mod, "PgUp"], label: "Previous agent thread", note: "in the thread switcher" },
      { keys: [mod, "PgDn"], label: "Next agent thread" },
      { keys: [mod, "Enter"], label: "Commit staged scope", note: "in the Git message field" },
    ],
  },
];

/** Everything a query can match, lowercased once per shortcut. */
function haystack(s: Shortcut): string {
  return [s.label, s.note ?? "", ...s.keys, ...(s.alt ?? [])].join(" ").toLowerCase();
}

function Chord({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k, i) =>
        POINTER.has(k) ? (
          <span key={`${k}-${i}`} className="sc-pointer">
            {k}
          </span>
        ) : (
          <kbd key={`${k}-${i}`} className="kbd">
            {k}
          </kbd>
        ),
      )}
    </>
  );
}

export function ShortcutsHelp() {
  const { state, actions } = useApp();
  const [query, setQuery] = useState("");
  // Focus the filter on open through Base UI's own prop rather than autoFocus,
  // which the a11y lint rejects: the dialog owns its focus trap, so handing it
  // the target is both the sanctioned API and the one that stays correct if the
  // popup's mount timing changes.
  const filterRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: q ? g.items.filter((s) => haystack(s).includes(q)) : g.items,
  })).filter((g) => g.items.length > 0);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  // Reset the filter on close, so reopening never starts mid-search.
  function onOpenChange(open: boolean) {
    if (!open) setQuery("");
    actions.setHelp(open);
  }

  return (
    <Dialog.Root open={state.help} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog shortcuts-dialog" initialFocus={filterRef}>
          <header className="ui-dialog-head">
            <Dialog.Title className="ui-dialog-title">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close className="btn ghost icon" aria-label="Close shortcuts">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>

          <input
            ref={filterRef}
            className="sc-filter"
            type="search"
            value={query}
            placeholder="Filter by action or key…"
            aria-label="Filter shortcuts"
            onChange={(e) => setQuery(e.target.value)}
          />

          {/* The count is the only cue that a filter narrowed the sheet, so it
              has to reach a screen reader too. */}
          <p className="sr-only" role="status">
            {q ? `${total} shortcut${total === 1 ? "" : "s"} match ${query}` : ""}
          </p>

          {total === 0 ? (
            <p className="sc-empty muted">
              No shortcut matches “{query}”. Every binding is listed in the keyboard
              shortcuts concept in the docs bundle.
            </p>
          ) : (
            <div className="sc-groups">
              {groups.map((g) => (
                <section key={g.title} className="sc-group">
                  <h3 className="sc-group-title">{g.title}</h3>
                  <dl className="sc-list">
                    {g.items.map((s) => (
                      <div key={s.label} className="sc-row">
                        <dt className="sc-label">
                          {s.label}
                          {s.note && <span className="sc-note">{s.note}</span>}
                        </dt>
                        <dd className="sc-keys">
                          <Chord keys={s.keys} />
                          {s.alt && (
                            <>
                              <span className="sc-or">or</span>
                              <Chord keys={s.alt} />
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}

          <footer className="ui-dialog-foot">
            <span className="kbd-hints">
              <span className="kbd-hint">
                <kbd className="kbd">?</kbd> toggle this sheet
              </span>
              <span className="kbd-hint">
                <kbd className="kbd">Esc</kbd> close
              </span>
            </span>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
