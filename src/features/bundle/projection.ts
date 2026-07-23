import type { AccessHints, KnownSensitivity } from "@/shared/access.ts";

export interface ProjectionInput {
  recipient: string;
  recipientAudiences: string[];
  maxSensitivity: KnownSensitivity;
  includeUnknownSensitivity: boolean;
  selectedConceptIds: string[];
  sensitiveTerms: string[];
}

export type ProjectionInclusionReason = "explicit" | "transitive-link";
export type ProjectionOmissionKind = "concept" | "ignored-path";
export type ProjectionOmissionReason =
  | "not-selected"
  | "audience-mismatch"
  | "sensitivity-exceeds-maximum"
  | "unknown-sensitivity"
  | "ignored-by-rule";

export interface ProjectionConcept {
  id: string;
  title: string;
  reason: ProjectionInclusionReason;
  linkedFrom: string | null;
  access: AccessHints;
}

export interface ProjectionOmission {
  kind: ProjectionOmissionKind;
  id: string;
  title: string;
  reason: ProjectionOmissionReason;
}

export interface ProjectionLinkConsequence {
  sourceId: string;
  target: string;
  outcome: "rewritten-omitted" | "existing-broken";
  occurrences: number;
}

export interface ProjectionRedaction {
  file: string;
  category: string;
  value: string;
  occurrences: number;
}

export interface ProjectionPlan {
  schemaVersion: 1;
  revision: string;
  sourceBundleFingerprint: string;
  recipient: string;
  recipientAudiences: string[];
  maxSensitivity: KnownSensitivity;
  includeUnknownSensitivity: boolean;
  destinationFolderName: string;
  included: ProjectionConcept[];
  omissions: ProjectionOmission[];
  linkConsequences: ProjectionLinkConsequence[];
  redactions: ProjectionRedaction[];
  ignoredRuleCount: number;
  ignoredPathsTruncated: boolean;
  warnings: string[];
}

export interface ErasureFinding {
  path: string;
  category: string;
  value: string;
  occurrences: number;
}

export interface ErasureAudit {
  schemaVersion: 1;
  passed: boolean;
  checkedFiles: number;
  checkedBytes: number;
  checkedTerms: number;
  findings: ErasureFinding[];
  truncated: boolean;
  diagnostics: string[];
}

export interface ProjectionValidation {
  errors: number;
  warnings: number;
  issues: Array<{
    level: "error" | "warning";
    path: string | null;
    message: string;
  }>;
  truncated: boolean;
}

export interface ProjectionExportInput {
  planRevision: string;
  projection: ProjectionInput;
  overwriteConfirmed: boolean;
}

export interface ProjectionExportResult {
  schemaVersion: 1;
  status: "exported" | "blocked-by-audit" | "existing-destination";
  destination: string;
  destinationFolderName: string;
  auditReport: string;
  audit: ErasureAudit;
  validation: ProjectionValidation;
  sourceUnchanged: boolean;
  replacedExistingProjection: boolean;
}

