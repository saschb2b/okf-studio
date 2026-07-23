// Traversal derivations for the Lineage panel. Every walk is deterministic,
// bounded, cycle-safe, and read-only. Optional profile relationships add
// meaning to portable links without replacing the ordinary graph.

import { assessReliability } from "@/shared/reliability.ts";
import type { ReliabilityState } from "@/shared/reliability.ts";
import type {
  Bundle,
  Concept,
  ProfileRelationshipEdge,
  ProfileReport,
} from "@/shared/types.ts";

export const MAX_LINEAGE_DEPTH = 6;
export const MAX_LINEAGE_NODES = 200;
export const MAX_LINEAGE_NEIGHBORS = 40;
export const MAX_PATH_VISITS = 1_000;

export type LineageDir = "up" | "down";
export type LineageDirection = LineageDir | "both";
export type LineageValidity = "all" | "current" | "caution";
export type LineageReference = "cycle" | "seen";
export type LineageTruncation = "depth" | "hub" | "budget";
export type LineageState = ReliabilityState | "missing";

export interface LineageRelation {
  namespace: string | null;
  type: string;
  label: string;
  inverse: string | null;
  recognized: boolean;
  portableLink: boolean;
}

export interface LineageNode {
  id: string;
  title: string;
  type: string;
  state: LineageState;
  direction: LineageDir | null;
  relations: LineageRelation[];
  children: LineageNode[];
  reference?: LineageReference;
  truncated?: boolean;
  truncationReason?: LineageTruncation;
  omitted?: number;
}

export interface LineageTraversalOptions {
  report?: ProfileReport | null;
  relation?: string;
  validity?: LineageValidity;
  asOfDay?: string;
  maxNodes?: number;
  maxNeighbors?: number;
}

export interface ExplainedLineageStep {
  fromId: string;
  toId: string;
  direction: LineageDir;
  relations: LineageRelation[];
}

export interface ExplainedLineagePath {
  ids: string[];
  steps: ExplainedLineageStep[];
  visited: number;
  truncated: boolean;
}

interface GraphEdge {
  sourceId: string;
  targetId: string;
  relation: LineageRelation;
}

interface Connection {
  id: string;
  direction: LineageDir;
  relations: LineageRelation[];
}

export function profileRelationFilterKey(
  edge: Pick<ProfileRelationshipEdge, "namespace" | "type">,
): string {
  return `profile:${encodeURIComponent(edge.namespace)}/${encodeURIComponent(edge.type)}`;
}

function profileRelationFilterParts(filter: string): {
  namespace: string;
  type: string;
} | null {
  if (!filter.startsWith("profile:")) return null;
  const [namespace, type] = filter.slice("profile:".length).split("/", 2);
  if (!namespace || !type) return null;
  try {
    return {
      namespace: decodeURIComponent(namespace),
      type: decodeURIComponent(type),
    };
  } catch {
    return null;
  }
}

function relationFromProfile(edge: ProfileRelationshipEdge): LineageRelation {
  return {
    namespace: edge.namespace,
    type: edge.type,
    label: edge.label,
    inverse: edge.inverse,
    recognized: edge.recognized,
    portableLink: edge.portableLink,
  };
}

function graphEdges(bundle: Bundle, report: ProfileReport | null | undefined): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const concept of bundle.concepts) {
    for (const targetId of concept.links) {
      edges.push({
        sourceId: concept.id,
        targetId,
        relation: {
          namespace: null,
          type: "portable",
          label: "Links to",
          inverse: "Cited by",
          recognized: true,
          portableLink: true,
        },
      });
    }
  }
  for (const edge of report?.edges ?? []) {
    edges.push({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      relation: relationFromProfile(edge),
    });
  }
  return edges;
}

function relationMatches(relation: LineageRelation, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "portable") return relation.type === "portable";
  const profile = profileRelationFilterParts(filter);
  return profile !== null
    && relation.namespace === profile.namespace
    && relation.type === profile.type;
}

function connectionKey(connection: Pick<Connection, "id" | "direction">): string {
  return `${connection.direction}\u0000${connection.id}`;
}

function connectionFor(
  edges: readonly GraphEdge[],
  id: string,
  direction: LineageDirection,
  relation: string,
): Connection[] {
  const grouped = new Map<string, Connection>();
  const add = (
    neighborId: string,
    edgeDirection: LineageDir,
    edgeRelation: LineageRelation,
  ): void => {
    if (!relationMatches(edgeRelation, relation)) return;
    const next: Connection = {
      id: neighborId,
      direction: edgeDirection,
      relations: [edgeRelation],
    };
    const key = connectionKey(next);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, next);
      return;
    }
    const relationKey = `${edgeRelation.namespace ?? ""}\u0000${edgeRelation.type}`;
    if (!existing.relations.some((item) =>
      `${item.namespace ?? ""}\u0000${item.type}` === relationKey
    )) {
      existing.relations.push(edgeRelation);
    }
  };

  for (const edge of edges) {
    if ((direction === "up" || direction === "both") && edge.sourceId === id) {
      add(edge.targetId, "up", edge.relation);
    }
    if ((direction === "down" || direction === "both") && edge.targetId === id) {
      add(edge.sourceId, "down", edge.relation);
    }
  }
  return [...grouped.values()];
}

function stateFor(
  concept: Concept | undefined,
  report: ProfileReport | null | undefined,
  asOfDay: string,
): LineageState {
  return concept ? assessReliability(concept, report, asOfDay).state : "missing";
}

function stateMatches(state: LineageState, validity: LineageValidity): boolean {
  if (validity === "all") return true;
  if (validity === "current") return state === "current";
  return state !== "current";
}

/**
 * A bounded spanning tree of transitive relatives in one direction.
 *
 * Cycles and already-rendered diamond branches remain visible as labelled
 * reference leaves. Hubs, depth, and the global node budget state how much was
 * omitted instead of silently ending the tree.
 */
export function lineageTree(
  bundle: Bundle | null,
  rootId: string | null,
  dir: LineageDir,
  maxDepth = MAX_LINEAGE_DEPTH,
  options: LineageTraversalOptions = {},
): LineageNode | null {
  if (!bundle || !rootId) return null;
  const byId = new Map(bundle.concepts.map((concept) => [concept.id, concept] as const));
  if (!byId.has(rootId)) return null;

  const edges = graphEdges(bundle, options.report);
  const relation = options.relation ?? "all";
  const validity = options.validity ?? "all";
  const asOfDay = options.asOfDay ?? "1970-01-01";
  const maxNodes = Math.max(1, options.maxNodes ?? MAX_LINEAGE_NODES);
  const maxNeighbors = Math.max(1, options.maxNeighbors ?? MAX_LINEAGE_NEIGHBORS);
  const visited = new Set<string>([rootId]);
  let usedNodes = 1;

  const makeNode = (
    id: string,
    depth: number,
    direction: LineageDir | null,
    relations: LineageRelation[],
    ancestors: Set<string>,
    reference?: LineageReference,
  ): LineageNode => {
    const concept = byId.get(id);
    const node: LineageNode = {
      id,
      title: concept?.title ?? id,
      type: concept?.type ?? "",
      state: stateFor(concept, options.report, asOfDay),
      direction,
      relations,
      children: [],
      ...(reference ? { reference } : {}),
    };
    if (!concept || reference) return node;

    const candidates = connectionFor(edges, id, dir, relation)
      .filter((connection) =>
        stateMatches(
          stateFor(byId.get(connection.id), options.report, asOfDay),
          validity,
        )
      )
      .sort((left, right) => {
        const leftTitle = byId.get(left.id)?.title ?? left.id;
        const rightTitle = byId.get(right.id)?.title ?? right.id;
        return leftTitle.localeCompare(rightTitle)
          || left.id.localeCompare(right.id)
          || left.direction.localeCompare(right.direction);
      });
    if (candidates.length === 0) return node;
    if (depth >= maxDepth) {
      node.truncated = true;
      node.truncationReason = "depth";
      node.omitted = candidates.length;
      return node;
    }

    const selected = candidates.slice(0, maxNeighbors);
    if (selected.length < candidates.length) {
      node.truncated = true;
      node.truncationReason = "hub";
      node.omitted = candidates.length - selected.length;
    }
    for (let index = 0; index < selected.length; index += 1) {
      const connection = selected[index];
      if (usedNodes >= maxNodes) {
        node.truncated = true;
        node.truncationReason = "budget";
        node.omitted = (node.omitted ?? 0) + selected.length - index;
        break;
      }
      usedNodes += 1;
      if (ancestors.has(connection.id)) {
        node.children.push(makeNode(
          connection.id,
          depth + 1,
          connection.direction,
          connection.relations,
          ancestors,
          "cycle",
        ));
        continue;
      }
      if (visited.has(connection.id)) {
        node.children.push(makeNode(
          connection.id,
          depth + 1,
          connection.direction,
          connection.relations,
          ancestors,
          "seen",
        ));
        continue;
      }
      visited.add(connection.id);
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(connection.id);
      node.children.push(makeNode(
        connection.id,
        depth + 1,
        connection.direction,
        connection.relations,
        nextAncestors,
      ));
    }
    return node;
  };

  return makeNode(rootId, 0, null, [], new Set([rootId]));
}

/** Count distinct expanded nodes; cycle and diamond reference leaves do not inflate the total. */
export function lineageSize(node: LineageNode | null): number {
  if (!node) return 0;
  return (node.reference ? 0 : 1)
    + node.children.reduce((count, child) => count + lineageSize(child), 0);
}

export function explainedPathBetween(
  bundle: Bundle | null,
  aId: string,
  bId: string,
  direction: LineageDirection = "both",
  options: LineageTraversalOptions = {},
): ExplainedLineagePath | null {
  if (!bundle) return null;
  const byId = new Map(bundle.concepts.map((concept) => [concept.id, concept] as const));
  if (!byId.has(aId) || !byId.has(bId)) return null;
  if (aId === bId) return { ids: [aId], steps: [], visited: 1, truncated: false };

  const edges = graphEdges(bundle, options.report);
  const relation = options.relation ?? "all";
  const validity = options.validity ?? "all";
  const asOfDay = options.asOfDay ?? "1970-01-01";
  const maxVisits = Math.max(1, options.maxNodes ?? MAX_PATH_VISITS);
  const previous = new Map<string, {
    id: string | null;
    connection: Connection | null;
  }>([[aId, { id: null, connection: null }]]);
  const queue: string[] = [aId];
  let truncated = false;
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (current === bId) break;
    const connections = connectionFor(edges, current, direction, relation)
      .filter((connection) => byId.has(connection.id))
      .filter((connection) =>
        connection.id === bId
        || stateMatches(
          stateFor(byId.get(connection.id), options.report, asOfDay),
          validity,
        )
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const connection of connections) {
      if (previous.has(connection.id)) continue;
      if (previous.size >= maxVisits) {
        truncated = true;
        break;
      }
      previous.set(connection.id, { id: current, connection });
      queue.push(connection.id);
    }
    if (truncated) break;
  }
  if (!previous.has(bId)) {
    return truncated
      ? { ids: [], steps: [], visited: previous.size, truncated: true }
      : null;
  }

  const ids: string[] = [];
  const steps: ExplainedLineageStep[] = [];
  let current: string | null = bId;
  while (current !== null) {
    ids.unshift(current);
    const entry = previous.get(current);
    if (entry?.id && entry.connection) {
      steps.unshift({
        fromId: entry.id,
        toId: current,
        direction: entry.connection.direction,
        relations: entry.connection.relations,
      });
    }
    current = entry?.id ?? null;
  }
  return { ids, steps, visited: previous.size, truncated };
}

/** Backward-compatible identity-only shortest path over the ordinary graph. */
export function pathBetween(
  bundle: Bundle | null,
  aId: string,
  bId: string,
): string[] | null {
  return explainedPathBetween(bundle, aId, bId)?.ids ?? null;
}

const MIN_MENTION_LEN = 4;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function unlinkedMentions(bundle: Bundle | null, concept: Concept | null): string[] {
  if (!bundle || !concept) return [];
  const text = `${concept.description} ${concept.body}`.toLowerCase();
  if (!text.trim()) return [];
  const linked = new Set(concept.links);
  const output: string[] = [];
  for (const candidate of bundle.concepts) {
    if (candidate.id === concept.id || linked.has(candidate.id)) continue;
    const title = candidate.title.trim().toLowerCase();
    if (title.length < MIN_MENTION_LEN) continue;
    const expression = new RegExp(`(?<![a-z0-9])${escapeRegExp(title)}(?![a-z0-9])`);
    if (expression.test(text)) output.push(candidate.id);
  }
  return output;
}
