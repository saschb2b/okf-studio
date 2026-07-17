import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/App.tsx";
import { AppProvider } from "@/shared/store.tsx";
import * as ipc from "@/shared/ipc.ts";

// The launch-restore attempt runs once per module, so this lives in its own
// test file: a fresh module registry stands in for a fresh app launch.

describe("agent panel restore at launch", () => {
  it("authenticates the remembered agent, then restores its transcript and session choices", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Restore Auth Harness",
      executable: "C:\\tools\\restore.exe",
      arguments: [],
      environment: [],
    });
    const bundleRoot = "/mock/workspace/docs";
    const earlierConnection = await ipc.connectCustomAgent(profile.id, bundleRoot);
    await ipc.authenticateAgent(earlierConnection.connectionId, "browser-login");
    const earlierSession = await ipc.newAgentSession(earlierConnection.connectionId, bundleRoot);
    await ipc.setAgentSessionConfigOption(
      earlierConnection.connectionId,
      earlierSession.sessionId,
      "mode",
      { type: "select", value: "plan" },
    );
    await ipc.setAgentSessionConfigOption(
      earlierConnection.connectionId,
      earlierSession.sessionId,
      "model",
      { type: "select", value: "browser-fast" },
    );
    await ipc.setAgentSessionConfigOption(
      earlierConnection.connectionId,
      earlierSession.sessionId,
      "reasoning",
      { type: "select", value: "low" },
    );
    await ipc.promptAgent(
      earlierConnection.connectionId,
      earlierSession.sessionId,
      "Explain how this bundle controls trading risk.",
    );
    await ipc.saveAgentThreadMetadata({
      bundleRoot,
      profileId: profile.id,
      sessionId: earlierSession.sessionId,
      title: "Trading risk controls",
    });
    await ipc.disconnectAgent(earlierConnection.connectionId);

    // What an earlier app session leaves behind after the process itself exits.
    localStorage.setItem(
      "okf-studio:agent-panel",
      JSON.stringify({ open: true, width: null }),
    );
    localStorage.setItem(
      "okf-studio:agent-last-connection",
      JSON.stringify({ kind: "custom", id: profile.id }),
    );

    const user = userEvent.setup();
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
    await screen.findByRole("button", { name: /switch bundle/i });
    expect(await screen.findByRole("heading", { name: "Authentication required" }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Trading risk controls" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Explain how this bundle controls trading risk."))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mode: Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model: Browser fast" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reasoning: Low" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pick up where you left off" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Saved thread unavailable" }))
      .not.toBeInTheDocument();

    // An explicit disconnect forgets the remembered entry.
    const connection = ipc
      .activeAgentConnections()
      .find((candidate) => candidate.profileId === profile.id);
    expect(connection).toBeDefined();
    await act(() => ipc.disconnectAgent(connection!.connectionId));
    expect(ipc.lastAgentConnection()).toBeNull();
    await ipc.removeCustomAgent(profile.id);
  });
});
