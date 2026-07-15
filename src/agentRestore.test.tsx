import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/App.tsx";
import { AppProvider } from "@/store.tsx";
import * as ipc from "@/ipc.ts";

// The launch-restore attempt runs once per module, so this lives in its own
// test file: a fresh module registry stands in for a fresh app launch.

afterEach(() => vi.restoreAllMocks());

describe("agent panel restore at launch", () => {
  it("reconnects the remembered agent and resumes the saved thread on its own", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Restore Harness",
      executable: "C:\\tools\\restore.exe",
      arguments: [],
      environment: [],
    });
    // What an earlier app session would have left behind: the open panel, the
    // remembered explicit connection, and one current saved-thread pointer.
    localStorage.setItem(
      "okf-studio:agent-panel",
      JSON.stringify({ open: true, width: null }),
    );
    localStorage.setItem(
      "okf-studio:agent-last-connection",
      JSON.stringify({ kind: "custom", id: profile.id }),
    );
    await ipc.saveAgentThreadMetadata({
      bundleRoot: "/mock/workspace/docs",
      profileId: profile.id,
      sessionId: "mock-session-research",
      title: "Evidence notebook",
    });

    const user = userEvent.setup();
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
    await screen.findByRole("button", { name: /switch bundle/i });

    // The remembered connection returns and its first surface resumes the
    // saved thread without a Resume card.
    expect(
      await screen.findByRole("heading", { name: "Evidence notebook" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/traced the principles/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pick up where you left off" }),
    ).not.toBeInTheDocument();

    // An explicit disconnect forgets the remembered entry.
    const connection = ipc
      .activeAgentConnections()
      .find((candidate) => candidate.profileId === profile.id);
    expect(connection).toBeDefined();
    await ipc.disconnectAgent(connection!.connectionId);
    expect(ipc.lastAgentConnection()).toBeNull();
    await ipc.removeCustomAgent(profile.id);
  });
});
