import type { AgentSourceInput } from "@/shared/ipc.ts";
import type { Issue } from "@/shared/types.ts";

export const OKF_TASK_IDS = [
  "okf-create",
  "okf-enrich",
  "okf-audit",
  "okf-repair",
  "okf-research",
  "okf-change-impact",
  "okf-migrate",
] as const;

export type OkfTaskId = (typeof OKF_TASK_IDS)[number];

export interface OkfTaskDefinition {
  id: OkfTaskId;
  title: string;
  capabilityIds: readonly string[];
  tools: readonly ("read" | "search" | "validate" | "stage" | "web")[];
  network: boolean;
  writes: boolean;
}

export const OKF_TASKS: Readonly<Record<OkfTaskId, OkfTaskDefinition>> = {
  "okf-create": {
    id: "okf-create",
    title: "Create an OKF bundle",
    capabilityIds: ["okf-create"],
    tools: ["read", "search", "validate", "stage"],
    network: false,
    writes: true,
  },
  "okf-enrich": {
    id: "okf-enrich",
    title: "Enrich this bundle",
    capabilityIds: ["okf-inspect", "okf-enrich"],
    tools: ["read", "search", "validate", "stage"],
    network: false,
    writes: true,
  },
  "okf-audit": {
    id: "okf-audit",
    title: "Audit this bundle",
    capabilityIds: ["okf-inspect", "okf-audit"],
    tools: ["read", "search", "validate"],
    network: false,
    writes: false,
  },
  "okf-repair": {
    id: "okf-repair",
    title: "Repair validation issues",
    capabilityIds: ["okf-audit", "okf-repair"],
    tools: ["read", "search", "validate", "stage"],
    network: false,
    writes: true,
  },
  "okf-research": {
    id: "okf-research",
    title: "Research with cited evidence",
    capabilityIds: ["okf-inspect", "okf-research"],
    tools: ["read", "search", "web"],
    network: true,
    writes: false,
  },
  "okf-change-impact": {
    id: "okf-change-impact",
    title: "Assess change impact",
    capabilityIds: ["okf-inspect", "okf-change-impact"],
    tools: ["read", "search", "validate"],
    network: false,
    writes: false,
  },
  "okf-migrate": {
    id: "okf-migrate",
    title: "Plan an OKF migration",
    capabilityIds: ["okf-inspect", "okf-migrate"],
    tools: ["read", "search", "validate", "stage"],
    network: false,
    writes: true,
  },
};

export interface OkfTaskKickoff {
  taskId: OkfTaskId;
  prompt: string;
  contextConceptIds?: readonly string[];
  sources?: readonly AgentSourceInput[];
}

export interface OkfContextObject {
  id: string;
  title: string;
  type: string;
  path: string;
  reason: "active-concept" | "graph-neighbor" | "user-attachment" | "validation-finding";
  required: boolean;
  estimatedBytes: number;
}

export interface OkfContextSource {
  id: string;
  title: string;
  origin: string | null;
  sourceDigest: string | null;
  required: boolean;
  estimatedBytes: number;
}

export interface OkfContextBudget {
  maxBytes: number;
  maxEstimatedTokens: number;
  selectedBytes: number;
  selectedEstimatedTokens: number;
}

export interface OkfContextOmission {
  kind: "bundle-object" | "source";
  id: string;
  reason: "removed-by-user" | "workspace-preference" | "budget-exceeded" | "context-limit";
}

export interface OkfContextPlan {
  schemaVersion: 1;
  taskId: OkfTaskId;
  capabilityIds: readonly string[];
  tools: readonly string[];
  network: boolean;
  writes: boolean;
  bundleFingerprint: string;
  objects: readonly OkfContextObject[];
  sources: readonly OkfContextSource[];
  validation: { errors: number; warnings: number };
  budget: OkfContextBudget;
  omissions: readonly OkfContextOmission[];
}

export interface AcceptedOkfContextManifest extends OkfContextPlan {
  accepted: true;
}

interface ContextPlanInput {
  taskId: OkfTaskId;
  bundleRoot: string;
  concepts: readonly {
    id: string;
    title: string;
    type: string;
    body?: string;
    links?: readonly string[];
    timestamp?: string | null;
  }[];
  activeConcept: { id: string; title: string } | null;
  attachedConcepts: readonly { id: string; title: string; type: string }[];
  sources: readonly {
    id: string;
    title: string;
    content: string;
    origin?: string;
    sourceDigest?: string;
    imageData?: string;
  }[];
  issues: readonly Issue[];
  removedIds?: ReadonlySet<string>;
  memoryRemovedIds?: ReadonlySet<string>;
  maxBytes?: number;
}

const DEFAULT_CONTEXT_BYTES = 128 * 1024;
const MAX_CONTEXT_OBJECTS = 8;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `okf-revision-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function bundleContextFingerprint(
  bundleRoot: string,
  concepts: readonly {
    id: string;
    title: string;
    type: string;
    body?: string;
    links?: readonly string[];
    timestamp?: string | null;
  }[],
  issues: readonly Issue[],
): string {
  const conceptState = concepts
    .map(({ id, title, type, body, links, timestamp }) => [
      id,
      title,
      type,
      timestamp ?? "",
      [...(links ?? [])].sort().join("\u001c"),
      body ?? "",
    ].join("\u001f"))
    .sort()
    .join("\u001e");
  const issueState = issues
    .map(({ conceptId, level, message }) => [conceptId ?? "", level, message].join("\u001f"))
    .sort()
    .join("\u001e");
  return fingerprint(`${bundleRoot}\u001d${conceptState}\u001d${issueState}`);
}

export function createOkfContextPlan(input: ContextPlanInput): OkfContextPlan {
  const task = OKF_TASKS[input.taskId];
  const removed = input.removedIds ?? new Set<string>();
  const memoryRemoved = input.memoryRemovedIds ?? new Set<string>();
  const maxBytes = input.maxBytes ?? DEFAULT_CONTEXT_BYTES;
  const conceptById = new Map(input.concepts.map((concept) => [concept.id, concept]));
  const candidates = new Map<string, OkfContextObject>();
  const objectBytes = (concept: { id: string; title: string; type: string; body?: string }) =>
    byteLength(`${concept.id}\n${concept.title}\n${concept.type}\n${concept.body ?? ""}`);

  if (input.activeConcept) {
    const concept = conceptById.get(input.activeConcept.id);
    if (concept) {
      candidates.set(concept.id, {
        ...concept,
        path: `${concept.id}.md`,
        reason: "active-concept",
        required: false,
        estimatedBytes: objectBytes(concept),
      });
      const neighborIds = new Set(concept.links ?? []);
      for (const candidate of input.concepts) {
        if (candidate.links?.includes(concept.id)) neighborIds.add(candidate.id);
      }
      for (const neighborId of [...neighborIds].sort()) {
        const neighbor = conceptById.get(neighborId);
        if (!neighbor) continue;
        candidates.set(neighbor.id, {
          ...neighbor,
          path: `${neighbor.id}.md`,
          reason: "graph-neighbor",
          required: false,
          estimatedBytes: objectBytes(neighbor),
        });
      }
    }
  }
  for (const concept of input.attachedConcepts) {
    candidates.set(concept.id, {
      ...concept,
      path: `${concept.id}.md`,
      reason: "user-attachment",
      required: false,
      estimatedBytes: objectBytes(concept),
    });
  }
  if (input.taskId === "okf-audit" || input.taskId === "okf-repair") {
    for (const issue of input.issues) {
      if (!issue.conceptId) continue;
      const concept = conceptById.get(issue.conceptId);
      if (!concept) continue;
      candidates.set(concept.id, {
        ...concept,
        path: `${concept.id}.md`,
        reason: "validation-finding",
        required: true,
        estimatedBytes: objectBytes(concept),
      });
    }
  }

  const objectCandidates = [...candidates.values()].sort((left, right) =>
    Number(right.required) - Number(left.required) || left.path.localeCompare(right.path)
  );
  const sourceCandidates: OkfContextSource[] = input.sources.map((source) => ({
    id: source.id,
    title: source.title,
    origin: source.origin ?? null,
    sourceDigest: source.sourceDigest ?? null,
    required: false,
    estimatedBytes: byteLength(source.content) + byteLength(source.imageData ?? ""),
  })).sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));

  let selectedBytes = 0;
  const omissions: OkfContextOmission[] = [];
  const objects: OkfContextObject[] = [];
  const sources: OkfContextSource[] = [];
  const include = (kind: OkfContextOmission["kind"], id: string, bytes: number, required: boolean) => {
    if (!required && memoryRemoved.has(`${kind}:${id}`)) {
      omissions.push({ kind, id, reason: "workspace-preference" });
      return false;
    }
    if (!required && removed.has(`${kind}:${id}`)) {
      omissions.push({ kind, id, reason: "removed-by-user" });
      return false;
    }
    if (selectedBytes + bytes > maxBytes) {
      omissions.push({ kind, id, reason: "budget-exceeded" });
      return false;
    }
    selectedBytes += bytes;
    return true;
  };
  for (const object of objectCandidates) {
    if (objects.length >= MAX_CONTEXT_OBJECTS) {
      omissions.push({ kind: "bundle-object", id: object.id, reason: "context-limit" });
      continue;
    }
    if (include("bundle-object", object.id, object.estimatedBytes, object.required)) {
      objects.push(object);
    }
  }
  for (const source of sourceCandidates) {
    if (include("source", source.id, source.estimatedBytes, source.required)) {
      sources.push(source);
    }
  }

  return {
    schemaVersion: 1,
    taskId: input.taskId,
    capabilityIds: task.capabilityIds,
    tools: task.tools,
    network: task.network,
    writes: task.writes,
    bundleFingerprint: bundleContextFingerprint(input.bundleRoot, input.concepts, input.issues),
    objects,
    sources,
    validation: {
      errors: input.issues.filter((issue) => issue.level === "error").length,
      warnings: input.issues.filter((issue) => issue.level === "warning").length,
    },
    budget: {
      maxBytes,
      maxEstimatedTokens: Math.ceil(maxBytes / 4),
      selectedBytes,
      selectedEstimatedTokens: Math.ceil(selectedBytes / 4),
    },
    omissions,
  };
}

export function acceptOkfContextPlan(plan: OkfContextPlan): AcceptedOkfContextManifest {
  return { ...plan, accepted: true };
}

export function taskScopeChangeRequiresConfirmation(
  currentTaskId: OkfTaskId,
  suggestedTaskId: OkfTaskId,
): boolean {
  const current = OKF_TASKS[currentTaskId];
  const suggested = OKF_TASKS[suggestedTaskId];
  return suggested.network !== current.network || suggested.writes !== current.writes ||
    suggested.tools.some((tool) => !current.tools.includes(tool));
}

export function isOkfTaskId(value: unknown): value is OkfTaskId {
  return typeof value === "string" && (OKF_TASK_IDS as readonly string[]).includes(value);
}
