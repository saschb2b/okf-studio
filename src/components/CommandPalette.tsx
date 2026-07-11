// Global Search Launcher — Ctrl/Cmd+K (or `/`, or the header search field).
// A single launcher that jumps to any concept by id/title/type, searches the
// full text of descriptions and bodies, surfaces recent concepts, and runs
// quick actions — keyboard-only. Filters over the already-parsed bundle, so
// results are instant. See docs/proposals/global-search.md and
// docs/features/command-palette.md.
//
// Built on Base UI's Dialog (modal focus trap, Escape, backdrop, scroll-lock,
// focus restore) wrapping an inline Autocomplete (arrow/typeahead navigation,
// active-item ARIA, Enter-to-select). Results are split into ordered groups
// (Recent / Concepts / In text / Actions) via Autocomplete.Group +
// Autocomplete.Collection; we keep our own fuzzy ranking and hand the grouped
// result to Autocomplete via `filteredItems`, so the scoring/order survives.

import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { useApp } from "../store.tsx";
import { focusAgentPanel, focusAgentPanelOpener } from "../agentPanelFocus.ts";
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
  /** A highlighted snippet for "In text" hits; absent for plain title hits. */
  snippet?: SnippetPart[];
}

type Item = ActionItem | ConceptItem;

/** One group of results. `value` is the visible label (and groups Base UI). */
interface Group {
  value: string;
  items: Item[];
}

/** A slice of snippet text; `match` parts are visually highlighted. */
interface SnippetPart {
  text: string;
  match: boolean;
}

const RECENT_LIMIT = 5;
const CONCEPT_LIMIT = 30;
const TEXT_LIMIT = 20;
const SNIPPET_PAD = 32;

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
  for (const ch of n) {
    while (hi < h.length && h[hi] !== ch) hi++;
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

/**
 * Build a one-line highlighted snippet around the first occurrence of `needle`
 * in `text`, or null if the (case-insensitive) substring isn't present. Newlines
 * collapse to spaces so the snippet stays single-line.
 */
function buildSnippet(text: string, needle: string): SnippetPart[] | null {
  const flat = text.replace(/\s+/g, " ").trim();
  const idx = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return null;

  const start = Math.max(0, idx - SNIPPET_PAD);
  const end = Math.min(flat.length, idx + needle.length + SNIPPET_PAD);
  const parts: SnippetPart[] = [];
  if (start > 0) parts.push({ text: "…", match: false });
  if (idx > start) parts.push({ text: flat.slice(start, idx), match: false });
  parts.push({ text: flat.slice(idx, idx + needle.length), match: true });
  if (end > idx + needle.length) {
    parts.push({ text: flat.slice(idx + needle.length, end), match: false });
  }
  if (end < flat.length) parts.push({ text: "…", match: false });
  return parts;
}

/** Display label for an item — used by Autocomplete for ARIA/typeahead. */
function itemLabel(item: Item): string {
  return item.kind === "concept" ? item.concept.title : item.label;
}

export function CommandPalette() {
  const { state, actions } = useApp();
  // Controlled input value: we need the query to compute the ranked, grouped
  // result set ourselves (Autocomplete's built-in collator filter can't
  // reproduce our prefix/word-boundary/subsequence scoring or grouping).
  const [query, setQuery] = useState("");
  // One-shot seed hand-off (the sidebar's "Open full search" passes its query
  // along): applied once per open, via the adjust-state-during-render pattern,
  // so the user continues the same search instead of retyping it.
  const [appliedSeed, setAppliedSeed] = useState<string | null>(null);
  if (state.palette && state.paletteSeed != null && appliedSeed !== state.paletteSeed) {
    setAppliedSeed(state.paletteSeed);
    setQuery(state.paletteSeed);
  }

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
      id: "act:open-url",
      label: "Open from URL…",
      hint: "Action",
      run: () => actions.setRemoteOpen(true),
    },
    {
      kind: "action",
      id: "act:overview",
      label: "Bundle overview",
      hint: "Action",
      run: () => actions.setOverview(true),
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
      id: "act:lineage",
      label: "Trace lineage",
      hint: "Action",
      run: () => actions.togglePanel("lineage", true),
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
      id: "act:popout",
      label: "Move concept to new window",
      hint: "Action",
      run: () => void actions.popOutTab(),
    },
    {
      kind: "action",
      id: "act:viz-graph",
      label: "View: Graph",
      hint: "Action",
      run: () => actions.setVizView("graph"),
    },
    {
      kind: "action",
      id: "act:viz-treemap",
      label: "View: Treemap",
      hint: "Action",
      run: () => actions.setVizView("treemap"),
    },
    {
      kind: "action",
      id: "act:viz-sunburst",
      label: "View: Sunburst",
      hint: "Action",
      run: () => actions.setVizView("sunburst"),
    },
    {
      kind: "action",
      id: "act:viz-pack",
      label: "View: Circle packing",
      hint: "Action",
      run: () => actions.setVizView("pack"),
    },
    {
      kind: "action",
      id: "act:agent",
      label: "Toggle agent panel",
      hint: "Action",
      run: () => {
        actions.togglePanel("agent");
        if (state.panels.agent) focusAgentPanelOpener();
        else focusAgentPanel();
      },
    },
    {
      kind: "action",
      id: "act:settings",
      label: "Settings",
      hint: "Action",
      run: () => actions.setSettingsOpen(true),
    },
    {
      kind: "action",
      id: "act:shortcuts",
      label: "Keyboard shortcuts",
      hint: "Action",
      run: () => actions.setHelp(true),
    },
  ];

  const concepts = state.bundle?.concepts ?? [];
  const byId = new Map(concepts.map((c) => [c.id, c] as const));

  const conceptItem = (concept: Concept, score = 0): ConceptItem => ({
    kind: "concept",
    id: concept.id,
    concept,
    score,
  });

  // Recent: distinct, most-recent-first concept ids the user viewed. `back` is
  // chronological (oldest→newest prior view); the active concept is the latest.
  // Derived from existing state — no store change. See proposal.
  const recentItems: ConceptItem[] = [];
  const seenRecent = new Set<string>();
  const recentIds = [...state.back, state.activeConceptId].reverse();
  for (const id of recentIds) {
    if (!id || seenRecent.has(id)) continue;
    const c = byId.get(id);
    if (!c) continue;
    seenRecent.add(id);
    recentItems.push(conceptItem(c));
    if (recentItems.length >= RECENT_LIMIT) break;
  }

  const needle = query.trim();

  // Concepts: fuzzy/substring matches on title/id/type. Title/prefix hits rank
  // first (handled by scoreConcept). Empty query shows Recent + Actions instead
  // (the zero-query state), so this group is empty until the user types.
  const conceptHits: ConceptItem[] = needle
    ? concepts
        .map((c) => conceptItem(c, scoreConcept(c, needle)))
        .filter((it) => it.score >= 0)
        .sort(
          (a, b) =>
            b.score - a.score || a.concept.title.localeCompare(b.concept.title),
        )
        .slice(0, CONCEPT_LIMIT)
    : [];

  // In text: concepts whose description or body contains the query and that
  // aren't already a strong (Concepts-group) hit. Render a snippet around it.
  const strongHits = new Set(conceptHits.map((it) => it.id));
  const textHits: ConceptItem[] = needle
    ? concepts
        .filter((c) => !strongHits.has(c.id))
        .map((c): ConceptItem | null => {
          const snippet =
            buildSnippet(c.description, needle) ?? buildSnippet(c.body, needle);
          return snippet ? { ...conceptItem(c), snippet } : null;
        })
        .filter((it): it is ConceptItem => it !== null)
        .slice(0, TEXT_LIMIT)
    : [];

  // Ranked like concepts (fuzzy/substring on the label, best match first) so a
  // good action match doesn't lose to a weaker fuzzy concept hit for ordering
  // purposes — actions are few, so this group never grows past actionItems.length.
  const actionHits: ActionItem[] = needle
    ? actionItems
        .map((a) => ({ a, score: scoreMatch(a.label, needle) }))
        .filter(({ score }) => score >= 0)
        .sort((x, y) => y.score - x.score)
        .map(({ a }) => a)
    : actionItems;

  // Group order: Recent (zero-query only) → Actions → Concepts → In text.
  // Actions come right after Recent, ahead of Concepts/In text, because there
  // are at most a handful of them — buried below dozens of fuzzy concept
  // hits, a matching action was effectively unreachable without scrolling
  // past everything else first. Zero-query shows Recent + Actions (never a
  // blank list).
  const groups: Group[] = [];
  if (!needle && recentItems.length) {
    groups.push({ value: "Recent", items: recentItems });
  }
  if (actionHits.length) groups.push({ value: "Actions", items: actionHits });
  if (conceptHits.length) groups.push({ value: "Concepts", items: conceptHits });
  if (textHits.length) groups.push({ value: "In text", items: textHits });

  function activate(item: Item, e?: ReactMouseEvent) {
    if (item.kind === "concept") {
      // Ctrl/Cmd+click opens the result in a background tab (Shift to also
      // switch) — the browser gesture. See docs/proposals/multi-view.md.
      if (e && (e.ctrlKey || e.metaKey)) {
        actions.openInNewTab(item.id, { background: !e.shiftKey });
      } else {
        actions.selectConcept(item.id); // store also closes the palette
      }
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
        if (!open) {
          setQuery(""); // clear the search when the palette closes
          setAppliedSeed(null); // …so an identical seed can apply next time
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup
          className="ui-dialog palette-dialog"
          aria-label="Search and commands"
        >
          <Autocomplete.Root
            // Inline: render the list directly in the dialog, no nested popup.
            // `open` is bound to the dialog so transient state resets on close.
            // `items` and `filteredItems` must share the same grouped shape —
            // passing a flattened `items` here previously left the combobox
            // thinking the list was ungrouped, so its keyboard-navigation index
            // walked the 2-3 *groups* instead of the items inside them (arrow
            // key navigation got stuck after one or two presses).
            inline
            open={state.palette}
            items={groups}
            filteredItems={groups}
            value={query}
            onValueChange={(value) => setQuery(value)}
            itemToStringValue={itemLabel}
            autoHighlight
          >
            <Autocomplete.Input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="palette-input"
              placeholder="Search concepts and text, or run a command…"
            />

            <Autocomplete.List className="palette-list" aria-label="Results">
              {(group: Group) => (
                <Autocomplete.Group
                  key={group.value}
                  items={group.items}
                  className="palette-group"
                >
                  <Autocomplete.GroupLabel className="palette-group-label">
                    {group.value}
                  </Autocomplete.GroupLabel>
                  <Autocomplete.Collection>
                    {(item: Item) => (
                      <Autocomplete.Item
                        key={`${item.kind}:${item.id}`}
                        value={item}
                        className="palette-item"
                        onClick={(e) => activate(item, e)}
                      >
                        {item.kind === "concept" ? (
                          <ConceptRow item={item} />
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
                  </Autocomplete.Collection>
                </Autocomplete.Group>
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

/** A concept result row: title + type/id meta, with an optional text snippet. */
function ConceptRow({ item }: { item: ConceptItem }) {
  return (
    <span className="palette-row">
      <span className="palette-row-main">
        <span className="palette-label">{item.concept.title}</span>
        <span className="palette-meta">
          <span className="palette-type">{item.concept.type}</span>
          <span className="palette-id">{item.concept.id}</span>
        </span>
      </span>
      {item.snippet && (
        <span className="palette-snippet">
          {item.snippet.map((part, i) =>
            part.match ? (
              <mark key={i} className="palette-mark">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
      )}
    </span>
  );
}
