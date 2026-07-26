// Shared story fixtures for the agent surfaces.
//
// AgentConnectionInfo is five nested shapes deep, and every agent story that
// needs one was going to hand-build it. One builder here keeps them consistent
// and means a change to the connection contract breaks in one place instead of
// in five stories that each drifted their own way.

import type {
  AgentCatalogEntry,
  AgentCatalogRecord,
} from "@/features/agent/catalog.ts";
import type { AgentConnectionInfo } from "@/features/agent/connection.ts";
import type { CustomAgentProfile } from "@/features/agent/custom.ts";
import type { LocalModelProfile } from "@/features/agent/local.ts";

/** A connected external agent, mediated by Studio's own host. */
export function mockConnection(
  overrides: Partial<AgentConnectionInfo> = {},
): AgentConnectionInfo {
  return {
    connectionId: "conn-1",
    profileId: "claude-code",
    bundleRoot: "C:/knowledge/docs",
    protocolVersion: "0.4.3",
    agent: { name: "claude-code", title: "Claude Code", version: "2.1.0" },
    authMethods: [
      { id: "subscription", name: "Subscription", description: "Sign in with an existing plan" },
    ],
    authenticated: true,
    capabilities: {
      loadSession: true,
      promptImage: false,
      promptAudio: false,
      promptEmbeddedContext: true,
      mcpHttp: true,
      mcpSse: false,
      sessionList: true,
      sessionResume: true,
      sessionClose: true,
    },
    securityScope: {
      evidenceSource: "native-provider-host",
      processContainment: "windows-job-object",
      profile: {
        id: "studio-native-mediated-v1",
        effectiveMounts: "studio-tool-mediated-bundle",
        writableRoots: "reviewed-staging-only",
        networkPolicy: "configured-endpoint-only",
        credentialExposure: "configured-endpoint-only",
        lifetime: "connection",
        stopConditions: ["disconnect", "application-exit"],
        unattendedEligible: false,
      },
    },
    ...overrides,
  };
}

/** A catalog record plus the connection state the registry row renders from. */
export function mockCatalogEntry(
  overrides: Partial<AgentCatalogRecord & { state: AgentCatalogEntry["state"] }> = {},
): AgentCatalogEntry {
  return {
    id: "claude-code",
    name: "Claude Code",
    summary: "Anthropic's coding agent, over the Agent Client Protocol.",
    runtime: "node",
    authMethods: ["subscription", "api-key"],
    source: "npm",
    availability: "installable",
    repository: "https://github.com/anthropics/claude-code",
    website: "https://claude.com/claude-code",
    distribution: {
      kind: "npm",
      package: "@anthropic-ai/claude-code",
      version: "latest",
      bin: "claude-code",
    },
    state: { status: "available" },
    ...overrides,
  } as AgentCatalogEntry;
}

export function mockLocalModelProfile(
  overrides: Partial<LocalModelProfile> = {},
): LocalModelProfile {
  return {
    id: "local-1",
    name: "Ollama · llama3.1",
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    hasCredential: false,
    ...overrides,
  };
}

export function mockCustomProfile(
  overrides: Partial<CustomAgentProfile> = {},
): CustomAgentProfile {
  return {
    id: "custom-1",
    name: "In-house reviewer",
    executable: "C:/tools/reviewer/reviewer.exe",
    arguments: ["--acp", "--quiet"],
    environment: ["REVIEWER_MODE=strict"],
    ...overrides,
  };
}
