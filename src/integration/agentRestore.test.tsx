import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
      // StrictMode because src/main.tsx mounts the app inside it, so every effect
      // here runs twice exactly as it does when the app is run.
      <StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </StrictMode>,
    );
    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
    await screen.findByRole("button", { name: /switch bundle/i });
    // Reconnecting reports authenticated: false and re-advertises the methods.
    // The remembered method is re-applied silently, so the transcript comes back
    // with no interaction at all.
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
      // StrictMode because src/main.tsx mounts the app inside it, so every effect
      // here runs twice exactly as it does when the app is run.
      <StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </StrictMode>,
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

  it("names the agent it could not reconnect, and offers to try again", async () => {
    // A remembered agent whose profile is gone: the install was removed, or the
    // endpoint moved. The id is not presentable and the profile can no longer be
    // read for a name, which is why the name is stored alongside it.
    localStorage.setItem(
      "okf-studio:agent-panel",
      JSON.stringify({ open: true, width: null }),
    );
    localStorage.setItem(
      "okf-studio:agent-last-connection",
      JSON.stringify({ kind: "custom", id: "custom-goneforever", name: "Ghost Agent" }),
    );

    const user = userEvent.setup();
    render(
      // StrictMode because src/main.tsx mounts the app inside it, so every effect
      // here runs twice exactly as it does when the app is run.
      <StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </StrictMode>,
    );
    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
    await screen.findByRole("button", { name: /switch bundle/i });

    expect(
      await screen.findByRole("heading", { name: "Couldn't reconnect Ghost Agent" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your threads are kept/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect an agent" }))
      .not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(screen.getByRole("button", { name: "Choose a different agent" }))
      .toBeInTheDocument();

    // Retrying re-runs the attempt rather than being a dead control. The profile
    // is still gone, so it lands back here instead of silently doing nothing.
    await user.click(retry);
    expect(
      await screen.findByRole("heading", { name: "Couldn't reconnect Ghost Agent" }),
    ).toBeInTheDocument();
  });

  it("falls back to unnamed copy for an entry saved before names were recorded", async () => {
    localStorage.setItem(
      "okf-studio:agent-panel",
      JSON.stringify({ open: true, width: null }),
    );
    localStorage.setItem(
      "okf-studio:agent-last-connection",
      JSON.stringify({ kind: "custom", id: "custom-goneforever" }),
    );

    const user = userEvent.setup();
    render(
      // StrictMode because src/main.tsx mounts the app inside it, so every effect
      // here runs twice exactly as it does when the app is run.
      <StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </StrictMode>,
    );
    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
    await screen.findByRole("button", { name: /switch bundle/i });

    expect(
      await screen.findByRole("heading", { name: "Couldn't reconnect your last agent" }),
    ).toBeInTheDocument();
  });

  it("records the connected agent's name for the next launch", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Named For Restore",
      executable: "C:\\tools\\named.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");
    expect(ipc.lastAgentConnection()?.name).toBe("Named For Restore");

    await act(() => ipc.disconnectAgent(connection.connectionId));
    await ipc.removeCustomAgent(profile.id);
  });

  it("marks a restored connection before any subscriber can see it", async () => {
    // The ordering invariant, asserted directly rather than through the UI: the
    // marker has to be set before the connection is published. A surface that
    // mounts on that publish asks "was this a launch restore?" and has to get an
    // answer, or it shows the Resume card over an already-restored thread.
    const profile = await ipc.saveCustomAgent({
      name: "Restore Order Harness",
      executable: "C:\\tools\\order.exe",
      arguments: [],
      environment: [],
    });
    localStorage.setItem(
      "okf-studio:agent-last-connection",
      JSON.stringify({ kind: "custom", id: profile.id, authMethodId: "browser-login" }),
    );

    let markedWhenFirstSeen: boolean | null = null;
    const stop = ipc.subscribeAgentConnections(() => {
      if (markedWhenFirstSeen !== null) return;
      const restored = ipc.activeAgentConnections()
        .find((candidate) => candidate.profileId === profile.id);
      if (!restored) return;
      // The first notification that carries this connection. Whatever decides to
      // auto-resume runs off exactly this signal, so the answer has to be ready.
      markedWhenFirstSeen = ipc.consumeRestoredConnection(restored.connectionId);
    });

    ipc.maybeRestoreLastAgentConnection("/mock/workspace/docs");
    // Wait for the subscription to have seen the restored connection, not for
    // 250ms to pass. The sleep made this a timing bet: long enough on a fast
    // machine, short enough to flake in CI, and silent about which it was.
    await waitFor(() => expect(markedWhenFirstSeen).not.toBeNull());
    stop();

    expect(markedWhenFirstSeen).toBe(true);

    const connection = ipc.activeAgentConnections()
      .find((candidate) => candidate.profileId === profile.id);
    if (connection) await act(() => ipc.disconnectAgent(connection.connectionId));
    await ipc.removeCustomAgent(profile.id);
  });

  it("treats a remembered entry it cannot even attempt as a failure", async () => {
    // A local-model entry with no model cannot produce a connection attempt.
    // Resolving quietly published "idle", which dropped the user on the
    // first-run empty state with no hint that an agent was meant to come back.
    localStorage.setItem(
      "okf-studio:agent-last-connection",
      JSON.stringify({ kind: "local", id: "local-1", name: "Ollama · llama3.1" }),
    );
    ipc.maybeRestoreLastAgentConnection("/mock/workspace/docs");
    await waitFor(() => expect(ipc.agentRestoreStatus()).toBe("failed"));
  });
});
