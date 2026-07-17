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

export interface NpmAgentDistribution {
  kind: "npm";
  package: string;
  version: string;
  tarball: string;
  integrity: `sha512-${string}`;
  downloadSize: number;
  unpackedSize: number;
  entrypoint: string;
  arguments: readonly string[];
  environment: readonly string[];
  /** Pinned launch values that override same-named host variables. */
  environmentDefaults?: Readonly<Record<string, string>>;
}

export interface AgentBinaryTarget {
  archive: "zip" | "tar-gz";
  url: string;
  /** Measured by Studio at catalog-snapshot time, not taken from upstream. */
  sha256: string;
  downloadSize: number;
  unpackedSize: number;
  root: string;
  executable: string;
  pathArguments: readonly string[];
  arguments: readonly string[];
}

export interface BinaryAgentDistribution {
  kind: "binary";
  version: string;
  targets: Readonly<Record<string, AgentBinaryTarget>>;
  environment: readonly string[];
  environmentDefaults?: Readonly<Record<string, string>>;
}

export type AgentDistribution = NpmAgentDistribution | BinaryAgentDistribution;

export interface AgentCatalogRecord {
  id: string;
  name: string;
  summary: string;
  runtime: AgentRuntime;
  authMethods: readonly AgentAuthMethod[];
  source: string;
  availability: "installable" | "configurable" | "planned";
  repository?: string | null;
  website?: string | null;
  distribution: AgentDistribution | null;
}

export interface AgentCatalogDocument {
  version: number;
  nodeRuntime: AgentNodeRuntime;
  entries: readonly AgentCatalogRecord[];
}

export interface AgentNodeRuntime {
  version: string;
  distributions: readonly AgentNodeDistribution[];
}

export interface AgentNodeDistribution {
  target:
    | "windows-x86_64"
    | "linux-x86_64"
    | "linux-aarch64"
    | "macos-x86_64"
    | "macos-aarch64";
  archive: "zip" | "tar-gz";
  url: string;
  sha256: string;
  downloadSize: number;
  root: string;
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

export function catalogProfileId(agentId: string): string {
  return `catalog-${agentId}`;
}
