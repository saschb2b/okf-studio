export type AgentArtifactKind =
  | "source-inventory"
  | "bundle-plan"
  | "health-report"
  | "research-brief"
  | "change-impact-map"
  | "migration-plan"
  | "staged-revision";

export type AgentArtifactStatus = "partial" | "complete";
export type AgentArtifactSourceKind = "bundle" | "attachment" | "external";
export type AgentArtifactItemStatus =
  | "pending"
  | "in-progress"
  | "complete"
  | "blocked"
  | "advisory";

export interface AgentArtifactConceptReference {
  path: string;
  conceptId: string;
  exists: boolean;
}

export interface AgentArtifactSource {
  id: string;
  label: string;
  kind: AgentArtifactSourceKind;
  reference: string;
}

export interface AgentArtifactCitation {
  sourceId: string;
  claim: string;
}

export interface AgentArtifactField {
  id: string;
  label: string;
  value: string;
  editable: boolean;
}

export interface AgentArtifactItem {
  id: string;
  label: string;
  detail: string;
  status: AgentArtifactItemStatus;
  conceptPath: string | null;
  sourceIds: readonly string[];
}

export interface AgentArtifact {
  schemaVersion: 1;
  artifactId: string;
  kind: AgentArtifactKind;
  revision: number;
  parentRevision: number | null;
  bundleFingerprint: string;
  title: string;
  status: AgentArtifactStatus;
  summary: string;
  conceptReferences: readonly AgentArtifactConceptReference[];
  sources: readonly AgentArtifactSource[];
  citations: readonly AgentArtifactCitation[];
  fields: readonly AgentArtifactField[];
  items: readonly AgentArtifactItem[];
  missingFields: readonly string[];
  large: boolean;
}

export type AgentArtifactValidation =
  | { status: "none" }
  | { status: "invalid"; message: string }
  | { status: "ready"; artifact: AgentArtifact };

export const AGENT_ARTIFACT_KIND_LABELS: Readonly<Record<AgentArtifactKind, string>> = {
  "source-inventory": "Source inventory",
  "bundle-plan": "Bundle plan",
  "health-report": "Health report",
  "research-brief": "Research brief",
  "change-impact-map": "Change-impact map",
  "migration-plan": "Migration plan",
  "staged-revision": "Staged revision",
};

export function hasAgentArtifactEnvelope(text: string): boolean {
  return agentArtifactEnvelopeText(text) !== null;
}

export function agentArtifactEnvelopeText(text: string): string | null {
  const marker = "```okf-artifact";
  const start = text.lastIndexOf(marker);
  if (start < 0) return null;
  const contentStart = text.indexOf("\n", start + marker.length);
  if (contentStart < 0) return null;
  const end = text.indexOf("\n```", contentStart + 1);
  if (end < 0) return null;
  return text.slice(start, end + 4);
}

export function applyArtifactFieldEdits(
  artifact: AgentArtifact,
  values: Readonly<Partial<Record<string, string>>>,
): AgentArtifact {
  return {
    ...artifact,
    revision: artifact.revision + 1,
    parentRevision: artifact.revision,
    fields: artifact.fields.map((field) => {
      const value = values[field.id];
      return {
        ...field,
        value: field.editable && value !== undefined ? value : field.value,
      };
    }),
  };
}

export function artifactRevisionPrompt(artifact: AgentArtifact): string {
  const context = {
    schemaVersion: artifact.schemaVersion,
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    revision: artifact.revision,
    parentRevision: artifact.parentRevision,
    bundleFingerprint: artifact.bundleFingerprint,
    fields: artifact.fields.map(({ id, value }) => ({ id, value })),
  };
  return [
    `Continue from my reviewed ${AGENT_ARTIFACT_KIND_LABELS[artifact.kind].toLowerCase()} revision.`,
    "Treat this as explicit user context. Do not replace it with an update based on an older revision.",
    "",
    "```okf-artifact-revision",
    JSON.stringify(context, null, 2),
    "```",
  ].join("\n");
}
