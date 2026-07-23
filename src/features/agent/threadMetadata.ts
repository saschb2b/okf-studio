import type { AcceptedOkfContextManifest, OkfTaskId } from "@/features/agent/taskContext.ts";
import { isOkfTaskId, OKF_TASKS } from "@/features/agent/taskContext.ts";

export interface AgentThreadMetadata {
  bundleRoot: string;
  profileId: string;
  sessionId: string;
  title: string;
  archived: boolean;
  taskId: OkfTaskId | null;
  contextManifest: AcceptedOkfContextManifest | null;
  updatedAt: number;
}

export const AGENT_THREAD_METADATA_CAP = 50;

const LIMITS = {
  bundleRoot: 4_096,
  profileId: 256,
  sessionId: 1_024,
  title: 80,
  contextManifest: 64 * 1024,
} as const;

const LEGACY_WORKFLOW_TASKS = {
  "create-bundle": "okf-create",
  "enhance-bundle": "okf-enrich",
  "deep-research": "okf-research",
  "dataset-change": "okf-change-impact",
} as const;

function isBoundedText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
}

function isBoundedString(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
}

function isOptionalBoundedText(value: unknown, limit: number): value is string | null {
  return value === null || (
    typeof value === "string" && value.length <= limit &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  );
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStringList(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit &&
    value.every((item) => isBoundedText(item, 256));
}

function isProfileContext(value: unknown, taskId: OkfTaskId): boolean {
  if (value === undefined || value === null) return true;
  if (!["okf-create", "okf-audit", "okf-migrate", "okf-revise"].includes(taskId) ||
    typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  if (context.schemaVersion !== 1 || context.basis !== "advisory-profile" ||
    context.conformanceBoundary !== "Profile advice does not change OKF validation." ||
    typeof context.truncated !== "boolean" ||
    !Array.isArray(context.coreRequirements) || context.coreRequirements.length !== 1) {
    return false;
  }
  const core = context.coreRequirements[0] as Record<string, unknown> | undefined;
  if (core?.key !== "type" || core.requirement !== "OKF-required") return false;
  if (!Array.isArray(context.profiles) || context.profiles.length > 8 ||
    !context.profiles.every((item) => {
      if (!item || typeof item !== "object") return false;
      const profile = item as Record<string, unknown>;
      if (!(isBoundedText(profile.namespace, 128) &&
        isOptionalBoundedText(profile.version, 64) &&
        isOptionalBoundedText(profile.descriptorPath, 512) &&
        ["active", "unavailable"].includes(String(profile.status)) &&
        isBoundedText(profile.message, 512) &&
        isOptionalBoundedText(profile.title, 512) &&
        Array.isArray(profile.fields) && profile.fields.length <= 48 &&
        Array.isArray(profile.relationships) && profile.relationships.length <= 48)) {
        return false;
      }
      const fieldsValid = profile.fields.every((fieldValue) => {
        if (!fieldValue || typeof fieldValue !== "object") return false;
        const field = fieldValue as Record<string, unknown>;
        return isBoundedText(field.id, 128) &&
          ["bundle", "concept"].includes(String(field.scope)) &&
          isBoundedText(field.key, 256) &&
          isBoundedText(field.label, 512) &&
          isBoundedString(field.description, 512) &&
          ["string", "number", "boolean", "array", "object"].includes(
            String(field.valueType),
          ) &&
          ["OKF-required", "Profile-required", "Recommended"].includes(
            String(field.requirement),
          ) &&
          isStringList(field.conceptTypes, 32) &&
          Array.isArray(field.examples) && field.examples.length <= 4 &&
          field.examples.every((example) => isBoundedString(example, 257));
      });
      const relationshipsValid = profile.relationships.every((relationshipValue) => {
        if (!relationshipValue || typeof relationshipValue !== "object") return false;
        const relationship = relationshipValue as Record<string, unknown>;
        return isBoundedText(relationship.id, 128) &&
          isBoundedText(relationship.label, 512) &&
          isOptionalBoundedText(relationship.inverse, 128) &&
          isBoundedString(relationship.description, 512);
      });
      return fieldsValid && relationshipsValid;
    })) return false;
  if (!Array.isArray(context.edges) || context.edges.length > 128 ||
    !context.edges.every((item) => {
      if (!item || typeof item !== "object") return false;
      const edge = item as Record<string, unknown>;
      return isBoundedText(edge.sourceId, 512) &&
        isBoundedText(edge.targetId, 512) &&
        isBoundedText(edge.namespace, 128) &&
        isBoundedText(edge.type, 128) &&
        isBoundedText(edge.label, 512) &&
        isOptionalBoundedText(edge.inverse, 128) &&
        typeof edge.recognized === "boolean" &&
        typeof edge.targetExists === "boolean" &&
        typeof edge.portableLink === "boolean";
    })) return false;
  return Array.isArray(context.diagnostics) && context.diagnostics.length <= 64 &&
    context.diagnostics.every((item) => {
      if (!item || typeof item !== "object") return false;
      const diagnostic = item as Record<string, unknown>;
      return isBoundedText(diagnostic.namespace, 128) &&
        isBoundedText(diagnostic.ruleId, 128) &&
        ["information", "recommendation", "warning"].includes(String(diagnostic.level)) &&
        isBoundedText(diagnostic.file, 1_024) &&
        isOptionalBoundedText(diagnostic.conceptId, 1_024) &&
        isBoundedText(diagnostic.field, 256) &&
        isBoundedText(diagnostic.message, 512) &&
        diagnostic.basis === "profile-advice";
    });
}

function isAcceptedContextManifest(value: unknown, serializedBytes: number): value is AcceptedOkfContextManifest {
  if (!value || typeof value !== "object" || serializedBytes > LIMITS.contextManifest) return false;
  const manifest = value as Record<string, unknown>;
  if (manifest.accepted !== true || manifest.schemaVersion !== 1 || !isOkfTaskId(manifest.taskId)) {
    return false;
  }
  const task = OKF_TASKS[manifest.taskId];
  if (!(isStringList(manifest.capabilityIds, 16) &&
    manifest.capabilityIds.length === task.capabilityIds.length &&
    manifest.capabilityIds.every((item, index) => item === task.capabilityIds[index]) &&
    isStringList(manifest.tools, 16) &&
    manifest.tools.length === task.tools.length &&
    manifest.tools.every((item, index) => item === task.tools[index]) &&
    manifest.network === task.network && manifest.writes === task.writes &&
    isBoundedText(manifest.bundleFingerprint, 128) &&
    manifest.bundleFingerprint.startsWith("okf-revision-"))) {
    return false;
  }
  if (!Array.isArray(manifest.objects) || manifest.objects.length > 64 ||
    !manifest.objects.every((item) => {
      if (!item || typeof item !== "object") return false;
      const object = item as Record<string, unknown>;
      return isBoundedText(object.id, 1_024) && isBoundedText(object.title, 1_024) &&
        isBoundedText(object.type, 256) && isBoundedText(object.path, 4_096) &&
        ["active-concept", "graph-neighbor", "user-attachment", "validation-finding"]
          .includes(String(object.reason)) && typeof object.required === "boolean" &&
        isSafeCount(object.estimatedBytes);
    })) return false;
  if (!Array.isArray(manifest.sources) || manifest.sources.length > 64 ||
    !manifest.sources.every((item) => {
      if (!item || typeof item !== "object") return false;
      const source = item as Record<string, unknown>;
      return isBoundedText(source.id, 1_024) && isBoundedText(source.title, 1_024) &&
        isOptionalBoundedText(source.origin, 4_096) &&
        isOptionalBoundedText(source.sourceDigest, 1_024) &&
        typeof source.required === "boolean" && isSafeCount(source.estimatedBytes);
    })) return false;
  const validation = manifest.validation as Record<string, unknown> | undefined;
  const budget = manifest.budget as Record<string, unknown> | undefined;
  if (!validation || !budget || !isSafeCount(validation.errors) ||
    !isSafeCount(validation.warnings) || !isSafeCount(budget.maxBytes) ||
    !isSafeCount(budget.maxEstimatedTokens) || !isSafeCount(budget.selectedBytes) ||
    !isSafeCount(budget.selectedEstimatedTokens) || budget.selectedBytes > budget.maxBytes ||
    budget.selectedEstimatedTokens > budget.maxEstimatedTokens ||
    !isProfileContext(manifest.profileContext, manifest.taskId)) return false;
  return Array.isArray(manifest.omissions) && manifest.omissions.length <= 128 &&
    manifest.omissions.every((item) => {
      if (!item || typeof item !== "object") return false;
      const omission = item as Record<string, unknown>;
      return ["bundle-object", "source"].includes(String(omission.kind)) &&
        isBoundedText(omission.id, 1_024) &&
        ["removed-by-user", "budget-exceeded", "context-limit"].includes(String(omission.reason));
    });
}

function parseMetadata(value: unknown): AgentThreadMetadata | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AgentThreadMetadata>;
  const raw = value as Record<string, unknown>;
  const hasInvalidLegacyWorkflow = raw.taskId == null && typeof raw.workflow === "string" &&
    !(raw.workflow in LEGACY_WORKFLOW_TASKS);
  const taskId = raw.taskId ?? (
    typeof raw.workflow === "string"
      ? LEGACY_WORKFLOW_TASKS[raw.workflow as keyof typeof LEGACY_WORKFLOW_TASKS]
      : null
  );
  const contextManifest = raw.contextManifest;
  let serializedManifestBytes = 0;
  try {
    serializedManifestBytes = contextManifest == null
      ? 0
      : new TextEncoder().encode(JSON.stringify(contextManifest)).byteLength;
  } catch {
    return null;
  }
  const manifestIsValid = contextManifest === undefined || contextManifest === null ||
    isAcceptedContextManifest(contextManifest, serializedManifestBytes);
  if (!(isBoundedText(candidate.bundleRoot, LIMITS.bundleRoot) &&
    isBoundedText(candidate.profileId, LIMITS.profileId) &&
    isBoundedText(candidate.sessionId, LIMITS.sessionId) &&
    isBoundedText(candidate.title, LIMITS.title) &&
    typeof candidate.updatedAt === "number" && Number.isSafeInteger(candidate.updatedAt) &&
    candidate.updatedAt >= 0 &&
    (candidate.archived === undefined || typeof candidate.archived === "boolean") &&
    !hasInvalidLegacyWorkflow &&
    (taskId === null || isOkfTaskId(taskId)) &&
    manifestIsValid &&
    (contextManifest == null || contextManifest.taskId === taskId))) {
    return null;
  }
  return {
    bundleRoot: candidate.bundleRoot,
    profileId: candidate.profileId,
    sessionId: candidate.sessionId,
    title: candidate.title,
    archived: candidate.archived ?? false,
    taskId: taskId ?? null,
    contextManifest: contextManifest ?? null,
    updatedAt: candidate.updatedAt,
  };
}

export function parseAgentThreadMetadata(value: unknown): AgentThreadMetadata[] {
  if (!Array.isArray(value)) return [];
  const seenSessions = new Set<string>();
  return value
    .map(parseMetadata)
    .filter((metadata): metadata is AgentThreadMetadata => metadata !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((metadata) => {
      const sessionKey = JSON.stringify([
        metadata.bundleRoot,
        metadata.profileId,
        metadata.sessionId,
      ]);
      if (seenSessions.has(sessionKey)) return false;
      seenSessions.add(sessionKey);
      return true;
    })
    .slice(0, AGENT_THREAD_METADATA_CAP);
}

export function createAgentThreadMetadata(
  input: Omit<AgentThreadMetadata, "updatedAt" | "archived" | "taskId" | "contextManifest"> & {
    archived?: boolean;
    taskId?: OkfTaskId | null;
    contextManifest?: AcceptedOkfContextManifest | null;
  },
  updatedAt = Date.now(),
): AgentThreadMetadata {
  const title = input.title.replace(/\s+/gu, " ").trim();
  const metadata = parseMetadata({
    ...input,
    title,
    archived: input.archived ?? false,
    taskId: input.taskId ?? null,
    contextManifest: input.contextManifest ?? null,
    updatedAt,
  });
  if (!metadata) {
    throw new Error("The thread metadata is invalid or exceeds its storage limit.");
  }
  return metadata;
}

export function upsertAgentThreadMetadata(
  current: readonly AgentThreadMetadata[],
  metadata: AgentThreadMetadata,
): AgentThreadMetadata[] {
  return [
    metadata,
    ...current.filter((candidate) =>
      candidate.bundleRoot !== metadata.bundleRoot ||
      candidate.profileId !== metadata.profileId ||
      candidate.sessionId !== metadata.sessionId
    ),
  ].slice(0, AGENT_THREAD_METADATA_CAP);
}

export function removeAgentThreadMetadata(
  current: readonly AgentThreadMetadata[],
  bundleRoot: string,
  profileId: string,
  sessionId?: string,
): AgentThreadMetadata[] {
  return current.filter((candidate) =>
    candidate.bundleRoot !== bundleRoot || candidate.profileId !== profileId ||
    (sessionId !== undefined && candidate.sessionId !== sessionId)
  );
}
