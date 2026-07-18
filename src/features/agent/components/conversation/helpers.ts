import type { AgentSecurityScopeInfo } from "@/features/agent/connection.ts";
import type { OkfTaskKickoff } from "@/features/agent/taskContext.ts";
import type { Issue } from "@/shared/types.ts";
import { Database, Search, Sparkles, WandSparkles } from "lucide-react";
import type { AttachedSource, AgentUsage } from "./types.ts";

export const BUNDLE_PROPOSAL_INSTRUCTIONS =
  "End with exactly one fenced `okf-proposal` JSON block shaped as `{\"concepts\":[{\"path\":\"concept.md\",\"title\":\"Concept\",\"type\":\"Concept type\",\"links\":[\"related.md\"]}],\"indexes\":[{\"path\":\"index.md\",\"concepts\":[\"concept.md\"]}]}`. Use bundle-relative Markdown paths and make every index member name a proposed concept.";
export const BUNDLE_GENERATION_PROMPT =
  "Generate the newest reviewed `okf-proposal` into Studio staging now. Create conformant Markdown with the proposed paths, titles, types, links, and indexes. Preserve authored facts, include source provenance where the attached evidence supports it, and use only Studio-mediated staged writes. Do not apply changes to the bundle.";

export const THREAD_STARTERS = [
  {
    title: "Create bundle",
    description: "Turn attached evidence into a proposed OKF structure.",
    prompt: `Create a new OKF bundle from the sources I attach. First inspect the evidence, then propose the concepts, types, links, and indexes. Do not write files yet. ${BUNDLE_PROPOSAL_INSTRUCTIONS}`,
    taskId: "okf-create",
    icon: WandSparkles,
  },
  {
    title: "Enhance bundle",
    description: "Find useful additions without replacing authored facts.",
    prompt: `Review this OKF bundle and the sources I attach. Propose additions or corrections without overwriting authored facts. Include only additions or changed concepts and do not write files yet. ${BUNDLE_PROPOSAL_INSTRUCTIONS}`,
    taskId: "okf-enrich",
    icon: Sparkles,
  },
  {
    title: "Request dataset change",
    description: "Map a requested change to affected knowledge.",
    prompt: "Assess this dataset documentation and propose a change plan. Identify dependencies, validation risks, and supporting evidence. End with `## Change Plan` containing actionable steps and `## Affected Concepts` containing one bundle-relative `.md` path per bullet. Do not write files yet: ",
    taskId: "okf-change-impact",
    icon: Database,
  },
  {
    title: "Deep research",
    description: "Trace a question through the bundle and sources.",
    prompt: "Research this question across the active bundle and attached sources. Cite the evidence for each finding. End with `## Sources` containing one bullet per cited source and `## Inferences` containing each inference or `None.`: ",
    taskId: "okf-research",
    icon: Search,
  },
] as const satisfies readonly (OkfTaskKickoff & {
  title: string;
  description: string;
  icon: typeof WandSparkles;
})[];

export const MAX_THREAD_TITLE_CHARS = 80;

export function usageCostLabel(cost: AgentUsage["cost"]): string | null {
  if (!cost) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cost.currency,
      maximumFractionDigits: 4,
    }).format(cost.amount);
  } catch {
    return `${cost.currency} ${cost.amount.toFixed(4).replace(/\.?0+$/, "")}`;
  }
}

export function usageLabels(usage: AgentUsage): { visible: string; detail: string } {
  const cost = usageCostLabel(usage.cost);
  const used = new Intl.NumberFormat().format(usage.usedTokens);
  const size = new Intl.NumberFormat().format(usage.contextWindowTokens);
  const context = usage.contextWindowTokens > 0
    ? `${Math.min(100, Math.round((usage.usedTokens / usage.contextWindowTokens) * 100))}% context`
    : `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(usage.usedTokens)} tokens`;
  return {
    visible: cost ? `${context} · ${cost}` : context,
    detail: cost
      ? `${used} of ${size} context tokens used. Cumulative session cost: ${cost}.`
      : `${used} of ${size} context tokens used.`,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function historyDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function stagedBytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function threadDateLabel(updatedAt: number): string | null {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(updatedAt));
}

export function sourceTooltip(source: AttachedSource): string {
  if (source.kind === "issue") return source.content;
  if (source.kind === "selection") {
    const content = Array.from(source.content);
    const excerpt = content.slice(0, 256).join("");
    return `${source.title}: ${excerpt}${content.length > 256 ? "..." : ""}`;
  }
  if (source.warning) return `${source.title}: ${source.warning}`;
  return source.title;
}

export const SECURITY_PROFILE_NAMES = {
  "studio-native-mediated-v1": "Studio mediated (v1)",
  "external-interactive-unrestricted-v1": "External interactive (v1)",
  "external-linux-restricted-offline-v1": "Linux restricted offline (v1)",
  "external-windows-restricted-app-container-v1": "Windows restricted AppContainer (v1)",
} satisfies Record<AgentSecurityScopeInfo["profile"]["id"], string>;

export const SECURITY_FILE_SCOPE = {
  "studio-tool-mediated-bundle": "Only bounded Studio tools can read the active bundle.",
  "host-operating-system": "Studio tools are bundle-scoped. The ACP process keeps normal OS file access.",
  "system-runtime-agent-and-read-only-bundle": "The process can read its system runtime, executable, and active bundle. Protected bundle paths are hidden.",
  "app-container-runtime-and-mediated-bundle": "The process can access its AppContainer runtime and private copy of the executable. Only bounded Studio tools can read the active bundle.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["effectiveMounts"], string>;

export const SECURITY_NETWORK_SCOPE = {
  "configured-endpoint-only": "Studio contacts only the configured model endpoint. No fetch tool is exposed.",
  "host-operating-system": "The ACP process keeps normal OS network access.",
  isolated: "The process has no host network access.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["networkPolicy"], string>;

export const SECURITY_WRITE_SCOPE = {
  "reviewed-staging-only": "Writes require an interactive grant and reviewed staging.",
  "host-operating-system-permissions": "Studio-mediated writes require review. The ACP process can bypass that mediation.",
  "private-temporary-only": "Direct writes are limited to private temporary storage. Bundle changes still require reviewed staging.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["writableRoots"], string>;

export const SECURITY_CREDENTIAL_SCOPE = {
  "configured-endpoint-only": "Only the configured endpoint can receive its saved API key.",
  "host-operating-system-and-launch-environment": "The process can access its launch environment and credentials available through the OS.",
  "launch-environment-only": "The process receives only the environment variables allowlisted for this launch.",
} satisfies Record<AgentSecurityScopeInfo["profile"]["credentialExposure"], string>;

export const SECURITY_STOP_LABELS = {
  disconnect: "disconnect",
  "application-exit": "app exit",
  "host-failure": "host failure",
} satisfies Record<AgentSecurityScopeInfo["profile"]["stopConditions"][number], string>;

export function readableSecurityStops(labels: readonly string[]): string {
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

export function securityEvidenceCopy(scope: AgentSecurityScopeInfo): string {
  if (scope.evidenceSource === "native-provider-host") {
    return "Produced by Studio's native provider host.";
  }
  if (scope.profile.id === "external-linux-restricted-offline-v1") {
    return "Produced by the ACP launcher after Bubblewrap started the process and Studio attached its process group.";
  }
  if (scope.profile.id === "external-windows-restricted-app-container-v1") {
    return "Produced by the ACP launcher after AppContainer started the process and Studio attached its Windows Job Object.";
  }
  return scope.processContainment === "windows-job-object"
    ? "Produced by the ACP launcher after Job Object attachment."
    : "Produced by the ACP launcher after process-group attachment.";
}

export function validationIssueKey(issue: Issue): string {
  return JSON.stringify([issue.level, issue.conceptId, issue.message]);
}

