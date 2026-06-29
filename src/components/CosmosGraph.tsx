// GPU graph renderer (cosmos.gl / @cosmograph/cosmos) — an alternative to the
// canvas Graph View, selectable in Controls → Renderer. It runs the force
// simulation on the GPU (scales to very large graphs), colors nodes by Louvain
// community, and keeps the essentials: click-to-open, hover highlight (cosmos's
// native greyout), focus mode, and an HTML label overlay for the selected and
// hovered concepts (cosmos draws no text itself). See docs/features/graph-view.md.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Graph } from "@cosmograph/cosmos";
import { useApp } from "../store.tsx";
import type { Actions } from "../store.tsx";
import { buildEdges, egoIds, isVisible } from "../selectors.ts";
import { louvain } from "../graph/community.ts";
import { graphBackbone, maxPerNodeFor } from "../graph/backbone.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import "./CosmosGraph.css";

/** Read a CSS custom property off the document root. */
function cssVar(name: string): string {
  if (typeof getComputedStyle === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Resolve any CSS color (hsl/hex/named) to [r,g,b] 0-255 via a 1×1 canvas.
const colorCache = new Map<string, [number, number, number]>();
let colorCtx: CanvasRenderingContext2D | null = null;
function rgb255(css: string): [number, number, number] {
  const hit = colorCache.get(css);
  if (hit) return hit;
  if (!colorCtx) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    colorCtx = c.getContext("2d");
  }
  let out: [number, number, number] = [136, 136, 136];
  if (colorCtx) {
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = css;
    colorCtx.fillRect(0, 0, 1, 1);
    const d = colorCtx.getImageData(0, 0, 1, 1).data;
    out = [d[0], d[1], d[2]];
  }
  colorCache.set(css, out);
  return out;
}

interface GData {
  ids: string[];
  titles: string[];
  index: Map<string, number>;
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
  const dataRef = useRef<GData>({ ids: [], titles: [], index: new Map() });
  const hoverRef = useRef<number | null>(null);
  const actionsRef = useRef<Actions>(actions);
  const selectedRef = useRef<string | null>(state.activeConceptId);
  // Keep the latest actions/selection in refs for the cosmos event handlers,
  // synced in an effect (not during render) — handlers fire after commit.
  useEffect(() => {
    actionsRef.current = actions;
    selectedRef.current = state.activeConceptId;
  });
  const [labels, setLabels] = useState<Label[]>([]);

  // Reposition the active label set (selected + hovered + hovered's neighbors)
  // from current world positions. Cheap: only a handful of labels are shown.
  function positionLabels() {
    const g = graphRef.current;
    const data = dataRef.current;
    if (!g) return;
    const ids = new Set<string>();
    if (selectedRef.current) ids.add(selectedRef.current);
    if (hoverRef.current != null) {
      const hid = data.ids[hoverRef.current];
      if (hid) ids.add(hid);
      for (const a of g.getAdjacentIndices(hoverRef.current) ?? []) {
        const id = data.ids[a];
        if (id) ids.add(id);
      }
    }
    if (ids.size === 0) {
      setLabels([]);
      return;
    }
    const pos = g.getPointPositions();
    const next: Label[] = [];
    for (const id of ids) {
      const i = data.index.get(id);
      if (i == null) continue;
      const wx = pos[i * 2];
      const wy = pos[i * 2 + 1];
      if (!Number.isFinite(wx)) continue;
      const [sx, sy] = g.spaceToScreenPosition([wx, wy]);
      next.push({ id, title: data.titles[i], x: sx, y: sy });
    }
    setLabels(next);
  }

  // Create the cosmos graph once; handlers read refs to stay current.
  useEffect(() => {
    const div = wrapRef.current;
    if (!div) return;
    const graph = new Graph(div, {
      backgroundColor: "rgba(0,0,0,0)",
      spaceSize: 4096,
      renderLinks: true,
      scalePointsOnZoom: true,
      enableDrag: true,
      fitViewOnInit: true,
      simulationGravity: 0.25,
      simulationCenter: 0,
      simulationRepulsion: 1.0,
      simulationRepulsionTheta: 1.15,
      simulationLinkSpring: 1.2,
      simulationLinkDistance: 10,
      simulationFriction: 0.85,
      simulationDecay: 1000,
      onClick: (index: number | undefined) => {
        actionsRef.current.selectConcept(
          index != null ? (dataRef.current.ids[index] ?? null) : null,
        );
      },
      onPointMouseOver: (index: number) => {
        hoverRef.current = index;
        graphRef.current?.selectPointByIndex(index, true); // highlight + greyout
        positionLabels();
      },
      onPointMouseOut: () => {
        hoverRef.current = null;
        graphRef.current?.unselectPoints();
        positionLabels();
      },
      onZoom: () => positionLabels(),
      onSimulationTick: () => positionLabels(),
    });
    graphRef.current = graph;
    return () => {
      graph.destroy();
      graphRef.current = null;
    };
     
  }, []);

  // Rebuild graph data when the bundle, filters, focus, or theme change.
  useEffect(() => {
    const graph = graphRef.current;
    const bundle = state.bundle;
    if (!graph || !bundle) return;

    const restrict =
      state.graphMode === "focus" && state.activeConceptId
        ? egoIds(bundle, state.activeConceptId, state.focusDepth)
        : null;
    const filter = { query: "", hiddenTypes: state.hiddenTypes, activeTag: state.activeTag };
    const visible = bundle.concepts.filter(
      (c) => isVisible(c, filter) && (restrict === null || restrict.has(c.id)),
    );

    const ids = visible.map((c) => c.id);
    const titles = visible.map((c) => c.title);
    const index = new Map(ids.map((id, i) => [id, i] as const));
    dataRef.current = { ids, titles, index };

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
    for (const e of graphBackbone({
      n: ids.length,
      directed,
      tags: visible.map((c) => c.tags),
      maxPerNode: maxPerNodeFor(state.linkDensity),
    })) {
      linkPairs.push(e.a, e.b);
    }
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
      const [r, g, b] = rgb255(palette.color(String(comm[i] ?? 0)));
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = 1;
      sizes[i] = 3 + Math.sqrt(c.degree / maxDeg) * 9;
    });

    const links = new Float32Array(linkPairs);
    const [lr, lg, lb] = rgb255(cssVar("--text-dim") || "#888");
    const linkColors = new Float32Array((linkPairs.length / 2) * 4);
    for (let i = 0; i < linkColors.length; i += 4) {
      linkColors[i] = lr;
      linkColors[i + 1] = lg;
      linkColors[i + 2] = lb;
      linkColors[i + 3] = 0.35;
    }

    graph.setPointPositions(positions);
    graph.setPointColors(colors);
    graph.setPointSizes(sizes);
    graph.setLinks(links);
    graph.setLinkColors(linkColors);
    graph.render(1);
    graph.fitView(400);
    positionLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.activeRoot,
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
