// GPU graph renderer (cosmos.gl / @cosmos.gl/graph) — an alternative to the
// canvas Graph View, selectable in Controls → Renderer. It runs the force
// simulation on the GPU (scales to very large graphs), colors nodes by Louvain
// community, and keeps the essentials: click-to-open, hover highlight (cosmos's
// native greyout), focus mode, and an HTML label overlay for the selected and
// hovered concepts (cosmos draws no text itself). See docs/features/graph-view.md.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Graph } from "@cosmos.gl/graph";
import { useApp } from "@/shared/store.tsx";
import type { Actions } from "@/shared/store.tsx";
import { buildEdges, conceptById, egoIds, isVisible } from "@/shared/selectors.ts";
import { louvain } from "@/features/viz/graph/community.ts";
import { graphBackbone, maxPerNodeFor } from "@/features/viz/graph/backbone.ts";
import { buildTypePalette, resolveDark } from "@/shared/theme.ts";
import { VIZ_FALLBACK } from "@/features/viz/nivoTheme.ts";
import "./CosmosGraph.css";

/** Read a CSS custom property off the document root. */
function cssVar(name: string): string {
  if (typeof getComputedStyle === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Resolve any CSS color (hsl/hex/named) to normalized [r,g,b] 0-1 via a 1×1
// canvas — cosmos.gl reads color arrays as 0-1 channels.
const colorCache = new Map<string, [number, number, number]>();
let colorCtx: CanvasRenderingContext2D | null = null;
function rgb01(css: string): [number, number, number] {
  const hit = colorCache.get(css);
  if (hit) return hit;
  if (!colorCtx) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    colorCtx = c.getContext("2d");
  }
  let out: [number, number, number] = [0.53, 0.53, 0.53];
  if (colorCtx) {
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = css;
    colorCtx.fillRect(0, 0, 1, 1);
    const d = colorCtx.getImageData(0, 0, 1, 1).data;
    out = [d[0] / 255, d[1] / 255, d[2] / 255];
  }
  colorCache.set(css, out);
  return out;
}

/** How often a settling layout is refit, and how long each refit glides. */
const FOLLOW_INTERVAL_MS = 500;

interface GData {
  ids: string[];
  titles: string[];
  index: Map<string, number>;
  /** Per point: the drawn links touching it and the points at their far ends. */
  linksOf: number[][];
  neighborsOf: number[][];
}

interface Label {
  id: string;
  title: string;
  x: number;
  y: number;
}

export function CosmosGraph() {
  const { state, actions } = useApp();
  const wrapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const dataRef = useRef<GData>({
    ids: [],
    titles: [],
    index: new Map(),
    linksOf: [],
    neighborsOf: [],
  });
  const hoverRef = useRef<number | null>(null);
  const trackedRef = useRef("");
  // Auto-framing state for a settling layout: whether the user has taken the
  // view (pan, zoom, drag) and when the view last refit.
  const userViewRef = useRef(false);
  const lastFitRef = useRef(0);
  const actionsRef = useRef<Actions>(actions);
  const selectedRef = useRef<string | null>(state.activeConceptId);
  // Keep the latest actions/selection in refs for the cosmos event handlers,
  // synced in an effect (not during render) — handlers fire after commit.
  useEffect(() => {
    actionsRef.current = actions;
    selectedRef.current = state.activeConceptId;
  });
  const [labels, setLabels] = useState<Label[]>([]);
  // cosmos.gl creates its WebGL device asynchronously, so a missing WebGL
  // rejects `graph.ready` instead of throwing from the effect. Rethrowing it
  // during render hands it to the ErrorBoundary around this renderer.
  const [initError, setInitError] = useState<Error | null>(null);
  if (initError) throw initError;

  // Reposition the active label set (selected + hovered + hovered's neighbors)
  // from current world positions. Cheap: only a handful of points are tracked,
  // so the GPU read-back stays small however large the graph is.
  function positionLabels() {
    const g = graphRef.current;
    const data = dataRef.current;
    if (!g?.isReady) return;
    const ids = new Set<string>();
    if (selectedRef.current) ids.add(selectedRef.current);
    if (hoverRef.current != null) {
      const hid = data.ids[hoverRef.current];
      if (hid) ids.add(hid);
      for (const a of data.neighborsOf[hoverRef.current] ?? []) {
        const id = data.ids[a];
        if (id) ids.add(id);
      }
    }
    const tracked: number[] = [];
    for (const id of ids) {
      const i = data.index.get(id);
      if (i != null) tracked.push(i);
    }
    const key = tracked.join(",");
    if (key !== trackedRef.current) {
      g.trackPointPositionsByIndices(tracked);
      trackedRef.current = key;
    }
    if (tracked.length === 0) {
      setLabels([]);
      return;
    }
    const pos = g.getTrackedPointPositionsMap();
    const next: Label[] = [];
    for (const i of tracked) {
      const p = pos.get(i);
      if (!p || !Number.isFinite(p[0])) continue;
      const [sx, sy] = g.spaceToScreenPosition(p);
      next.push({ id: data.ids[i], title: data.titles[i], x: sx, y: sy });
    }
    setLabels(next);
  }

  // Keep a settling layout framed: the seed ring is far wider than the settled
  // graph, so a single fit at the start leaves it a speck. Refit a few times a
  // second while the simulation runs and once when it ends, until the user
  // pans, zooms, or drags. Each fit reads every position back from the GPU, so
  // it is throttled rather than run per tick.
  function followLayout(final: boolean) {
    const g = graphRef.current;
    if (!g || userViewRef.current) return;
    const now = performance.now();
    if (!final && now - lastFitRef.current < FOLLOW_INTERVAL_MS) return;
    lastFitRef.current = now;
    g.fitView(final ? 400 : FOLLOW_INTERVAL_MS);
  }

  // Create the cosmos graph once; handlers read refs to stay current.
  useEffect(() => {
    const div = wrapRef.current;
    if (!div) return;
    const graph = new Graph(div, {
      backgroundColor: "rgba(0,0,0,0)",
      spaceSize: 4096,
      renderLinks: true,
      // Points keep their screen size: the view zooms in to frame a settled
      // layout, and points that grew with it would swallow their neighbors.
      scalePointsOnZoom: false,
      enableDrag: true,
      fitViewOnInit: false,
      // Data changes (focus, filters, density) swap in a different point set,
      // so tweening index i from its old position would be meaningless. Snap,
      // and let the simulation lay out the new set.
      transitionDuration: 0,
      simulationGravity: 0.25,
      simulationCenter: 0,
      simulationRepulsion: 1.0,
      simulationRepulsionTheta: 1.15,
      simulationLinkSpring: 1.2,
      simulationLinkDistance: 10,
      simulationFriction: 0.85,
      simulationDecay: 1000,
      onClick: (index, _pos, event) => {
        const id = index != null ? (dataRef.current.ids[index] ?? null) : null;
        // Ctrl/Cmd+click opens the node in a background reader tab (Shift to
        // also switch); plain click keeps the shared-selection behavior.
        if (id && (event.ctrlKey || event.metaKey)) {
          actionsRef.current.openInNewTab(id, { background: !event.shiftKey });
        } else {
          actionsRef.current.selectConcept(id);
        }
      },
      onPointMouseOver: (index) => {
        hoverRef.current = index;
        const data = dataRef.current;
        // Highlight the node, its neighbors, and its own links; cosmos greys
        // out the rest.
        graphRef.current?.setConfigPartial({
          highlightedPointIndices: [index, ...(data.neighborsOf[index] ?? [])],
          highlightedLinkIndices: data.linksOf[index] ?? [],
        });
        positionLabels();
      },
      onPointMouseOut: () => {
        hoverRef.current = null;
        graphRef.current?.setConfigPartial({
          highlightedPointIndices: undefined,
          highlightedLinkIndices: undefined,
        });
        positionLabels();
      },
      onZoomStart: (_event, userDriven) => {
        if (userDriven) userViewRef.current = true;
      },
      onDragStart: () => {
        userViewRef.current = true;
      },
      onZoom: () => positionLabels(),
      onSimulationTick: () => {
        positionLabels();
        followLayout(false);
      },
      onSimulationEnd: () => followLayout(true),
    });
    graphRef.current = graph;
    graph.ready.then(
      () => positionLabels(),
      (err: unknown) => {
        if (graphRef.current !== graph) return;
        setInitError(err instanceof Error ? err : new Error(String(err)));
      },
    );
    // Keep the HTML label overlay aligned with the canvas when the window (and
    // so the graph container) resizes — otherwise, once the simulation settles,
    // labels drift from their points until the next hover/zoom re-runs layout.
    const ro = new ResizeObserver(() => positionLabels());
    ro.observe(div);
    return () => {
      ro.disconnect();
      graph.destroy();
      graphRef.current = null;
      trackedRef.current = "";
    };

  }, []);

  // Rebuild graph data when the bundle, filters, focus, or theme change.
  useEffect(() => {
    const graph = graphRef.current;
    const bundle = state.bundle;
    if (!graph || !bundle) return;

    // Focus needs a concept to center on. A folder home (index) or no selection
    // falls back to the whole graph, as in the canvas renderer.
    const focusId = conceptById(bundle, state.activeConceptId)?.id ?? null;
    const restrict =
      state.graphMode === "focus" && focusId
        ? egoIds(bundle, focusId, state.focusDepth)
        : null;
    const filter = { query: "", hiddenTypes: state.hiddenTypes, activeTag: state.activeTag };
    const visible = bundle.concepts.filter(
      (c) => isVisible(c, filter) && (restrict === null || restrict.has(c.id)),
    );

    const ids = visible.map((c) => c.id);
    const titles = visible.map((c) => c.title);
    const index = new Map(ids.map((id, i) => [id, i] as const));

    // Cross-links among visible nodes, as directed index pairs.
    const directed: { a: number; b: number }[] = [];
    for (const e of buildEdges(bundle.concepts)) {
      const a = index.get(e.source);
      const b = index.get(e.target);
      if (a === undefined || b === undefined || a === b) continue;
      directed.push({ a, b });
    }

    // Colors by Louvain community (over the full link graph, so cluster colors
    // stay stable across density settings); sizes by degree.
    const dark = resolveDark(state.settings.theme);
    const comm = louvain(ids.length, directed);

    // Draw a readable backbone rather than every edge — a dense cross-link graph
    // is otherwise an unreadable hairball (see graph/backbone.ts).
    const linkPairs: number[] = [];
    const linksOf: number[][] = ids.map(() => []);
    const neighborsOf: number[][] = ids.map(() => []);
    for (const e of graphBackbone({
      n: ids.length,
      directed,
      tags: visible.map((c) => c.tags),
      maxPerNode: maxPerNodeFor(state.linkDensity),
    })) {
      const link = linkPairs.length / 2;
      linkPairs.push(e.a, e.b);
      linksOf[e.a].push(link);
      linksOf[e.b].push(link);
      neighborsOf[e.a].push(e.b);
      neighborsOf[e.b].push(e.a);
    }
    dataRef.current = { ids, titles, index, linksOf, neighborsOf };
    const palette = buildTypePalette([...new Set(comm.map(String))], dark);
    const maxDeg = visible.reduce((m, c) => Math.max(m, c.degree), 0) || 1;

    const positions = new Float32Array(ids.length * 2);
    const colors = new Float32Array(ids.length * 4);
    const sizes = new Float32Array(ids.length);
    const cx = 2048;
    const cy = 2048;
    visible.forEach((c, i) => {
      const angle = (i / Math.max(1, ids.length)) * Math.PI * 2;
      const radius = 300 + (i % 7) * 40; // deterministic spread seed
      positions[i * 2] = cx + Math.cos(angle) * radius;
      positions[i * 2 + 1] = cy + Math.sin(angle) * radius;
      const [r, g, b] = rgb01(palette.color(String(comm[i] ?? 0)));
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = 1;
      sizes[i] = 5 + Math.sqrt(c.degree / maxDeg) * 13;
    });

    const links = new Float32Array(linkPairs);
    const [lr, lg, lb] = rgb01(cssVar("--text-dim") || VIZ_FALLBACK.textDim);
    const linkColors = new Float32Array((linkPairs.length / 2) * 4);
    for (let i = 0; i < linkColors.length; i += 4) {
      linkColors[i] = lr;
      linkColors[i + 1] = lg;
      linkColors[i + 2] = lb;
      linkColors[i + 3] = 0.35;
    }

    // The hovered index may not survive the new point set.
    hoverRef.current = null;
    graph.setConfigPartial({
      highlightedPointIndices: undefined,
      highlightedLinkIndices: undefined,
    });
    graph.setPointPositions(positions);
    graph.setPointColors(colors);
    graph.setPointSizes(sizes);
    graph.setLinks(links);
    graph.setLinkColors(linkColors);
    graph.render();
    // render() only uploads and draws; start() reheats the layout, including
    // after an earlier simulation has already settled.
    graph.start(1);
    // A fresh layout is framed again until the user takes the view.
    userViewRef.current = false;
    lastFitRef.current = 0;
    positionLabels();
  }, [
    // Depend on the bundle object, not activeRoot: a same-root live-reload/re-scan
    // swaps in a new bundle while activeRoot is unchanged, and keying on the root
    // would leave the GPU graph rendering the stale concept/link set.
    state.bundle,
    state.hiddenTypes,
    state.activeTag,
    state.graphMode,
    state.focusDepth,
    state.activeConceptId,
    state.linkDensity,
    state.settings.theme,
  ]);

  // Reposition labels when the selection changes (node set is unchanged).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    positionLabels();
  }, [state.activeConceptId]);

  return (
    <div className="cosmos-wrap">
      <div ref={wrapRef} className="cosmos-canvas" />
      <div className="cosmos-labels" aria-hidden="true">
        {labels.map((l) => (
          <span
            key={l.id}
            className="cosmos-label"
            style={{ "--x": `${l.x}px`, "--y": `${l.y}px` } as CSSProperties}
          >
            {l.title}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="cosmos-fit"
        aria-label="Fit graph to view"
        onClick={() => graphRef.current?.fitView(300)}
      >
        Fit
      </button>
    </div>
  );
}
