// Shared model for the canvas graph: the types, tuned constants, and pure
// helpers that the renderer (render.ts), the controls panel (GraphControls.tsx),
// and the GraphView engine all build on. Kept at the bottom of the dependency
// graph — it imports only the sim/data types — so those three never form a cycle.

import type { Bundle } from "../types.ts";
import type { SimEdge, SimNode, SimParams } from "./forceSim.ts";

export const MIN_RADIUS = 4;
export const MAX_RADIUS = 20;
export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;

/** The pan/zoom transform applied before every draw. */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

/** Adjustable display options (rendering only — not physics). */
export interface Display {
  nodeScale: number;
  linkThickness: number;
  linkOpacity: number;
  labelScale: number; // >1 shows labels at lower zoom
  /** Node color source: by concept `type`, or by detected `cluster` (Louvain). */
  colorBy: "type" | "cluster";
}

export const DEFAULT_DISPLAY: Display = {
  nodeScale: 1,
  linkThickness: 1,
  linkOpacity: 0.5,
  labelScale: 1,
  colorBy: "cluster",
};

/** The force fields the controls panel exposes (the rest come from DEFAULT_PARAMS). */
export type Forces = Pick<
  SimParams,
  "repulsion" | "springLength" | "springK" | "centering" | "clusterStrength"
>;

// Tuned force defaults for the app's graph. The sim's DEFAULT_PARAMS stays the
// neutral baseline (used by the sim tests); the graph wants a noticeably more
// spread, organic layout — strong repulsion (amplified by the degree-weighted
// mass), longer links so leaves fan out, and gentle centering so the core
// doesn't compress into a blob. This is what produces the cluster-separated,
// canvas-filling look rather than a tight clump.
export const GRAPH_FORCES: Forces = {
  repulsion: 3200,
  springLength: 130, // unused under LinLog; kept for the spring fallback/controls
  springK: 0.12, // LinLog attraction is gentle (log), so it wants a higher gain
  centering: 0.015,
  // Gentle pull toward each Louvain community's centroid (cosmos.gl's
  // point-clustering force), so the geometry agrees with the detected
  // clusters that also drive the default node coloring.
  clusterStrength: 0.05,
};

/** The per-frame render input: visible nodes/edges plus everything the draw pass
 *  needs to color, highlight, and label them. Rebuilt only when the data or the
 *  structural filters change (see GraphView's build effect). */
export interface RenderData {
  /** Visible nodes (those passing the type/tag filter), in draw order. */
  nodes: SimNode[];
  edges: SimEdge[];
  /** Citation direction per edge (backbone edges are undirected): bit 1 =
   *  a cites b, bit 2 = b cites a. Drawn as arrowheads on highlighted edges. */
  edgeDir: number[];
  /** Per-node concept metadata, index-aligned with `nodes`. */
  meta: {
    id: string;
    title: string;
    type: string;
    /** Color by concept type (the legend palette). */
    color: string;
    /** Color by detected community (Louvain) — used when Display.colorBy is "cluster". */
    clusterColor: string;
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

/** Node radius scaled by degree (sqrt so hubs grow but not wildly). */
export function radiusForDegree(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return MIN_RADIUS;
  const t = Math.sqrt(degree / maxDegree);
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
}

/** A set of `ids` plus their direct neighbors (links ∪ citedBy), for isolating
 *  a defect set into the view with enough context to see why it is one. */
export function expandWithNeighbors(bundle: Bundle | null, ids: string[]): Set<string> {
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
