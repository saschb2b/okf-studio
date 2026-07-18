import type { AgentSourceInput } from "@/shared/ipc.ts";
import type { Issue } from "@/shared/types.ts";
import type { OkfTaskId, OkfTaskKickoff } from "@/features/agent/taskContext.ts";

export type OkfTaskOrigin =
  | {
      kind: "concept" | "graph-selection" | "search-result";
      id: string;
      title: string;
      conceptId: string;
    }
  | {
      kind: "validation-finding";
      id: string;
      title: string;
      issue: Issue;
    }
  | {
      kind: "citation";
      id: string;
      title: string;
      conceptId: string;
      url: string;
    }
  | {
      kind: "source";
      id: string;
      title: string;
      source: AgentSourceInput;
    };

export interface OkfTaskLaunchRequest {
  requestId: string;
  origin: OkfTaskOrigin;
  preferredTaskId?: OkfTaskId;
  returnFocusId?: string;
  openedBundleFingerprint: string;
}

const ORIGIN_TASKS: Readonly<Record<OkfTaskOrigin["kind"], readonly OkfTaskId[]>> = {
  concept: ["okf-audit", "okf-enrich", "okf-research", "okf-change-impact"],
  "graph-selection": ["okf-change-impact", "okf-audit", "okf-enrich"],
  "search-result": ["okf-research", "okf-change-impact", "okf-enrich"],
  "validation-finding": ["okf-repair", "okf-audit", "okf-research"],
  citation: ["okf-research", "okf-enrich", "okf-change-impact"],
  source: ["okf-enrich", "okf-research", "okf-create"],
};

export function tasksForOkfOrigin(origin: OkfTaskOrigin): readonly OkfTaskId[] {
  return ORIGIN_TASKS[origin.kind];
}

export function kickoffForOkfOrigin(
  taskId: OkfTaskId,
  origin: OkfTaskOrigin,
): OkfTaskKickoff {
  const contextConceptIds = "conceptId" in origin ? [origin.conceptId] : [];
  const sources: AgentSourceInput[] = [];
  let object = origin.title;

  if (origin.kind === "validation-finding") {
    object = `${origin.issue.level} finding: ${origin.issue.message}`;
    sources.push({
      title: `${origin.issue.level === "error" ? "Error" : "Warning"}: ${origin.issue.conceptId ?? "bundle"}`,
      content: origin.issue.message,
      origin: origin.issue.conceptId ? `${origin.issue.conceptId}.md` : "Bundle validation",
      mediaType: "text/plain",
    });
  } else if (origin.kind === "citation") {
    object = `citation ${origin.url}`;
    sources.push({
      title: `Citation from ${origin.title}`,
      content: origin.url,
      origin: origin.url,
      mediaType: "text/uri-list",
    });
  } else if (origin.kind === "source") {
    sources.push(origin.source);
  }

  return {
    taskId,
    prompt: taskPrompt(taskId, object),
    contextConceptIds,
    sources,
  };
}

function taskPrompt(taskId: OkfTaskId, object: string): string {
  const instruction: Readonly<Record<OkfTaskId, string>> = {
    "okf-create": "Plan a new OKF bundle from this evidence",
    "okf-enrich": "Propose a reviewed OKF enrichment grounded in this context",
    "okf-audit": "Audit this OKF context and explain the deterministic findings",
    "okf-repair": "Propose a reviewed repair for this OKF validation finding",
    "okf-research": "Explain this OKF context with cited evidence and separate inference",
    "okf-change-impact": "Assess the downstream OKF change impact of this context",
    "okf-migrate": "Plan an OKF migration for this context",
  };
  return `${instruction[taskId]}: ${object}. Use the attached object as the starting scope, preview any scope expansion, and keep writes staged for review.`;
}

export function okfTaskOriginLabel(origin: OkfTaskOrigin): string {
  const labels: Readonly<Record<OkfTaskOrigin["kind"], string>> = {
    concept: "Concept",
    "graph-selection": "Graph selection",
    "search-result": "Search result",
    "validation-finding": "Validation finding",
    citation: "Citation",
    source: "Source",
  };
  return labels[origin.kind];
}
