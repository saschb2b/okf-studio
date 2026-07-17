import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { chooseThreadAction, openAttachmentMenu, openFolder, openThreadActions, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio agent turn", () => {
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
    expect(within(externalScope).getByText("External interactive (v1). Unattended work is locked."))
      .toBeInTheDocument();
    expect(within(externalScope).getByText("The ACP process keeps normal OS network access."))
      .toBeInTheDocument();
    expect(within(externalScope).getByText("The process can access its launch environment and credentials available through the OS."))
      .toBeInTheDocument();
    expect(within(externalScope).getByText(/Produced by the ACP launcher after (Job Object|process-group) attachment\./))
      .toBeInTheDocument();
    expect(within(externalScope).getByText("This proves process-tree ownership, not a filesystem or network sandbox."))
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
    await user.click(await screen.findByRole("button", { name: /Deep research/ }));
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
    // Zed-style quiet row: the title is the whole line; no kind label text.
    expect(within(toolCard).getByText("Search the bundle")).toBeInTheDocument();
    expect(toolCard).toHaveClass("agent-tool--row");
    await user.click(within(toolCard).getByText("2 locations"));
    expect(within(toolCard).getByText("product/overview.md:12")).toBeVisible();
    expect(within(toolCard).getByText("features/agent-panel.md:49")).toBeVisible();
    await screen.findByText(/Browser ACP received:/);
    expect(within(planCard).getByText("2 of 2 complete")).toBeInTheDocument();
    expect(within(planCard).getAllByText("Completed")).toHaveLength(2);
    // Completed is the silent resting state (Zed): class only, no status text.
    expect(toolCard).toHaveClass("agent-tool--completed");
    expect(within(toolCard).queryByText("Completed")).not.toBeInTheDocument();
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
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Export failed. The selected folder is read-only.",
    );
    await chooseThreadAction(user, "Export thread");
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
    await openThreadActions(user);
    expect(await screen.findByRole("menuitem", { name: "Change agent" }))
      .toHaveAttribute("data-disabled", "");
    await user.keyboard("{Escape}");
    vi.spyOn(ipc, "respondAgentPermission").mockRejectedValueOnce(new Error("Approval failed"));
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(await within(permissionCard).findByRole("alert")).toHaveTextContent("Approval failed");
    await user.click(screen.getByRole("button", {
      name: "Start another thread with Research Harness",
    }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close thread surface" }));
    await user.click(screen.getByRole("button", { name: "Close thread" }));
    expect(within(permissionCard).getByRole("alert")).toHaveTextContent("Approval failed");
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(
      await screen.findByText(/Browser ACP received:.*Edit: refresh the index/),
    ).toBeInTheDocument();
    await openThreadActions(user);
    expect(await screen.findByRole("menuitem", { name: "Change agent" }))
      .not.toHaveAttribute("data-disabled");
    await user.keyboard("{Escape}");

    await user.type(screen.getByLabelText("Message the agent"), "Edit: refresh the links");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(/Browser ACP received:.*Edit: refresh the links/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Permission needed" })).not.toBeInTheDocument();

    const longInvestigationComposer = screen.getByLabelText("Message the agent");
    await waitFor(() => expect(longInvestigationComposer).toBeEnabled());
    await user.type(longInvestigationComposer, "Run a long investigation");
    const sendLongInvestigation = await screen.findByRole("button", { name: "Send" });
    await waitFor(() => expect(sendLongInvestigation).toBeEnabled());
    await user.click(sendLongInvestigation);
    const activeToolCard = await waitFor(() => {
      const card = screen.getAllByRole("article", { name: "Tool: Search the bundle" })
        .find((candidate) => candidate.classList.contains("agent-tool--in-progress"));
      if (!card) throw new Error("The active tool card was not rendered.");
      return card;
    });
    // Running shows as the pulsing-icon state (class), not a status label.
    expect(activeToolCard).toHaveClass("agent-tool--in-progress");
    expect(document.querySelector(".agent-composer__usage")).toHaveTextContent("2% context");
    const userMessageCount = document.querySelectorAll(".agent-message--user").length;
    fireEvent.change(screen.getByLabelText("Message the agent"), {
      target: { value: "Explain the implications" },
    });
    await user.click(await screen.findByRole("button", { name: "Queue" }));
    expect(await screen.findByText("Follow-up queued")).toBeInTheDocument();
    const queuedMessage = screen.getByRole("region", { name: "Next message" });
    await waitFor(() =>
      expect(within(queuedMessage).getByRole("button", { name: "Recall draft" })).toHaveFocus(),
    );
    expect(document.querySelectorAll(".agent-message--user")).toHaveLength(userMessageCount);
    expect(screen.getByLabelText("Message the agent")).toBeDisabled();
    await user.click(within(queuedMessage).getByRole("button", { name: "Recall draft" }));
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

    const failureComposer = screen.getByLabelText("Message the agent");
    await waitFor(() => expect(failureComposer).toBeEnabled());
    await user.type(failureComposer, "Fail once: simulate a dropped connection");
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
    await user.click(await within(failedTurn).findByRole("button", { name: "Retry turn" }));
    expect(await within(failedTurn).findByRole("alert")).toHaveTextContent(
      "Retry failed. The retry was not accepted.",
    );
    await user.click(await within(failedTurn).findByRole("button", { name: "Retry turn" }));
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

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Research Harness" }));
  }, 60_000);
});
