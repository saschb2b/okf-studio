export interface AgentThreadMetadata {
  bundleRoot: string;
  profileId: string;
  sessionId: string;
  title: string;
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

function isAgentThreadMetadata(value: unknown): value is AgentThreadMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentThreadMetadata>;
  return isBoundedText(candidate.bundleRoot, LIMITS.bundleRoot) &&
    isBoundedText(candidate.profileId, LIMITS.profileId) &&
    isBoundedText(candidate.sessionId, LIMITS.sessionId) &&
    isBoundedText(candidate.title, LIMITS.title) &&
    typeof candidate.updatedAt === "number" && Number.isSafeInteger(candidate.updatedAt) &&
    candidate.updatedAt >= 0;
}

export function parseAgentThreadMetadata(value: unknown): AgentThreadMetadata[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter(isAgentThreadMetadata)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((metadata) => {
      const key = JSON.stringify([metadata.bundleRoot, metadata.profileId]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, AGENT_THREAD_METADATA_CAP);
}

export function createAgentThreadMetadata(
  input: Omit<AgentThreadMetadata, "updatedAt">,
  updatedAt = Date.now(),
): AgentThreadMetadata {
  const title = input.title.replace(/\s+/gu, " ").trim();
  const metadata = { ...input, title, updatedAt };
  if (!isAgentThreadMetadata(metadata)) {
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
      candidate.bundleRoot !== metadata.bundleRoot || candidate.profileId !== metadata.profileId
    ),
  ].slice(0, AGENT_THREAD_METADATA_CAP);
}

export function removeAgentThreadMetadata(
  current: readonly AgentThreadMetadata[],
  bundleRoot: string,
  profileId: string,
): AgentThreadMetadata[] {
  return current.filter((candidate) =>
    candidate.bundleRoot !== bundleRoot || candidate.profileId !== profileId
  );
}
