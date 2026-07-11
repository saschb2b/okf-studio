export interface AgentImplementationInfo {
  name: string;
  title: string | null;
  version: string;
}

export interface AgentAuthMethodInfo {
  id: string;
  name: string;
  description: string | null;
}

export interface AgentCapabilityInfo {
  loadSession: boolean;
  promptImage: boolean;
  promptAudio: boolean;
  promptEmbeddedContext: boolean;
  mcpHttp: boolean;
  mcpSse: boolean;
  sessionList: boolean;
  sessionResume: boolean;
  sessionClose: boolean;
}

export interface AgentConnectionInfo {
  connectionId: string;
  profileId: string;
  protocolVersion: string;
  agent: AgentImplementationInfo | null;
  authMethods: readonly AgentAuthMethodInfo[];
  capabilities: AgentCapabilityInfo;
}

export interface AgentSessionInfo {
  connectionId: string;
  sessionId: string;
  bundleRoot: string;
}

export type AgentConnectionEvent =
  | {
      connectionId: string;
      profileId: string;
      status: "disconnected";
      message: null;
    }
  | {
      connectionId: string;
      profileId: string;
      status: "failed";
      message: string;
    };
