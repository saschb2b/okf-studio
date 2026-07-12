import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("shows the first-run empty state", () => {
    renderApp();
    expect(
      screen.getByText(/Point it at a folder\. Read your knowledge as a graph\./i),
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
    expect(screen.getByRole("button", { name: /Create bundle/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enhance bundle/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request dataset change/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Deep research/ }));
    expect(screen.getByLabelText("Message the agent")).toHaveValue(
      "Research this question across the active bundle and attached sources. Cite the evidence for each finding and label any inference: ",
    );
    await user.type(screen.getByLabelText("Message the agent"), "Which decisions lack sources?");
    expect(screen.getByLabelText("Message the agent")).toHaveValue(
      "Research this question across the active bundle and attached sources. Cite the evidence for each finding and label any inference: Which decisions lack sources?",
    );
    expect(promptSpy).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Message the agent"));
    expect(screen.queryByRole("button", { name: "Add files" })).not.toBeInTheDocument();
    await openAttachmentMenu(user);
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Attach context" })).toHaveFocus(),
    );
    await user.click(screen.getByRole("button", { name: "Attach context" }));
    await vi.waitFor(() =>
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
    await vi.waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
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
    await vi.waitFor(() => expect(screen.getByLabelText("HTTPS URL")).toHaveFocus());
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
    await screen.findByText(/Browser ACP received:/);
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
        "# Bundle research\n\nAgent: Research Harness\n\nBundle: OKF Studio (sample)\n\n## You\n\n> Summarize the **bundle**\n\n## Agent\n\n",
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
    expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
    vi.spyOn(ipc, "respondAgentPermission").mockRejectedValueOnce(new Error("Approval failed"));
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(await within(permissionCard).findByRole("alert")).toHaveTextContent("Approval failed");
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(
      await screen.findByText(/Browser ACP received:.*Edit: refresh the index/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();

    await user.type(screen.getByLabelText("Message the agent"), "Run a long investigation");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const userMessageCount = document.querySelectorAll(".agent-message--user").length;
    fireEvent.change(screen.getByLabelText("Message the agent"), {
      target: { value: "Explain the implications" },
    });
    await user.click(await screen.findByRole("button", { name: "Queue" }));
    expect(await screen.findByText("Follow-up queued")).toBeInTheDocument();
    const queuedMessage = screen.getByRole("region", { name: "Next message" });
    await vi.waitFor(() =>
      expect(within(queuedMessage).getByRole("button", { name: "Edit" })).toHaveFocus(),
    );
    expect(document.querySelectorAll(".agent-message--user")).toHaveLength(userMessageCount);
    expect(screen.getByLabelText("Message the agent")).toBeDisabled();
    await user.click(within(queuedMessage).getByRole("button", { name: "Edit" }));
    await vi.waitFor(() => expect(screen.getByLabelText("Message the agent")).toHaveFocus());
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
    await vi.waitFor(() => expect(screen.getByLabelText("Message the agent")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Message the agent"), {
      target: { value: "Explain the implications and cite sources" },
    });
    await user.click(screen.getByRole("button", { name: "Queue" }));
    promptSpy.mockRejectedValueOnce(new Error("Queued follow-up did not start."));
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    const cancelledStatus = await screen.findByText("Turn cancelled.");
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

    await user.type(screen.getByLabelText("Message the agent"), "Fail: simulate a dropped connection");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("The agent started a response before the connection failed."),
    ).toBeInTheDocument();
    const failedStatus = await screen.findByText(
      "Turn failed. The mock agent connection closed.",
    );
    expect(failedStatus.closest("article")).toHaveAttribute("role", "status");

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
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

    const splitter = screen.getByRole("separator", { name: /resize agent panel/i });
    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(
      JSON.parse(localStorage.getItem("okf-studio:agent-panel")!),
    ).toEqual({ open: true, width: 456 });

    first.unmount();
    renderApp();
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
