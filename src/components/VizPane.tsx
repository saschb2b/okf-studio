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

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useApp, type VizView } from "../store.tsx";
import { isVisible, matchesQuery } from "../selectors.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import { buildVizTreeAuto, vizPath, type VizNode } from "../viz/hierarchy.ts";
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
    const selPath = vizPath(tree, selected);
    if (!selPath) return; // filtered away, or a group id — nothing to reveal
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reactive drill on external selection, mirroring the graph's focus re-root
    setRootId(selPath.length >= 2 ? selPath[selPath.length - 2].id : "");
  }, [selected, tree]);

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
          <div className="graph-toolbar-left">
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
        <div className="graph-toolbar-left">
          <VizSwitcher />
        </div>
        <VizBreadcrumb path={path} onDrill={setRootId} />
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
 * The drill trail (toolbar center cell): `Bundle › design › tokens ×`. Each
 * segment re-roots to that ancestor; × returns to the top. Hidden at the root,
 * like the graph's depth stepper outside focus mode.
 */
function VizBreadcrumb({
  path,
  onDrill,
}: {
  path: VizNode[];
  onDrill: (id: string) => void;
}) {
  if (path.length < 2) return null;
  return (
    <nav className="graph-seg viz-crumbs" aria-label="Drill-down path">
      {path.map((n, i) =>
        i === path.length - 1 ? (
          <span key={n.id} className="viz-crumb-current" aria-current="location">
            {n.name}
          </span>
        ) : (
          <button
            key={n.id}
            type="button"
            className="graph-seg-btn"
            aria-label={`Back to ${n.name}`}
            onClick={() => onDrill(n.id)}
          >
            {n.name}
          </button>
        ),
      )}
      <button
        type="button"
        className="graph-seg-btn viz-crumb-close"
        aria-label="Back to the whole bundle"
        onClick={() => onDrill("")}
      >
        &times;
      </button>
    </nav>
  );
}
