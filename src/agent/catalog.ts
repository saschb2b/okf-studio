export type AgentConnectionState =
  | { status: "available" }
  | { status: "installing"; progress: number; canCancel: boolean }
  | { status: "installed"; version: string }
  | { status: "connecting" }
  | { status: "authentication-required"; methods: readonly AgentAuthMethod[] }
  | { status: "ready"; connectionId: string }
  | { status: "update-available"; installedVersion: string; version: string }
  | { status: "failed"; message: string; canRetry: boolean };

export type AgentAuthMethod = "subscription" | "api-key" | "none";
export type AgentRuntime = "external-acp" | "studio-native";

export interface AgentCatalogEntry {
  id: "claude-agent" | "codex" | "studio-api" | "local-model";
  name: string;
  summary: string;
  runtime: AgentRuntime;
  authMethods: readonly AgentAuthMethod[];
  source: string;
  availability: "installable" | "planned";
  state: AgentConnectionState;
}

export const AGENT_CATALOG: readonly AgentCatalogEntry[] = [
  {
    id: "claude-agent",
    name: "Claude Agent",
    summary: "Use Claude Code through its subscription login or an API key.",
    runtime: "external-acp",
    authMethods: ["subscription", "api-key"],
    source: "ACP Registry",
    availability: "installable",
    state: { status: "available" },
  },
  {
    id: "codex",
    name: "Codex",
    summary: "Use a ChatGPT subscription or an OpenAI API key.",
    runtime: "external-acp",
    authMethods: ["subscription", "api-key"],
    source: "ACP Registry",
    availability: "installable",
    state: { status: "available" },
  },
  {
    id: "studio-api",
    name: "Studio Agent",
    summary: "Connect an API-backed model to Studio's scoped OKF tools.",
    runtime: "studio-native",
    authMethods: ["api-key"],
    source: "Built into OKF Studio",
    availability: "planned",
    state: { status: "available" },
  },
  {
    id: "local-model",
    name: "Local model",
    summary: "Keep prompts and bundle context on a compatible local endpoint.",
    runtime: "studio-native",
    authMethods: ["none"],
    source: "Built into OKF Studio",
    availability: "planned",
    state: { status: "available" },
  },
] as const;

export function authMethodLabel(method: AgentAuthMethod): string {
  switch (method) {
    case "subscription":
      return "Subscription";
    case "api-key":
      return "API key";
    case "none":
      return "No cloud account";
  }
}

export function runtimeLabel(runtime: AgentRuntime): string {
  return runtime === "external-acp" ? "External ACP agent" : "Studio runtime";
}
