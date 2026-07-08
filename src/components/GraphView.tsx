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

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useApp } from "../store.tsx";
import { buildEdges, egoIds, isVisible, matchesQuery, orphanIds } from "../selectors.ts";
import { louvain } from "../graph/community.ts";
import { graphBackbone, maxPerNodeFor } from "../graph/backbone.ts";
// Lazy so cosmos.gl's WebGL bundle (~hundreds of KB) only loads if the user
// switches to the GPU renderer — the default canvas path stays lean.
const CosmosGraph = lazy(() =>
  import("./CosmosGraph.tsx").then((m) => ({ default: m.CosmosGraph })),
);
import { buildTypePalette, resolveDark } from "../theme.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { GraphControls } from "./GraphControls.tsx";
import { VizSwitcher } from "./VizSwitcher.tsx";
import type { Concept } from "../types.ts";
import { renderGraph } from "../graph/render.ts";
import type {
  Display,
  Forces,
  RenderData,
  View,
} from "../graph/renderModel.ts";
import {
  DEFAULT_DISPLAY,
  expandWithNeighbors,
  GRAPH_FORCES,
  MAX_SCALE,
  MIN_SCALE,
  radiusForDegree,
} from "../graph/renderModel.ts";
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

const STATIC_ITERATIONS = 400; // synchronous steps when reduceMotion is on
// Cap the canvas backing-store resolution. On a HiDPI display (or Linux
// fractional scaling) a large window's canvas balloons to many millions of
// pixels — all repainted every frame while the layout settles — so a big window
// went laggy while a small one stayed smooth. Rendering "a smaller canvas scaled
// up" (MDN's HiDPI guidance) keeps fill/paint cheap: a graph stays crisp up to
// 2x, and past a pixel budget the device-pixel-ratio scales down further so a
// huge viewport never costs more than ~this many pixels a frame.
const MAX_DPR = 2;
const MAX_CANVAS_PIXELS = 3_500_000;

export function GraphView() {
  const { state, actions } = useApp();

  // Controls (React state drives the UI; refs feed the imperative draw/sim).
  const [forces, setForces] = useState<Forces>(() => ({ ...GRAPH_FORCES }));
  const [display, setDisplay] = useState<Display>(DEFAULT_DISPLAY);
  // A transient "isolate" set: when non-null, the graph renders only these ids
  // (plus their neighbors), overriding focus/overview. Driven by the defect
  // count chip. Read-only and tolerant — clearing it returns to normal.
  const [isolate, setIsolate] = useState<{ label: string; ids: string[] } | null>(null);
  // Expand-on-click: an explicit, incrementally-grown set the graph restricts to.
  // Seeded/grown by double-clicking a node (pulls in that node + its neighbors),
  // so the user builds up a neighborhood a hop at a time — Neo4j Bloom's core
  // interaction — instead of loading the whole graph. Null means not exploring.
  const [explore, setExplore] = useState<Set<string> | null>(null);
  // Which renderer draws the graph: the bespoke canvas (default, full features)
  // or the GPU cosmos.gl renderer (scales to very large graphs). See
  // docs/features/graph-view.md.
  const [renderer, setRenderer] = useState<"canvas" | "gpu">("canvas");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Imperative state kept out of React's render path.
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const renderRef = useRef<RenderData>({
    nodes: [],
    edges: [],
    edgeDir: [],
    meta: [],
    indexById: new Map(),
    neighbors: [],
  });
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const rafRef = useRef<number | null>(null);
  // Coalesces high-frequency direct-draw requests (wheel zoom, pan) into at most
  // one draw per animation frame — a trackpad zoom can fire hundreds of wheel
  // events a second, and a synchronous draw each would back up the main thread
  // (a "freeze", worst on the slower WebKitGTK webview).
  const drawReqRef = useRef<number | null>(null);
  const alphaRef = useRef(1); // simulation cooling factor; decays to ALPHA_MIN then rests
  const hoverRef = useRef<number | null>(null);
  // Screen-px label widths, cached per (font-size, title) across frames.
  const labelWidthRef = useRef<Map<string, number>>(new Map());
  // RAF id of the in-flight view tween (fit / zoom-button glide), if any.
  const viewTweenRef = useRef<number | null>(null);
  const paramsRef = useRef<SimParams>({
    ...DEFAULT_PARAMS,
    ...GRAPH_FORCES,
    linkModel: "linlog", // gentle log attraction → spread, untangled clusters
  });
  const displayRef = useRef<Display>(display);
  const needsFitRef = useRef(true); // auto-fit once a fresh layout settles
  // Continuously re-frame a *fresh* layout while it blooms (instant, every
  // frame), so it assembles in view instead of sprawling off-screen until the
  // cooling schedule finally triggers one fit ~5s later. Cleared once settled,
  // or the moment the user pans/zooms/drags (we never fight their view).
  const trackFitRef = useRef(false);
  const prevRestrictKey = useRef<string | null>(null); // last focus/isolate set, to refit on change

  // Latest selection for the imperative draw, without re-binding the whole
  // render pipeline on every selection change. Synced in an effect (not during
  // render); the draw loop runs after commit, so it sees the current value.
  const selectedRef = useRef<string | null>(state.activeConceptId);
  useEffect(() => {
    selectedRef.current = state.activeConceptId;
  });

  // ---- Drawing -------------------------------------------------------------

  function cssVar(name: string): string {
    const el = containerRef.current;
    if (!el) return "";
    return getComputedStyle(el).getPropertyValue(name).trim();
  }

  // `animating` (set while the layout is settling) renders only the hub +
  // always-shown labels, skipping the leaf labels and the O(labels²) collision
  // cull — the priciest per-frame work, and unnecessary detail while nodes move.
  // The heavy lifting is renderGraph (../graph/render.ts); this wraps it with the
  // ref reads and theme-color lookups, so the paint pass stays a pure function.
  function draw(animating = false) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Opaque context: skip per-pixel alpha compositing with the page (a real win
    // on the WebKitGTK webview). renderGraph paints the theme background itself
    // each frame instead of clearing to transparent.
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    renderGraph({
      ctx,
      size: sizeRef.current,
      view: viewRef.current,
      data: renderRef.current,
      display: displayRef.current,
      selected: selectedRef.current,
      hover: hoverRef.current,
      animating,
      labelWidths: labelWidthRef.current,
      colors: {
        bg: cssVar("--bg") || "#000",
        edge: cssVar("--text-dim") || "#888",
        accent: cssVar("--accent") || "#2f6df6",
        text: cssVar("--text") || "#111",
        textDim: cssVar("--text-dim") || "#777",
        nodeStroke: cssVar("--bg") || "#fff",
        warn: cssVar("--warn") || "#b8860b",
      },
    });
  }

  // ---- Animation loop ------------------------------------------------------

  /** Request a single draw on the next frame, coalescing bursts. No-op while the
   *  sim loop is running (it already draws every frame with the latest view). */
  function scheduleDraw() {
    if (drawReqRef.current != null || rafRef.current != null) return;
    drawReqRef.current = requestAnimationFrame(() => {
      drawReqRef.current = null;
      draw();
    });
  }

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
      trackFitRef.current = false; // no animation to track — just fit the result
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
      const settled = alphaRef.current < ALPHA_MIN;
      // Track a settling layout every frame so it stays framed as it organizes —
      // easing toward the fit (glides in on entry, follows the spread), then
      // landing exactly once settled. Covers a fresh bloom and a focus/isolate
      // re-settle alike.
      if (trackFitRef.current) {
        if (settled) {
          fitInstant();
          trackFitRef.current = false;
          needsFitRef.current = false;
        } else {
          fitFollow();
        }
      } else if (settled) {
        maybeFit();
      }
      if (settled) {
        rafRef.current = null; // settled — idle until the next interaction/data change
        draw(); // landing frame: full label pass (leaves + collision cull)
        return;
      }
      draw(true); // moving: hub anchors only, no collision cull
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

  /** The user took over the view — cancel any pending or continuous auto-fit so
   *  we never fight their pan/zoom. */
  function cancelAutoFit() {
    trackFitRef.current = false;
    needsFitRef.current = false;
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
  const restrictIds: Set<string> | null =
    explore ??
    (isolate
      ? expandWithNeighbors(state.bundle, isolate.ids)
      : state.graphMode === "focus" && state.activeConceptId
        ? egoIds(state.bundle, state.activeConceptId, state.focusDepth)
        : null);
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
    // Whether any node lacks a cached position (a brand-new layout). Computed
    // before the loop below populates the cache.
    const spawnedNew = visible.some((c) => !store.has(c.id));

    // Centre + footprint of the already-positioned (cached) nodes. On a *focus/
    // isolate* change that pulls in NEW nodes (deeper depth, wider set), seed
    // those near the existing set instead of on the far global ring — otherwise
    // they fly in from the edge and the auto-fit zooms way out then back in (the
    // laggy excursion). This applies ONLY to a restricted view: entering the
    // whole-graph Overview (restrictIds === null) genuinely needs its nodes to
    // fly apart into clusters, so it keeps the ring + a full warm-up (cramming
    // them into a footprint and warming gently would spread far too slowly). A
    // brand-new layout has no cached nodes and keeps the ring too.
    const restricted = restrictIds !== null;
    let cachedN = 0;
    let cSumX = 0;
    let cSumY = 0;
    for (const c of visible) {
      const p = store.get(c.id);
      if (p) {
        cachedN++;
        cSumX += p.x;
        cSumY += p.y;
      }
    }
    const footprintSeed = restricted && cachedN > 0;
    const cCx = footprintSeed ? cSumX / cachedN : 0;
    const cCy = footprintSeed ? cSumY / cachedN : 0;
    let cExtent = radius;
    if (footprintSeed) {
      let m = 0;
      for (const c of visible) {
        const p = store.get(c.id);
        if (p) m = Math.max(m, Math.hypot(p.x - cCx, p.y - cCy));
      }
      cExtent = Math.max(60, m);
    }

    visible.forEach((c: Concept, i) => {
      const existing = store.get(c.id);
      let x: number;
      let y: number;
      if (existing) {
        x = existing.x;
        y = existing.y;
      } else {
        const angle = (i / Math.max(1, visible.length)) * Math.PI * 2;
        if (footprintSeed) {
          // Joining an existing restricted set: seed within its footprint (around
          // its centre) so the frame doesn't lurch while this node settles in.
          const rr = cExtent * (0.3 + ((i % 5) / 5) * 0.7);
          x = cCx + Math.cos(angle) * rr;
          y = cCy + Math.sin(angle) * rr;
        } else {
          // Brand-new layout, or entering Overview: an even ring so the sim
          // spreads it into clusters.
          x = Math.cos(angle) * radius * (0.4 + Math.random() * 0.6);
          y = Math.sin(angle) * radius * (0.4 + Math.random() * 0.6);
        }
        store.set(c.id, { x, y });
      }
      indexById.set(c.id, nodes.length);
      nodes.push({
        id: c.id,
        x,
        y,
        vx: 0,
        vy: 0,
        r: radiusForDegree(c.degree, maxDegree),
        // Repulsive mass ∝ degree+1 (ForceAtlas2): hubs and dense clusters claim
        // more space, so the layout spreads and clusters separate emergently.
        mass: c.degree + 1,
        fx: null,
        fy: null,
      });
      meta.push({
        id: c.id,
        title: c.title,
        type: c.type,
        color: palette.color(c.type),
        clusterColor: "", // filled below once communities are detected
        dim: !matchesQuery(c, state.query),
        orphan: c.degree === 0 && c.links.length === 0 && c.citedBy.length === 0,
        broken: c.brokenLinks.length,
      });
    });

    // Cross-links among visible nodes only (links to hidden nodes are dropped),
    // as directed index pairs.
    const directed: SimEdge[] = [];
    for (const e of buildEdges(list)) {
      const a = indexById.get(e.source);
      const b = indexById.get(e.target);
      if (a === undefined || b === undefined || a === b) continue;
      directed.push({ a, b });
    }

    // Detect communities (Louvain) over the *full* link graph and assign each
    // node a cluster color — kept on the full graph so cluster colors stay
    // stable regardless of the link-density (backbone) setting below.
    const comm = louvain(nodes.length, directed);
    // The sim's cluster-gravity pass reads each node's community; assigned in
    // both color modes so switching Color never reflows the layout.
    for (let i = 0; i < nodes.length; i++) nodes[i].cluster = comm[i] ?? 0;

    // Draw and simulate a readable *backbone* rather than every edge: a dense
    // cross-link graph is otherwise an unreadable hairball (see graph/backbone).
    // Hover/selection highlighting follows the drawn edges, so neighbors are
    // built from the backbone too.
    const edges: SimEdge[] = graphBackbone({
      n: nodes.length,
      directed,
      tags: list.map((c) => c.tags),
      maxPerNode: maxPerNodeFor(state.linkDensity),
    });
    const neighbors: Set<number>[] = nodes.map(() => new Set<number>());
    for (const e of edges) {
      neighbors[e.a].add(e.b);
      neighbors[e.b].add(e.a);
    }
    // Recover citation direction for the (undirected) backbone edges, for the
    // arrowheads on highlighted edges: bit 1 = a cites b, bit 2 = b cites a.
    const dirSet = new Set(directed.map((e) => e.a * nodes.length + e.b));
    const edgeDir = edges.map(
      (e) =>
        (dirSet.has(e.a * nodes.length + e.b) ? 1 : 0) |
        (dirSet.has(e.b * nodes.length + e.a) ? 2 : 0),
    );
    const clusterPalette = buildTypePalette(
      [...new Set(comm.map(String))],
      dark,
    );
    for (let i = 0; i < meta.length; i++) {
      meta[i].clusterColor = clusterPalette.color(String(comm[i] ?? 0));
    }

    for (const id of store.keys()) {
      if (!bundleIds.has(id)) store.delete(id);
    }

    renderRef.current = { nodes, edges, edgeDir, meta, indexById, neighbors };
    // The focus/isolate set changed (or this is the first build) — frame the new
    // subgraph so it is centered and readable.
    const restrictChanged = prevRestrictKey.current !== restrictKey;
    prevRestrictKey.current = restrictKey;
    // Warm up fully for a brand-new layout; otherwise a gentle nudge so kept
    // positions do not visibly jump. A focus/isolate change reheats a touch more
    // so the smaller set can spread out from its cached positions.
    // New nodes joining a cached *restricted* set warm up only gently (0.6) so
    // the settled core stays put and just the newcomers slot in — a focus/depth
    // change doesn't re-explode, and its auto-fit doesn't lurch. A brand-new
    // layout and entering Overview both warm up fully (alpha 1) to spread from
    // the ring into clusters; an all-cached change is a light nudge (0.4).
    alphaRef.current = spawnedNew ? (footprintSeed ? 0.6 : 1) : 0.4;
    needsFitRef.current = spawnedNew || restrictChanged; // refit a fresh layout or a new focus set
    // Track-fit both a brand-new layout (blooming from the spawn ring) and a
    // focus/isolate re-settle (spreading from cached positions): the view eases
    // toward the fit every frame — gliding in on entry, following the spread —
    // so the graph stays framed as it organizes instead of drifting until one
    // late fit. A same-set data refresh (live reload) is neither, so its view is
    // left untouched.
    trackFitRef.current = spawnedNew || restrictChanged;
    runLoop();
    // Imperative helpers (draw/runLoop/syncPositions) read from refs, so they are
    // intentionally not in the dep list; this effect rebuilds only on data/filter
    // changes.
    // restrictKey folds in graphMode/focusDepth/activeConceptId/isolate: the
    // rebuild fires only when the focused/isolated node *set* changes, so a
    // selection move in overview mode stays a cheap redraw (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    concepts,
    filterKey,
    restrictKey,
    state.query,
    state.linkDensity,
    state.settings.theme,
    state.settings.reduceMotion,
  ]);

  // Redraw (no resim) when only the selection changes (overview mode: the node
  // set is unchanged, just the highlight). In focus mode a selection change moves
  // the ego set, which the rebuild effect above handles via restrictKey.
  useEffect(() => {
    draw();
    // draw() reads refs only; it intentionally re-runs just on selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeConceptId]);

  // Drop a stale isolate set when the bundle changes (its ids belong to the old
  // bundle). Keeps the view from going blank on bundle switch.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setIsolate(null);
    setExplore(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state.activeRoot]);

  // Live-tune forces from the controls panel: copy into the sim params ref and
  // gently reheat so the layout adapts in place.
  useEffect(() => {
    paramsRef.current = { ...DEFAULT_PARAMS, ...forces, linkModel: "linlog" };
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
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      // Cap the backing-store resolution: use the display's DPR up to 2x, but a
      // large viewport scales it down so the canvas never exceeds the pixel
      // budget (keeps a big window from repainting millions of extra pixels a
      // frame). Small windows keep full DPR and stay crisp.
      const rawDpr = window.devicePixelRatio || 1;
      const budgetDpr = Math.sqrt(MAX_CANVAS_PIXELS / (w * h));
      const dpr = Math.max(0.75, Math.min(rawDpr, MAX_DPR, budgetDpr));
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
    // Mount-only: observes the container and draws via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the loop on unmount.
  // Unmount-only cleanup; both helpers only touch refs.
  useEffect(
    () => () => {
      stopLoop();
      cancelViewTween();
      if (drawReqRef.current != null) cancelAnimationFrame(drawReqRef.current);
    },
    [],
  );

  // The graph shortcuts the shortcuts overlay promises: + / − zoom, F fit.
  // Bound while the graph is mounted (reader-only layout unmounts it); bare
  // keys only, so the reader's Ctrl/Cmd +/−/0 text sizing stays untouched.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(1.2);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomBy(1 / 1.2);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        fit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // zoomBy/fit read refs; reduce-motion (read by applyView) re-binds via dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.reduceMotion]);


  // ---- Coordinate helpers --------------------------------------------------

  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
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
    cancelAutoFit(); // the user is taking control — stop auto-framing
    canvas.setPointerCapture(e.pointerId);
    const world = toWorld(e.clientX, e.clientY);
    const idx = hitTest(world.x, world.y);
    if (idx != null) {
      const node = renderRef.current.nodes[idx];
      node.fx = node.x;
      node.fy = node.y;
      dragRef.current = { kind: "node", index: idx, moved: false };
    } else {
      cancelViewTween(); // direct panning takes over from any glide
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
      scheduleDraw();
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
        // Ctrl/Cmd+click opens the node in a background reader tab (Shift to
        // also switch); plain click keeps the shared-selection behavior.
        if (e.ctrlKey || e.metaKey) {
          actions.openInNewTab(node.id, { background: !e.shiftKey });
        } else {
          actions.selectConcept(node.id);
        }
      } else {
        reheat();
      }
    }
  }

  function onWheel(e: ReactWheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    cancelViewTween(); // direct zooming takes over from any glide
    cancelAutoFit(); // the user set their own zoom — stop auto-framing
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
    scheduleDraw();
  }

  // Pull `id` and its direct neighbors into the explore set (seeding it on the
  // first expand). The restrict machinery keeps cached positions, so the newly
  // revealed neighbors animate in from where they were rather than re-spawning.
  function expandNode(id: string) {
    setIsolate(null); // explore takes over any active isolate
    setExplore((cur) => {
      const grown = expandWithNeighbors(state.bundle, [id]);
      if (!cur) return grown;
      const next = new Set(cur);
      for (const x of grown) next.add(x);
      return next;
    });
  }

  function onDoubleClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    const world = toWorld(e.clientX, e.clientY);
    const idx = hitTest(world.x, world.y);
    if (idx == null) return;
    const node = renderRef.current.nodes[idx];
    actions.selectConcept(node.id);
    expandNode(node.id);
  }

  // ---- Overlay controls ----------------------------------------------------

  function cancelViewTween() {
    if (viewTweenRef.current != null) {
      cancelAnimationFrame(viewTweenRef.current);
      viewTweenRef.current = null;
    }
  }

  /**
   * Glide the view to `target` over a short ease-out, so a fit or zoom step
   * reads as movement through the graph instead of a teleport. The world point
   * under the viewport center travels linearly while scale interpolates
   * geometrically (zoom *feels* linear that way). Direct input — wheel, pan —
   * interrupts the glide; reduce-motion jumps instantly.
   */
  function applyView(target: View) {
    cancelViewTween();
    const v = viewRef.current;
    if (state.settings.reduceMotion) {
      v.scale = target.scale;
      v.tx = target.tx;
      v.ty = target.ty;
      draw();
      return;
    }
    const ms = 260;
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const s0 = v.scale;
    const s1 = target.scale;
    const wc0x = (cx - v.tx) / s0;
    const wc0y = (cy - v.ty) / s0;
    const wc1x = (cx - target.tx) / s1;
    const wc1y = (cy - target.ty) / s1;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const k = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const s = s0 * Math.pow(s1 / s0, k);
      const wcx = wc0x + (wc1x - wc0x) * k;
      const wcy = wc0y + (wc1y - wc0y) * k;
      v.scale = s;
      v.tx = cx - wcx * s;
      v.ty = cy - wcy * s;
      if (rafRef.current == null) draw(); // when the sim loop is hot, it draws
      viewTweenRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    viewTweenRef.current = requestAnimationFrame(tick);
  }

  function zoomBy(factor: number) {
    const view = viewRef.current;
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const wx = (cx - view.tx) / view.scale;
    const wy = (cy - view.ty) / view.scale;
    applyView({ scale: next, tx: cx - wx * next, ty: cy - wy * next });
  }

  /** The view that frames the whole graph, or null if there's nothing to frame. */
  function computeFitView(): View | null {
    const data = renderRef.current;
    const { w, h } = sizeRef.current;
    if (data.nodes.length === 0 || w === 0 || h === 0) return null;
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
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (w - pad * 2) / bw, (h - pad * 2) / bh));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return { scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale };
  }

  /** Frame the whole graph with a glide (the Fit button, and settle landings). */
  function fit() {
    const t = computeFitView();
    if (t) applyView(t);
  }

  /** Frame the whole graph *instantly* (no glide) — the exact landing once a
   *  tracked layout has settled. */
  function fitInstant() {
    const t = computeFitView();
    if (!t) return;
    const v = viewRef.current;
    v.scale = t.scale;
    v.tx = t.tx;
    v.ty = t.ty;
  }

  /** Ease the view one step toward the current fit — called every frame while a
   *  layout settles (fresh bloom or a focus/isolate re-settle), so the view both
   *  glides to the new frame on entry and tracks the moving target as it spreads,
   *  staying framed without a snap. Geometric on scale, linear on the world point
   *  under the viewport centre (so zoom reads linear), mirroring `applyView`. */
  function fitFollow() {
    const t = computeFitView();
    if (!t) return;
    const v = viewRef.current;
    const { w, h } = sizeRef.current;
    const cx0 = (w / 2 - v.tx) / v.scale;
    const cy0 = (h / 2 - v.ty) / v.scale;
    const cx1 = (w / 2 - t.tx) / t.scale;
    const cy1 = (h / 2 - t.ty) / t.scale;
    // Deadzone: ignore tiny fit changes (a node jittering at the bbox edge as it
    // settles), so once framed the view rests instead of twitching every frame.
    const scaleOff = Math.abs(t.scale / v.scale - 1);
    const centreOffPx = Math.hypot(cx1 - cx0, cy1 - cy0) * v.scale;
    if (scaleOff < 0.015 && centreOffPx < 3) return;
    const k = 0.22; // ease factor per frame
    const s = v.scale * Math.pow(t.scale / v.scale, k);
    const cx = cx0 + (cx1 - cx0) * k;
    const cy = cy0 + (cy1 - cy0) * k;
    v.scale = s;
    v.tx = w / 2 - cx * s;
    v.ty = h / 2 - cy * s;
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
    state.graphMode === "focus" && state.activeConceptId == null && !isolate && !explore;

  function isolateSet(label: string, ids: string[]) {
    // Toggle: clicking the active chip clears the isolate.
    setIsolate((cur) => (cur?.label === label ? null : { label, ids }));
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
      {renderer === "gpu" ? (
        <ErrorBoundary
          resetKey={renderer}
          fallback={
            <div className="graph-empty">
              <p>GPU renderer unavailable</p>
              <small>WebGL couldn&apos;t start in this environment.</small>
              <button
                type="button"
                className="graph-panel-toggle"
                onClick={() => setRenderer("canvas")}
              >
                Use Canvas renderer
              </button>
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="graph-empty">
                <p>Loading GPU renderer…</p>
              </div>
            }
          >
            <CosmosGraph />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          role="img"
          aria-label={ariaLabel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
        />
      )}
      <div className="graph-toolbar">
        <div className="graph-toolbar-left">
          <GraphControls
            renderer={renderer}
            setRenderer={setRenderer}
            linkDensity={state.linkDensity}
            setLinkDensity={(d) => actions.setLinkDensity(d)}
            display={display}
            setDisplay={setDisplay}
            forces={forces}
            setForces={setForces}
          />
        </div>
        <div className="graph-mode" role="group" aria-label="Graph mode">
          <div className="graph-seg">
            <button
              type="button"
              className="graph-seg-btn"
              aria-label="Overview: show the whole graph"
              aria-pressed={state.graphMode === "overview" && !explore}
              onClick={() => {
                setExplore(null);
                actions.setGraphMode("overview");
              }}
            >
              Overview
            </button>
            <button
              type="button"
              className="graph-seg-btn"
              aria-label="Focus: show the selected concept's neighborhood"
              aria-pressed={state.graphMode === "focus" && !explore}
              onClick={() => {
                setExplore(null);
                actions.setGraphMode("focus");
              }}
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
        <div className="graph-toolbar-right">
          <VizSwitcher />
        </div>
      </div>
      {renderer === "canvas" && (
        <div className="graph-chips">
          {explore ? (
            <button
              type="button"
              className="graph-chip graph-chip-active"
              aria-label={`Exploring ${explore.size} concepts. Click to exit and show the full graph.`}
              title="Double-click any node to pull in its neighbors"
              onClick={() => setExplore(null)}
            >
              Exploring {explore.size} &middot; exit &times;
            </button>
          ) : isolate ? (
            <button
              type="button"
              className="graph-chip graph-chip-active"
              aria-label={`Showing isolated set: ${isolate.label}. Click to clear.`}
              onClick={() => setIsolate(null)}
            >
              {isolate.label} &times;
            </button>
          ) : hasDefects ? (
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
          ) : (
            <span className="graph-chip-hint muted" aria-hidden="true">
              Double-click a node to explore
            </span>
          )}
        </div>
      )}
      {renderer === "canvas" && (
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
      )}
    </div>
  );
}
