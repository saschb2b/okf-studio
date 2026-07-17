import { describe, expect, it, vi } from "vitest";
import * as ipc from "@/shared/ipc.ts";

describe("browser IPC mock", () => {
  it("resets profiles, connections, installs, and subscribers together", async () => {
    const connectionHandler = vi.fn();
    const installHandler = vi.fn();
    await ipc.onAgentConnectionState(connectionHandler);
    await ipc.onAgentInstallProgress(installHandler);

    const custom = await ipc.saveCustomAgent({
      name: "Reset Harness",
      executable: "reset-agent",
      arguments: [],
      environment: [],
    });
    await ipc.saveLocalModelProfile({
      name: "Reset Model",
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
    });
    const firstConnection = await ipc.connectCustomAgent(custom.id, "/mock/workspace/docs");
    await ipc.disconnectAgent(firstConnection.connectionId);
    await ipc.connectCustomAgent(custom.id, "/mock/workspace/docs");
    await ipc.installAgent("auggie", "install-before-reset");

    expect(await ipc.customAgents()).toHaveLength(1);
    expect(await ipc.localModelProfiles()).toHaveLength(1);
    expect(ipc.activeAgentConnections()).toHaveLength(1);
    expect((await ipc.agentInstallPreflight("auggie")).packageInstalled).toBe(true);
    expect(connectionHandler).toHaveBeenCalled();
    expect(installHandler).toHaveBeenCalled();

    ipc.resetBrowserMockForTests();

    expect(await ipc.customAgents()).toEqual([]);
    expect(await ipc.localModelProfiles()).toEqual([]);
    expect(ipc.activeAgentConnections()).toEqual([]);
    expect((await ipc.agentInstallPreflight("auggie")).packageInstalled).toBe(false);

    connectionHandler.mockClear();
    installHandler.mockClear();
    const next = await ipc.saveCustomAgent({
      name: "Next Harness",
      executable: "next-agent",
      arguments: [],
      environment: [],
    });
    const nextConnection = await ipc.connectCustomAgent(next.id, "/mock/workspace/docs");
    await ipc.disconnectAgent(nextConnection.connectionId);
    await ipc.installAgent("auggie", "install-after-reset");
    expect(connectionHandler).not.toHaveBeenCalled();
    expect(installHandler).not.toHaveBeenCalled();
  });
});
