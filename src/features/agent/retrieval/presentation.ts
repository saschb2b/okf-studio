import { RETRIEVAL_ROUTES, type RetrievalResult, type RetrievalRoute } from "./types.ts";

export interface EvidenceStatus {
  label: string;
  description: string;
}

export interface EvidenceAssessment {
  tone: "neutral" | "warning";
  title: string;
  description: string;
}

export function evidenceStatus(result: RetrievalResult): EvidenceStatus | null {
  switch (result.diagnostic.class) {
    case "ready":
      return result.evidence.requiresAbstention
        ? {
            label: "Evidence needs review",
            description: "the available excerpts do not support a confident answer",
          }
        : null;
    case "conflicting-evidence":
      return {
        label: "Conflicting evidence",
        description: "the selected sources disagree",
      };
    case "empty-results":
      return {
        label: "No supporting evidence",
        description: "the bundle did not provide an excerpt that supports this answer",
      };
    case "stale-manifest":
      return {
        label: "Evidence may be outdated",
        description: "the bundle changed after this evidence was collected",
      };
    case "low-recall":
    case "filter-mismatch":
    case "missing-metadata":
    case "budget-omission":
      return {
        label: "Evidence is incomplete",
        description: "relevant material may be missing from the selected excerpts",
      };
    case "provider-failure":
      return {
        label: "Part of search unavailable",
        description: "part of the evidence search could not be used",
      };
    case "noisy-candidates":
    case "generation-non-use":
      return {
        label: "Evidence needs review",
        description: "Studio could not confirm that the evidence cleanly supports the response",
      };
  }
}

export function evidenceAssessment(result: RetrievalResult): EvidenceAssessment {
  const itemCount = result.evidence.items.length;
  switch (result.diagnostic.class) {
    case "ready":
      return {
        tone: "neutral",
        title: "Evidence is available",
        description: `Studio found ${itemCount} excerpt${itemCount === 1 ? "" : "s"} that can support this answer.`,
      };
    case "conflicting-evidence":
      return {
        tone: "warning",
        title: "Sources disagree",
        description: "The bundle does not identify which competing claim should take precedence, so the disputed point should be treated as unresolved.",
      };
    case "empty-results":
      return {
        tone: "warning",
        title: "No supporting evidence was found",
        description: "Studio could not find a bundle excerpt that supports the answer.",
      };
    case "stale-manifest":
      return {
        tone: "warning",
        title: "This evidence may be out of date",
        description: "The bundle changed after Studio collected these excerpts.",
      };
    case "provider-failure":
      return {
        tone: "warning",
        title: "Part of the evidence search was unavailable",
        description: "Studio completed the search with fewer capabilities than requested.",
      };
    case "low-recall":
    case "filter-mismatch":
    case "missing-metadata":
    case "budget-omission":
      return {
        tone: "warning",
        title: "The evidence may be incomplete",
        description: "Relevant material may not be represented in the excerpts found for this answer.",
      };
    case "noisy-candidates":
    case "generation-non-use":
      return {
        tone: "warning",
        title: "Review the evidence before relying on the answer",
        description: "Studio found evidence, but could not confirm that it cleanly supports the response.",
      };
  }
}

export function routeLabel(route: RetrievalRoute): string {
  return RETRIEVAL_ROUTES.find((candidate) => candidate.id === route)?.label ?? route;
}
