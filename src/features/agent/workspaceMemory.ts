import { OKF_TASK_IDS } from "@/features/agent/taskContext.ts";
import type { OkfTaskId } from "@/features/agent/taskContext.ts";

export const WORKSPACE_MEMORY_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_MEMORY_LIMIT = 256;

export type WorkspaceMemoryKind =
  | "preference"
  | "dismissed-finding"
  | "task-record"
  | "routine-definition";

export interface WorkspaceMemoryItem {
  schemaVersion: 1;
  id: string;
  bundleRoot: string;
  kind: WorkspaceMemoryKind;
  label: string;
  origin: "user-action" | "studio-observation" | "agent-suggestion-accepted";
  owner: "user" | "studio";
  taskId: OkfTaskId | null;
  conceptId: string | null;
  findingFingerprint: string | null;
  routineId: string | null;
  contextEffect: string | null;
  validationFingerprint: string;
  createdAt: number;
  lastValidatedAt: number;
  lastUsedAt: number | null;
  retentionDays: number;
}

export interface WorkspaceMemoryEnvelope {
  schemaVersion: 1;
  items: readonly WorkspaceMemoryItem[];
}

export interface ParsedWorkspaceMemory {
  items: WorkspaceMemoryItem[];
  rejectedCount: number;
}

const KIND_LIMITS: Readonly<Record<WorkspaceMemoryKind, number>> = {
  preference: 64,
  "dismissed-finding": 96,
  "task-record": 64,
  "routine-definition": 32,
};
const PORTABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    !hasUnsafeControl(value);
}

function hasUnsafeControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 127 || (code < 32 && ![9, 10, 13].includes(code))) return true;
  }
  return false;
}

function isOkfTaskId(value: unknown): value is OkfTaskId {
  return typeof value === "string" && OKF_TASK_IDS.some((taskId) => taskId === value);
}

function parseItem(value: unknown, now: number): WorkspaceMemoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<WorkspaceMemoryItem>;
  const taskId = item.taskId === null || isOkfTaskId(item.taskId)
    ? item.taskId
    : undefined;
  const kind = item.kind;
  const retentionDays = item.retentionDays;
  const createdAt = item.createdAt;
  const lastValidatedAt = item.lastValidatedAt;
  const lastUsedAt = item.lastUsedAt;
  if (
    item.schemaVersion !== WORKSPACE_MEMORY_SCHEMA_VERSION ||
    !boundedText(item.id, 128) || !PORTABLE_ID.test(item.id) ||
    !boundedText(item.bundleRoot, 2_048) || !boundedText(item.label, 160) ||
    !boundedText(item.validationFingerprint, 128) ||
    !["preference", "dismissed-finding", "task-record", "routine-definition"].includes(kind ?? "") ||
    !["user-action", "studio-observation", "agent-suggestion-accepted"].includes(item.origin ?? "") ||
    !["user", "studio"].includes(item.owner ?? "") || taskId === undefined ||
    typeof createdAt !== "number" || !Number.isSafeInteger(createdAt) ||
    typeof lastValidatedAt !== "number" || !Number.isSafeInteger(lastValidatedAt) ||
    (lastUsedAt !== null && (typeof lastUsedAt !== "number" || !Number.isSafeInteger(lastUsedAt))) ||
    typeof retentionDays !== "number" || !Number.isInteger(retentionDays) ||
    retentionDays < 1 || retentionDays > 365 ||
    createdAt < 0 || createdAt > now + 86_400_000 ||
    lastValidatedAt < createdAt || lastValidatedAt > now + 86_400_000
  ) return null;
  for (const optional of [item.conceptId, item.findingFingerprint, item.routineId, item.contextEffect]) {
    if (optional !== null && !boundedText(optional, optional === item.contextEffect ? 240 : 128)) return null;
  }
  if (item.kind === "preference" && (!item.taskId || !item.conceptId || !item.contextEffect)) return null;
  if (item.kind === "dismissed-finding" && !item.findingFingerprint) return null;
  if (item.kind === "task-record" && !item.taskId) return null;
  if (item.kind === "routine-definition" && !item.routineId) return null;
  if (item.owner === "studio" && item.origin !== "studio-observation") return null;
  if (item.owner === "user" && item.origin === "studio-observation") return null;
  if (createdAt + retentionDays * 86_400_000 < now) return null;
  return item as WorkspaceMemoryItem;
}

export function parseWorkspaceMemory(value: unknown, now = Date.now()): ParsedWorkspaceMemory {
  const envelope = value && typeof value === "object" ? value as Partial<WorkspaceMemoryEnvelope> : null;
  const rawItems = envelope?.schemaVersion === WORKSPACE_MEMORY_SCHEMA_VERSION &&
      Array.isArray(envelope.items)
    ? envelope.items.slice(0, WORKSPACE_MEMORY_LIMIT * 2)
    : [];
  const parsed = rawItems.map((item) => parseItem(item, now));
  const items = parsed.filter((item): item is WorkspaceMemoryItem => item !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
  const perKind = new Map<WorkspaceMemoryKind, number>();
  const bounded = items.filter((item) => {
    const count = (perKind.get(item.kind) ?? 0) + 1;
    perKind.set(item.kind, count);
    return count <= KIND_LIMITS[item.kind];
  }).slice(0, WORKSPACE_MEMORY_LIMIT);
  const rejectedCount = value == null
    ? 0
    : envelope?.schemaVersion === WORKSPACE_MEMORY_SCHEMA_VERSION && Array.isArray(envelope.items)
      ? envelope.items.length - bounded.length
      : 1;
  return { items: bounded, rejectedCount: Math.max(0, rejectedCount) };
}

export function memoryEnvelope(items: readonly WorkspaceMemoryItem[]): WorkspaceMemoryEnvelope {
  return { schemaVersion: WORKSPACE_MEMORY_SCHEMA_VERSION, items: items.slice(0, WORKSPACE_MEMORY_LIMIT) };
}

export function createOmissionPreference(input: {
  bundleRoot: string;
  taskId: OkfTaskId;
  conceptId: string;
  conceptTitle: string;
  validationFingerprint: string;
  origin?: "user-action" | "agent-suggestion-accepted";
  now?: number;
}): WorkspaceMemoryItem {
  const now = input.now ?? Date.now();
  const id = `preference:${input.taskId}:${input.conceptId}`;
  const candidate: WorkspaceMemoryItem = {
    schemaVersion: 1,
    id,
    bundleRoot: input.bundleRoot,
    kind: "preference",
    label: `Omit ${input.conceptTitle} from ${input.taskId} context`,
    origin: input.origin ?? "user-action",
    owner: "user",
    taskId: input.taskId,
    conceptId: input.conceptId,
    findingFingerprint: null,
    routineId: null,
    contextEffect: `Omit bundle-object:${input.conceptId} from future ${input.taskId} plans.`,
    validationFingerprint: input.validationFingerprint,
    createdAt: now,
    lastValidatedAt: now,
    lastUsedAt: null,
    retentionDays: 180,
  };
  const parsed = parseItem(candidate, now);
  if (!parsed) throw new Error("The workspace preference is invalid or exceeds its storage limit.");
  return parsed;
}

export function createTaskRecord(input: {
  bundleRoot: string;
  taskId: OkfTaskId;
  validationFingerprint: string;
  now?: number;
}): WorkspaceMemoryItem {
  const now = input.now ?? Date.now();
  return {
    schemaVersion: 1,
    id: `task:${input.taskId}:${now}`,
    bundleRoot: input.bundleRoot,
    kind: "task-record",
    label: `${input.taskId} started`,
    origin: "studio-observation",
    owner: "studio",
    taskId: input.taskId,
    conceptId: null,
    findingFingerprint: null,
    routineId: null,
    contextEffect: null,
    validationFingerprint: input.validationFingerprint,
    createdAt: now,
    lastValidatedAt: now,
    lastUsedAt: now,
    retentionDays: 30,
  };
}

export function activeMemoryOmissions(
  items: readonly WorkspaceMemoryItem[],
  bundleRoot: string,
  taskId: OkfTaskId,
  fingerprint: string,
): ReadonlySet<string> {
  return new Set(items.filter((item) =>
    item.bundleRoot === bundleRoot && item.kind === "preference" && item.taskId === taskId &&
    item.validationFingerprint === fingerprint && item.conceptId !== null
  ).map((item) => `bundle-object:${item.conceptId}`));
}

export function upsertWorkspaceMemory(
  current: readonly WorkspaceMemoryItem[],
  item: WorkspaceMemoryItem,
  now = Date.now(),
): WorkspaceMemoryItem[] {
  return parseWorkspaceMemory(memoryEnvelope([
    item,
    ...current.filter((candidate) => candidate.id !== item.id),
  ]), now).items;
}
