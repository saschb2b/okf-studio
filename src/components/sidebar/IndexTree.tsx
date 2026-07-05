// Index tree — progressive disclosure over the bundle's index.md hierarchy.
//
// Renders the root IndexNode's sections. Entries of kind "concept" are clickable
// and select the concept; entries of kind "directory" expand/collapse to reveal
// the IndexNode whose `dir` matches the entry's `target`. Synthesized indexes are
// marked subtly. The entry for state.activeConceptId is highlighted. When a query
// or filter is active, entries whose target is not in filteredConceptIds are
// dimmed (directories are kept so their matching descendants stay reachable).
//
// Keyboard: the tree is a single roving-tabindex widget (role="tree"). Arrow keys
// move between visible rows, Left/Right collapse/expand directories, Enter opens.
// See docs/features/navigation.md.

import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  KeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";
import { useApp } from "../../store.tsx";
import { filteredConceptIds } from "../../selectors.ts";
import type { Bundle, IndexEntry, IndexNode } from "../../types.ts";

/** Pick the root index: prefer the empty / "." dir, else the first node. */
function rootNode(indexes: IndexNode[]): IndexNode | null {
  return (
    indexes.find((n) => n.dir === "" || n.dir === ".") ?? indexes.at(0) ?? null
  );
}

/**
 * Find the IndexNode a directory entry points at (match by dir == target).
 * Never resolves to the entry's own node (selfDir), which would cycle.
 */
function nodeFor(
  indexes: IndexNode[],
  target: string,
  selfDir: string,
): IndexNode | undefined {
  if (target === selfDir) return undefined;
  return indexes.find((n) => n.dir === target);
}

/** Concepts under each directory (every ancestor gets credit), so directory
 *  rows can say how much bundle lives behind them. */
function dirConceptCounts(bundle: Bundle): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of bundle.concepts) {
    let slash = c.id.lastIndexOf("/");
    while (slash > 0) {
      const dir = c.id.slice(0, slash);
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
      slash = dir.lastIndexOf("/");
    }
  }
  return counts;
}

// The row/expand key formulas live here so flatten(), the render (TreeNode), and
// expandPathTo() all derive keys identically — drift between them would silently
// break keyboard nav and reveal-scroll, with no type error to catch it.
/** The stable DOM/nav key for an entry row. */
function rowKeyOf(pathKey: string, si: number, ei: number, target: string): string {
  return `${pathKey}/${si}.${ei}:${target}`;
}
/** The expand-set key for a directory entry's child node. */
function expandKeyOf(pathKey: string, target: string): string {
  return `node:${pathKey}/${target}`;
}

/**
 * The chain of expand keys leading to `conceptId` in the index tree, using the
 * shared key scheme — so a selection made anywhere (graph, launcher, reader
 * links) can reveal itself in the tree. Null when the index never lists the
 * concept.
 */
function expandPathTo(
  indexes: IndexNode[],
  node: IndexNode,
  conceptId: string,
  pathKey: string,
): string[] | null {
  for (const sec of node.sections) {
    for (const entry of sec.entries) {
      if (entry.kind === "concept" && entry.target === conceptId) return [];
      if (entry.kind === "directory") {
        const child = nodeFor(indexes, entry.target, node.dir);
        if (!child) continue;
        const key = expandKeyOf(pathKey, entry.target);
        const sub = expandPathTo(indexes, child, conceptId, key);
        if (sub) return [key, ...sub];
      }
    }
  }
  return null;
}

/** A single flattened, currently-visible row used for keyboard navigation. */
interface Row {
  key: string;
  entry: IndexEntry;
  depth: number;
  /** For directory rows that resolve to a node, the node's expand key. */
  expandKey?: string;
  hasChildren: boolean;
  expanded: boolean;
}

/** Walk the (lazily expanded) tree to produce the visible rows, in order. */
function flatten(
  indexes: IndexNode[],
  node: IndexNode,
  expanded: Set<string>,
  depth: number,
  pathKey: string,
  out: Row[],
): void {
  for (let si = 0; si < node.sections.length; si++) {
    const sec = node.sections[si];
    for (let ei = 0; ei < sec.entries.length; ei++) {
      const entry = sec.entries[ei];
      const key = rowKeyOf(pathKey, si, ei, entry.target);
      if (entry.kind === "directory") {
        const child = nodeFor(indexes, entry.target, node.dir);
        const expandKey = child ? expandKeyOf(pathKey, entry.target) : undefined;
        const isOpen = !!expandKey && expanded.has(expandKey);
        out.push({
          key,
          entry,
          depth,
          expandKey,
          hasChildren: !!child,
          expanded: isOpen,
        });
        if (child && isOpen) {
          flatten(indexes, child, expanded, depth + 1, expandKey, out);
        }
      } else {
        out.push({ key, entry, depth, hasChildren: false, expanded: false });
      }
    }
  }
}

/**
 * Reveal the active concept in the tree: expand the directory chain leading to a
 * selection made anywhere (graph node, launcher, reader link), then scroll its
 * row into view once it renders. Only ever expands — never fights a fold the
 * user just made — and scrolls once per selection, so it doesn't fight the
 * user's own scrolling afterwards.
 */
function useRevealActiveRow(
  bundle: Bundle | null,
  activeId: string | null,
  listRef: RefObject<HTMLDivElement | null>,
  setExpanded: Dispatch<SetStateAction<Set<string>>>,
): void {
  const scrolledToRef = useRef<string | null>(null);

  useEffect(() => {
    scrolledToRef.current = null; // new selection → the scroll effect may fire
    if (!activeId || !bundle) return;
    const root = rootNode(bundle.indexes);
    if (!root) return;
    const path = expandPathTo(bundle.indexes, root, activeId, "root");
    if (path === null || path.length === 0) return;
    // Reacting to an external selection is the point of this effect; the
    // updater bails (returns prev) when the chain is already expanded.
    setExpanded((prev) => {
      if (path.every((k) => prev.has(k))) return prev;
      return new Set([...prev, ...path]);
    });
  }, [activeId, bundle, setExpanded]);

  // Scroll the active row into view once it exists. Runs after every commit
  // (dep-less) because the row may only appear on the re-render *after* the
  // expansion above — a one-shot rAF raced that commit and often missed it.
  // An offscreen row centers (context above and below, VS Code's reveal); an
  // already-visible row is left alone.
  useEffect(() => {
    if (!activeId || scrolledToRef.current === activeId) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-row-key]");
    for (const row of rows ?? []) {
      if (!row.dataset.rowKey?.endsWith(`:${activeId}`)) continue;
      scrolledToRef.current = activeId;
      const vp = row.closest(".ui-scrollarea-viewport");
      const vr = vp?.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      // Zero-height rects mean the environment can't measure (jsdom) — fall
      // back to a minimal scroll rather than skipping.
      const measurable = !!vr && vr.height > 0;
      const visible = measurable && rr.top >= vr.top && rr.bottom <= vr.bottom;
      if (!visible) {
        row.scrollIntoView({ block: measurable ? "center" : "nearest" });
      }
      break;
    }
  });
}

export function IndexTree() {
  const { state, actions } = useApp();
  const bundle = state.bundle;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useRevealActiveRow(bundle, state.activeConceptId, listRef, setExpanded);

  if (!bundle) return null;
  const root = rootNode(bundle.indexes);
  if (!root) return null;
  const dirCounts = dirConceptCounts(bundle);

  const visibleIds = filteredConceptIds(bundle, {
    query: state.query,
    hiddenTypes: state.hiddenTypes,
    activeTag: state.activeTag,
  });
  const filtering =
    !!state.query || state.hiddenTypes.length > 0 || !!state.activeTag;

  // Does anything listed in the index (expanded or not) survive the filter?
  // When it doesn't, every row is dimmed and the tree reads as a dead end, so
  // a notice explains it and routes to the launcher (the full-text search).
  const indexHasMatch =
    !filtering ||
    bundle.indexes.some((n) =>
      n.sections.some((s) =>
        s.entries.some((e) => e.kind === "concept" && visibleIds.has(e.target)),
      ),
    );

  const rows: Row[] = [];
  flatten(bundle.indexes, root, expanded, 0, "root", rows);

  // The roving tabindex target: the focused row if still visible, else the
  // active concept's row, else the first row.
  const focusIdx = (() => {
    if (focusKey) {
      const i = rows.findIndex((r) => r.key === focusKey);
      if (i >= 0) return i;
    }
    const a = rows.findIndex(
      (r) => r.entry.kind === "concept" && r.entry.target === state.activeConceptId,
    );
    return a >= 0 ? a : 0;
  })();

  function toggle(expandKey: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(expandKey)) next.delete(expandKey);
      else next.add(expandKey);
      return next;
    });
  }

  function openRow(row: Row) {
    if (row.entry.kind === "concept") {
      actions.selectConcept(row.entry.target);
    } else if (row.expandKey) {
      toggle(row.expandKey);
    }
  }

  function moveFocus(i: number) {
    const clamped = Math.max(0, Math.min(rows.length - 1, i));
    const row = rows.at(clamped);
    if (!row) return;
    setFocusKey(row.key);
    // Move DOM focus to the corresponding row button.
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row-key="${cssEscape(row.key)}"]`)
        ?.focus();
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    const row = rows.at(focusIdx);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(focusIdx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(focusIdx - 1);
        break;
      case "Home":
        e.preventDefault();
        moveFocus(0);
        break;
      case "End":
        e.preventDefault();
        moveFocus(rows.length - 1);
        break;
      case "ArrowRight":
        if (row?.hasChildren && row.expandKey) {
          e.preventDefault();
          if (!row.expanded) toggle(row.expandKey);
          else moveFocus(focusIdx + 1);
        }
        break;
      case "ArrowLeft":
        if (row?.hasChildren && row.expandKey && row.expanded) {
          e.preventDefault();
          toggle(row.expandKey);
        } else if (row && row.depth > 0) {
          // Jump to the nearest shallower (parent) row.
          e.preventDefault();
          for (let i = focusIdx - 1; i >= 0; i--) {
            if (rows[i].depth < row.depth) {
              moveFocus(i);
              break;
            }
          }
        }
        break;
      case "Enter":
      case " ":
        if (row) {
          e.preventDefault();
          openRow(row);
        }
        break;
    }
  }

  return (
    <section className="sb-section sb-tree-section" aria-label="Index">
      <h2 className="sb-section-title">Index</h2>
      {!indexHasMatch && (
        <div className="sb-tree-empty" role="status">
          <p className="sb-tree-empty-line">
            {visibleIds.size === 0
              ? "No concepts match the current search and filters."
              : `${visibleIds.size} concept${visibleIds.size === 1 ? "" : "s"} match, but none are listed in this index.`}
          </p>
          {visibleIds.size > 0 && (
            <button
              type="button"
              className="sb-tree-empty-cta"
              onClick={() => actions.setPalette(true, state.query)}
            >
              Open full search
            </button>
          )}
        </div>
      )}
      <div
        ref={listRef}
        className="sb-tree"
        role="tree"
        aria-label={`${bundle.name} index`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <TreeNode
          indexes={bundle.indexes}
          node={root}
          depth={0}
          pathKey="root"
          expanded={expanded}
          toggle={toggle}
          rows={rows}
          focusIdx={focusIdx}
          activeId={state.activeConceptId}
          visibleIds={visibleIds}
          filtering={filtering}
          dirCounts={dirCounts}
          onOpenConcept={(id) => actions.selectConcept(id)}
        />
      </div>
    </section>
  );
}

/** A quiet, right-aligned "how many concepts live in here" for directory rows. */
function DirCount({ count }: { count: number | undefined }) {
  if (!count) return null;
  return <span className="sb-tree-count">{count}</span>;
}

function TreeNode({
  indexes,
  node,
  depth,
  pathKey,
  expanded,
  toggle,
  rows,
  focusIdx,
  activeId,
  visibleIds,
  filtering,
  dirCounts,
  onOpenConcept,
}: {
  indexes: IndexNode[];
  node: IndexNode;
  depth: number;
  pathKey: string;
  expanded: Set<string>;
  toggle: (key: string) => void;
  rows: Row[];
  focusIdx: number;
  activeId: string | null;
  visibleIds: Set<string>;
  filtering: boolean;
  dirCounts: Map<string, number>;
  onOpenConcept: (id: string) => void;
}) {
  const focusedKey = rows[focusIdx]?.key;

  return (
    <ul className="sb-tree-group" role="group">
      {node.sections.map((sec, si) => (
        <li key={`sec:${si}`} className="sb-tree-sec" role="none">
          {sec.heading && (
            <div className="sb-tree-heading" role="none" style={indent(depth)}>
              {sec.heading}
            </div>
          )}
          <ul className="sb-tree-entries" role="group">
            {sec.entries.map((entry, ei) => {
              const key = rowKeyOf(pathKey, si, ei, entry.target);
              if (entry.kind === "directory") {
                const child = nodeFor(indexes, entry.target, node.dir);
                const expandKey = child
                  ? expandKeyOf(pathKey, entry.target)
                  : undefined;
                const isOpen = !!expandKey && expanded.has(expandKey);
                return (
                  <li key={key} role="none" className="sb-tree-li">
                    <button
                      type="button"
                      role="treeitem"
                      aria-selected={false}
                      aria-expanded={child ? isOpen : undefined}
                      aria-level={depth + 1}
                      data-row-key={key}
                      tabIndex={key === focusedKey ? 0 : -1}
                      className={`sb-tree-item sb-tree-dir${
                        child ? "" : " is-missing"
                      }`}
                      style={indent(depth)}
                      title={entry.description || entry.title}
                      onClick={() => {
                        if (expandKey) toggle(expandKey);
                      }}
                    >
                      <span className="sb-twisty" aria-hidden="true">
                        {child ? (isOpen ? "▾" : "▸") : "·"}
                      </span>
                      <span className="sb-tree-label">{entry.title}</span>
                      {child?.synthesized && (
                        <span
                          className="sb-synth"
                          title="Synthesized index (no index.md in this directory)"
                        >
                          auto
                        </span>
                      )}
                      <DirCount count={dirCounts.get(entry.target)} />
                    </button>
                    {child &&
                      isOpen &&
                      (child.sections.some((s) => s.entries.length > 0) ? (
                        <TreeNode
                          indexes={indexes}
                          node={child}
                          depth={depth + 1}
                          pathKey={expandKey}
                          expanded={expanded}
                          toggle={toggle}
                          rows={rows}
                          focusIdx={focusIdx}
                          activeId={activeId}
                          visibleIds={visibleIds}
                          filtering={filtering}
                          dirCounts={dirCounts}
                          onOpenConcept={onOpenConcept}
                        />
                      ) : (
                        // A directory with no concepts (assets only, or empty):
                        // expanding must say so, not silently add zero rows.
                        <div
                          className="sb-tree-empty-dir"
                          role="none"
                          style={indent(depth + 1)}
                        >
                          No concepts in this folder
                        </div>
                      ))}
                  </li>
                );
              }

              // concept entry
              const active = entry.target === activeId;
              const dimmed = filtering && !visibleIds.has(entry.target);
              return (
                <li key={key} role="none" className="sb-tree-li">
                  <button
                    type="button"
                    role="treeitem"
                    aria-selected={active}
                    aria-level={depth + 1}
                    aria-current={active ? "true" : undefined}
                    data-row-key={key}
                    tabIndex={key === focusedKey ? 0 : -1}
                    className={`sb-tree-item sb-tree-concept${
                      active ? " is-active" : ""
                    }${dimmed ? " is-dimmed" : ""}`}
                    style={indent(depth)}
                    title={entry.description || entry.title}
                    onClick={() => onOpenConcept(entry.target)}
                  >
                    <span className="sb-twisty sb-leaf" aria-hidden="true" />
                    <span className="sb-tree-label">{entry.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function indent(depth: number): CSSProperties {
  return { paddingLeft: `${8 + depth * 14}px` };
}

/** Minimal CSS.escape fallback for attribute selectors built from row keys. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\\]]/g, "\\$&");
}
