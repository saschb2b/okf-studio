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

export interface AgentDistribution {
  kind: "npm";
  package: string;
  version: string;
  tarball: string;
  integrity: `sha512-${string}`;
  downloadSize: number;
  unpackedSize: number;
}

export interface AgentCatalogRecord {
  id: string;
  name: string;
  summary: string;
  runtime: AgentRuntime;
  authMethods: readonly AgentAuthMethod[];
  source: string;
  availability: "installable" | "planned";
  distribution: AgentDistribution | null;
}

export interface AgentCatalogDocument {
  version: number;
  entries: readonly AgentCatalogRecord[];
}

export interface AgentCatalogEntry extends AgentCatalogRecord {
  state: AgentConnectionState;
}

export function catalogEntries(
  document: AgentCatalogDocument,
): readonly AgentCatalogEntry[] {
  return document.entries.map((entry) => ({
    ...entry,
    state: { status: "available" },
  }));
}

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
