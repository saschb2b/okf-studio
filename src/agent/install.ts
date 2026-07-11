export interface AgentInstallPreflight {
  agentId: string;
  agentVersion: string;
  target: string;
  runtimeVersion: string;
  packageDownloadSize: number;
  runtimeDownloadSize: number;
  totalDownloadSize: number;
  packageInstalled: boolean;
  runtimeInstalled: boolean;
}

export interface AgentInstallReceipt {
  agentId: string;
  version: string;
  packageDir: string;
  integrity: string;
  alreadyInstalled: boolean;
}

export interface AgentInstallProgress {
  installId: string;
  agentId: string;
  phase: "downloading" | "extracting" | "complete" | "cancelled";
  downloadedBytes: number;
  totalBytes: number;
}
