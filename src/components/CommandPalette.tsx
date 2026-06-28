// Command Palette — Ctrl/Cmd+K. Jump to any concept by id, title, or type, and
// run quick actions, keyboard-only. Filters over the already-parsed bundle, so
// results are instant. See docs/features/command-palette.md.

import { useEffect, useRef, useState } from "react";
import { useApp } from "../store.tsx";
import type { Concept } from "../types.ts";
import "./chrome.css";
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

export function CommandPalette() {
  const { state, actions } = useApp();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const needle = query.trim();

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
  const conceptItems: ConceptItem[] = concepts
    .map((concept) => ({
      kind: "concept" as const,
      id: concept.id,
      concept,
      score: scoreConcept(concept, needle),
    }))
    .filter((it) => it.score >= 0)
    .sort((a, b) => b.score - a.score || a.concept.title.localeCompare(b.concept.title))
    .slice(0, 30);

  const matchedActions = needle
    ? actionItems.filter((a) => scoreMatch(a.label, needle) >= 0)
    : actionItems;

  // Concepts lead (the palette is primarily a navigator); actions follow.
  const items: Item[] = [...conceptItems, ...matchedActions];

  // Clamp / reset the highlighted row whenever the result set changes.
  useEffect(() => {
    setActive((a) => (items.length === 0 ? 0 : Math.min(a, items.length - 1)));
  }, [items.length]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    actions.setPalette(false);
  }

  function activate(item: Item | undefined) {
    if (!item) return;
    if (item.kind === "concept") {
      actions.selectConcept(item.id); // store also closes the palette
      close();
    } else {
      close();
      item.run();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(items[active]);
    } else if (e.key === "Tab") {
      // Single focusable input: trap focus inside the dialog.
      e.preventDefault();
    }
  }

  if (!state.palette) return null;

  return (
    <div
      className="chrome-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type="text"
          className="palette-input"
          placeholder="Jump to a concept, or run a command…"
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={
            items[active] ? `palette-item-${active}` : undefined
          }
          aria-autocomplete="list"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />

        <ul
          ref={listRef}
          id="palette-results"
          className="palette-list"
          role="listbox"
          aria-label="Results"
        >
          {items.length === 0 && (
            <li className="palette-empty muted" role="presentation">
              No matches
            </li>
          )}
          {items.map((item, i) => (
            <li
              key={`${item.kind}:${item.id}`}
              id={`palette-item-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={`palette-item ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                // mousedown to act before the input loses focus / backdrop fires
                e.preventDefault();
                activate(item);
              }}
            >
              {item.kind === "concept" ? (
                <>
                  <span className="palette-label">{item.concept.title}</span>
                  <span className="palette-meta">
                    <span className="palette-type">{item.concept.type}</span>
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
            </li>
          ))}
        </ul>

        <div className="palette-foot muted" aria-hidden="true">
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
