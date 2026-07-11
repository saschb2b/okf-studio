// Keyboard-shortcuts overlay — the in-app cheat sheet promised by
// docs/ux/keyboard-shortcuts.md. Toggled with `?` (and from the command
// palette), built on Base UI's Dialog. Mirrors the documented keymap.

import { X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { useApp } from "../store.tsx";
import { modKey } from "../platform.ts";
import "./chrome.css";
import "./baseui.css";
import "./ShortcutsHelp.css";

const mod = modKey;

interface Shortcut {
  combo: string[];
  alt?: string[];
  label: string;
}
interface Group {
  title: string;
  items: Shortcut[];
}

const GROUPS: Group[] = [
  {
    title: "General",
    items: [
      { combo: [mod, "O"], label: "Open folder" },
      { combo: [mod, "⇧", "O"], label: "Open from URL" },
      { combo: [mod, "P"], label: "Bundle switcher" },
      { combo: [mod, "K"], alt: ["/"], label: "Search & commands" },
      { combo: [mod, "â‡§", "A"], label: "Agent panel" },
      { combo: [mod, ","], label: "Settings" },
      { combo: ["?"], label: "Keyboard shortcuts" },
      { combo: ["Esc"], label: "Close dialog / deselect" },
    ],
  },
  {
    title: "Navigate",
    items: [
      { combo: ["↑", "↓"], label: "Move through results / sidebar" },
      { combo: ["Enter"], label: "Open the highlighted concept" },
      { combo: ["Alt", "←"], label: "Back in history" },
      { combo: ["Alt", "→"], label: "Forward in history" },
    ],
  },
  {
    title: "Tabs",
    items: [
      { combo: [mod, "T"], label: "New tab" },
      { combo: [mod, "W"], label: "Close tab" },
      { combo: ["Ctrl", "Tab"], alt: ["Ctrl", "⇧", "Tab"], label: "Next / previous tab" },
      { combo: [mod, "click"], label: "Open link in new tab" },
    ],
  },
  {
    title: "Layout",
    items: [
      { combo: ["O"], label: "Bundle overview" },
      { combo: ["T"], label: "Trace lineage" },
      { combo: [mod, "1"], label: "Graph only" },
      { combo: [mod, "2"], label: "Split" },
      { combo: [mod, "3"], label: "Reader only" },
      { combo: ["\\"], label: "Cycle layout" },
      { combo: ["["], label: "Toggle sidebar" },
      { combo: ["]"], label: "Toggle reader" },
    ],
  },
  {
    title: "Visualizations",
    items: [
      { combo: ["V"], label: "Next visualization" },
      { combo: ["Alt", "↑"], label: "Up a level (treemap / sunburst / circles)" },
      { combo: ["+", "−"], label: "Zoom graph in / out" },
      { combo: ["F"], label: "Fit graph to view" },
    ],
  },
  {
    title: "Reader",
    items: [{ combo: [mod, "+/−/0"], label: "Text size: bigger / smaller / reset" }],
  },
  {
    title: "Panels",
    items: [
      { combo: ["L"], label: "Toggle log" },
      { combo: ["R"], label: "Re-scan folder" },
    ],
  },
];

function Keys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k) => (
        <kbd key={k} className="sc-kbd">
          {k}
        </kbd>
      ))}
    </>
  );
}

export function ShortcutsHelp() {
  const { state, actions } = useApp();

  return (
    <Dialog.Root open={state.help} onOpenChange={(open) => actions.setHelp(open)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog shortcuts-dialog">
          <header className="ui-dialog-head">
            <Dialog.Title className="ui-dialog-title">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close className="btn ghost icon" aria-label="Close shortcuts">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="sc-groups">
            {GROUPS.map((g) => (
              <section key={g.title} className="sc-group">
                <h3 className="sc-group-title">{g.title}</h3>
                <dl className="sc-list">
                  {g.items.map((s) => (
                    <div key={s.label} className="sc-row">
                      <dt className="sc-label">{s.label}</dt>
                      <dd className="sc-keys">
                        <Keys keys={s.combo} />
                        {s.alt && (
                          <>
                            <span className="sc-or">or</span>
                            <Keys keys={s.alt} />
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <footer className="ui-dialog-foot">
            <span className="muted sc-hint">
              Press <kbd className="sc-kbd">?</kbd> any time to toggle this.
            </span>
            <Dialog.Close className="btn primary">Close</Dialog.Close>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
