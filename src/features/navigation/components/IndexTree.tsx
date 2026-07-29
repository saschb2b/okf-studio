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
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
} from "react";
import { ChevronDown, ChevronRight, FolderOpen, House } from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import { conceptById, distinctTypes, filteredConceptIds, indexIdForDir } from "@/shared/selectors.ts";
import { buildTypePalette, resolveDark } from "@/shared/theme.ts";
import type { Bundle, IndexEntry, IndexNode, IndexSection } from "@/shared/types.ts";

/** Pick the root index: prefer the empty / "." dir, else the first node. */
function rootNode(indexes: IndexNode[]): IndexNode | null {
  return (
    indexes.find((n) => n.dir === "" || n.dir === ".") ?? indexes.at(0) ?? null
  );
}

/** Find the IndexNode a directory entry points at (match by dir == target). */
function nodeFor(indexes: IndexNode[], target: string): IndexNode | undefined {
  return indexes.find((n) => n.dir === target);
}

/**
 * The node a directory entry opens beneath itself: the node for its target,
 * unless that node is already on `path`, the chain of directories from the root
 * down to the entry's own node.
 *
 * Index files routinely link back up ("Weiter → [Alle Warengruppen](../index.md)"),
 * and the parser reads a link to a reserved index.md as a directory entry. So
 * parent and child point at each other, and walking directory entries blindly
 * recurses parent to child to parent until the stack blows, which is what took
 * the whole window down while revealing a selection. An entry like that still
 * renders and still opens its folder home; it just doesn't nest a second copy
 * of an ancestor underneath itself.
 */
function openableChild(
  indexes: IndexNode[],
  target: string,
  path: readonly string[],
): IndexNode | undefined {
  if (path.includes(target)) return undefined;
  return nodeFor(indexes, target);
}

/**
 * The subfolder a section is a door to: its concept entries all live under one
 * directory that has an index node. Null when the section mixes folders, holds
 * directory entries, or its directory has no index. This lets a section heading
 * like "Product" open the product/ folder home, not just the entries below it.
 */
function sectionFolderDir(
  indexes: IndexNode[],
  sec: IndexSection,
  selfDir: string,
): string | null {
  const dirs = new Set<string>();
  for (const e of sec.entries) {
    if (e.kind !== "concept") return null;
    const slash = e.target.lastIndexOf("/");
    dirs.add(slash > 0 ? e.target.slice(0, slash) : "");
  }
  if (dirs.size !== 1) return null;
  const dir = [...dirs][0];
  if (!dir) return null; // root-level concepts are not a subfolder
  if (dir === selfDir) return null; // an authored group inside this index
  if (selfDir && !dir.startsWith(`${selfDir}/`)) return null;
  return indexes.some((n) => n.dir === dir) ? dir : null;
}

/**
 * Resolve a folder-door section to its own index. The child index owns the
 * visible grouping; parent-only entries remain available in an unnamed tail.
 */
function sectionChildNode(
  indexes: IndexNode[],
  node: IndexNode,
  sec: IndexSection,
): IndexNode | null {
  const dir = sectionFolderDir(indexes, sec, node.dir);
  if (!dir) return null;
  // sectionFolderDir already guaranteed `dir` is a strict descendant of the
  // node's own directory, so a section door can never reach back up.
  const child = nodeFor(indexes, dir);
  if (!child || child.sections.every((section) => section.entries.length === 0)) {
    return null;
  }

  const childTargets = new Set(
    child.sections.flatMap((section) => section.entries.map((entry) => entry.target)),
  );
  const parentOnlyEntries = sec.entries.filter((entry) => !childTargets.has(entry.target));
  if (parentOnlyEntries.length === 0) return child;

  return {
    ...child,
    sections: [...child.sections, { heading: "", entries: parentOnlyEntries }],
  };
}

/** Directories already reachable as a clickable section heading in this node —
 *  so the sidebar can drop a redundant duplicate listing (e.g. a hand-written
 *  "Subdirectories" section) *in the view only*, never touching the source. */
function redundantDirTargets(indexes: IndexNode[], node: IndexNode): Set<string> {
  const dirs = new Set<string>();
  for (const sec of node.sections) {
    if (!sec.heading) continue;
    const d = sectionFolderDir(indexes, sec, node.dir);
    if (d) dirs.add(d);
  }
  return dirs;
}

/**
 * A node's sections as the sidebar renders them: a directory entry that merely
 * duplicates a folder-door heading is dropped, and a section left empty by that
 * (a pure "Subdirectories" list) is dropped whole. flatten(), expandPathTo(),
 * and TreeNode all read through this so their row keys stay in lockstep. The
 * parsed model is never mutated — this is a rendering concern.
 */
function renderableSections(indexes: IndexNode[], node: IndexNode): IndexSection[] {
  const redundant = redundantDirTargets(indexes, node);
  if (redundant.size === 0) return node.sections;
  const out: IndexSection[] = [];
  for (const sec of node.sections) {
    const entries = sec.entries.filter(
      (e) => !(e.kind === "directory" && redundant.has(e.target)),
    );
    if (entries.length === 0) continue; // fully redundant → hide the section
    out.push(entries.length === sec.entries.length ? sec : { ...sec, entries });
  }
  return out;
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
/** The nav key for a folder-door section heading (a treeitem, not an entry). */
function headingKeyOf(pathKey: string, si: number, target: string): string {
  return `${pathKey}/h${si}:${target}`;
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
  ancestors: readonly string[],
): string[] | null {
  const path = [...ancestors, node.dir];
  for (const sec of renderableSections(indexes, node)) {
    const sectionChild = sectionChildNode(indexes, node, sec);
    if (sectionChild) {
      const sub = expandPathTo(
        indexes,
        sectionChild,
        conceptId,
        `${pathKey}/section:${sectionChild.dir}`,
        path,
      );
      if (sub) return sub;
      continue;
    }
    for (const entry of sec.entries) {
      if (entry.kind === "concept" && entry.target === conceptId) return [];
      if (entry.kind === "directory") {
        const child = openableChild(indexes, entry.target, path);
        if (!child) continue;
        const key = expandKeyOf(pathKey, entry.target);
        const sub = expandPathTo(indexes, child, conceptId, key, path);
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
  ancestors: readonly string[],
): void {
  const path = [...ancestors, node.dir];
  const sections = renderableSections(indexes, node);
  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    // A folder-door heading is a treeitem in its own right — modeled as a
    // synthetic concept row targeting the folder-home id, so the existing
    // roving-tabindex / open-on-Enter machinery carries it for free.
    const folderDir = sec.heading
      ? sectionFolderDir(indexes, sec, node.dir)
      : null;
    if (folderDir) {
      const target = indexIdForDir(folderDir);
      out.push({
        key: headingKeyOf(pathKey, si, target),
        entry: { title: sec.heading, target, description: "", kind: "concept" },
        depth,
        hasChildren: false,
        expanded: false,
      });
    }
    const sectionChild = sectionChildNode(indexes, node, sec);
    if (sectionChild) {
      flatten(
        indexes,
        sectionChild,
        expanded,
        depth + 1,
        `${pathKey}/section:${sectionChild.dir}`,
        out,
        path,
      );
      continue;
    }
    for (let ei = 0; ei < sec.entries.length; ei++) {
      const entry = sec.entries[ei];
      const key = rowKeyOf(pathKey, si, ei, entry.target);
      if (entry.kind === "directory") {
        const child = openableChild(indexes, entry.target, path);
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
          flatten(indexes, child, expanded, depth + 1, expandKey, out, path);
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
    const path = expandPathTo(bundle.indexes, root, activeId, "root", []);
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
        if (measurable && vp) {
          // Center by scrolling ONLY the tree's own viewport. scrollIntoView
          // also scrolls every scrollable ancestor to satisfy the alignment —
          // including the app shell (overflow:hidden still scrolls
          // programmatically) — which shifted the whole chrome up and cut off
          // the title bar (owner-reported, on tab/selection changes).
          vp.scrollTop += rr.top - vr.top - (vr.height - rr.height) / 2;
        } else {
          // Unmeasurable (jsdom): a minimal reveal is all we can ask for.
          row.scrollIntoView({ block: "nearest" });
        }
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

  // Per-concept type color — the same encoding the graph, overview, and reader
  // use — so a leaf row carries a small dot and the tree scans by type.
  const palette = buildTypePalette(distinctTypes(bundle), resolveDark(state.settings.theme));
  const dotFor = (id: string): string | null => {
    const t = conceptById(bundle, id)?.type;
    return t ? palette.color(t) : null;
  };

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
  flatten(bundle.indexes, root, expanded, 0, "root", rows, []);

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
    } else {
      // A directory is an openable root: open its folder home and reveal its
      // contents. Left/Right still collapse/expand without navigating.
      actions.selectConcept(indexIdForDir(row.entry.target));
      if (row.expandKey && !row.expanded) toggle(row.expandKey);
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
      {/* The section is self-evident (the navigate lens is the index) and the
          folder-home row below is the visible header, so the heading is a
          screen-reader label only. */}
      <h2 className="sb-section-title sr-only">Index</h2>
      {/* The bundle root's own folder home (index.md landing) — a door back to
          the top, above the tree it structures. */}
      <button
        type="button"
        className={`sb-tree-home${
          state.activeConceptId === indexIdForDir("") ? " is-active" : ""
        }`}
        aria-current={state.activeConceptId === indexIdForDir("") ? "true" : undefined}
        title={`${bundle.name} — folder home`}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) {
            actions.openInNewTab(indexIdForDir(""), { background: !e.shiftKey });
          } else {
            actions.selectConcept(indexIdForDir(""));
          }
        }}
      >
        <House className="sb-home-glyph" size={15} aria-hidden="true" />
        <span className="sb-tree-label">{bundle.name}</span>
      </button>
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
          dotFor={dotFor}
          ancestors={[]}
          // Plain click selects; Ctrl/Cmd+click opens a background tab (Shift
          // to also switch) — the browser gesture. docs/proposals/multi-view.md
          onOpenConcept={(id, e) => {
            if (e && (e.ctrlKey || e.metaKey)) {
              actions.openInNewTab(id, { background: !e.shiftKey });
            } else {
              actions.selectConcept(id);
            }
          }}
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
  dotFor,
  ancestors,
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
  dotFor: (id: string) => string | null;
  /** Directories from the root down to this node. See openableChild(). */
  ancestors: readonly string[];
  onOpenConcept: (id: string, e?: ReactMouseEvent<HTMLElement>) => void;
}) {
  const focusedKey = rows[focusIdx]?.key;
  const path = [...ancestors, node.dir];

  return (
    <ul className="sb-tree-group" role="group">
      {renderableSections(indexes, node).map((sec, si) => {
        const sectionChild = sectionChildNode(indexes, node, sec);
        return (
          <li key={`sec:${si}`} className="sb-tree-sec" role="none">
            {sec.heading && (
              <SectionHeading
                indexes={indexes}
                nodeDir={node.dir}
                sec={sec}
                si={si}
                pathKey={pathKey}
                depth={depth}
                activeId={activeId}
                focusedKey={focusedKey}
                onOpen={onOpenConcept}
              />
            )}
            {sectionChild ? (
              <TreeNode
                indexes={indexes}
                node={sectionChild}
                depth={depth + 1}
                pathKey={`${pathKey}/section:${sectionChild.dir}`}
                expanded={expanded}
                toggle={toggle}
                rows={rows}
                focusIdx={focusIdx}
                activeId={activeId}
                visibleIds={visibleIds}
                filtering={filtering}
                dirCounts={dirCounts}
                dotFor={dotFor}
                ancestors={path}
                onOpenConcept={onOpenConcept}
              />
            ) : (
              <ul className="sb-tree-entries" role="group">
                {sec.entries.map((entry, ei) => {
                  const key = rowKeyOf(pathKey, si, ei, entry.target);
                  if (entry.kind === "directory") {
                    // `target` is whether the directory exists at all (a row
                    // for a missing one reads as dim and dead); `child` is
                    // whether it also opens beneath this row.
                    const target = nodeFor(indexes, entry.target);
                    const child = openableChild(indexes, entry.target, path);
                    const expandKey = child
                      ? expandKeyOf(pathKey, entry.target)
                      : undefined;
                    const isOpen = !!expandKey && expanded.has(expandKey);
                    const dirActive = activeId === indexIdForDir(entry.target);
                    return (
                      <li key={key} role="none" className="sb-tree-li">
                        <button
                          type="button"
                          role="treeitem"
                          aria-selected={dirActive}
                          aria-current={dirActive ? "true" : undefined}
                          aria-expanded={child ? isOpen : undefined}
                          aria-level={depth + 1}
                          data-row-key={key}
                          tabIndex={key === focusedKey ? 0 : -1}
                          className={`sb-tree-item sb-tree-dir${
                            target ? "" : " is-missing"
                          }${dirActive ? " is-active" : ""}`}
                          style={indent(depth)}
                          title={entry.description || entry.title}
                          // A directory is an openable root: open its folder home.
                          // A plain click also expands it (to reveal contents); a
                          // click that collapses does not navigate. Ctrl/Cmd+click
                          // opens the home in a background tab.
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              onOpenConcept(indexIdForDir(entry.target), e);
                              return;
                            }
                            const willExpand = !!expandKey && !isOpen;
                            if (expandKey) toggle(expandKey);
                            if (!expandKey || willExpand) {
                              onOpenConcept(indexIdForDir(entry.target), e);
                            }
                          }}
                        >
                          <span className="sb-twisty" aria-hidden="true">
                            {child ? (
                              isOpen ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )
                            ) : null}
                          </span>
                          <span className="sb-tree-label">{entry.title}</span>
                          {target?.synthesized && (
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
                              dotFor={dotFor}
                              ancestors={path}
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
                  const dot = dotFor(entry.target);
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
                        onClick={(e) => onOpenConcept(entry.target, e)}
                      >
                        <span className="sb-twisty sb-leaf" aria-hidden="true">
                          {dot && (
                            <span className="sb-tree-dot" style={{ background: dot }} />
                          )}
                        </span>
                        <span className="sb-tree-label">{entry.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A section label. Plain text, unless the section's concepts all live in one
 *  folder that has an index — then it's a treeitem door to that folder's home
 *  (like the directory rows), opening its index.md and zooming the viz to that
 *  section. As a treeitem it stays valid inside role="tree" and joins the
 *  roving-tabindex keyboard nav (its row comes from flatten()). */
function SectionHeading({
  indexes,
  nodeDir,
  sec,
  si,
  pathKey,
  depth,
  activeId,
  focusedKey,
  onOpen,
}: {
  indexes: IndexNode[];
  nodeDir: string;
  sec: IndexSection;
  si: number;
  pathKey: string;
  depth: number;
  activeId: string | null;
  focusedKey: string | undefined;
  onOpen: (id: string, e?: ReactMouseEvent<HTMLElement>) => void;
}) {
  const folderDir = sectionFolderDir(indexes, sec, nodeDir);
  if (!folderDir) {
    return (
      <div className="sb-tree-heading" role="none" style={indent(depth)}>
        {sec.heading}
      </div>
    );
  }
  const target = indexIdForDir(folderDir);
  const key = headingKeyOf(pathKey, si, target);
  const active = activeId === target;
  return (
    <button
      type="button"
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={active}
      aria-current={active ? "true" : undefined}
      data-row-key={key}
      tabIndex={key === focusedKey ? 0 : -1}
      className={`sb-tree-heading sb-tree-heading-link${active ? " is-active" : ""}`}
      style={indent(depth)}
      title={`Open the ${sec.heading} folder`}
      onClick={(e) => onOpen(target, e)}
    >
      <span className="sb-tree-label">{sec.heading}</span>
      <FolderOpen className="sb-heading-folder" size={13} aria-hidden="true" />
    </button>
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
