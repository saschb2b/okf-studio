// The graph pane's visualization host. Renders the force-directed GraphView
// (the default) or one of the space-filling hierarchy views — Treemap,
// Sunburst, Circle Packing — per the persisted store choice (vizView). Owns
// everything the three hierarchy views share: the filtered tree, the drill
// position (so switching views keeps your place), the toolbar chrome
// (VizSwitcher + breadcrumb), and selection/dim wiring. The views themselves
// are pure chart renderers over HierarchyVizProps. See
// docs/features/viz-views.md.
//
// React Compiler is enabled: no manual useMemo/useCallback/memo.

import { Fragment, lazy, Suspense, useEffect, useRef, useState } from "react";
import { useApp, type VizView } from "../store.tsx";
import { dirForIndexId, isVisible, matchesQuery } from "../selectors.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import { buildVizTreeAuto, findVizNode, vizPath, type VizNode } from "../viz/hierarchy.ts";
import { readVizColors, type VizColors } from "../viz/nivoTheme.ts";
import type { HierarchyVizProps } from "../viz/props.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { GraphView } from "./GraphView.tsx";
import { VizSwitcher } from "./VizSwitcher.tsx";
import "./VizPane.css";

// Lazy: the nivo/d3 chunk (~50-60 kB gzip, shared by all three views) loads
// only when a hierarchy view is first selected — the default graph stays lean,
// the same rationale as the on-demand CosmosGraph.
const TreemapView = lazy(() =>
  import("./TreemapView.tsx").then((m) => ({ default: m.TreemapView })),
);
const SunburstView = lazy(() =>
  import("./SunburstView.tsx").then((m) => ({ default: m.SunburstView })),
);
const PackView = lazy(() =>
  import("./PackView.tsx").then((m) => ({ default: m.PackView })),
);

export function VizPane() {
  const { state } = useApp();
  if (state.vizView === "graph") return <GraphView />;
  return <HierarchyPane view={state.vizView} />;
}

function HierarchyPane({ view }: { view: Exclude<VizView, "graph"> }) {
  const { state, actions } = useApp();

  // Resolved role colors for nivo (its theme is plain JS, not var()-aware).
  // A naive render-time read lags one theme change behind: applyTheme flips
  // the CSS variables in an AppProvider effect AFTER this component renders.
  // So watch the same signal the stylesheet keys on — data-theme on the
  // document root — and re-resolve when it actually changes (also catches an
  // OS scheme flip under the "system" setting).
  const [colors, setColors] = useState<VizColors>(readVizColors);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => setColors(readVizColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Drill position, shared across the three views. Reset on bundle switch
  // (ids belong to the old bundle); clamped below if filters remove the node.
  const [rootId, setRootId] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on bundle switch, same pattern as GraphView's isolate/explore
    setRootId("");
  }, [state.activeRoot]);

  const concepts = state.bundle?.concepts ?? [];
  const filter = {
    query: "",
    hiddenTypes: state.hiddenTypes,
    activeTag: state.activeTag,
  };
  const visible = concepts.filter((c) => isVisible(c, filter));

  const empty = !state.bundle || visible.length === 0;
  const { tree, grouping } = state.bundle
    ? buildVizTreeAuto(state.bundle, visible)
    : { tree: { id: "", name: "" } satisfies VizNode, grouping: "flat" as const };

  // Selecting a concept anywhere (sidebar, palette, a reader link) focuses
  // the view on it — the graph's recenter-on-select, translated: drill to the
  // selected leaf's parent group so the accent-ringed concept is on screen.
  // Keyed on selection *changes* only, so it never fights manual drilling.
  const selected = state.activeConceptId;
  const prevSelectedRef = useRef(selected);
  useEffect(() => {
    if (prevSelectedRef.current === selected) return;
    prevSelectedRef.current = selected;
    if (!selected) return;
    // A folder home (index.md) zooms straight into that folder's group node —
    // its group id is the directory path; root ("") returns to the whole tree.
    const homeDir = dirForIndexId(selected);
    if (homeDir !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reactive drill on external selection, mirroring the graph's folder zoom
      setRootId(homeDir && findVizNode(tree, homeDir) ? homeDir : "");
      return;
    }
    const selPath = vizPath(tree, selected);
    if (!selPath) return; // filtered away, or a group id — nothing to reveal
    // (the set-state-in-effect disable above covers this second branch too)
    setRootId(selPath.length >= 2 ? selPath[selPath.length - 2].id : "");
  }, [selected, tree]);

  // Alt+↑ drills up one level (the file-manager parent-directory gesture), a
  // fast alternative to reaching for the breadcrumb. Bound only while a
  // hierarchy view is mounted; Alt+←/→ stay history navigation, and the bare
  // graph keys don't apply here.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowUp" || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const p = vizPath(tree, rootId);
      if (!p || p.length < 2) return; // already at the whole bundle
      e.preventDefault();
      setRootId(p[p.length - 2].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tree, rootId]);

  if (empty) {
    return (
      <div className="graph-view viz-view">
        <div className="graph-empty">
          <p>No concepts to visualize</p>
          <small>
            {concepts.length > 0
              ? "Every concept is hidden by the current filters."
              : "Open a bundle to see its structure."}
          </small>
        </div>
        <div className="graph-toolbar">
          <div className="graph-toolbar-right">
            <VizSwitcher />
          </div>
        </div>
      </div>
    );
  }

  // Text query dims non-matches (the graph's convention) instead of removing
  // them, so the shape of the bundle stays stable while searching.
  const dimmedIds = new Set<string>();
  if (state.query) {
    for (const c of visible) {
      if (!matchesQuery(c, state.query)) dimmedIds.add(c.id);
    }
  }

  const dark = resolveDark(state.settings.theme);
  const palette = buildTypePalette(
    concepts.map((c) => c.type),
    dark,
  );

  // A filter change can remove the drilled-into group; fall back to the root
  // rather than rendering nothing.
  const path = vizPath(tree, rootId) ?? [tree];
  const effectiveRootId = path[path.length - 1].id;

  const vizProps: HierarchyVizProps = {
    tree,
    rootId: effectiveRootId,
    onDrill: setRootId,
    onSelect: (id) => actions.selectConcept(id),
    selectedId: state.activeConceptId,
    dimmedIds,
    colorForType: (t) => palette.color(t),
    colors,
    dark,
    reduceMotion: state.settings.reduceMotion,
  };

  const Chart =
    view === "treemap" ? TreemapView : view === "sunburst" ? SunburstView : PackView;

  return (
    <div className="graph-view viz-view">
      <ErrorBoundary
        resetKey={view}
        fallback={
          <div className="graph-empty">
            <p>Visualization unavailable</p>
            <small>This view failed to render; try another one.</small>
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="graph-empty">
              <p>Loading visualization…</p>
            </div>
          }
        >
          <Chart {...vizProps} />
        </Suspense>
      </ErrorBoundary>
      <div className="graph-toolbar">
        {/* Left cell reserved for per-view controls (parity with the graph's
            Controls popover); the hierarchy views have none yet. */}
        <VizBreadcrumb path={path} onDrill={setRootId} />
        <div className="graph-toolbar-right">
          <VizSwitcher />
        </div>
      </div>
      {grouping !== "path" && (
        <div className="graph-chips">
          <span className="graph-chip-hint muted" aria-hidden="true">
            {grouping === "type"
              ? "Flat ids — grouped by type"
              : "Flat bundle — no hierarchy in ids"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The drill trail (toolbar center region): `All › Design › Tokens`. Each
 * segment re-roots to that ancestor (the compact "All" returns to the whole
 * bundle); the current group is the bold tail. Hidden at the root, like the
 * graph's depth stepper outside focus mode. A deep trail collapses its middle
 * to a "…" that steps back into the hidden levels, so the centered breadcrumb
 * stays narrow enough to clear the Controls and switcher on either side.
 */
function VizBreadcrumb({
  path,
  onDrill,
}: {
  path: VizNode[];
  onDrill: (id: string) => void;
}) {
  if (path.length < 2) return null;

  // The root shows as a compact "All"; the rest keep their names.
  const crumbs = path.map((n, i) => ({
    id: n.id,
    label: i === 0 ? "All" : n.name,
    current: i === path.length - 1,
  }));

  // Keep at most the root + last two; a deeper trail hides its middle behind a
  // "…" that drills to the level just above the visible tail.
  const rendered: (
    | (typeof crumbs)[number]
    | { ellipsisTo: string }
  )[] =
    crumbs.length > 3
      ? [crumbs[0], { ellipsisTo: crumbs[crumbs.length - 3].id }, ...crumbs.slice(-2)]
      : crumbs;

  return (
    <nav
      className="graph-seg viz-crumbs"
      aria-label="Drill-down path"
      title="Alt+↑ to go up a level"
    >
      {rendered.map((c, i) => {
        const sep =
          i > 0 ? (
            <span className="viz-crumb-sep" aria-hidden="true">
              ›
            </span>
          ) : null;
        if ("ellipsisTo" in c) {
          return (
            <Fragment key="ellipsis">
              {sep}
              <button
                type="button"
                className="graph-seg-btn viz-crumb-ellipsis"
                aria-label="Back up one level"
                onClick={() => onDrill(c.ellipsisTo)}
              >
                …
              </button>
            </Fragment>
          );
        }
        return (
          <Fragment key={c.id}>
            {sep}
            {c.current ? (
              <span className="viz-crumb-current" aria-current="location">
                {c.label}
              </span>
            ) : (
              <button
                type="button"
                className="graph-seg-btn"
                aria-label={`Back to ${c.label}`}
                onClick={() => onDrill(c.id)}
              >
                {c.label}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
