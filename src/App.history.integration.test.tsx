import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { chooseThreadAction, openAttachmentMenu, openFolder, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio agent history", () => {
  it("searches and imports agent-owned sessions without replacing the live thread", async () => {
    const historySpy = vi.spyOn(ipc, "listAgentSessions")
      .mockRejectedValueOnce(new Error("History service unavailable"))
      .mockResolvedValueOnce({ sessions: [], hasMore: false });
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "History Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\history.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect History Harness" }));
    await screen.findByText(/Connected to History Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await chooseThreadAction(user, "History");
    expect(await screen.findByRole("heading", { name: "Import agent session" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "History unavailable. History service unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("This agent has no sessions for the active bundle.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh agent session history" }));
    expect(await screen.findByText("Trace bundle evidence")).toBeInTheDocument();
    expect(screen.getByText("Resolve validation warnings")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search agent sessions" }), "validation");
    expect(screen.queryByText("Trace bundle evidence")).not.toBeInTheDocument();
    expect(screen.getByText("Resolve validation warnings")).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Search agent sessions" }));

    const session = screen.getByText("Trace bundle evidence").closest("li");
    if (!session) throw new Error("The session history row was not rendered.");
    await user.click(within(session).getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("heading", { name: "Trace bundle evidence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Switch to Thread 1: New thread, Idle$/ }))
      .toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", {
      name: /^Switch to Thread 2: Trace bundle evidence, Idle$/,
    })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Trace the evidence behind/)).toBeInTheDocument();
    expect(screen.getByText(/traced the principles/)).toBeInTheDocument();
    const importedConversation = screen.getByRole("region", { name: "Trace bundle evidence" });
    const composer = within(importedConversation).getByLabelText("Message the agent");
    await waitFor(() => expect(composer).toBeEnabled(), { timeout: 3_000 });
    expect(composer).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Rename thread: Trace bundle evidence" }));
    await user.clear(screen.getByLabelText("Thread title"));
    await user.type(screen.getByLabelText("Thread title"), "Evidence notebook");
    await user.click(screen.getByRole("button", { name: "Save title" }));
    await waitFor(() => expect(
      JSON.parse(localStorage.getItem("okf-studio:agent-threads") ?? "[]"),
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: "mock-session-research",
        title: "Evidence notebook",
      }),
    ])));

    await chooseThreadAction(user, "Archive thread");
    expect(await screen.findByRole("heading", { name: "Archived thread" })).toBeInTheDocument();
    expect(within(importedConversation).getByRole("heading", { name: "New thread" }))
      .toBeInTheDocument();
    expect(within(importedConversation).getByRole("heading", { name: "Pick up where you left off" }))
      .toBeInTheDocument();
    expect(within(importedConversation).queryByRole("heading", { name: "Ask about this bundle" }))
      .not.toBeInTheDocument();
    expect(within(importedConversation).queryByRole("button", { name: /Create bundle/ }))
      .not.toBeInTheDocument();
    await waitFor(() => expect(
      JSON.parse(localStorage.getItem("okf-studio:agent-threads") ?? "[]"),
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: "mock-session-research",
        title: "Evidence notebook",
        archived: true,
      }),
    ])));
    await user.click(within(importedConversation).getByRole("button", { name: "Start new thread" }));
    expect(await within(importedConversation).findByRole("heading", { name: "Ask about this bundle" }))
      .toBeInTheDocument();
    expect(within(importedConversation).getByRole("button", { name: /Create bundle/ }))
      .toBeInTheDocument();
    expect(localStorage.getItem("okf-studio:agent-threads")).not.toBe("[]");

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect History Harness" }));
    await screen.findByText(/Connected to History Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Pick up where you left off" }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Evidence notebook" })).toBeInTheDocument();
    expect(screen.getByText(/traced the principles/)).toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect History Harness" }));
    await screen.findByText(/Connected to History Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Continue previous thread" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pick up where you left off" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ask about this bundle" })).not.toBeInTheDocument();
    expect(screen.getByText("Evidence notebook")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Evidence notebook" })).toBeInTheDocument();
    expect(screen.getByText(/traced the principles/)).toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect History Harness" }));
    await screen.findByText(/Connected to History Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    historySpy.mockResolvedValueOnce({ sessions: [], hasMore: false });
    await user.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Saved thread unavailable" }))
      .toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The agent no longer reports this session",
    );
    expect(screen.queryByRole("heading", { name: "Ask about this bundle" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Evidence notebook" })).toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect History Harness" }));
    await screen.findByText(/Connected to History Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(
      () => expect(screen.getByLabelText("Message the agent")).toHaveFocus(),
      { timeout: 3_000 },
    );
    expect(localStorage.getItem("okf-studio:agent-threads")).toBe("[]");

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove History Harness" }));
  }, 40_000);

  it("archives a browser-mock thread and restores it through the advertised history", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Archive Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\archive.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Archive Harness" }));
    await screen.findByText(/Connected to Archive Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.type(screen.getByLabelText("Message the agent"), "Summarize the bundle");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP received: Summarize the bundle"))
      .toBeInTheDocument();
    await chooseThreadAction(user, "Archive thread");
    expect(await screen.findByRole("heading", { name: "Archived thread" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Summarize the bundle" }))
      .toBeInTheDocument();
    expect(screen.getByText("Browser ACP received: Summarize the bundle"))
      .toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Archive Harness" }));
  });

  it("attaches a previous thread as bounded source evidence", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Thread Context Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\thread-context.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Thread Context Harness" }));
    await screen.findByText(/Connected to Thread Context Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    // The live thread's own pointer is never offered as attachable context.
    await user.type(screen.getByLabelText("Message the agent"), "Summarize the bundle");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP received: Summarize the bundle"))
      .toBeInTheDocument();
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach previous thread" }));
    expect(await screen.findByText("No saved thread exists for this bundle and agent."))
      .toBeInTheDocument();
    await user.keyboard("{Escape}");

    await chooseThreadAction(user, "Archive thread");
    expect(await screen.findByRole("heading", { name: "Archived thread" })).toBeInTheDocument();

    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach previous thread" }));
    await user.click(await screen.findByRole("button", {
      name: "Attach previous thread: Summarize the bundle",
    }));
    expect(await screen.findByText("Thread: Summarize the bundle")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Message the agent"),
      "Continue from the earlier thread",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP received: Continue from the earlier thread"))
      .toBeInTheDocument();
    expect(promptSpy).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "Continue from the earlier thread",
      [],
      [expect.objectContaining({
        title: "Thread: Summarize the bundle",
        origin: "Previous thread",
        mediaType: "text/markdown",
        content: expect.stringContaining("## You\n\n> Summarize the bundle"),
      })],
    );
    expect(screen.queryByText("Thread: Summarize the bundle")).not.toBeInTheDocument();

    // A pointer missing from a fresh bundle-filtered listing cannot attach.
    vi.spyOn(ipc, "listAgentSessions").mockResolvedValueOnce({ sessions: [], hasMore: false });
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach previous thread" }));
    await user.click(await screen.findByRole("button", {
      name: "Attach previous thread: Summarize the bundle",
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The agent no longer reports this session for the active bundle.",
    );
    await user.keyboard("{Escape}");

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Thread Context Harness" }));
  }, 40_000);
});
