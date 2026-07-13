export type AgentThreadWorkflow =
  | "create-bundle"
  | "enhance-bundle"
  | "deep-research"
  | "dataset-change"
  | null;

export interface AgentThreadMetadata {
  bundleRoot: string;
  profileId: string;
  sessionId: string;
  title: string;
  archived: boolean;
  workflow: AgentThreadWorkflow;
  updatedAt: number;
}

export const AGENT_THREAD_METADATA_CAP = 50;

const LIMITS = {
  bundleRoot: 4_096,
  profileId: 256,
  sessionId: 1_024,
  title: 80,
} as const;

function isBoundedText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
}

function parseMetadata(value: unknown): AgentThreadMetadata | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AgentThreadMetadata>;
  const workflow = (value as Record<string, unknown>).workflow;
  if (!(isBoundedText(candidate.bundleRoot, LIMITS.bundleRoot) &&
    isBoundedText(candidate.profileId, LIMITS.profileId) &&
    isBoundedText(candidate.sessionId, LIMITS.sessionId) &&
    isBoundedText(candidate.title, LIMITS.title) &&
    typeof candidate.updatedAt === "number" && Number.isSafeInteger(candidate.updatedAt) &&
    candidate.updatedAt >= 0 &&
    (candidate.archived === undefined || typeof candidate.archived === "boolean") &&
    (workflow === undefined || workflow === null || workflow === "create-bundle" ||
      workflow === "enhance-bundle" || workflow === "deep-research" ||
      workflow === "dataset-change"))) {
    return null;
  }
  return {
    bundleRoot: candidate.bundleRoot,
    profileId: candidate.profileId,
    sessionId: candidate.sessionId,
    title: candidate.title,
    archived: candidate.archived ?? false,
    workflow: workflow ?? null,
    updatedAt: candidate.updatedAt,
  };
}

export function parseAgentThreadMetadata(value: unknown): AgentThreadMetadata[] {
  if (!Array.isArray(value)) return [];
  const seenStates = new Set<string>();
  const seenSessions = new Set<string>();
  return value
    .map(parseMetadata)
    .filter((metadata): metadata is AgentThreadMetadata => metadata !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((metadata) => {
      const stateKey = JSON.stringify([
        metadata.bundleRoot,
        metadata.profileId,
        metadata.archived,
      ]);
      const sessionKey = JSON.stringify([
        metadata.bundleRoot,
        metadata.profileId,
        metadata.sessionId,
      ]);
      if (seenStates.has(stateKey) || seenSessions.has(sessionKey)) return false;
      seenStates.add(stateKey);
      seenSessions.add(sessionKey);
      return true;
    })
    .slice(0, AGENT_THREAD_METADATA_CAP);
}

export function createAgentThreadMetadata(
  input: Omit<AgentThreadMetadata, "updatedAt" | "archived" | "workflow"> & {
    archived?: boolean;
    workflow?: AgentThreadWorkflow;
  },
  updatedAt = Date.now(),
): AgentThreadMetadata {
  const title = input.title.replace(/\s+/gu, " ").trim();
  const metadata = parseMetadata({
    ...input,
    title,
    archived: input.archived ?? false,
    workflow: input.workflow ?? null,
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
      (candidate.archived !== metadata.archived && candidate.sessionId !== metadata.sessionId)
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
