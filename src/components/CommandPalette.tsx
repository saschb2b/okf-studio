// Command Palette — Ctrl/Cmd+K. Jump to any concept by id, title, or type, and
// run quick actions, keyboard-only. Filters over the already-parsed bundle, so
// results are instant. See docs/features/command-palette.md.
//
// Built on Base UI's Dialog (modal focus trap, Escape, backdrop, scroll-lock,
// focus restore) wrapping an inline Autocomplete (arrow/typeahead navigation,
// active-item ARIA, Enter-to-select). Appearance is our design tokens; the
// overlay/shell come from `.ui-backdrop`/`.ui-dialog`, the inner look from the
// `.palette*` classes. We keep our own fuzzy ranking and feed the result to
// Autocomplete via `filteredItems`, so the established scoring/order survives.

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { useApp } from "../store.tsx";
import type { Concept } from "../types.ts";
import "./chrome.css";
import "./baseui.css";
import "./CommandPalette.css";

interface ActionItem {
  kind: "action";
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

interface ConceptItem {
  kind: "concept";
  id: string;
  concept: Concept;
  score: number;
}

type Item = ActionItem | ConceptItem;

/**
 * Substring / subsequence match returning a rank score (higher is better), or
 * -1 for no match. Prefix and whole-word matches rank above scattered ones.
 */
function scoreMatch(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();

  const idx = h.indexOf(n);
  if (idx === 0) return 1000 - h.length; // prefix: best, shorter wins
  if (idx > 0) {
    // contiguous substring; bonus when it begins a word
    const wordStart = /[\s/_.-]/.test(h[idx - 1]);
    return 600 - idx + (wordStart ? 50 : 0);
  }

  // fuzzy subsequence fallback
  let hi = 0;
  let matched = 0;
  for (let ni = 0; ni < n.length; ni++) {
    while (hi < h.length && h[hi] !== n[ni]) hi++;
    if (hi >= h.length) return -1;
    hi++;
    matched++;
  }
  return matched === n.length ? 100 - h.length : -1;
}

function scoreConcept(c: Concept, needle: string): number {
  if (!needle) return 0;
  return Math.max(
    scoreMatch(c.title, needle),
    scoreMatch(c.id, needle),
    scoreMatch(c.type, needle),
  );
}

/** Display label for an item — used by Autocomplete for ARIA/typeahead. */
function itemLabel(item: Item): string {
  return item.kind === "concept" ? item.concept.title : item.label;
}

export function CommandPalette() {
  const { state, actions } = useApp();
  // Controlled input value: we need the query to compute the ranked
  // `filteredItems` array ourselves (Autocomplete's built-in collator filter
  // can't reproduce our prefix/word-boundary/subsequence scoring).
  const [query, setQuery] = useState("");

  const close = () => actions.setPalette(false);

  const actionItems: ActionItem[] = [
    {
      kind: "action",
      id: "act:open",
      label: "Open folder…",
      hint: "Action",
      run: () => void actions.openFolder(),
    },
    {
      kind: "action",
      id: "act:rescan",
      label: "Re-scan folder",
      hint: "Action",
      run: () => void actions.rescan(),
    },
    {
      kind: "action",
      id: "act:log",
      label: "Toggle log",
      hint: "Action",
      run: () => actions.togglePanel("log"),
    },
    {
      kind: "action",
      id: "act:settings",
      label: "Settings",
      hint: "Action",
      run: () => actions.setSettingsOpen(true),
    },
  ];

  const concepts = state.bundle?.concepts ?? [];
  const allConceptItems: ConceptItem[] = concepts.map((concept) => ({
    kind: "concept" as const,
    id: concept.id,
    concept,
    score: 0,
  }));

  // The complete item set (concepts lead — the palette is primarily a
  // navigator — then quick actions). Autocomplete uses this for typeahead/ARIA;
  // the visible subset is the ranked `filteredItems` below.
  const items: Item[] = [...allConceptItems, ...actionItems];

  // Our own fuzzy ranking (prefix/word-boundary/subsequence over title/id/type).
  const needle = query.trim();
  const conceptHits: ConceptItem[] = needle
    ? allConceptItems
        .map((it) => ({ ...it, score: scoreConcept(it.concept, needle) }))
        .filter((it) => it.score >= 0)
        .sort(
          (a, b) =>
            b.score - a.score || a.concept.title.localeCompare(b.concept.title),
        )
        .slice(0, 30)
    : allConceptItems;
  const actionHits = needle
    ? actionItems.filter((a) => scoreMatch(a.label, needle) >= 0)
    : actionItems;
  const filteredItems: Item[] = [...conceptHits, ...actionHits];

  function activate(item: Item) {
    if (item.kind === "concept") {
      actions.selectConcept(item.id); // store also closes the palette
      close();
    } else {
      close();
      item.run();
    }
  }

  return (
    <Dialog.Root
      open={state.palette}
      onOpenChange={(open) => {
        actions.setPalette(open);
        if (!open) setQuery(""); // clear the search when the palette closes
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup
          className="ui-dialog palette-dialog"
          aria-label="Command palette"
        >
          <Autocomplete.Root
            // Inline: render the list directly in the dialog, no nested popup.
            // `open` is bound to the dialog so transient state resets on close.
            inline
            open={state.palette}
            items={items}
            filteredItems={filteredItems}
            value={query}
            onValueChange={(value) => setQuery(value)}
            itemToStringValue={itemLabel}
            autoHighlight
          >
            <Autocomplete.Input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="palette-input"
              placeholder="Jump to a concept, or run a command…"
            />

            <Autocomplete.List className="palette-list" aria-label="Results">
              {(item: Item) => (
                <Autocomplete.Item
                  key={`${item.kind}:${item.id}`}
                  value={item}
                  className="palette-item"
                  onClick={() => activate(item)}
                >
                  {item.kind === "concept" ? (
                    <>
                      <span className="palette-label">
                        {item.concept.title}
                      </span>
                      <span className="palette-meta">
                        <span className="palette-type">
                          {item.concept.type}
                        </span>
                        <span className="palette-id">{item.concept.id}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="palette-label">{item.label}</span>
                      <span className="palette-meta">
                        <span className="palette-hint">{item.hint}</span>
                      </span>
                    </>
                  )}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>

            <Autocomplete.Empty className="palette-empty muted">
              No matches
            </Autocomplete.Empty>
          </Autocomplete.Root>

          <div className="palette-foot muted" aria-hidden="true">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>esc to close</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
