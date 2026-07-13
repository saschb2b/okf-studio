import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.tsx";
import { AppProvider } from "./store.tsx";
import * as ipc from "./ipc.ts";

// End-to-end-ish: render the real app, drive the mock backend (the IPC layer
// falls back to the in-memory fixture outside a Tauri window), and assert the
// whole UI wires up — empty state, open-folder flow, selection sync, panels.

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

async function openFolder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
  // Wait for the bundle to load. The name now appears in several places (top
  // bar, sidebar home, folder-home landing), so gate on the switcher button.
  await screen.findByRole("button", { name: /switch bundle/i });
}

async function openAttachmentMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add context or sources" }));
}

describe("OKF Studio app", () => {
  it("shows the first-run empty state", async () => {
    const recentBundles = vi.spyOn(ipc, "recentBundles");
    renderApp();
    await waitFor(() => expect(recentBundles).toHaveBeenCalledOnce());
    expect(
      screen.getByText(/Explore connected knowledge with the agents you already use\./i),
    ).toBeInTheDocument();
  });

  it("opens the disconnected agent panel from the status bar", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

    expect(screen.getByRole("complementary", { name: /agent panel/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect an agent" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    expect(screen.getByRole("heading", { name: /choose how agents run/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Claude Agent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Codex" })).toBeInTheDocument();
    const installButtons = await screen.findAllByRole("button", { name: "Install" });
    expect(installButtons).toHaveLength(2);
    expect(installButtons[0]).toBeEnabled();
    expect(screen.getAllByText(/managed Node v24\.11\.0/i)).toHaveLength(2);
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
    const firstConnection = await ipc.connectCustomAgent(firstProfile.id);
    const secondConnection = await ipc.connectCustomAgent(secondProfile.id);

    try {
      const user = userEvent.setup();
      renderApp();
      await openFolder(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

      expect(screen.getByRole("navigation", { name: "Agent connections" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Switch to Research Harness" })).toHaveAttribute(
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

      await user.click(screen.getByRole("button", { name: "Switch to Review Harness" }));
      expect(screen.getByRole("button", { name: "Switch to Review Harness" })).toHaveAttribute(
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

      await user.click(screen.getByRole("button", { name: "Switch to Research Harness" }));
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

  it("runs and switches between parallel threads on one agent connection", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Parallel Harness",
      executable: "C:\\tools\\parallel.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id);

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
        name: "Switch to Thread 1: Run a long investigation",
      })).toHaveAttribute("aria-pressed", "false");
      const secondThreadTab = screen.getByRole("button", {
        name: "Switch to Thread 2: New thread",
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
        name: "Switch to Thread 1: Run a long investigation",
      });
      await user.click(firstThreadTab);
      expect(within(firstConversation).getByRole("button", { name: "Stop" }))
        .toBeInTheDocument();
      expect(within(firstConversation).getByRole("button", {
        name: "Close thread surface",
      })).toBeDisabled();

      await user.click(screen.getByRole("button", {
        name: "Switch to Thread 2: Review the evidence in parallel",
      }));
      await user.click(within(secondConversation).getByRole("button", {
        name: "Close thread surface",
      }));
      await user.click(screen.getByRole("button", { name: "Close thread" }));
      expect(screen.queryByRole("button", {
        name: "Switch to Thread 2: Review the evidence in parallel",
      })).not.toBeInTheDocument();
      expect(firstThreadTab).toHaveFocus();

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

    expect(await within(card).findByRole("button", { name: "Connect Claude Agent" })).toBeEnabled();
    expect(within(card).getByText(/No agent has been started/i)).toBeInTheDocument();
  });

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
    expect(within(nativeScope).getByText("The model receives bounded Studio tools, not arbitrary file access."))
      .toBeInTheDocument();
    expect(within(nativeScope).getByText("No external ACP process runs."))
      .toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Add context or sources" })).toBeEnabled();
    const localGrant = screen.getByRole("button", { name: "Allow edits in this thread" });
    expect(localGrant).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Create bundle/ }));
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
    expect(await screen.findByText("Search OKF bundle")).toBeInTheDocument();
    expect(await screen.findByText(
      /Loaded packaged OKF instructions and found the Agent Panel concept/,
    ))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    const reloadedLocalSection = screen
      .getByRole("heading", { name: "Studio model endpoints" })
      .closest("section");
    if (!reloadedLocalSection) throw new Error("Local endpoint setup was not restored.");
    await user.click(within(reloadedLocalSection).getByRole("button", { name: "Disconnect" }));
    await user.click(within(reloadedLocalSection).getByRole("button", { name: "Remove Ollama" }));
  }, 10_000);

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

    await user.click(screen.getByRole("button", { name: "Change" }));
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
    expect(screen.getByText(/Local Harness · No bundle selected/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open a bundle to start" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByText(/Connected to Local Harness over ACP v1/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("Not connected.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Local Harness" }));
  });

  it("creates a bundle-scoped session and renders streamed agent text", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    const exportSpy = vi.spyOn(ipc, "exportAgentTranscript");
    renderApp();
    await openFolder(user);
    await user.click(screen.getByRole("treeitem", { name: "Overview" }));

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Research Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\research.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Research Harness" }));
    await screen.findByText(/Connected to Research Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "New thread" })).toBeInTheDocument();
    expect(screen.getByText(/read-only access to this bundle/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thread security scope" }));
    const externalScope = screen.getByRole("dialog", { name: "Thread security scope" });
    expect(within(externalScope).getByText("The ACP process keeps normal OS network access."))
      .toBeInTheDocument();
    expect(within(externalScope).getByText("This is mediation, not a filesystem or network sandbox."))
      .toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Create bundle/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enhance bundle/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request dataset change/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Create bundle/ }));
    expect(screen.getByLabelText<HTMLTextAreaElement>("Message the agent").value)
      .toContain("fenced `okf-proposal` JSON block");
    await user.clear(screen.getByLabelText("Message the agent"));
    await user.click(screen.getByRole("button", { name: /Request dataset change/ }));
    expect(screen.getByLabelText("Message the agent")).toHaveValue(
      "Assess this dataset documentation and propose a change plan. Identify dependencies, validation risks, and supporting evidence. End with `## Change Plan` containing actionable steps and `## Affected Concepts` containing one bundle-relative `.md` path per bullet. Do not write files yet: ",
    );
    await user.clear(screen.getByLabelText("Message the agent"));
    await user.click(screen.getByRole("button", { name: /Deep research/ }));
    expect(screen.getByLabelText("Message the agent")).toHaveValue(
      "Research this question across the active bundle and attached sources. Cite the evidence for each finding. End with `## Sources` containing one bullet per cited source and `## Inferences` containing each inference or `None.`: ",
    );
    await user.type(screen.getByLabelText("Message the agent"), "Which decisions lack sources?");
    expect(screen.getByLabelText("Message the agent")).toHaveValue(
      "Research this question across the active bundle and attached sources. Cite the evidence for each finding. End with `## Sources` containing one bullet per cited source and `## Inferences` containing each inference or `None.`: Which decisions lack sources?",
    );
    expect(promptSpy).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Message the agent"));
    expect(screen.queryByRole("button", { name: "Add files" })).not.toBeInTheDocument();
    await openAttachmentMenu(user);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Attach context" })).toHaveFocus(),
    );
    await user.click(screen.getByRole("button", { name: "Attach context" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Search concepts to attach")).toHaveFocus(),
    );
    await user.click(screen.getByRole("button", { name: "Add Overview to context" }));
    expect(screen.getByRole("button", { name: "Remove Overview from context" })).toBeInTheDocument();
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach context" }));
    expect(screen.queryByRole("button", { name: "Add Overview to context" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Search concepts to attach"), "Graph View");
    await user.click(screen.getByRole("button", { name: "Add Graph View to context" }));
    await user.click(screen.getByRole("button", { name: "Remove Graph View from context" }));
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach context" }));
    await user.type(screen.getByLabelText("Search concepts to attach"), "Graph View");
    await user.click(screen.getByRole("button", { name: "Add Graph View to context" }));
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach issue" }));
    await user.click(screen.getByRole("button", { name: /Attach warning: features\/concept-reader/ }));
    expect(
      screen.getByRole("button", { name: "Remove Warning: features/concept-reader source" }),
    ).toBeInTheDocument();
    await openAttachmentMenu(user);
    expect(screen.getByRole("button", { name: "Attach issue" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
    await user.type(screen.getByLabelText("Title"), "Interview notes");
    await user.type(
      screen.getByLabelText("Content"),
      "# Notes\n\nThe catalog owner confirmed the definition.",
    );
    await user.click(screen.getByRole("button", { name: "Attach source" }));
    expect(screen.getByRole("button", { name: "Remove Interview notes source" })).toBeInTheDocument();
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Add files" }));
    expect(
      await screen.findByRole("button", { name: "Remove research-report.pdf source" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(
        "research-report.pdf: 1 of 3 pages had no extractable text. OCR was not used.",
      ),
    ).toBeInTheDocument();
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Add folder" }));
    expect(
      await screen.findByRole("button", { name: "Remove config/settings.json source" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove data/findings.csv source" }),
    ).toBeInTheDocument();
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Add images" }));
    expect(
      await screen.findByRole("button", { name: "Remove architecture.png source" }),
    ).toBeInTheDocument();
    vi.spyOn(ipc, "fetchAgentSourceUrl").mockRejectedValueOnce(
      new Error("The URL could not be fetched securely."),
    );
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await user.click(screen.getByRole("button", { name: "Fetch URL" }));
    await waitFor(() => expect(screen.getByLabelText("HTTPS URL")).toHaveFocus());
    await user.type(screen.getByLabelText("HTTPS URL"), "https://example.com/research.html");
    await user.click(screen.getByRole("button", { name: "Fetch and attach" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The URL could not be fetched securely.",
    );
    await user.click(screen.getByRole("button", { name: "Fetch and attach" }));
    expect(
      await screen.findByRole("button", { name: "Remove research.html source" }),
    ).toBeInTheDocument();

    promptSpy.mockRejectedValueOnce(new Error("Agent session was not ready."));
    await user.type(screen.getByLabelText("Message the agent"), "Summarize the **bundle**");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Agent session was not ready.");
    expect(document.querySelector(".agent-message--user")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New thread" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message the agent")).toHaveValue("Summarize the **bundle**");
    expect(screen.getByRole("button", { name: "Remove Interview notes source" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Warning: features/concept-reader source" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(promptSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "Summarize the **bundle**",
      ["product/overview.md", "features/graph-view.md"],
      [
        {
          title: "Warning: features/concept-reader",
          content:
            "features/concept-reader.md: link target not found -> features/does-not-exist",
          origin: "features/concept-reader.md",
          mediaType: "text/plain",
        },
        {
          title: "Interview notes",
          content: "# Notes\n\nThe catalog owner confirmed the definition.",
        },
        {
          title: "research-report.pdf",
          content: "## Page 1\n\nQuarterly research findings.",
          origin: "research-report.pdf",
          mediaType: "application/pdf",
          sourceDigest: "a".repeat(64),
          warning: "1 of 3 pages had no extractable text. OCR was not used.",
        },
        {
          title: "data/findings.csv",
          content: "## CSV columns\n\n- Column 1: finding\n- Column 2: status\n\n## Rows 1-1\n\n| Row | Column 1: finding | Column 2: status |\n| ---: | --- | --- |\n| 1 | Schema drift | confirmed |\n",
          origin: "data/findings.csv",
          mediaType: "text/csv",
          sourceDigest: "b".repeat(64),
        },
        {
          title: "config/settings.json",
          content: "## JSON structure\n\nPaths use JSON Pointer. `(root)` identifies the complete document.\n\n## Nodes 1-5\n\n| Node | JSON Pointer | Type | Value |\n| ---: | --- | --- | --- |\n| 1 | (root) | object | 2 properties |\n| 2 | /mode | string | \"research\" |\n| 3 | /sources | array | 2 items |\n| 4 | /sources/0 | string | \"csv\" |\n| 5 | /sources/1 | string | \"pdf\" |\n",
          origin: "config/settings.json",
          mediaType: "application/json",
          sourceDigest: "c".repeat(64),
        },
        {
          title: "architecture.png",
          content: "",
          origin: "architecture.png",
          mediaType: "image/png",
          sourceDigest: "3c7474b4239ada3342d87f25ec8849eb8473ee35c5471452482686098b49e81b",
          imageData: "iVBORw0KGgppbWFnZQ==",
        },
        {
          title: "research.html",
          content: "# Remote research\n\nFetched evidence.",
          origin: "https://example.com/research.html",
          mediaType: "text/html",
          sourceDigest: "d".repeat(64),
        },
      ],
    );
    expect(await screen.findByText("Summarize the **bundle**")).toBeInTheDocument();
    const planCard = await screen.findByRole("region", { name: "Agent plan" });
    expect(within(planCard).getByText("Inspect the bundle and attachments")).toBeInTheDocument();
    expect(within(planCard).getByText("Draft the response")).toBeInTheDocument();
    const toolCard = await screen.findByRole("article", { name: "Tool: Search the bundle" });
    expect(within(toolCard).getByText("Search")).toBeInTheDocument();
    await user.click(within(toolCard).getByText("2 locations"));
    expect(within(toolCard).getByText("product/overview.md:12")).toBeVisible();
    expect(within(toolCard).getByText("features/agent-panel.md:49")).toBeVisible();
    await screen.findByText(/Browser ACP received:/);
    expect(within(planCard).getByText("2 of 2 complete")).toBeInTheDocument();
    expect(within(planCard).getAllByText("Completed")).toHaveLength(2);
    expect(within(toolCard).getByText("Completed")).toBeInTheDocument();
    expect(within(toolCard).getByText("2 locations")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Agent plan" })).toHaveLength(1);
    expect(screen.getAllByRole("article", { name: "Tool: Search the bundle" })).toHaveLength(1);
    const completedUsage = document.querySelector(".agent-composer__usage");
    expect(completedUsage).toHaveTextContent("3% context");
    expect(completedUsage?.getAttribute("title")).toContain("Cumulative session cost:");
    const renderedAgentText = document.querySelector(
      ".agent-message--agent .agent-message__markdown strong",
    );
    expect(renderedAgentText).toHaveTextContent("bundle");
    expect(renderedAgentText?.closest(".agent-message")).toHaveTextContent(
      "Browser ACP received: Summarize the bundle",
    );
    expect(await screen.findByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Summarize the bundle" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rename thread: Summarize the bundle" }));
    const titleInput = screen.getByLabelText("Thread title");
    expect(titleInput).toHaveFocus();
    await user.clear(titleInput);
    await user.type(titleInput, "Bundle research");
    await user.click(screen.getByRole("button", { name: "Save title" }));
    expect(screen.getByRole("heading", { name: "Bundle research" })).toBeInTheDocument();
    exportSpy.mockRejectedValueOnce(new Error("The selected folder is read-only."));
    await user.click(screen.getByRole("button", { name: "Export thread" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Export failed. The selected folder is read-only.",
    );
    await user.click(screen.getByRole("button", { name: "Export thread" }));
    expect(exportSpy).toHaveBeenLastCalledWith(
      "bundle-research-thread.md",
      expect.stringContaining(
        "# Bundle research\n\nAgent: Research Harness\n\nBundle: OKF Studio (sample)\n\n## You\n\n> Summarize the **bundle**\n\n## Plan\n\n- [x] Inspect the bundle and attachments\n- [x] Draft the response\n\n> **Tool (Completed):** Search the bundle\n\n## Agent\n\n",
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Exported bundle-research-thread.md",
    );
    expect(screen.getByRole("button", { name: "Add context or sources" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Interview notes source" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Warning: features/concept-reader source" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove research-report.pdf source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove config/settings.json source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove data/findings.csv source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove architecture.png source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove research.html source" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Message the agent"), "Edit: refresh the index");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const permissionHeading = await screen.findByRole("heading", { name: "Permission needed" });
    const permissionCard = permissionHeading.closest("article");
    if (!permissionCard) throw new Error("Permission card was not rendered.");
    expect(within(permissionCard).getByText("Write bundle files")).toBeInTheDocument();
    const repeatChoice = within(permissionCard).getByRole("checkbox", {
      name: /remember an allow once or reject choice/i,
    });
    await user.click(repeatChoice);
    expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
    vi.spyOn(ipc, "respondAgentPermission").mockRejectedValueOnce(new Error("Approval failed"));
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(await within(permissionCard).findByRole("alert")).toHaveTextContent("Approval failed");
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(
      await screen.findByText(/Browser ACP received:.*Edit: refresh the index/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();

    await user.type(screen.getByLabelText("Message the agent"), "Edit: refresh the links");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(/Browser ACP received:.*Edit: refresh the links/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Permission needed" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Message the agent"), "Run a long investigation");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const activeToolCards = await screen.findAllByRole("article", {
      name: "Tool: Search the bundle",
    });
    const activeToolCard = activeToolCards.at(-1);
    if (!activeToolCard) throw new Error("The active tool card was not rendered.");
    expect(within(activeToolCard).getByText("Running")).toBeInTheDocument();
    expect(document.querySelector(".agent-composer__usage")).toHaveTextContent("2% context");
    const userMessageCount = document.querySelectorAll(".agent-message--user").length;
    fireEvent.change(screen.getByLabelText("Message the agent"), {
      target: { value: "Explain the implications" },
    });
    await user.click(await screen.findByRole("button", { name: "Queue" }));
    expect(await screen.findByText("Follow-up queued")).toBeInTheDocument();
    const queuedMessage = screen.getByRole("region", { name: "Next message" });
    await waitFor(() =>
      expect(within(queuedMessage).getByRole("button", { name: "Edit" })).toHaveFocus(),
    );
    expect(document.querySelectorAll(".agent-message--user")).toHaveLength(userMessageCount);
    expect(screen.getByLabelText("Message the agent")).toBeDisabled();
    await user.click(within(queuedMessage).getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(screen.getByLabelText("Message the agent")).toHaveFocus());
    expect(screen.getByLabelText("Message the agent")).toHaveValue("Explain the implications");
    fireEvent.change(screen.getByLabelText("Message the agent"), {
      target: { value: "Explain the implications and cite sources" },
    });
    await user.click(screen.getByRole("button", { name: "Queue" }));
    await user.click(
      within(screen.getByRole("region", { name: "Next message" }))
        .getByRole("button", { name: "Remove" }),
    );
    expect(screen.queryByRole("region", { name: "Next message" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Message the agent")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Message the agent"), {
      target: { value: "Explain the implications and cite sources" },
    });
    await user.click(screen.getByRole("button", { name: "Queue" }));
    promptSpy.mockRejectedValueOnce(new Error("Queued follow-up did not start."));
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    const cancelledStatus = await screen.findByText("Turn cancelled.");
    expect(within(activeToolCard).getByText("Cancelled")).toBeInTheDocument();
    expect(cancelledStatus.closest("article")).toHaveAttribute("role", "status");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Queued follow-up did not start.",
    );
    expect(screen.getByLabelText("Message the agent")).toHaveValue(
      "Explain the implications and cite sources",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText(
        "Browser ACP received: Explain the implications and cite sources",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Next message" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Message the agent"), "Fail once: simulate a dropped connection");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("The agent started a response before the connection failed."),
    ).toBeInTheDocument();
    const failedStatus = await screen.findByText(
      "Turn failed. The mock agent connection closed.",
    );
    const failedTurn = failedStatus.closest("article");
    if (!failedTurn) throw new Error("The failed turn record was not rendered.");
    expect(failedTurn).toHaveAttribute("role", "status");
    promptSpy.mockRejectedValueOnce(new Error("The retry was not accepted."));
    await user.click(within(failedTurn).getByRole("button", { name: "Retry turn" }));
    expect(await within(failedTurn).findByRole("alert")).toHaveTextContent(
      "Retry failed. The retry was not accepted.",
    );
    await user.click(within(failedTurn).getByRole("button", { name: "Retry turn" }));
    expect(
      await screen.findByText("Browser ACP received: Fail once: simulate a dropped connection"),
    ).toBeInTheDocument();
    expect(within(failedTurn).queryByRole("button", { name: "Retry turn" })).not.toBeInTheDocument();

    vi.spyOn(ipc, "pickAgentTextSources").mockRejectedValueOnce(
      new Error("The selected file is not UTF-8 text."),
    );
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Add files" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The selected file is not UTF-8 text.",
    );

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Research Harness" }));
  }, 25_000);

  it("hands the newest bundle proposal to reviewed staging", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Creation Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\creation.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Creation Harness" }));
    await screen.findByText(/Connected to Creation Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.click(screen.getByRole("button", { name: /Create bundle/ }));
    await user.click(screen.getByRole("button", { name: "Send" }));
    const proposal = await screen.findByRole("region", {
      name: "Proposed OKF bundle structure",
    });
    expect(within(proposal).getByText("overview.md")).toBeInTheDocument();
    const generate = within(proposal).getByRole("button", { name: "Generate in staging" });
    expect(generate).toBeDisabled();
    expect(within(proposal).getByText(/Allow edits for this thread/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Allow edits in this thread" }));
    await user.click(generate);
    expect(await screen.findByText("Generated 3 proposed files in Studio staging."))
      .toBeInTheDocument();
    expect(await screen.findByText("Fresh bundle draft")).toBeInTheDocument();
    expect(screen.getByTitle("overview.md")).toBeInTheDocument();
    expect(screen.getByTitle("agent-system.md")).toBeInTheDocument();
    expect(screen.getByTitle("index.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("status", { name: "Staged validation result" }))
      .toHaveTextContent("Validation passed");
    const graph = screen.getByRole("region", { name: "Staged graph preview" });
    expect(graph).toHaveTextContent("2 concepts · 1 link");
    expect(graph).toHaveTextContent("Product overview, Product, staged");
    expect(graph).toHaveTextContent("Agent system, Architecture, staged");
    expect(graph).toHaveTextContent("Link from overview to agent-system");
    expect(screen.queryByRole("button", { name: "Apply changes" })).not.toBeInTheDocument();
    expect(screen.getByText(/Existing folders are never merged with or replaced/i))
      .toBeInTheDocument();
    const folderName = screen.getByLabelText("Bundle folder name");
    expect(folderName).toHaveValue("new-okf-bundle");
    await user.clear(folderName);
    await user.type(folderName, "CON");
    await user.click(screen.getByRole("button", { name: "Choose parent and create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("portable across Windows");
    await user.clear(folderName);
    await user.type(folderName, "customer-knowledge");
    await user.click(screen.getByRole("button", { name: "Choose parent and create" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Created 3 files in customer-knowledge.",
    );
    expect(screen.queryByText("Fresh bundle draft")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Creation Harness" }));
  });

  it("requires explicit existing-file choices before validating an enhancement", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Enhancement Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\enhancement.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Enhancement Harness" }));
    await screen.findByText(/Connected to Enhancement Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.click(screen.getByRole("button", { name: /Enhance bundle/ }));
    await user.click(screen.getByRole("button", { name: "Send" }));
    const proposal = await screen.findByRole("region", {
      name: "Proposed OKF bundle structure",
    });
    expect(within(proposal).getAllByText("product/overview.md").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Allow edits in this thread" }));
    await user.click(within(proposal).getByRole("button", { name: "Generate in staging" }));

    expect(await screen.findByText("Enhancement draft")).toBeInTheDocument();
    expect(screen.getByText(/Modified · explicit review required/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "choose Keep or Reject for 1 hunk",
    );

    await user.click(screen.getByRole("button", {
      name: "Review staged file product/overview.md",
    }));
    const choice = await screen.findByRole("group", { name: "Hunk 1 choice" });
    const keep = within(choice).getByRole("button", { name: "Keep" });
    const reject = within(choice).getByRole("button", { name: "Reject" });
    expect(keep).toHaveAttribute("aria-pressed", "false");
    expect(reject).toHaveAttribute("aria-pressed", "false");
    await user.click(keep);
    expect(keep).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("status", { name: "Staged validation result" }))
      .toHaveTextContent("Validation passed");
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Enhancement Harness" }));
  });

  it("lists and restores agent-owned sessions for the active bundle", async () => {
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

    await user.click(screen.getByRole("button", { name: "Agent session history" }));
    expect(await screen.findByRole("heading", { name: "Agent session history" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "History unavailable. History service unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("This agent has no sessions for the active bundle.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh agent session history" }));
    expect(await screen.findByText("Trace bundle evidence")).toBeInTheDocument();
    expect(screen.getByText("Resolve validation warnings")).toBeInTheDocument();

    const session = screen.getByText("Trace bundle evidence").closest("li");
    if (!session) throw new Error("The session history row was not rendered.");
    await user.click(within(session).getByRole("button", { name: "Restore" }));

    expect(await screen.findByRole("heading", { name: "Trace bundle evidence" })).toBeInTheDocument();
    expect(screen.getByText(/Trace the evidence behind/)).toBeInTheDocument();
    expect(screen.getByText(/traced the principles/)).toBeInTheDocument();
    expect(screen.getByLabelText("Message the agent")).toBeEnabled();
    await waitFor(
      () => expect(screen.getByLabelText("Message the agent")).toHaveFocus(),
      { timeout: 3_000 },
    );

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

    await user.click(screen.getByRole("button", { name: "Archive current thread" }));
    expect(await screen.findByRole("heading", { name: "Archived thread" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New thread" })).toBeInTheDocument();
    await waitFor(() => expect(
      JSON.parse(localStorage.getItem("okf-studio:agent-threads") ?? "[]"),
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: "mock-session-research",
        title: "Evidence notebook",
        archived: true,
      }),
    ])));
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Evidence notebook" })).toBeInTheDocument();
    expect(screen.getByText(/traced the principles/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect History Harness" }));
    await screen.findByText(/Connected to History Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Continue previous thread" }))
      .toBeInTheDocument();
    expect(screen.getByText("Evidence notebook")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Evidence notebook" })).toBeInTheDocument();
    expect(screen.getByText(/traced the principles/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect History Harness" }));
    await screen.findByText(/Connected to History Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    historySpy.mockResolvedValueOnce({ sessions: [], hasMore: false });
    await user.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saved thread unavailable. The agent no longer reports this session",
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Evidence notebook" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
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

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove History Harness" }));
  }, 15_000);

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
    await user.click(screen.getByRole("button", { name: "Archive current thread" }));
    expect(await screen.findByRole("heading", { name: "Archived thread" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Summarize the bundle" }))
      .toBeInTheDocument();
    expect(screen.getByText("Browser ACP received: Summarize the bundle"))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
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

    await user.click(screen.getByRole("button", { name: "Archive current thread" }));
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

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Thread Context Harness" }));
  }, 25_000);

  it("gates agent writes behind the thread grant and stages them for review", async () => {
    const user = userEvent.setup();
    vi.spyOn(ipc, "agentStagedFileDiff")
      .mockRejectedValueOnce(new Error("Diff fixture unavailable."));
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Write Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\write.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Write Harness" }));
    await screen.findByText(/Connected to Write Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    const grantToggle = screen.getByRole("button", { name: "Allow edits in this thread" });
    expect(grantToggle).toBeDisabled();

    // Without the grant, a write attempt explains what is missing.
    await user.type(screen.getByLabelText("Message the agent"), "Stage: proposals/draft.md");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(
      /Bundle write denied: writes require the Allow edits in this thread grant/,
    )).toBeInTheDocument();
    expect(screen.getByText("Change not staged")).toBeInTheDocument();
    expect(screen.queryByText("Staged changes")).not.toBeInTheDocument();

    await waitFor(() => expect(grantToggle).toBeEnabled());
    await user.click(grantToggle);
    await waitFor(() => expect(grantToggle).toHaveAttribute("aria-pressed", "true"));

    await user.type(screen.getByLabelText("Message the agent"), "Stage: proposals/draft.md");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP staged: proposals/draft.md"))
      .toBeInTheDocument();
    expect(screen.getByText("Change staged for review")).toBeInTheDocument();
    expect(await screen.findByText("Staged changes")).toBeInTheDocument();
    expect(screen.getByText("proposals/draft.md")).toBeInTheDocument();
    expect(screen.getByText(/not applied to the bundle/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("alert", { name: "Staged validation result" }))
      .toHaveTextContent("Validation found errors");
    expect(screen.getByText(/1 error · 0 warnings/)).toBeInTheDocument();
    await user.click(screen.getByText("Review validation issues"));
    expect(screen.getByText(/Missing required frontmatter field: type/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", {
      name: "Review staged file proposals/draft.md",
    }));
    expect(await screen.findByText(/Diff unavailable\. Diff fixture unavailable\./))
      .toHaveTextContent(
      "Diff unavailable. Diff fixture unavailable.",
    );
    await user.click(screen.getByRole("button", {
      name: "Retry staged file proposals/draft.md",
    }));
    const diff = await screen.findByLabelText("Unified diff for proposals/draft.md");
    expect(diff).toHaveTextContent("+# Draft");
    const hunkChoice = within(diff).getByRole("group", { name: "Hunk 1 choice" });
    const keepHunk = within(hunkChoice).getByRole("button", { name: "Keep" });
    const rejectHunk = within(hunkChoice).getByRole("button", { name: "Reject" });
    expect(keepHunk).toHaveAttribute("aria-pressed", "true");
    expect(rejectHunk).toHaveAttribute("aria-pressed", "false");
    await user.click(rejectHunk);
    await waitFor(() => expect(rejectHunk).toHaveAttribute("aria-pressed", "true"));
    expect(keepHunk).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Validation found errors")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("status", { name: "Staged validation result" }))
      .toHaveTextContent("Validation passed");

    // The Rust-owned choice survives closing and reopening the review.
    expect(screen.getByRole("button", {
      name: "Close staged file proposals/draft.md",
    })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.click(screen.getByRole("button", {
      name: "Close staged file proposals/draft.md",
    }));
    await user.click(screen.getByRole("button", {
      name: "Review staged file proposals/draft.md",
    }));
    const reopenedDiff = await screen.findByLabelText("Unified diff for proposals/draft.md");
    expect(within(reopenedDiff).getByRole("button", { name: "Reject" }))
      .toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(await screen.findByText("The rejected staged changes were cleared."))
      .toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Staged changes")).not.toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText("Message the agent"), "Stage: proposals/draft.md");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP staged: proposals/draft.md"))
      .toBeInTheDocument();
    await screen.findByRole("button", { name: "Send" });

    await user.type(screen.getByLabelText("Message the agent"), "Stage: proposals/notes.md");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP staged: proposals/notes.md"))
      .toBeInTheDocument();
    expect(screen.getByText("proposals/notes.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", {
      name: "Reject staged file proposals/draft.md",
    }));
    await waitFor(() =>
      expect(screen.queryByText("proposals/draft.md")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("proposals/notes.md")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Discard all" })).toHaveFocus(),
    );

    await user.click(screen.getByRole("button", { name: "Discard all" }));
    await waitFor(() =>
      expect(screen.queryByText("Staged changes")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Message the agent")).toHaveFocus(),
    );

    await user.type(screen.getByLabelText("Message the agent"), "Stage: proposals/valid.md");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP staged: proposals/valid.md"))
      .toBeInTheDocument();
    await screen.findByRole("button", { name: "Send" });
    await user.click(await screen.findByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("status", { name: "Staged validation result" }))
      .toHaveTextContent("Validation passed");
    await user.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(await screen.findByText("Applied 1 file to the bundle."))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect Write Harness" }));
    await screen.findByText(/Connected to Write Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByLabelText("Message the agent"), "Resume after restart");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Browser ACP received: Resume after restart");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("Restored 1 file from the checkpoint."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Write Harness" }));
  }, 25_000);

  it("blocks incomplete deep-research exports and saves a compliant revision", async () => {
    const user = userEvent.setup();
    const exportSpy = vi.spyOn(ipc, "exportAgentTranscript");
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Research Export Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\research-export.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Research Export Harness" }));
    await screen.findByText(/Connected to Research Export Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.click(screen.getByRole("button", { name: /Deep research/ }));
    await user.type(screen.getByLabelText("Message the agent"), "Omit research sections");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Missing required sections.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export thread" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Research export needs a Sources list with a cited link or bundle path and an Inferences section",
    );
    expect(exportSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Archive current thread" }));
    await user.click(screen.getByRole("button", { name: /Deep research/ }));
    await user.type(screen.getByLabelText("Message the agent"), "Which decisions are documented?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("link", { name: "Product overview" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export thread" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Exported");
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy).toHaveBeenCalledWith(
      expect.stringContaining("deep-research"),
      expect.stringContaining("## Inferences\n\nNone."),
    );

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Research Export Harness" }));
  });

  it("blocks dataset-change exports without a plan and affected concept set", async () => {
    const user = userEvent.setup();
    const exportSpy = vi.spyOn(ipc, "exportAgentTranscript");
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Dataset Change Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\dataset-change.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Dataset Change Harness" }));
    await screen.findByText(/Connected to Dataset Change Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.click(screen.getByRole("button", { name: /Request dataset change/ }));
    await user.type(screen.getByLabelText("Message the agent"), "Omit change sections");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The requested change needs review.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export thread" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dataset change export needs a Change Plan with at least one step and an Affected Concepts list with bundle paths",
    );
    expect(exportSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Archive current thread" }));
    await user.click(screen.getByRole("button", { name: /Request dataset change/ }));
    await user.type(screen.getByLabelText("Message the agent"), "Clarify the documented scope");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The change is bounded to the documented product scope."))
      .toBeInTheDocument();
    expect(screen.getByText("Change Plan")).toBeInTheDocument();
    expect(screen.getByText("Affected Concepts")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export thread" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Exported");
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy).toHaveBeenCalledWith(
      expect.stringContaining("dataset-change"),
      expect.stringContaining("## Affected Concepts\n\n- `product/overview.md`"),
    );

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Dataset Change Harness" }));
  });

  it("attaches an explicit reader selection as bounded source context", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    renderApp();
    await openFolder(user);
    await user.click(screen.getByRole("treeitem", { name: "Overview" }));

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Selection Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\selection.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Selection Harness" }));
    await screen.findByText(/Connected to Selection Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    const paragraph = document.querySelector<HTMLElement>(".reader-main .body p");
    const selection = window.getSelection();
    if (!paragraph || !selection) throw new Error("The reader paragraph could not be selected.");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection.removeAllRanges();
    selection.addRange(range);
    const selectedText = selection.toString().trim();

    await openAttachmentMenu(user);
    const attachSelection = screen.getByRole("button", { name: "Attach reader selection" });
    expect(attachSelection).toBeEnabled();
    expect(attachSelection).toHaveAttribute(
      "title",
      "Attach the selected text from the current concept",
    );
    await user.click(attachSelection);
    expect(
      screen.getByRole("button", { name: "Remove Selection from Overview source" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Message the agent"), "Assess this excerpt");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(promptSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "Assess this excerpt",
      [],
      [{
        title: "Selection from Overview",
        content: selectedText,
        origin: "product/overview.md#reader-selection",
        mediaType: "text/plain",
      }],
    );
    await screen.findByText(/Browser ACP received:.*Assess this excerpt/);
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Selection Harness" }));
  });

  it("uses an ACP-advertised authentication method before starting a session", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Auth Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\auth.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Auth Harness" }));
    expect(await screen.findByText(/Authentication is required before a session/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByRole("heading", { name: "Authentication required" })).toBeInTheDocument();
    expect(screen.getByText("Sign in with browser")).toBeInTheDocument();
    expect(screen.getByText(/agent opens its own sign-in flow/i)).toBeInTheDocument();
    vi.spyOn(ipc, "authenticateAgent").mockRejectedValueOnce(new Error("Browser closed"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Authentication failed. Browser closed",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Ask about this bundle" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(await screen.findByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Auth Harness" }));
  });

  it("keeps a custom ACP connection failure visible and retryable", async () => {
    vi.spyOn(ipc, "connectCustomAgent").mockRejectedValueOnce(new Error("Handshake rejected"));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Broken Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\broken.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));

    await user.click(await screen.findByRole("button", { name: "Connect Broken Harness" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection failed. Handshake rejected",
    );
    expect(screen.getByRole("button", { name: "Connect Broken Harness" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Remove Broken Harness" }));
  });

  it("shows a retryable error when the connection catalog cannot load", async () => {
    vi.spyOn(ipc, "agentCatalog").mockRejectedValueOnce(new Error("Catalog unavailable"));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Catalog unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("moves focus into and out of the agent panel with its shortcut", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    expect(screen.getByRole("button", { name: "Connect an agent" })).toHaveFocus();

    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    expect(screen.getByRole("button", { name: /toggle agent panel/i })).toHaveFocus();
  });

  it("persists the agent panel width and visibility", async () => {
    const recentBundles = vi.spyOn(ipc, "recentBundles");
    const user = userEvent.setup();
    const first = renderApp();
    await waitFor(() => expect(recentBundles).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

    const splitter = screen.getByRole("separator", { name: /resize agent panel/i });
    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(
      JSON.parse(localStorage.getItem("okf-studio:agent-panel")!),
    ).toEqual({ open: true, width: 456 });

    first.unmount();
    renderApp();
    await waitFor(() => expect(recentBundles).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("complementary", { name: /agent panel/i })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /resize agent panel/i })).toHaveAttribute(
      "aria-valuenow",
      "456",
    );
  });

  it("opens a folder and lists the bundle's concepts in the sidebar", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFolder(user);

    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    expect(within(sidebar).getByRole("treeitem", { name: /Overview/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole("treeitem", { name: /Graph View/i })).toBeInTheDocument();
  });

  it("lands on the bundle's folder home and syncs selection into the reader", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFolder(user);

    const reader = container.querySelector<HTMLElement>(".reader")!;
    // Default landing is the bundle root's folder home (its index.md), not a
    // concept — its title is the bundle name and its authored intro renders.
    expect(
      within(reader).getByRole("heading", { name: "OKF Studio (sample)" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".folder-home")).not.toBeNull();

    // Selecting a concept in the sidebar updates the reader.
    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    await user.click(within(sidebar).getByRole("treeitem", { name: /Graph View/i }));
    expect(
      await within(reader).findByRole("heading", { name: "Graph View" }),
    ).toBeInTheDocument();
  });

  it("surfaces the fixture's broken-link warning in the validation badge", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);
    // The mock bundle carries one broken cross-link, which validation reports
    // as a warning (amber), not the quiet conformant baseline.
    const badge = screen.getByRole("button", { name: /validation/i });
    expect(badge).toHaveTextContent(/1 warning/i);
    await user.click(badge);
    expect(
      await screen.findByText(/link target not found/i),
    ).toBeInTheDocument();
  });
});
