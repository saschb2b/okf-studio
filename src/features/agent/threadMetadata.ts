import type { AcceptedOkfContextManifest, OkfTaskId } from "@/features/agent/taskContext.ts";
import { isOkfTaskId, OKF_TASKS } from "@/features/agent/taskContext.ts";

/**
 * One prompt as the user typed it, with its position among the thread's user
 * messages.
 *
 * Studio cannot recover this from the agent. A prompt is sent as one turn whose
 * blocks are Studio's preamble, capability resources, attached sources and the
 * typed text, and an adapter is free to store that however it likes:
 * claude-agent-acp flattens Resource blocks into `<context ref="…">` envelopes
 * and pushes every resource URI into the message as a link, so `session/load`
 * replays a "user message" that is mostly Studio's own scaffolding run together
 * with the question. Guessing which part was typed is a losing game across
 * adapters, so Studio records what it knows.
 *
 * The ordinal is stored rather than implied by array position: the list is
 * trimmed to its most recent entries, and matching by position would then
 * attribute the wrong prompt to every message in a long thread.
 */
export interface AgentThreadPrompt {
  index: number;
  text: string;
}

export interface AgentThreadMetadata {
  bundleRoot: string;
  profileId: string;
  sessionId: string;
  title: string;
  archived: boolean;
  taskId: OkfTaskId | null;
  contextManifest: AcceptedOkfContextManifest | null;
  prompts: AgentThreadPrompt[];
  updatedAt: number;
}

export const AGENT_THREAD_METADATA_CAP = 50;

/** Kept per thread. Older prompts fall away before the thread itself does. */
export const AGENT_THREAD_PROMPT_CAP = 32;

const LIMITS = {
  bundleRoot: 4_096,
  profileId: 256,
  sessionId: 1_024,
  title: 80,
  contextManifest: 64 * 1024,
  promptText: 4_096,
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

/**
 * Prompt text, which unlike every other field here is allowed newlines and
 * tabs: people write multi-line prompts, and `isBoundedText` rejects every
 * control character, so reusing it would have silently dropped exactly the
 * prompts most worth keeping.
 */
function isPromptText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= LIMITS.promptText &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return (code <= 31 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    });
}

function parseThreadPrompts(value: unknown): AgentThreadPrompt[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value
    .filter((item): item is AgentThreadPrompt => {
      if (!item || typeof item !== "object") return false;
      const prompt = item as Record<string, unknown>;
      return typeof prompt.index === "number" && Number.isSafeInteger(prompt.index) &&
        prompt.index >= 0 && isPromptText(prompt.text);
    })
    .map((prompt) => ({ index: prompt.index, text: prompt.text }))
    .filter((prompt) => {
      if (seen.has(prompt.index)) return false;
      seen.add(prompt.index);
      return true;
    })
    .sort((left, right) => left.index - right.index)
    .slice(-AGENT_THREAD_PROMPT_CAP);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStringList(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit &&
    value.every((item) => isBoundedText(item, 256));
}

function isBoundedStringList(
  value: unknown,
  itemCount: number,
  itemLength: number,
): value is string[] {
  return Array.isArray(value) && value.length <= itemCount &&
    value.every((item) => isBoundedText(item, itemLength));
}

function isAccessHints(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const access = value as Record<string, unknown>;
  return typeof access.hasMetadata === "boolean" &&
    isBoundedStringList(access.audiences, 16, 128) &&
    isOptionalBoundedText(access.sensitivity, 128) &&
    (
      access.knownSensitivity === null ||
      typeof access.knownSensitivity === "string" &&
      ["public", "internal", "confidential", "restricted"]
        .includes(access.knownSensitivity)
    ) &&
    isOptionalBoundedText(access.handlingNotes, 512) &&
    isBoundedStringList(access.diagnostics, 8, 512);
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
        isSafeCount(object.estimatedBytes) && isAccessHints(object.access);
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
  let serializedManifestBytes: number;
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
    // Threads written before prompts were recorded simply have none, and the
    // restore path falls back for them rather than failing to parse.
    prompts: parseThreadPrompts(raw.prompts),
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
  input: Omit<
    AgentThreadMetadata,
    "updatedAt" | "archived" | "taskId" | "contextManifest" | "prompts"
  > & {
    archived?: boolean;
    taskId?: OkfTaskId | null;
    contextManifest?: AcceptedOkfContextManifest | null;
    prompts?: readonly AgentThreadPrompt[];
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
    prompts: input.prompts ?? [],
    updatedAt,
  });
  if (!metadata) {
    throw new Error("The thread metadata is invalid or exceeds its storage limit.");
  }
  return metadata;
}

/** Append or replace the prompt at `index`, keeping the list ordered and capped. */
export function withThreadPrompt(
  current: readonly AgentThreadPrompt[],
  index: number,
  text: string,
): AgentThreadPrompt[] {
  return parseThreadPrompts([
    ...current.filter((prompt) => prompt.index !== index),
    { index, text },
  ]);
}

/**
 * Restore a replayed transcript using the prompts Studio recorded.
 *
 * The agent's replay decides the shape of the thread — how many messages there
 * are and in what order — because it is the only record of the agent's side.
 * But every user message it hands back has been through the adapter's storage
 * format, so where Studio has its own record of that prompt, that wins.
 *
 * A user message with no recorded prompt is left exactly as replayed, so a
 * thread carrying no prompts — one started outside Studio, say — stays readable
 * rather than being guessed at fragment by fragment.
 */
export function restoreThreadPrompts<T extends { role: string; text: string }>(
  messages: readonly T[],
  prompts: readonly AgentThreadPrompt[],
): T[] {
  if (prompts.length === 0) return [...messages];
  const byIndex = new Map(prompts.map((prompt) => [prompt.index, prompt.text]));
  let userIndex = 0;
  return messages.map((message) => {
    if (message.role !== "user") return message;
    const recorded = byIndex.get(userIndex);
    userIndex += 1;
    return recorded === undefined ? message : { ...message, text: recorded };
  });
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
