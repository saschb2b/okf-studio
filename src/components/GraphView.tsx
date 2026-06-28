// Graph View: a canvas-based force-directed graph of the active bundle.
//
// Architecture (see docs/architecture/performance.md):
//  - Node positions live in refs, never React state. A requestAnimationFrame
//    loop steps the force simulation and redraws the canvas, so layout/paint
//    stays out of React's render path. The loop stops when the layout settles.
//  - Positions are keyed by concept id and reused across re-renders, so a live
//    reload (data refresh of the same bundle) updates in place; only brand-new
//    nodes get fresh positions, and the existing layout is preserved.
//  - reduceMotion runs the simulation synchronously for a fixed iteration count
//    and draws once (and on every interaction) instead of animating.
//
// React Compiler is enabled: no manual useMemo/useCallback/memo. Imperative
// canvas/sim state lives in refs and effects.

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { useApp } from "../store.tsx";
import { buildEdges, egoIds, isVisible, matchesQuery, orphanIds } from "../selectors.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import type { Bundle, Concept } from "../types.ts";
import {
  ALPHA_DECAY,
  ALPHA_MIN,
  DEFAULT_PARAMS,
  REHEAT_ALPHA,
  step,
  type SimEdge,
  type SimNode,
  type SimParams,
} from "../graph/forceSim.ts";
import "./GraphView.css";

const MIN_RADIUS = 5;
const MAX_RADIUS = 22;
const STATIC_ITERATIONS = 400; // synchronous steps when reduceMotion is on
const LABEL_MIN_SCALE = 0.7; // base zoom below which free-floating labels hide

// Adjustable display options (rendering only — not physics).
interface Display {
  nodeScale: number;
  linkThickness: number;
  linkOpacity: number;
  labelScale: number; // >1 shows labels at lower zoom
}
const DEFAULT_DISPLAY: Display = {
  nodeScale: 1,
  linkThickness: 1,
  linkOpacity: 0.5,
  labelScale: 1,
};
// The force fields the controls panel exposes (the rest come from DEFAULT_PARAMS).
type Forces = Pick<SimParams, "repulsion" | "springLength" | "springK" | "centering">;
const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
// Canvas ctx.font cannot resolve CSS custom properties, so spell out a stack
// that mirrors --ui in styles.css.
const LABEL_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

interface View {
  scale: number;
  tx: number;
  ty: number;
}

interface RenderData {
  /** Visible nodes (those passing the type/tag filter), in draw order. */
  nodes: SimNode[];
  edges: SimEdge[];
  /** Per-node concept metadata, index-aligned with `nodes`. */
  meta: {
    id: string;
    title: string;
    type: string;
    color: string;
    dim: boolean;
    /** True for a degree-0 concept (no links and no citedBy) — drawn with a ring. */
    orphan: boolean;
    /** Count of unresolved outbound hrefs — drawn as a warning marker when > 0. */
    broken: number;
  }[];
  /** id -> index into `nodes`/`meta`. */
  indexById: Map<string, number>;
  /** Adjacency by node index, for selection highlighting. */
  neighbors: Set<number>[];
}

function radiusForDegree(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return MIN_RADIUS;
  const t = Math.sqrt(degree / maxDegree); // sqrt so hubs grow but not wildly
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
}

/** A set of `ids` plus their direct neighbors (links ∪ citedBy), for isolating
 *  a defect set into the view with enough context to see why it is one. */
function expandWithNeighbors(bundle: Bundle | null, ids: string[]): Set<string> {
  const out = new Set(ids);
  if (!bundle) return out;
  const byId = new Map(bundle.concepts.map((c) => [c.id, c] as const));
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;
    for (const nb of c.links) out.add(nb);
    for (const nb of c.citedBy) out.add(nb);
  }
  return out;
}

export function GraphView() {
  const { state, actions } = useApp();

  // Controls (React state drives the UI; refs feed the imperative draw/sim).
  const [forces, setForces] = useState<Forces>(() => ({
    repulsion: DEFAULT_PARAMS.repulsion,
    springLength: DEFAULT_PARAMS.springLength,
    springK: DEFAULT_PARAMS.springK,
    centering: DEFAULT_PARAMS.centering,
  }));
  const [display, setDisplay] = useState<Display>(DEFAULT_DISPLAY);
  // A transient "isolate" set: when non-null, the graph renders only these ids
  // (plus their neighbors), overriding focus/overview. Driven by the defect
  // count chip. Read-only and tolerant — clearing it returns to normal.
  const [isolate, setIsolate] = useState<{ label: string; ids: string[] } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Imperative state kept out of React's render path.
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const renderRef = useRef<RenderData>({
    nodes: [],
    edges: [],
    meta: [],
    indexById: new Map(),
    neighbors: [],
  });
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const rafRef = useRef<number | null>(null);
  const alphaRef = useRef(1); // simulation cooling factor; decays to ALPHA_MIN then rests
  const hoverRef = useRef<number | null>(null);
  const paramsRef = useRef<SimParams>({ ...DEFAULT_PARAMS });
  const displayRef = useRef<Display>(display);
  const needsFitRef = useRef(true); // auto-fit once a fresh layout settles
  const prevRestrictKey = useRef<string | null>(null); // last focus/isolate set, to refit on change

  // Latest selection for the imperative draw, without re-binding the whole
  // render pipeline on every selection change.
  const selectedRef = useRef<string | null>(state.activeConceptId);
  selectedRef.current = state.activeConceptId;

  // ---- Drawing -------------------------------------------------------------

  function cssVar(name: string): string {
    const el = containerRef.current;
    if (!el) return "";
    return getComputedStyle(el).getPropertyValue(name).trim();
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h, dpr } = sizeRef.current;
    const view = viewRef.current;
    const data = renderRef.current;
    const selected = selectedRef.current;
    const disp = displayRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(view.tx, view.ty);
    ctx.scale(view.scale, view.scale);

    const selIdx = selected != null ? (data.indexById.get(selected) ?? null) : null;
    const hasFocus = selIdx != null;
    const focusNeighbors = hasFocus ? data.neighbors[selIdx] : null;

    const edgeColor = cssVar("--border") || "#888";
    const accent = cssVar("--accent") || "#2f6df6";
    const textColor = cssVar("--text") || "#111";
    const textDim = cssVar("--text-dim") || "#777";
    const nodeStroke = cssVar("--bg") || "#fff";
    const warnColor = cssVar("--warn") || "#b8860b"; // orphan ring + broken-link marker

    // Edges first, under the nodes.
    const baseLW = disp.linkThickness / view.scale;
    ctx.lineWidth = baseLW;
    for (const e of data.edges) {
      const a = data.nodes[e.a];
      const b = data.nodes[e.b];
      const incident = hasFocus && (e.a === selIdx || e.b === selIdx);
      if (hasFocus && !incident) {
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = edgeColor;
      } else if (incident) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = accent;
        ctx.lineWidth = (disp.linkThickness * 1.6) / view.scale;
      } else {
        ctx.globalAlpha = disp.linkOpacity;
        ctx.strokeStyle = edgeColor;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineWidth = baseLW;
    }
    ctx.globalAlpha = 1;

    // Nodes.
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i];
      const meta = data.meta[i];
      const isSel = i === selIdx;
      const isNeighbor = focusNeighbors?.has(i) ?? false;
      const dimmedByFocus = hasFocus && !isSel && !isNeighbor;
      const faded = meta.dim || dimmedByFocus;

      const rr = node.r * disp.nodeScale;
      ctx.globalAlpha = faded ? 0.18 : 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = meta.color;
      ctx.fill();
      ctx.lineWidth = (isSel ? 3 : 1.2) / view.scale;
      ctx.strokeStyle = isSel ? accent : nodeStroke;
      ctx.stroke();

      // Orphan: a dashed warning ring just outside the node (degree 0).
      if (meta.orphan && !faded) {
        ctx.save();
        ctx.setLineDash([4 / view.scale, 3 / view.scale]);
        ctx.lineWidth = 1.5 / view.scale;
        ctx.strokeStyle = warnColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, rr + 3 / view.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Broken-link markers: a small warning dot at the node's upper-right for any
    // node with unresolved outbound hrefs. Drawn after all nodes so it sits on
    // top. Tolerant signal — never an error glyph, just a flag.
    for (let i = 0; i < data.nodes.length; i++) {
      const meta = data.meta[i];
      if (meta.broken <= 0) continue;
      const node = data.nodes[i];
      const isSel = i === selIdx;
      const isNeighbor = focusNeighbors?.has(i) ?? false;
      const dimmedByFocus = hasFocus && !isSel && !isNeighbor;
      if (meta.dim || dimmedByFocus) continue;
      const rr = node.r * disp.nodeScale;
      const off = rr * 0.72;
      const mr = Math.max(2.5, rr * 0.38) / 1; // marker radius in world units
      ctx.beginPath();
      ctx.arc(node.x + off, node.y - off, mr, 0, Math.PI * 2);
      ctx.fillStyle = warnColor;
      ctx.fill();
      ctx.lineWidth = 1 / view.scale;
      ctx.strokeStyle = nodeStroke;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Labels: cull when zoomed out unless the node is selected, a neighbor of
    // the selection, or hovered.
    const hover = hoverRef.current;
    ctx.font = `${12 / view.scale}px ${LABEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i];
      const meta = data.meta[i];
      const isSel = i === selIdx;
      const isNeighbor = focusNeighbors?.has(i) ?? false;
      const isHover = i === hover;
      const dimmedByFocus = hasFocus && !isSel && !isNeighbor;

      const alwaysShow = isSel || isNeighbor || isHover;
      if (!alwaysShow && view.scale < LABEL_MIN_SCALE / disp.labelScale) continue;
      if (!alwaysShow && meta.dim) continue;

      ctx.globalAlpha = meta.dim || dimmedByFocus ? 0.25 : 1;
      ctx.fillStyle = isSel ? textColor : isNeighbor || isHover ? textColor : textDim;
      ctx.fillText(meta.title, node.x, node.y + node.r * disp.nodeScale + 2 / view.scale);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- Animation loop ------------------------------------------------------

  function stopLoop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function runLoop() {
    if (state.settings.reduceMotion) {
      // Synchronous settle, no animation: cool a fresh alpha all the way down.
      const data = renderRef.current;
      let alpha = Math.max(alphaRef.current, 1);
      for (let i = 0; i < STATIC_ITERATIONS && alpha > ALPHA_MIN; i++) {
        step(data.nodes, data.edges, paramsRef.current, alpha);
        alpha += (0 - alpha) * ALPHA_DECAY;
      }
      alphaRef.current = 0;
      syncPositions();
      maybeFit();
      draw();
      return;
    }
    stopLoop();
    const tick = () => {
      const data = renderRef.current;
      const alpha = alphaRef.current;
      step(data.nodes, data.edges, paramsRef.current, alpha);
      // Cool toward zero; once cold, stop the loop and rest.
      alphaRef.current = alpha + (0 - alpha) * ALPHA_DECAY;
      syncPositions();
      if (alphaRef.current < ALPHA_MIN) {
        rafRef.current = null; // settled — idle until the next interaction/data change
        maybeFit();
        draw();
        return;
      }
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  /** Frame the whole graph once, after a fresh layout has settled. */
  function maybeFit() {
    if (needsFitRef.current) {
      needsFitRef.current = false;
      fit();
    }
  }

  /** Persist current node positions back into the id-keyed ref. */
  function syncPositions() {
    const data = renderRef.current;
    const store = positionsRef.current;
    for (const node of data.nodes) {
      const p = store.get(node.id);
      if (p) {
        p.x = node.x;
        p.y = node.y;
      } else {
        store.set(node.id, { x: node.x, y: node.y });
      }
    }
  }

  /** Kick the loop awake (e.g. after a drag) so it can re-settle. */
  function reheat() {
    if (state.settings.reduceMotion) {
      // No animation; just redraw the new position.
      draw();
      return;
    }
    alphaRef.current = Math.max(alphaRef.current, REHEAT_ALPHA);
    if (rafRef.current == null) runLoop();
  }

  // ---- Build render data from the bundle + filters -------------------------
  // Re-run when the data set or the structural filters change. Text query only
  // dims (handled by recomputing `meta.dim`), so it is included too — it is cheap.

  const concepts = state.bundle?.concepts ?? null;
  const filterKey = `${state.hiddenTypes.join(",")}|${state.activeTag ?? ""}`;

  // The node set the focus/isolate logic restricts to. In focus mode with a
  // selection (and no active isolate), this is the ego neighborhood of the
  // selection; otherwise null means "show the whole filtered graph". An active
  // isolate set wins over both. Computed as a stable string key so the rebuild
  // effect only fires when the *set* actually changes.
  const restrictIds: Set<string> | null = isolate
    ? expandWithNeighbors(state.bundle, isolate.ids)
    : state.graphMode === "focus" && state.activeConceptId
      ? egoIds(state.bundle, state.activeConceptId, state.focusDepth)
      : null;
  // A key that changes only when the restricted set's membership changes, so the
  // heavy rebuild + re-fit is skipped on pure selection moves in overview mode.
  const restrictKey = restrictIds ? [...restrictIds].sort().join(",") : "";

  useEffect(() => {
    const list = concepts ?? [];
    const filter = { query: "", hiddenTypes: state.hiddenTypes, activeTag: state.activeTag };
    // Apply type/tag filtering first, then the focus/isolate restriction on top.
    const visible = list.filter(
      (c) => isVisible(c, filter) && (restrictIds === null || restrictIds.has(c.id)),
    );

    const dark = resolveDark(state.settings.theme);
    const types = [...new Set(list.map((c) => c.type))];
    const palette = buildTypePalette(types, dark);
    const maxDegree = visible.reduce((m, c) => Math.max(m, c.degree), 0);

    const store = positionsRef.current;
    // Drop positions only for nodes no longer in the *bundle* — not for nodes
    // merely hidden by the focus/isolate restriction. Keeping their cached
    // positions means re-entering the wider set animates from where they were
    // rather than re-spawning (the disorientation trap the proposal calls out).
    const bundleIds = new Set(list.map((c) => c.id));

    const nodes: SimNode[] = [];
    const meta: RenderData["meta"] = [];
    const indexById = new Map<string, number>();
    const radius = 220; // spawn ring for brand-new nodes
    let spawnedNew = false;

    visible.forEach((c: Concept, i) => {
      const existing = store.get(c.id);
      let x: number;
      let y: number;
      if (existing) {
        x = existing.x;
        y = existing.y;
      } else {
        // Fresh node: seed on a ring so the sim has something to spread out.
        const angle = (i / Math.max(1, visible.length)) * Math.PI * 2;
        x = Math.cos(angle) * radius * (0.4 + Math.random() * 0.6);
        y = Math.sin(angle) * radius * (0.4 + Math.random() * 0.6);
        store.set(c.id, { x, y });
        spawnedNew = true;
      }
      indexById.set(c.id, nodes.length);
      nodes.push({
        id: c.id,
        x,
        y,
        vx: 0,
        vy: 0,
        r: radiusForDegree(c.degree, maxDegree),
        fx: null,
        fy: null,
      });
      meta.push({
        id: c.id,
        title: c.title,
        type: c.type,
        color: palette.color(c.type),
        dim: !matchesQuery(c, state.query),
        orphan: c.degree === 0 && c.links.length === 0 && c.citedBy.length === 0,
        broken: c.brokenLinks.length,
      });
    });

    // Edges among visible nodes only (edges to hidden nodes are dropped).
    const rawEdges = buildEdges(list);
    const edges: SimEdge[] = [];
    const neighbors: Set<number>[] = nodes.map(() => new Set<number>());
    for (const e of rawEdges) {
      const a = indexById.get(e.source);
      const b = indexById.get(e.target);
      if (a === undefined || b === undefined || a === b) continue;
      edges.push({ a, b });
      neighbors[a].add(b);
      neighbors[b].add(a);
    }

    for (const id of store.keys()) {
      if (!bundleIds.has(id)) store.delete(id);
    }

    renderRef.current = { nodes, edges, meta, indexById, neighbors };
    // The focus/isolate set changed (or this is the first build) — frame the new
    // subgraph so it is centered and readable.
    const restrictChanged = prevRestrictKey.current !== restrictKey;
    prevRestrictKey.current = restrictKey;
    // Warm up fully for a brand-new layout; otherwise a gentle nudge so kept
    // positions do not visibly jump. A focus/isolate change reheats a touch more
    // so the smaller set can spread out from its cached positions.
    alphaRef.current = spawnedNew ? 1 : restrictChanged ? Math.max(0.4, REHEAT_ALPHA) : 0.4;
    needsFitRef.current = spawnedNew || restrictChanged; // refit a fresh layout or a new focus set
    runLoop();
    // Imperative helpers (draw/runLoop/syncPositions) read from refs, so they are
    // intentionally not in the dep list; this effect rebuilds only on data/filter
    // changes.
    // restrictKey folds in graphMode/focusDepth/activeConceptId/isolate: the
    // rebuild fires only when the focused/isolated node *set* changes, so a
    // selection move in overview mode stays a cheap redraw (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, filterKey, restrictKey, state.query, state.settings.theme, state.settings.reduceMotion]);

  // Redraw (no resim) when only the selection changes (overview mode: the node
  // set is unchanged, just the highlight). In focus mode a selection change moves
  // the ego set, which the rebuild effect above handles via restrictKey.
  useEffect(() => {
    draw();
  }, [state.activeConceptId]);

  // Drop a stale isolate set when the bundle changes (its ids belong to the old
  // bundle). Keeps the view from going blank on bundle switch.
  useEffect(() => {
    setIsolate(null);
  }, [state.activeRoot]);

  // Live-tune forces from the controls panel: copy into the sim params ref and
  // gently reheat so the layout adapts in place.
  useEffect(() => {
    paramsRef.current = { ...DEFAULT_PARAMS, ...forces };
    alphaRef.current = Math.max(alphaRef.current, REHEAT_ALPHA);
    runLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forces]);

  // Display options affect only drawing; copy and repaint.
  useEffect(() => {
    displayRef.current = display;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display]);

  // ---- Sizing / HiDPI ------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const apply = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const first = sizeRef.current.w === 0 && sizeRef.current.h === 0;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (first) {
        // Center the origin on first measure.
        viewRef.current.tx = w / 2;
        viewRef.current.ty = h / 2;
      }
      draw();
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Stop the loop on unmount.
  useEffect(() => stopLoop, []);

  // ---- Coordinate helpers --------------------------------------------------

  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const view = viewRef.current;
    return { x: (px - view.tx) / view.scale, y: (py - view.ty) / view.scale };
  }

  function hitTest(worldX: number, worldY: number): number | null {
    const data = renderRef.current;
    // Reverse order so topmost (last drawn) wins.
    for (let i = data.nodes.length - 1; i >= 0; i--) {
      const node = data.nodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const hit = node.r * displayRef.current.nodeScale + 3; // slack for easier clicking
      if (dx * dx + dy * dy <= hit * hit) return i;
    }
    return null;
  }

  // ---- Pointer interactions ------------------------------------------------

  const dragRef = useRef<
    | { kind: "pan"; startX: number; startY: number; tx0: number; ty0: number }
    | { kind: "node"; index: number; moved: boolean }
    | null
  >(null);

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const world = toWorld(e.clientX, e.clientY);
    const idx = hitTest(world.x, world.y);
    if (idx != null) {
      const node = renderRef.current.nodes[idx];
      node.fx = node.x;
      node.fy = node.y;
      dragRef.current = { kind: "node", index: idx, moved: false };
    } else {
      const view = viewRef.current;
      dragRef.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        tx0: view.tx,
        ty0: view.ty,
      };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) {
      // Hover handling for labels.
      const world = toWorld(e.clientX, e.clientY);
      const idx = hitTest(world.x, world.y);
      if (idx !== hoverRef.current) {
        hoverRef.current = idx;
        const canvas = canvasRef.current;
        if (canvas) canvas.style.cursor = idx != null ? "pointer" : "grab";
        if (rafRef.current == null) draw();
      }
      return;
    }
    if (drag.kind === "pan") {
      const view = viewRef.current;
      view.tx = drag.tx0 + (e.clientX - drag.startX);
      view.ty = drag.ty0 + (e.clientY - drag.startY);
      draw();
    } else {
      const world = toWorld(e.clientX, e.clientY);
      const node = renderRef.current.nodes[drag.index];
      node.fx = world.x;
      node.fy = world.y;
      node.x = world.x;
      node.y = world.y;
      drag.moved = true;
      reheat();
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "node") {
      const node = renderRef.current.nodes[drag.index];
      // Release the pin so the node rejoins the simulation.
      node.fx = null;
      node.fy = null;
      if (!drag.moved) {
        actions.selectConcept(node.id);
      } else {
        reheat();
      }
    }
  }

  function onWheel(e: ReactWheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const view = viewRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    // Zoom around the cursor: keep the world point under the cursor fixed.
    const wx = (px - view.tx) / view.scale;
    const wy = (py - view.ty) / view.scale;
    view.scale = next;
    view.tx = px - wx * next;
    view.ty = py - wy * next;
    draw();
  }

  // ---- Overlay controls ----------------------------------------------------

  function zoomBy(factor: number) {
    const view = viewRef.current;
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const wx = (cx - view.tx) / view.scale;
    const wy = (cy - view.ty) / view.scale;
    view.scale = next;
    view.tx = cx - wx * next;
    view.ty = cy - wy * next;
    draw();
  }

  function fit() {
    const data = renderRef.current;
    const { w, h } = sizeRef.current;
    if (data.nodes.length === 0 || w === 0 || h === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of data.nodes) {
      minX = Math.min(minX, n.x - n.r);
      minY = Math.min(minY, n.y - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = 40;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const scale = Math.min(MAX_SCALE, (w - pad * 2) / bw, (h - pad * 2) / bh);
    const view = viewRef.current;
    view.scale = Math.max(MIN_SCALE, scale);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    view.tx = w / 2 - cx * view.scale;
    view.ty = h / 2 - cy * view.scale;
    draw();
  }

  // ---- Render --------------------------------------------------------------

  const nodeCount = concepts?.length ?? 0;
  const edgeCount = concepts ? buildEdges(concepts).length : 0;
  const ariaLabel = `Concept graph: ${nodeCount} node${nodeCount === 1 ? "" : "s"}, ${edgeCount} link${edgeCount === 1 ? "" : "s"}`;

  // Defect counts over the whole bundle (not just the rendered set) — the chip
  // reports the global health and offers to isolate it.
  const orphans = orphanIds(state.bundle);
  const brokenConceptIds = (concepts ?? []).filter((c) => c.brokenLinks.length > 0).map((c) => c.id);
  const hasDefects = orphans.length > 0 || brokenConceptIds.length > 0;
  // Focus mode is on but there is no selection (or an isolate overrides it): the
  // graph falls back to Overview, so tell the newcomer how to engage focus.
  const focusFallback =
    state.graphMode === "focus" && state.activeConceptId == null && !isolate;

  function isolateSet(label: string, ids: string[]) {
    // Toggle: clicking the active chip clears the isolate.
    setIsolate((cur) => (cur && cur.label === label ? null : { label, ids }));
  }

  if (!state.bundle || nodeCount === 0) {
    return (
      <div className="graph-view" ref={containerRef}>
        <div className="graph-empty">
          <p>No concepts to graph</p>
          <small>Open a bundle to see its relationship graph.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-view" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />
      <div className="graph-panel">
        <Popover.Root>
          <Popover.Trigger className="graph-panel-toggle">Controls</Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              className="ui-popover-positioner"
              side="bottom"
              align="start"
              sideOffset={6}
            >
              <Popover.Popup className="ui-popover graph-panel-body">
                <fieldset>
                  <legend>Forces</legend>
                  <Slider label="Repel" min={0} max={3000} step={50} value={forces.repulsion}
                    onChange={(v) => setForces((f) => ({ ...f, repulsion: v }))} />
                  <Slider label="Link distance" min={20} max={250} step={5} value={forces.springLength}
                    onChange={(v) => setForces((f) => ({ ...f, springLength: v }))} />
                  <Slider label="Link force" min={0} max={0.3} step={0.01} value={forces.springK}
                    onChange={(v) => setForces((f) => ({ ...f, springK: v }))} />
                  <Slider label="Center" min={0} max={0.2} step={0.005} value={forces.centering}
                    onChange={(v) => setForces((f) => ({ ...f, centering: v }))} />
                </fieldset>
                <fieldset>
                  <legend>Display</legend>
                  <Slider label="Node size" min={0.4} max={2.5} step={0.1} value={display.nodeScale}
                    onChange={(v) => setDisplay((d) => ({ ...d, nodeScale: v }))} />
                  <Slider label="Link thickness" min={0.5} max={4} step={0.5} value={display.linkThickness}
                    onChange={(v) => setDisplay((d) => ({ ...d, linkThickness: v }))} />
                  <Slider label="Link opacity" min={0.05} max={1} step={0.05} value={display.linkOpacity}
                    onChange={(v) => setDisplay((d) => ({ ...d, linkOpacity: v }))} />
                  <Slider label="Label fade" min={0.5} max={3} step={0.1} value={display.labelScale}
                    onChange={(v) => setDisplay((d) => ({ ...d, labelScale: v }))} />
                </fieldset>
                <button
                  type="button"
                  className="graph-panel-reset"
                  onClick={() => {
                    setForces({
                      repulsion: DEFAULT_PARAMS.repulsion,
                      springLength: DEFAULT_PARAMS.springLength,
                      springK: DEFAULT_PARAMS.springK,
                      centering: DEFAULT_PARAMS.centering,
                    });
                    setDisplay(DEFAULT_DISPLAY);
                  }}
                >
                  Reset
                </button>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div className="graph-mode" role="group" aria-label="Graph mode">
        <div className="graph-seg">
          <button
            type="button"
            className="graph-seg-btn"
            aria-label="Overview: show the whole graph"
            aria-pressed={state.graphMode === "overview"}
            onClick={() => actions.setGraphMode("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className="graph-seg-btn"
            aria-label="Focus: show the selected concept's neighborhood"
            aria-pressed={state.graphMode === "focus"}
            onClick={() => actions.setGraphMode("focus")}
          >
            Focus
          </button>
        </div>
        {state.graphMode === "focus" && (
          <div className="graph-depth" role="group" aria-label="Focus depth">
            <span className="graph-depth-label">Depth</span>
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                type="button"
                className="graph-seg-btn"
                aria-label={`Focus depth ${d}`}
                aria-pressed={state.focusDepth === d}
                onClick={() => actions.setFocusDepth(d)}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {focusFallback && <span className="graph-mode-hint">Select a concept to focus</span>}
      </div>
      {(hasDefects || isolate) && (
        <div className="graph-chips">
          {isolate ? (
            <button
              type="button"
              className="graph-chip graph-chip-active"
              aria-label={`Showing isolated set: ${isolate.label}. Click to clear.`}
              onClick={() => setIsolate(null)}
            >
              {isolate.label} &times;
            </button>
          ) : (
            <button
              type="button"
              className="graph-chip graph-chip-warn"
              aria-label={`${orphans.length} orphan${orphans.length === 1 ? "" : "s"}, ${brokenConceptIds.length} with broken links. Click to isolate.`}
              onClick={() =>
                isolateSet(
                  `${orphans.length} orphans · ${brokenConceptIds.length} broken`,
                  [...new Set([...orphans, ...brokenConceptIds])],
                )
              }
            >
              {orphans.length} orphan{orphans.length === 1 ? "" : "s"} &middot; {brokenConceptIds.length} broken
            </button>
          )}
        </div>
      )}
      <div className="graph-controls">
        <button type="button" className="graph-btn" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
          +
        </button>
        <button
          type="button"
          className="graph-btn"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
        >
          &minus;
        </button>
        <button type="button" className="graph-btn graph-fit" aria-label="Fit graph to view" onClick={fit}>
          Fit
        </button>
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="graph-slider">
      <span className="graph-slider-label">{label}</span>
      <BaseSlider.Root
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v as number)}
      >
        <BaseSlider.Control className="ui-slider-control">
          <BaseSlider.Track className="ui-slider-track">
            <BaseSlider.Indicator className="ui-slider-indicator" />
            <BaseSlider.Thumb className="ui-slider-thumb" />
          </BaseSlider.Track>
        </BaseSlider.Control>
      </BaseSlider.Root>
    </div>
  );
}
