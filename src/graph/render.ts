// The canvas graph painter — a pure function of its inputs, lifted out of
// GraphView so the ~370-line draw pass reads (and tests) on its own. It only
// ever read refs; taking them as a params bag makes it stateless. See
// docs/features/graph-view.md for the batching / culling / label strategy.

import type { SimNode } from "./forceSim.ts";
import type { Display, RenderData, View } from "./renderModel.ts";
import { MAX_RADIUS, MIN_RADIUS } from "./renderModel.ts";

// Base zoom below which free-floating labels hide (Obsidian-style: dots at
// overview, labels as you zoom in; selection/hover/neighbors always labelled).
const LABEL_MIN_SCALE = 1.1;
// While the layout is *moving*, the full label pass (O(labels²) collision cull +
// a fillText per label, both slow on WebKitGTK) is the per-frame bottleneck, and
// it grows with the on-screen label count — so a big window/dense bundle went
// laggy mid-settle. Rather than blink every label out (jarring), we keep only
// the orientation anchors — hubs above this size fraction, plus the always-shown
// selection/hover set — labelled during motion, capped and collision-free (hubs
// are few and cluster-separated). The fine leaf labels + full collision cull run
// once on the settled landing, so the map stays labelled and only detail fills in.
const ANIM_LABEL_MIN_T = 0.75;
const ANIM_LABEL_CAP = 6;
// Canvas ctx.font cannot resolve CSS custom properties, so spell out a stack
// that mirrors --ui in styles.css.
const LABEL_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Theme colors resolved from CSS custom properties by the caller (canvas
 *  ctx.font/fillStyle can't read them), passed in so the renderer stays pure. */
export interface GraphColors {
  bg: string;
  edge: string;
  accent: string;
  text: string;
  textDim: string;
  nodeStroke: string;
  warn: string;
}

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  size: { w: number; h: number; dpr: number };
  view: View;
  data: RenderData;
  display: Display;
  /** Active concept id, for the selection ring/label. */
  selected: string | null;
  /** Hovered node index (dims the rest of the graph while set). */
  hover: number | null;
  /** True while the layout is settling — draws only the hub anchor labels. */
  animating: boolean;
  /** Screen-px label widths, cached per (font-size, title) across frames. */
  labelWidths: Map<string, number>;
  colors: GraphColors;
}

export function renderGraph({
  ctx,
  size,
  view,
  data,
  display: disp,
  selected,
  hover,
  animating,
  labelWidths: widths,
  colors,
}: RenderParams): void {
  const { w, h, dpr } = size;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);

  // Visible world rect — every pass culls to it, so a zoomed-in view only
  // draws what's on screen regardless of total graph size (the dominant cost
  // when zoomed into one cluster of a large bundle).
  const invScale = 1 / view.scale;
  const viewLeft = -view.tx * invScale;
  const viewTop = -view.ty * invScale;
  const viewRight = (w - view.tx) * invScale;
  const viewBottom = (h - view.ty) * invScale;
  // Cohen–Sutherland region code, for exact trivial-reject of off-screen edges.
  const outcode = (x: number, y: number): number =>
    (x < viewLeft ? 1 : 0) |
    (x > viewRight ? 2 : 0) |
    (y < viewTop ? 4 : 0) |
    (y > viewBottom ? 8 : 0);

  const selIdx = selected != null ? (data.indexById.get(selected) ?? null) : null;
  // Highlight the hovered node, else the selected one (so the open concept's
  // links stay visible). Only a hover *dims* the rest of the graph — selection
  // alone keeps the whole spread bright, so overview stays readable.
  const focusIdx = hover ?? selIdx;
  const hasFocus = focusIdx != null;
  const focusNeighbors = hasFocus ? data.neighbors[focusIdx] : null;
  const dimOthers = hover != null;

  const edgeColor = colors.edge; // visible links, not faint hairlines
  const accent = colors.accent;
  const textColor = colors.text;
  const textDim = colors.textDim;
  const nodeStroke = colors.nodeStroke;
  const warnColor = colors.warn; // orphan ring + broken-link marker

  // Edges first, under the nodes. Each edge carries its *source* node's
  // color (the citing concept owns the link — Gephi's convention), so hub
  // fans and cluster membership read from the wiring, not just the dots.
  const baseLW = disp.linkThickness / view.scale;
  // Arrowhead into `to`, pulled back to its rim — drawn only on highlighted
  // edges, so citation direction shows exactly where the user is looking.
  const arrowInto = (from: SimNode, to: SimNode) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const rim = to.r * disp.nodeScale + 2 / view.scale;
    const tipX = to.x - ux * rim;
    const tipY = to.y - uy * rim;
    const s = 6 / view.scale;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * s - uy * s * 0.45, tipY - uy * s + ux * s * 0.45);
    ctx.lineTo(tipX - ux * s + uy * s * 0.45, tipY - uy * s - ux * s * 0.45);
    ctx.closePath();
    ctx.fill();
  };
  // Batch edges by stroke color to cut per-edge state changes (a strokeStyle
  // assignment + a stroke() call each — the dominant canvas cost on a large
  // graph). Incident (highlighted) edges are collected and drawn individually
  // last, on top, with arrowheads. Overlapping edges in a batch composite
  // their opacity once rather than building up per segment — a hair cleaner,
  // the only visible difference.
  const edgeGroups = new Map<string, number[]>();
  const incidentEdges: number[] = [];
  for (let ei = 0; ei < data.edges.length; ei++) {
    const e = data.edges[ei];
    const a = data.nodes[e.a];
    const b = data.nodes[e.b];
    // Both endpoints share an off-screen half-plane → the segment can't cross
    // the viewport, so skip it (exact; never culls a visible edge).
    if ((outcode(a.x, a.y) & outcode(b.x, b.y)) !== 0) continue;
    if (hasFocus && (e.a === focusIdx || e.b === focusIdx)) {
      incidentEdges.push(ei);
      continue;
    }
    // A single dim group while hovering, else grouped by the source's color.
    const key = dimOthers
      ? "__dim__"
      : disp.colorBy === "cluster"
        ? data.meta[e.a].clusterColor
        : data.meta[e.a].color;
    const group = edgeGroups.get(key);
    if (group) group.push(ei);
    else edgeGroups.set(key, [ei]);
  }
  ctx.lineWidth = baseLW;
  for (const [key, eis] of edgeGroups) {
    if (key === "__dim__") {
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = edgeColor;
    } else {
      ctx.globalAlpha = disp.linkOpacity;
      ctx.strokeStyle = key;
    }
    ctx.beginPath();
    for (const ei of eis) {
      const e = data.edges[ei];
      ctx.moveTo(data.nodes[e.a].x, data.nodes[e.a].y);
      ctx.lineTo(data.nodes[e.b].x, data.nodes[e.b].y);
    }
    ctx.stroke();
  }
  // Incident edges on top: accent, thicker, with citation-direction arrowheads.
  if (incidentEdges.length > 0) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = (disp.linkThickness * 1.6) / view.scale;
    ctx.beginPath();
    for (const ei of incidentEdges) {
      const e = data.edges[ei];
      ctx.moveTo(data.nodes[e.a].x, data.nodes[e.a].y);
      ctx.lineTo(data.nodes[e.b].x, data.nodes[e.b].y);
    }
    ctx.stroke();
    ctx.fillStyle = accent;
    for (const ei of incidentEdges) {
      const e = data.edges[ei];
      const dir = data.edgeDir[ei] ?? 0;
      if (dir & 1) arrowInto(data.nodes[e.a], data.nodes[e.b]);
      if (dir & 2) arrowInto(data.nodes[e.b], data.nodes[e.a]);
    }
  }
  ctx.globalAlpha = 1;

  // Nodes — batched by (fade, color) to cut per-node state changes. Nodes never
  // overlap (the collision pass guarantees a gap), so batched fills/strokes are
  // pixel-identical to drawing them one at a time. The selected node's accent
  // border and the orphan rings are their own small batches.
  const arcPath = (n: SimNode, r: number) => {
    ctx.moveTo(n.x + r, n.y); // start at angle 0 so arcs don't connect
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  };
  const rOf = (i: number) => data.nodes[i].r * disp.nodeScale;
  const fillGroups = new Map<string, number[]>(); // "f|color" / "b|color" -> ids
  const strokeBright: number[] = [];
  const strokeFaded: number[] = [];
  const orphanRings: number[] = [];
  let selVisible = -1;
  let selFaded = false;
  for (let i = 0; i < data.nodes.length; i++) {
    const node = data.nodes[i];
    const meta = data.meta[i];
    const rr = node.r * disp.nodeScale;
    if (
      node.x + rr < viewLeft ||
      node.x - rr > viewRight ||
      node.y + rr < viewTop ||
      node.y - rr > viewBottom
    )
      continue; // fully off-screen
    const isNeighbor = focusNeighbors?.has(i) ?? false;
    const dimmedByFocus = dimOthers && i !== focusIdx && !isNeighbor;
    const faded = meta.dim || dimmedByFocus;
    const color = disp.colorBy === "cluster" ? meta.clusterColor : meta.color;
    const key = (faded ? "f|" : "b|") + color;
    const g = fillGroups.get(key);
    if (g) g.push(i);
    else fillGroups.set(key, [i]);
    if (i === selIdx) {
      selVisible = i;
      selFaded = faded;
    } else if (faded) strokeFaded.push(i);
    else strokeBright.push(i);
    if (meta.orphan && !faded) orphanRings.push(i);
  }
  // Fills, one path + one fill per (fade, color).
  for (const [key, ids] of fillGroups) {
    ctx.globalAlpha = key.startsWith("f|") ? 0.18 : 1;
    ctx.fillStyle = key.slice(2);
    ctx.beginPath();
    for (const i of ids) arcPath(data.nodes[i], rOf(i));
    ctx.fill();
  }
  // Non-selected borders (theme-bg stroke), one path per fade group.
  ctx.strokeStyle = nodeStroke;
  ctx.lineWidth = 1.2 / view.scale;
  for (const [alpha, ids] of [
    [1, strokeBright],
    [0.18, strokeFaded],
  ] as const) {
    if (ids.length === 0) continue;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const i of ids) arcPath(data.nodes[i], rOf(i));
    ctx.stroke();
  }
  // Selected node's accent border (thicker), on top.
  if (selVisible >= 0) {
    ctx.globalAlpha = selFaded ? 0.18 : 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3 / view.scale;
    ctx.beginPath();
    arcPath(data.nodes[selVisible], rOf(selVisible));
    ctx.stroke();
  }
  // Orphan rings — a dashed warning ring just outside each degree-0 node.
  if (orphanRings.length > 0) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.setLineDash([4 / view.scale, 3 / view.scale]);
    ctx.lineWidth = 1.5 / view.scale;
    ctx.strokeStyle = warnColor;
    ctx.beginPath();
    for (const i of orphanRings) arcPath(data.nodes[i], rOf(i) + 3 / view.scale);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Broken-link markers: a small warning dot at the node's upper-right for any
  // node with unresolved outbound hrefs. Drawn after all nodes so it sits on
  // top. Tolerant signal — never an error glyph, just a flag.
  for (let i = 0; i < data.nodes.length; i++) {
    const meta = data.meta[i];
    if (meta.broken <= 0) continue;
    const node = data.nodes[i];
    if (
      node.x < viewLeft ||
      node.x > viewRight ||
      node.y < viewTop ||
      node.y > viewBottom
    )
      continue; // off-screen
    const isNeighbor = focusNeighbors?.has(i) ?? false;
    const dimmedByFocus = dimOthers && i !== focusIdx && !isNeighbor;
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

  // Labels, dataviz-style: sized by node importance, hubs surfacing first as
  // you zoom out (each node's reveal threshold scales with its radius), and
  // collision-culled by priority so dense regions stay legible instead of
  // becoming a text smear. Selection/hover/neighbors always label.
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const baseReveal = LABEL_MIN_SCALE / disp.labelScale;
  interface LabelCand {
    i: number;
    /** Label font size in *screen* px (importance-scaled). */
    fontPx: number;
    alwaysShow: boolean;
  }
  // Label slack: a label hangs below/beside its node, so a node just past the
  // edge can still show one — widen the (shared) viewport rect by this much
  // before culling label candidates.
  const labelSlack = 160 * invScale;
  const cands: LabelCand[] = [];
  for (let i = 0; i < data.nodes.length; i++) {
    const node = data.nodes[i];
    const meta = data.meta[i];
    const isSel = i === selIdx;
    const isNeighbor = focusNeighbors?.has(i) ?? false;
    const isHover = i === hover;
    const alwaysShow = isSel || isNeighbor || isHover;
    // Off-screen and not contextually pinned → not a label candidate.
    if (
      !alwaysShow &&
      (node.x < viewLeft - labelSlack ||
        node.x > viewRight + labelSlack ||
        node.y < viewTop - labelSlack ||
        node.y > viewBottom + labelSlack)
    )
      continue;
    // 0 for the smallest node, 1 for the biggest hub.
    const t = (node.r - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS);
    // Hubs reveal their labels well before leaves do.
    if (!alwaysShow && view.scale < baseReveal * (1 - 0.75 * t)) continue;
    if (!alwaysShow && meta.dim) continue;
    // While moving, keep only the hub anchors (leaves fill in on settle).
    if (animating && !alwaysShow && t < ANIM_LABEL_MIN_T) continue;
    cands.push({ i, fontPx: 10 + 5 * t, alwaysShow });
  }
  // Priority: always-shown labels first, then bigger nodes.
  cands.sort(
    (a, b) =>
      Number(b.alwaysShow) - Number(a.alwaysShow) ||
      data.nodes[b.i].r - data.nodes[a.i].r,
  );
  // Greedy screen-space collision: a label is dropped when it overlaps one
  // already kept — except always-shown labels, which draw regardless (but
  // still claim their space so lower-priority neighbors yield).
  const kept: { cx: number; x: number; y: number; w: number; h: number; cand: LabelCand }[] = [];
  for (const cand of cands) {
    // While moving: draw the hub anchors straight through (cands is already
    // sorted hub-first), capped, without measuring or collision-testing.
    if (animating && kept.length >= ANIM_LABEL_CAP) break;
    const node = data.nodes[cand.i];
    const meta = data.meta[cand.i];
    const cy = node.y + node.r * disp.nodeScale + 2 / view.scale;
    if (animating) {
      kept.push({ cx: node.x, x: node.x, y: cy, w: 0, h: 0, cand });
      continue;
    }
    // Measured at screen size and cached; world width follows the zoom.
    const key = `${Math.round(cand.fontPx * 2)}|${meta.title}`;
    let lw = widths.get(key);
    if (lw === undefined) {
      ctx.font = `${cand.fontPx}px ${LABEL_FONT}`;
      lw = ctx.measureText(meta.title).width;
      if (widths.size > 8192) widths.clear();
      widths.set(key, lw);
    }
    const wWorld = lw / view.scale;
    const hWorld = (cand.fontPx * 1.25) / view.scale;
    const rect = {
      cx: node.x,
      x: node.x - wWorld / 2,
      y: cy,
      w: wWorld,
      h: hWorld,
      cand,
    };
    const collides = kept.some(
      (k) =>
        rect.x < k.x + k.w && k.x < rect.x + rect.w && rect.y < k.y + k.h && k.y < rect.y + rect.h,
    );
    if (collides && !cand.alwaysShow) continue;
    kept.push(rect);
  }
  for (const { cx, y, cand } of kept) {
    const meta = data.meta[cand.i];
    const isSel = cand.i === selIdx;
    const isNeighbor = focusNeighbors?.has(cand.i) ?? false;
    const isHover = cand.i === hover;
    const dimmedByFocus = dimOthers && cand.i !== focusIdx && !isNeighbor;
    ctx.font = `${cand.fontPx / view.scale}px ${LABEL_FONT}`;
    ctx.globalAlpha = meta.dim || dimmedByFocus ? 0.25 : 1;
    ctx.fillStyle = isSel || isNeighbor || isHover ? textColor : textDim;
    ctx.fillText(meta.title, cx, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
