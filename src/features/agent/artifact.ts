export type AgentArtifactKind =
  | "source-inventory"
  | "bundle-plan"
  | "health-report"
  | "research-brief"
  | "change-impact-map"
  | "migration-plan"
  | "writing-revision"
  | "staged-revision";

export type AgentArtifactStatus = "partial" | "complete";
export type AgentArtifactSourceKind = "bundle" | "attachment" | "external";
export type AgentArtifactItemStatus =
  | "pending"
  | "in-progress"
  | "complete"
  | "blocked"
  | "advisory"
  | "unchanged"
  | "reworded"
  | "added"
  | "removed";

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
  before?: string | null;
  after?: string | null;
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
  verification: AgentArtifactVerification;
}

export type AgentArtifactVerificationCategory =
  | "completeness"
  | "evidence"
  | "identity";
export type AgentArtifactVerificationLevel = "error" | "warning";

export interface AgentArtifactVerificationFinding {
  ruleId: string;
  ruleVersion: number;
  category: AgentArtifactVerificationCategory;
  level: AgentArtifactVerificationLevel;
  message: string;
  fieldIds: readonly string[];
  conceptIds: readonly string[];
  sourceIds: readonly string[];
}

export interface AgentArtifactVerification {
  errors: number;
  warnings: number;
  completionBlocked: boolean;
  findings: readonly AgentArtifactVerificationFinding[];
}

export type AgentCriticCategory =
  | "coverage"
  | "contradictions"
  | "unsupported-claims"
  | "missed-relationships"
  | "clarity"
  | "redundancy"
  | "structure"
  | "voice-fit"
  | "claim-preservation";
export type AgentCriticCheckStatus = "checked" | "unavailable";
export type AgentCriticFindingSeverity = "error" | "warning" | "question";
export type AgentCriticFindingBasis = "evidence" | "inference";
export type AgentCriticReferenceKind = "field" | "concept" | "source";
export type AgentCriticRuleRelationship = "agrees" | "disagrees";
export type AgentCriticOutcome = "concerns-found" | "no-concerns" | "inconclusive";

export interface AgentCriticLimitation {
  code: string;
  detail: string;
}

export interface AgentCriticRequest {
  artifactId: string;
  artifactRevision: number;
  bundleFingerprint: string;
  prompt: string;
  contextPaths: readonly string[];
  deterministicVerification: AgentArtifactVerification;
  limitations: readonly AgentCriticLimitation[];
}

export interface AgentCriticCheck {
  category: AgentCriticCategory;
  status: AgentCriticCheckStatus;
  detail: string;
}

export interface AgentCriticReference {
  kind: AgentCriticReferenceKind;
  id: string;
}

export interface AgentCriticFinding {
  id: string;
  category: AgentCriticCategory;
  severity: AgentCriticFindingSeverity;
  basis: AgentCriticFindingBasis;
  claim: string;
  references: readonly AgentCriticReference[];
  deterministicRuleIds: readonly string[];
  deterministicRelationship: AgentCriticRuleRelationship | null;
}

export interface AgentCriticComparison {
  agreements: readonly string[];
  disagreements: readonly string[];
  unverifiedQuestions: readonly string[];
}

export interface AgentCriticReport {
  artifactId: string;
  artifactRevision: number;
  bundleFingerprint: string;
  outcome: AgentCriticOutcome;
  completionBlocked: boolean;
  checks: readonly AgentCriticCheck[];
  findings: readonly AgentCriticFinding[];
  limitations: readonly AgentCriticLimitation[];
  comparison: AgentCriticComparison;
}

export type AgentCriticValidation =
  | { status: "invalid"; message: string }
  | { status: "ready"; report: AgentCriticReport };

export type AgentCriticState =
  | { status: "idle" }
  | { status: "loading"; limitations: readonly AgentCriticLimitation[] }
  | { status: "ready"; report: AgentCriticReport; providerLimitations: readonly string[] }
  | { status: "error"; message: string; limitations: readonly AgentCriticLimitation[] };

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
  "writing-revision": "Writing revision",
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
