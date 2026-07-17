import { describe, it, expect, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { chooseThreadAction, openAttachmentMenu, openFolder, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio agent connections", () => {
  it("keeps an external connection on its launch bundle", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Bound Harness",
      executable: "C:\\tools\\bound.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");

    try {
      await expect(ipc.newAgentSession(connection.connectionId, "/mock/handbook")).rejects.toThrow(
        "This external agent connection belongs to another bundle.",
      );
    } finally {
      await ipc.disconnectAgent(connection.connectionId);
      await ipc.removeCustomAgent(profile.id);
    }
  });

  it("switches between live agent connections without interrupting their threads", async () => {
    const firstProfile = await ipc.saveCustomAgent({
      name: "Research Harness",
      executable: "C:\\tools\\research.exe",
      arguments: [],
      environment: [],
    });
    const secondProfile = await ipc.saveCustomAgent({
      name: "Review Harness",
      executable: "C:\\tools\\review.exe",
      arguments: [],
      environment: [],
    });
    const firstConnection = await ipc.connectCustomAgent(firstProfile.id, "/mock/workspace/docs");
    const secondConnection = await ipc.connectCustomAgent(secondProfile.id, "/mock/workspace/docs");

    try {
      const user = userEvent.setup();
      renderApp();
      await openFolder(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

      expect(screen.getByRole("navigation", { name: "Agent connections" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Switch to Research Harness, / })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "Connect another agent" })).toBeInTheDocument();

      const researchConversation = screen.getByRole("region", { name: "New thread" });
      await user.type(
        within(researchConversation).getByLabelText("Message the agent"),
        "Run a long investigation",
      );
      await user.click(within(researchConversation).getByRole("button", { name: "Send" }));
      expect(await within(researchConversation).findByRole("button", { name: "Stop" }))
        .toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^Switch to Review Harness, / }));
      expect(screen.getByRole("button", { name: /^Switch to Review Harness, / })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const reviewConversation = screen.getByRole("region", { name: "New thread" });
      await user.type(
        within(reviewConversation).getByLabelText("Message the agent"),
        "Review the evidence",
      );
      await user.click(within(reviewConversation).getByRole("button", { name: "Send" }));
      await waitFor(
        () => expect(within(reviewConversation).getByRole("button", { name: "Send" })).toBeEnabled(),
        { timeout: 5_000 },
      );
      expect(reviewConversation).toHaveTextContent(
        "Browser ACP received: Review the evidence",
      );

      await user.click(screen.getByRole("button", { name: /^Switch to Research Harness, / }));
      expect(within(researchConversation).getByRole("button", { name: "Stop" }))
        .toBeInTheDocument();
      await user.click(within(researchConversation).getByRole("button", { name: "Stop" }));
      expect(await within(researchConversation).findByText("Turn cancelled.")).toBeInTheDocument();
    } finally {
      cleanup();
      await ipc.disconnectAgent(firstConnection.connectionId);
      await ipc.disconnectAgent(secondConnection.connectionId);
      await ipc.removeCustomAgent(firstProfile.id);
      await ipc.removeCustomAgent(secondProfile.id);
    }
  });

  it("keeps a failed connection visible beside its recovery action", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Failure Harness",
      executable: "C:\\tools\\failure.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");
    const connectionHandlers: Parameters<typeof ipc.onAgentConnectionState>[0][] = [];
    vi.spyOn(ipc, "onAgentConnectionState").mockImplementation((handler) => {
      connectionHandlers.push(handler);
      return Promise.resolve(() => undefined);
    });

    try {
      const user = userEvent.setup();
      renderApp();
      await openFolder(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
      await screen.findByRole("button", { name: /^Switch to Failure Harness, / });

      await act(async () => {
        for (const handler of connectionHandlers) {
          handler({
            connectionId: connection.connectionId,
            profileId: profile.id,
            status: "failed",
            message: "The agent process exited before the session completed.",
          });
        }
        await ipc.disconnectAgent(connection.connectionId);
      });

      const failure = await screen.findByRole("alert");
      expect(failure).toHaveTextContent("Failure Harness stopped");
      expect(failure).toHaveTextContent(
        "The agent process exited before the session completed.",
      );
      expect(screen.getByRole("heading", { name: "Your bundle is still open" }))
        .toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Connect an agent" }))
        .not.toBeInTheDocument();
      await user.click(within(failure).getByRole("button", { name: "Review connections" }));
      expect(screen.getByRole("heading", { name: "Choose how agents run" }))
        .toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Failure Harness stopped");
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByText("Failure Harness stopped")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect an agent" })).toBeInTheDocument();
    } finally {
      cleanup();
      await ipc.disconnectAgent(connection.connectionId);
      await ipc.removeCustomAgent(profile.id);
    }
  });

  it("keeps a lost event stream with its thread and retries every subscription", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Session Harness",
      executable: "C:\\tools\\session.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");
    const turnUpdates = vi.spyOn(ipc, "onAgentTurnUpdate")
      .mockRejectedValueOnce(new Error("The turn update listener stopped."));

    try {
      const user = userEvent.setup();
      renderApp();
      await openFolder(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

      const failure = await screen.findByRole("alert");
      expect(failure).toHaveTextContent("Agent updates paused");
      expect(failure).toHaveTextContent("The turn update listener stopped.");
      expect(screen.queryByText(/Studio lost the agent event stream/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", {
        name: "Start another thread with Session Harness",
      }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Switch to Thread 1: New thread, / }));
      expect(screen.getByRole("alert")).toHaveTextContent("Agent updates paused");

      await user.click(screen.getByRole("button", { name: "Retry updates" }));
      await waitFor(() => expect(screen.queryByText("Agent updates paused")).not.toBeInTheDocument());
      expect(turnUpdates).toHaveBeenCalledTimes(3);
    } finally {
      cleanup();
      await ipc.disconnectAgent(connection.connectionId);
      await ipc.removeCustomAgent(profile.id);
    }
  });

  it("keeps a failed Stop action beside its thread controls", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Turn Harness",
      executable: "C:\\tools\\turn.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");
    const cancelTurn = vi.spyOn(ipc, "cancelAgentTurn")
      .mockRejectedValueOnce(new Error("The ACP host did not accept cancellation."));

    try {
      const user = userEvent.setup();
      renderApp();
      await openFolder(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
      await user.type(screen.getByLabelText("Message the agent"), "Run a long investigation");
      await user.click(screen.getByRole("button", { name: "Send" }));
      await user.click(await screen.findByRole("button", { name: "Stop" }));

      const failure = await screen.findByRole("alert");
      expect(failure).toHaveTextContent(
        "Stop failed. The ACP host did not accept cancellation.",
      );
      expect(screen.queryByText(/Studio could not stop the turn/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", {
        name: "Start another thread with Turn Harness",
      }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Switch to Thread 1:/ }));
      expect(screen.getByRole("alert")).toHaveTextContent("Stop failed");

      await user.click(screen.getByRole("button", { name: "Retry stop" }));
      expect(await screen.findByText("Turn cancelled.")).toBeInTheDocument();
      expect(screen.queryByText("Stop failed.")).not.toBeInTheDocument();
      expect(cancelTurn).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
      await ipc.disconnectAgent(connection.connectionId);
      await ipc.removeCustomAgent(profile.id);
    }
  });

  it("runs and switches between parallel threads on one agent connection", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Parallel Harness",
      executable: "C:\\tools\\parallel.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");

    try {
      const user = userEvent.setup();
      renderApp();
      await openFolder(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

      const firstConversation = screen.getByRole("region", { name: "New thread" });
      await user.type(
        within(firstConversation).getByLabelText("Message the agent"),
        "Run a long investigation",
      );
      await user.click(within(firstConversation).getByRole("button", { name: "Send" }));
      expect(await within(firstConversation).findByRole("button", { name: "Stop" }))
        .toBeInTheDocument();

      await user.click(screen.getByRole("button", {
        name: "Start another thread with Parallel Harness",
      }));
      expect(screen.getByRole("button", {
        name: /^Switch to Thread 1: Run a long investigation, /,
      })).toHaveAttribute("aria-pressed", "false");
      const secondThreadTab = screen.getByRole("button", {
        name: /^Switch to Thread 2: New thread, /,
      });
      expect(secondThreadTab).toHaveAttribute("aria-pressed", "true");

      const secondConversation = screen.getByRole("region", { name: "New thread" });
      await user.type(
        within(secondConversation).getByLabelText("Message the agent"),
        "Review the evidence in parallel",
      );
      await user.click(within(secondConversation).getByRole("button", { name: "Send" }));
      expect(await within(secondConversation).findByText(
        "Browser ACP received: Review the evidence in parallel",
      )).toBeInTheDocument();

      const firstThreadTab = screen.getByRole("button", {
        name: /^Switch to Thread 1: Run a long investigation, /,
      });
      await user.click(firstThreadTab);
      expect(within(firstConversation).getByRole("button", { name: "Stop" }))
        .toBeInTheDocument();
      expect(within(firstConversation).getByRole("button", {
        name: "Close thread surface",
      })).toBeDisabled();

      await user.click(screen.getByRole("button", {
        name: /^Switch to Thread 2: Review the evidence in parallel, /,
      }));
      await user.click(within(secondConversation).getByRole("button", {
        name: "Close thread surface",
      }));
      await user.click(screen.getByRole("button", { name: "Close thread" }));
      expect(screen.queryByRole("button", {
        name: /^Switch to Thread 2: Review the evidence in parallel, /,
      })).not.toBeInTheDocument();
      await waitFor(() => expect(firstThreadTab).toHaveFocus(), { timeout: 3_000 });

      await user.click(within(firstConversation).getByRole("button", { name: "Stop" }));
      expect(await within(firstConversation).findByText("Turn cancelled.")).toBeInTheDocument();
    } finally {
      cleanup();
      await ipc.disconnectAgent(connection.connectionId);
      await ipc.removeCustomAgent(profile.id);
    }
  });

  it("installs an agent without starting or connecting it", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    const heading = screen.getByRole("heading", { name: "Claude Agent" });
    const card = heading.closest("article");
    if (!card) throw new Error("Claude Agent card was not rendered.");

    await user.click(await within(card).findByRole("button", { name: "Install" }));

    expect(await within(card).findByRole("button", { name: "Connect Claude Agent" })).toBeDisabled();
    expect(within(card).getByText("Open an OKF bundle to connect.")).toBeInTheDocument();
    expect(within(card).getByText(/No agent has been started/i)).toBeInTheDocument();
  });

  it("sends with Enter and keeps Shift+Enter as a newline", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Enter Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\enter.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Enter Harness" }));
    await screen.findByText(/Connected to Enter Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    const prompt = screen.getByLabelText("Message the agent");
    await user.type(prompt, "First line{Shift>}{Enter}{/Shift}Second line");
    expect(prompt).toHaveValue("First line\nSecond line");

    await user.keyboard("{Enter}");
    expect(await screen.findByText(/Browser ACP received: First line/)).toBeInTheDocument();
    expect(prompt).toHaveValue("");

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Enter Harness" }));
  }, 40_000);

  it("tests and saves a local model endpoint without starting an agent", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    const localCard = screen.getByRole("heading", { name: "Studio Agent" }).closest("article");
    if (!localCard) throw new Error("Studio Agent card was not rendered.");
    await user.click(within(localCard).getByRole("button", { name: "Configure" }));

    const localSection = screen
      .getByRole("heading", { name: "Studio model endpoints" })
      .closest("section");
    if (!localSection) throw new Error("Local endpoint setup was not rendered.");
    await waitFor(() =>
      expect(within(localSection).getByLabelText("Provider")).toHaveFocus(),
    );
    expect(within(localSection).getByLabelText("Endpoint")).toHaveValue(
      "http://127.0.0.1:11434",
    );
    expect(within(localSection).getByRole("button", { name: "Save endpoint" }))
      .toBeDisabled();

    await user.click(within(localSection).getByRole("button", { name: "Test connection" }));
    expect(await within(localSection).findByText("Endpoint reached")).toBeInTheDocument();
    expect(within(localSection).getByText(/qwen3:8b/)).toBeInTheDocument();
    await user.click(within(localSection).getByRole("button", { name: "Save endpoint" }));

    expect(await within(localSection).findByText("http://127.0.0.1:11434"))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "New thread" })).not.toBeInTheDocument();
    await user.click(within(localSection).getByRole("button", { name: "Remove Ollama" }));
    expect(within(localSection).queryByText("http://127.0.0.1:11434"))
      .not.toBeInTheDocument();
  });

  it("keeps a Studio Agent API key out of saved profile metadata", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    const localCard = screen.getByRole("heading", { name: "Studio Agent" }).closest("article");
    if (!localCard) throw new Error("Studio Agent card was not rendered.");
    await user.click(within(localCard).getByRole("button", { name: "Configure" }));
    const section = screen
      .getByRole("heading", { name: "Studio model endpoints" })
      .closest("section");
    if (!section) throw new Error("Studio endpoint setup was not rendered.");

    await user.selectOptions(within(section).getByLabelText("Provider"), "open-ai-compatible");
    await user.type(within(section).getByLabelText("Endpoint"), "https://api.example.test");
    await user.type(within(section).getByLabelText(/API key/), "secret-browser-test-key");
    await user.click(within(section).getByRole("button", { name: "Test connection" }));
    await within(section).findByText("Endpoint reached");
    await user.click(within(section).getByRole("button", { name: "Save endpoint" }));

    expect(await within(section).findByText("API key stored by the operating system"))
      .toBeInTheDocument();
    expect(screen.queryByText("secret-browser-test-key")).not.toBeInTheDocument();
    const saved = await ipc.localModelProfiles();
    expect(saved.at(-1)).toMatchObject({
      baseUrl: "https://api.example.test",
      hasCredential: true,
    });
    expect(saved.at(-1)).not.toHaveProperty("apiKey");

    await user.click(within(section).getByRole("button", { name: "Remove OpenAI-compatible" }));
  });

  it("connects a saved local model for a bounded Studio Agent turn", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    const localCard = screen.getByRole("heading", { name: "Studio Agent" }).closest("article");
    if (!localCard) throw new Error("Studio Agent card was not rendered.");
    await user.click(within(localCard).getByRole("button", { name: "Configure" }));
    const localSection = screen
      .getByRole("heading", { name: "Studio model endpoints" })
      .closest("section");
    if (!localSection) throw new Error("Local endpoint setup was not rendered.");
    await user.click(within(localSection).getByRole("button", { name: "Test connection" }));
    await within(localSection).findByText("Endpoint reached");
    await user.click(within(localSection).getByRole("button", { name: "Save endpoint" }));
    await user.click(await within(localSection).findByRole("button", { name: "Test" }));
    const model = await within(localSection).findByLabelText("Model");
    expect(model).toHaveValue("qwen3:8b");
    await user.click(within(localSection).getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("heading", { name: "Chat with Studio Agent" }))
      .toBeInTheDocument();
    expect(screen.getByText(/bounded bundle and source tools, and reviewed staging/i))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thread security scope" }));
    const nativeScope = screen.getByRole("dialog", { name: "Thread security scope" });
    expect(within(nativeScope).getByText("Studio mediated (v1). Unattended work is locked."))
      .toBeInTheDocument();
    expect(within(nativeScope).getByText("Only bounded Studio tools can read the active bundle."))
      .toBeInTheDocument();
    expect(within(nativeScope).getByText("Only the configured endpoint can receive its saved API key."))
      .toBeInTheDocument();
    expect(within(nativeScope).getByText("No external ACP process runs."))
      .toBeInTheDocument();
    expect(within(nativeScope).getByText("Connection only. Stops on disconnect, app exit, or host failure."))
      .toBeInTheDocument();
    expect(within(nativeScope).getByText("Produced by Studio's native provider host."))
      .toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Add context or sources" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Allow edits in this thread" }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Create bundle/ }));
    const localGrant = await screen.findByRole("button", { name: "Allow edits in this thread" });
    expect(localGrant).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/I inspected the available evidence/)).toBeInTheDocument();
    const proposal = await screen.findByRole("region", {
      name: "Proposed OKF bundle structure",
    });
    await waitFor(() => expect(localGrant).toBeEnabled());
    await user.click(localGrant);
    const generate = within(proposal).getByRole("button", { name: "Generate in staging" });
    await user.click(generate);
    expect(await screen.findByText("Propose staged bundle files")).toBeInTheDocument();
    expect(await screen.findByText("Validate staged proposal")).toBeInTheDocument();
    expect(await screen.findByText("Generated 3 proposed files in Studio staging."))
      .toBeInTheDocument();
    expect(await screen.findByText("Fresh bundle draft")).toBeInTheDocument();
    expect(screen.getByText("Change staged for review")).toBeInTheDocument();

    await openAttachmentMenu(user);
    expect(screen.getByRole("button", { name: "Attach context" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await user.type(screen.getByLabelText("Title"), "research-notes.txt");
    await user.type(screen.getByLabelText("Content"), "The source documents an evidence trail.");
    await user.click(screen.getByRole("button", { name: "Attach source" }));
    await user.type(screen.getByLabelText("Message the agent"), "Summarize the attached evidence");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Inspect attached sources")).toBeInTheDocument();
    expect(await screen.findByText("Read attached source")).toBeInTheDocument();
    expect(await screen.findByText(/including research-notes\.txt/)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Message the agent"),
      "Load the OKF instructions, then search the active bundle for agent panel guidance",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Load OKF instructions")).toBeInTheDocument();
    expect((await screen.findAllByText("Search OKF bundle")).length).toBeGreaterThan(0);
    expect(await screen.findByText(
      /Loaded packaged OKF instructions and found the Agent Panel concept/,
    ))
      .toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    const reloadedLocalSection = screen
      .getByRole("heading", { name: "Studio model endpoints" })
      .closest("section");
    if (!reloadedLocalSection) throw new Error("Local endpoint setup was not restored.");
    await user.click(within(reloadedLocalSection).getByRole("button", { name: "Disconnect" }));
    await user.click(within(reloadedLocalSection).getByRole("button", { name: "Remove Ollama" }));
  }, 20_000);

  it("cancels an in-progress agent installation and returns to installable", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    const heading = screen.getByRole("heading", { name: "Codex" });
    const card = heading.closest("article");
    if (!card) throw new Error("Codex card was not rendered.");

    await user.click(await within(card).findByRole("button", { name: "Install" }));
    await user.click(await within(card).findByRole("button", { name: "Cancel" }));

    expect(await within(card).findByText(/Installation cancelled/i)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Install" })).toBeEnabled();
  });

  it("connects an installed catalog agent through its advertised authentication", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    const card = screen.getByRole("heading", { name: "Codex" }).closest("article");
    if (!card) throw new Error("Codex card was not rendered.");
    await user.click(await within(card).findByRole("button", { name: "Install" }));
    vi.spyOn(ipc, "connectCatalogAgent").mockRejectedValueOnce(new Error("Handshake rejected"));
    await user.click(await within(card).findByRole("button", { name: "Connect Codex" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "Connection failed. Handshake rejected",
    );
    await user.click(within(card).getByRole("button", { name: "Connect Codex" }));

    expect(
      await screen.findByRole("heading", { name: "Authentication required" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Ask about this bundle" })).toBeInTheDocument();
    expect(screen.getByText(/read-only access to this bundle/i)).toBeInTheDocument();
    await openAttachmentMenu(user);
    expect(screen.getByRole("button", { name: "Add images" })).toBeDisabled();
    expect(screen.getByTitle("This agent does not accept image prompts.")).toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    const connectedCard = screen.getByRole("heading", { name: "Codex" }).closest("article");
    if (!connectedCard) throw new Error("Connected Codex card was not rendered.");
    await user.click(await within(connectedCard).findByRole("button", { name: "Disconnect" }));
  });

  it("registers and removes a custom ACP argv profile without starting it", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Local Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\agent.exe");
    await user.type(screen.getByLabelText("Arguments, one per line"), "--stdio");
    await user.type(
      screen.getByLabelText("Inherited environment variable names, one per line"),
      "MODEL_PATH",
    );
    await user.click(screen.getByRole("button", { name: "Save command" }));

    expect(await screen.findByText("Local Harness")).toBeInTheDocument();
    expect(screen.getByText(/Not connected/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Local Harness" }));
    expect(screen.queryByText("Local Harness")).not.toBeInTheDocument();
  });

  it("connects and disconnects a custom ACP profile on explicit actions", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Local Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\agent.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));

    await user.click(await screen.findByRole("button", { name: "Connect Local Harness" }));
    expect(screen.getByRole("button", { name: "Connect Local Harness" })).toBeDisabled();
    expect(await screen.findByText(/Connected to Local Harness over ACP v1/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "New thread" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Switch to Local Harness, / })).toBeInTheDocument();
    await chooseThreadAction(user, "Change agent");
    expect(await screen.findByText(/Connected to Local Harness over ACP v1/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("Not connected.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Local Harness" }));
  });
});
