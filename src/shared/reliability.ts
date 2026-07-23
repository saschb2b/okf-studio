import type { Concept, ProfileReport } from "@/shared/types.ts";

export const RELIABILITY_PROFILE_NAMESPACE = "io.okf.reliability";

export type LifecycleValue =
  | "draft"
  | "active"
  | "deprecated"
  | "superseded"
  | "retired";

export type ReliabilityState =
  | "current"
  | "uncertain"
  | "contradicted"
  | "review-overdue"
  | "not-yet-effective"
  | "expired"
  | "deprecated"
  | "superseded"
  | "retired";

export interface ReliabilityAssessment {
  hasMetadata: boolean;
  state: ReliabilityState;
  lifecycle: LifecycleValue | null;
  confidence: number | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  reviewAfter: string | null;
  contradictedBy: string[];
  supersededBy: string[];
  diagnostics: string[];
}

function stringValue(concept: Concept, key: string): string | null {
  const value = concept.extra[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(concept: Concept, key: string): string[] {
  const value = concept.extra[key];
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  ).map((item) => item.trim()))];
}

function validDay(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value);
}

function typedTargets(
  report: ProfileReport | null | undefined,
  conceptId: string,
  type: "contradicts" | "supersedes",
): string[] {
  if (!report) return [];
  if (type === "contradicts") {
    return report.edges
      .filter((edge) => edge.type === type
        && (edge.sourceId === conceptId || edge.targetId === conceptId))
      .map((edge) => edge.sourceId === conceptId ? edge.targetId : edge.sourceId);
  }
  return report.edges
    .filter((edge) => edge.type === type && edge.targetId === conceptId)
    .map((edge) => edge.sourceId);
}

export function assessReliability(
  concept: Concept,
  report: ProfileReport | null | undefined,
  asOfDay: string,
): ReliabilityAssessment {
  const diagnostics: string[] = [];
  const lifecycleRaw = stringValue(concept, "lifecycle");
  const lifecycle = lifecycleRaw && [
    "draft",
    "active",
    "deprecated",
    "superseded",
    "retired",
  ].includes(lifecycleRaw)
    ? lifecycleRaw as LifecycleValue
    : null;
  if (lifecycleRaw && !lifecycle) diagnostics.push(`Unknown lifecycle value: ${lifecycleRaw}`);

  const confidenceRaw = concept.extra.confidence;
  const confidence = typeof confidenceRaw === "number"
    ? confidenceRaw
    : typeof confidenceRaw === "string" && confidenceRaw.trim()
      ? Number(confidenceRaw)
      : null;
  const validConfidence = confidence !== null
    && Number.isFinite(confidence)
    && confidence >= 0
    && confidence <= 1
    ? confidence
    : null;
  if (confidenceRaw !== undefined && confidenceRaw !== null && validConfidence === null) {
    diagnostics.push("Confidence must be a number from 0 to 1.");
  }

  const effectiveFrom = stringValue(concept, "effective_from")
    ?? stringValue(concept, "effective_time");
  const effectiveUntil = stringValue(concept, "effective_until");
  const reviewAfter = stringValue(concept, "review_after");
  for (const [label, value] of [
    ["effective_from", effectiveFrom],
    ["effective_until", effectiveUntil],
    ["review_after", reviewAfter],
  ] as const) {
    if (value && !validDay(value)) diagnostics.push(`${label} must start with an ISO date.`);
  }
  if (validDay(effectiveFrom) && validDay(effectiveUntil) && effectiveFrom > effectiveUntil) {
    diagnostics.push("effective_from is later than effective_until.");
  }

  const contradictedBy = [...new Set([
    ...stringList(concept, "contradicts"),
    ...typedTargets(report, concept.id, "contradicts"),
  ])].sort();
  const supersededBy = [...new Set([
    ...stringList(concept, "superseded_by"),
    ...typedTargets(report, concept.id, "supersedes"),
  ])].sort();
  if (lifecycle === "active" && supersededBy.length > 0) {
    diagnostics.push("An active concept also declares a replacement.");
  }
  if (lifecycle === "superseded" && supersededBy.length === 0) {
    diagnostics.push("A superseded concept does not name its replacement.");
  }

  let state: ReliabilityState = "current";
  if (lifecycle === "retired") state = "retired";
  else if (lifecycle === "superseded" || supersededBy.length > 0) state = "superseded";
  else if (lifecycle === "deprecated") state = "deprecated";
  else if (contradictedBy.length > 0) state = "contradicted";
  else if (validDay(effectiveFrom) && effectiveFrom.slice(0, 10) > asOfDay) {
    state = "not-yet-effective";
  } else if (validDay(effectiveUntil) && effectiveUntil.slice(0, 10) < asOfDay) {
    state = "expired";
  } else if (validDay(reviewAfter) && reviewAfter.slice(0, 10) < asOfDay) {
    state = "review-overdue";
  } else if (validConfidence !== null && validConfidence < 1) {
    state = "uncertain";
  }

  return {
    hasMetadata: [
      lifecycleRaw,
      confidenceRaw,
      effectiveFrom,
      effectiveUntil,
      reviewAfter,
      ...contradictedBy,
      ...supersededBy,
    ].some((value) => value !== null && value !== undefined),
    state,
    lifecycle,
    confidence: validConfidence,
    effectiveFrom,
    effectiveUntil,
    reviewAfter,
    contradictedBy,
    supersededBy,
    diagnostics,
  };
}

export interface ReliabilityFinding {
  ruleId: string;
  conceptIds: string[];
  message: string;
}

export function reliabilityFindings(
  concepts: readonly Concept[],
  report: ProfileReport | null | undefined,
  asOfDay: string,
): ReliabilityFinding[] {
  const findings = concepts.flatMap((concept) => assessReliability(concept, report, asOfDay)
    .diagnostics.map((message, index) => ({
      ruleId: `reliability.metadata.${index + 1}`,
      conceptIds: [concept.id],
      message,
    })));
  if (!report) return findings;

  const supersedes = report.edges.filter((edge) => edge.type === "supersedes");
  const outgoing = new Map<string, string[]>();
  for (const edge of supersedes) {
    outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge.targetId]);
  }
  const reportedCycles = new Set<string>();
  for (const start of outgoing.keys()) {
    const path: string[] = [];
    const visiting = new Set<string>();
    const walk = (id: string): void => {
      const cycleStart = path.indexOf(id);
      if (cycleStart >= 0) {
        const cycle = [...path.slice(cycleStart), id];
        const key = [...new Set(cycle)].sort().join("\u0000");
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          findings.push({
            ruleId: "reliability.supersession-cycle",
            conceptIds: [...new Set(cycle)],
            message: `Supersession cycle: ${cycle.join(" → ")}`,
          });
        }
        return;
      }
      if (visiting.has(id)) return;
      visiting.add(id);
      path.push(id);
      for (const target of outgoing.get(id) ?? []) walk(target);
      path.pop();
    };
    walk(start);
  }
  return findings;
}
