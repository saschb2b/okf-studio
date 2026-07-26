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
      JSON.stringify({ kind: "custom", id: profile.id, authMethodId: "browser-login" }),
    );

    const user = userEvent.setup();
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
    await screen.findByRole("button", { name: /switch bundle/i });
    // The whole point of the fix. Reconnecting reports authenticated: false and
    // re-advertises the methods, so the panel used to stop here and ask which
    // one to use — on every launch, in front of a thread the user had already
    // chosen. The method is remembered now and re-applied silently, so the
    // transcript comes back with no interaction at all.
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
    expect(screen.queryByRole("heading", { name: "Authentication required" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in again" }))
      .not.toBeInTheDocument();
    // Re-authenticating made restore long enough that the surface could reach
    // "ready" before the connection was marked as restored, which put this card
    // back for exactly the launches the fix is meant to smooth over.
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();

    // An explicit disconnect forgets the remembered entry.
    const connection = ipc
      .activeAgentConnections()
      .find((candidate) => candidate.profileId === profile.id);
    expect(connection).toBeDefined();
    await act(() => ipc.disconnectAgent(connection!.connectionId));
    expect(ipc.lastAgentConnection()).toBeNull();
    await ipc.removeCustomAgent(profile.id);
  });

  it("still asks which method to use when none was remembered", async () => {
    // An entry saved by an older build, or a profile that was never
    // authenticated, carries no authMethodId. There is nothing to re-apply, so
    // the picker is correct here rather than a regression.
    const profile = await ipc.saveCustomAgent({
      name: "Restore Auth Harness",
      executable: "C:\tools\restore.exe",
      arguments: [],
      environment: [],
    });
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
    await ipc.removeCustomAgent(profile.id);
  });

  it("records the method it authenticated with, so the next launch can reuse it", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Restore Auth Harness",
      executable: "C:\tools\restore.exe",
      arguments: [],
      environment: [],
    });
    const bundleRoot = "/mock/workspace/docs";
    const connection = await ipc.connectCustomAgent(profile.id, bundleRoot);
    expect(ipc.rememberedAuthMethod(profile.id)).toBeNull();

    await ipc.authenticateAgent(connection.connectionId, "browser-login");
    expect(ipc.rememberedAuthMethod(profile.id)).toBe("browser-login");
    expect(ipc.lastAgentConnection()?.authMethodId).toBe("browser-login");

    await act(() => ipc.disconnectAgent(connection.connectionId));
    await ipc.removeCustomAgent(profile.id);
  });
});
