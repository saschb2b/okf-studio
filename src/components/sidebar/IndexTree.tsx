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

import { useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useApp } from "../../store.tsx";
import { filteredConceptIds } from "../../selectors.ts";
import type { IndexEntry, IndexNode } from "../../types.ts";

/** Pick the root index: prefer the empty / "." dir, else the first node. */
function rootNode(indexes: IndexNode[]): IndexNode | null {
  return (
    indexes.find((n) => n.dir === "" || n.dir === ".") ?? indexes[0] ?? null
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
      const key = `${pathKey}/${si}.${ei}:${entry.target}`;
      if (entry.kind === "directory") {
        const child = nodeFor(indexes, entry.target, node.dir);
        const expandKey = child ? `node:${pathKey}/${entry.target}` : undefined;
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

export function IndexTree() {
  const { state, actions } = useApp();
  const bundle = state.bundle;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  if (!bundle) return null;
  const root = rootNode(bundle.indexes);
  if (!root) return null;

  const visibleIds = filteredConceptIds(bundle, {
    query: state.query,
    hiddenTypes: state.hiddenTypes,
    activeTag: state.activeTag,
  });
  const filtering =
    !!state.query || state.hiddenTypes.length > 0 || !!state.activeTag;

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
    const row = rows[clamped];
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
    const row = rows[focusIdx];
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
      <div
        ref={listRef}
        className="sb-tree"
        role="tree"
        aria-label={`${bundle.name} index`}
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
          onOpenConcept={(id) => actions.selectConcept(id)}
        />
      </div>
    </section>
  );
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
              const key = `${pathKey}/${si}.${ei}:${entry.target}`;
              if (entry.kind === "directory") {
                const child = nodeFor(indexes, entry.target, node.dir);
                const expandKey = child
                  ? `node:${pathKey}/${entry.target}`
                  : undefined;
                const isOpen = !!expandKey && expanded.has(expandKey);
                return (
                  <li key={key} role="none" className="sb-tree-li">
                    <button
                      type="button"
                      role="treeitem"
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
                          synth
                        </span>
                      )}
                    </button>
                    {child && isOpen && (
                      <TreeNode
                        indexes={indexes}
                        node={child}
                        depth={depth + 1}
                        pathKey={expandKey!}
                        expanded={expanded}
                        toggle={toggle}
                        rows={rows}
                        focusIdx={focusIdx}
                        activeId={activeId}
                        visibleIds={visibleIds}
                        filtering={filtering}
                        onOpenConcept={onOpenConcept}
                      />
                    )}
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
