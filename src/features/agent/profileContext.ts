import type {
  ProfileDiagnostic,
  ProfileField,
  ProfileReport,
  ProfileResolution,
} from "@/shared/types.ts";
import type { OkfTaskId } from "@/features/agent/taskContext.ts";

const PROFILE_TASKS: ReadonlySet<OkfTaskId> = new Set([
  "okf-create",
  "okf-audit",
  "okf-migrate",
  "okf-revise",
]);
const MAX_PROFILES = 8;
const MAX_FIELDS = 48;
const MAX_RELATIONSHIPS = 48;
const MAX_DIAGNOSTICS = 64;
const MAX_EXAMPLES = 4;
const MAX_EXAMPLE_CHARS = 256;

export function taskUsesAdvisoryProfiles(taskId: OkfTaskId): boolean {
  return PROFILE_TASKS.has(taskId);
}

export type ProfileRequirementLabel =
  | "OKF-required"
  | "Profile-required"
  | "Recommended";

export interface ProfileTaskField {
  id: string;
  scope: "bundle" | "concept";
  key: string;
  label: string;
  description: string;
  valueType: "string" | "number" | "boolean" | "array" | "object";
  requirement: ProfileRequirementLabel;
  conceptTypes: string[];
  examples: string[];
}

export interface ProfileTaskRelationship {
  id: string;
  label: string;
  inverse: string | null;
  description: string;
}

export interface ProfileTaskDiagnostic {
  namespace: string;
  ruleId: string;
  level: "information" | "recommendation" | "warning";
  file: string;
  conceptId: string | null;
  field: string;
  message: string;
  basis: "profile-advice";
}

export interface ProfileTaskProfile {
  namespace: string;
  version: string | null;
  descriptorPath: string | null;
  status: "active" | "unavailable";
  message: string;
  title: string | null;
  fields: ProfileTaskField[];
  relationships: ProfileTaskRelationship[];
}

export interface OkfProfileTaskContext {
  schemaVersion: 1;
  basis: "advisory-profile";
  conformanceBoundary: "Profile advice does not change OKF validation.";
  coreRequirements: [{ key: "type"; requirement: "OKF-required" }];
  profiles: ProfileTaskProfile[];
  diagnostics: ProfileTaskDiagnostic[];
  truncated: boolean;
}

function exampleText(value: unknown): string {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = "[unavailable example]";
    }
  }
  const characters = Array.from(text);
  return characters.length > MAX_EXAMPLE_CHARS
    ? `${characters.slice(0, MAX_EXAMPLE_CHARS).join("")}…`
    : text;
}

function requirement(field: ProfileField): ProfileRequirementLabel {
  if (field.key === "type") return "OKF-required";
  return field.expectation === "required" ? "Profile-required" : "Recommended";
}

function taskProfile(profile: ProfileResolution): ProfileTaskProfile {
  const descriptor = profile.descriptor;
  return {
    namespace: profile.namespace,
    version: profile.version,
    descriptorPath: profile.descriptorPath,
    status: profile.status,
    message: profile.message,
    title: descriptor?.title ?? null,
    fields: (descriptor?.fields ?? []).slice(0, MAX_FIELDS).map((field) => ({
      id: field.id,
      scope: field.scope,
      key: field.key,
      label: field.label,
      description: field.description,
      valueType: field.valueType,
      requirement: requirement(field),
      conceptTypes: field.conceptTypes.slice(0, 32),
      examples: field.examples.slice(0, MAX_EXAMPLES).map(exampleText),
    })),
    relationships: (descriptor?.relationships ?? [])
      .slice(0, MAX_RELATIONSHIPS)
      .map((relationship) => ({
        id: relationship.id,
        label: relationship.label,
        inverse: relationship.inverse,
        description: relationship.description,
      })),
  };
}

function taskDiagnostic(diagnostic: ProfileDiagnostic): ProfileTaskDiagnostic {
  return {
    namespace: diagnostic.namespace,
    ruleId: diagnostic.ruleId,
    level: diagnostic.level,
    file: diagnostic.file,
    conceptId: diagnostic.conceptId,
    field: diagnostic.field,
    message: diagnostic.message,
    basis: "profile-advice",
  };
}

export function profileTaskContext(
  taskId: OkfTaskId,
  report: ProfileReport | null | undefined,
): OkfProfileTaskContext | null {
  if (!taskUsesAdvisoryProfiles(taskId) || !report || report.profiles.length === 0) return null;
  const profiles = report.profiles.slice(0, MAX_PROFILES).map(taskProfile);
  const diagnostics = report.diagnostics.slice(0, MAX_DIAGNOSTICS).map(taskDiagnostic);
  const truncated = report.truncated
    || report.profiles.length > profiles.length
    || report.diagnostics.length > diagnostics.length
    || report.profiles.some((profile) => {
      const descriptor = profile.descriptor;
      return descriptor !== null && (
        descriptor.fields.length > MAX_FIELDS
        || descriptor.relationships.length > MAX_RELATIONSHIPS
        || descriptor.fields.some((field) => field.examples.length > MAX_EXAMPLES)
      );
    });
  return {
    schemaVersion: 1,
    basis: "advisory-profile",
    conformanceBoundary: "Profile advice does not change OKF validation.",
    coreRequirements: [{ key: "type", requirement: "OKF-required" }],
    profiles,
    diagnostics,
    truncated,
  };
}
