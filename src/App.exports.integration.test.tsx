import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { chooseThreadAction, openAttachmentMenu, openFolder, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio knowledge-work exports", () => {
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
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Research export needs a Sources list with a cited link or bundle path and an Inferences section",
    );
    expect(exportSpy).not.toHaveBeenCalled();

    await chooseThreadAction(user, "Archive thread");
    await user.click(await screen.findByRole("button", { name: "Start new thread" }));
    await user.click(screen.getByRole("button", { name: /Deep research/ }));
    await user.type(screen.getByLabelText("Message the agent"), "Which decisions are documented?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("link", { name: "Product overview" })).toBeInTheDocument();
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("status")).toHaveTextContent("Exported");
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy).toHaveBeenCalledWith(
      expect.stringContaining("deep-research"),
      expect.stringContaining("## Inferences\n\nNone."),
    );

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Research Export Harness" }));
  }, 40_000);

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

    await user.click(await screen.findByRole("button", { name: /Request dataset change/ }));
    await user.type(screen.getByLabelText("Message the agent"), "Omit change sections");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The requested change needs review.")).toBeInTheDocument();
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dataset change export needs a Change Plan with at least one step and an Affected Concepts list with bundle paths",
    );
    expect(exportSpy).not.toHaveBeenCalled();

    await chooseThreadAction(user, "Archive thread");
    await user.click(await screen.findByRole("button", { name: "Start new thread" }));
    await user.click(screen.getByRole("button", { name: /Request dataset change/ }));
    await user.type(screen.getByLabelText("Message the agent"), "Clarify the documented scope");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The change is bounded to the documented product scope."))
      .toBeInTheDocument();
    expect(screen.getByText("Change Plan")).toBeInTheDocument();
    expect(screen.getByText("Affected Concepts")).toBeInTheDocument();
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("status")).toHaveTextContent("Exported");
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy).toHaveBeenCalledWith(
      expect.stringContaining("dataset-change"),
      expect.stringContaining("## Affected Concepts\n\n- `product/overview.md`"),
    );

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Dataset Change Harness" }));
  }, 40_000);

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

    // Let the agent panel's draft session settle first: the reader body is
    // rendered via dangerouslySetInnerHTML, so a pending re-render recreates the
    // paragraph node and detaches an in-flight selection mid-capture.
    await waitFor(() => expect(screen.getByLabelText("Message the agent")).toBeEnabled());

    // The reader-selection capture is a one-shot on the trigger's pointerdown: it
    // reads window.getSelection() at open time, so retrying the assertion cannot
    // help once a stale/collapsed read disabled the button. Instead re-establish
    // the selection fresh and reopen the menu until the capture takes.
    let selectedText = "";
    let attachSelection!: HTMLElement;
    for (let attempt = 1; ; attempt += 1) {
      const paragraph = document.querySelector<HTMLElement>(".reader-main .body p");
      const selection = window.getSelection();
      if (!paragraph || !selection) throw new Error("The reader paragraph could not be selected.");
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      selection.removeAllRanges();
      selection.addRange(range);
      selectedText = selection.toString().trim();

      await openAttachmentMenu(user);
      const btn = screen.getByRole("button", { name: "Attach reader selection" });
      if (!(btn as HTMLButtonElement).disabled) {
        attachSelection = btn;
        break;
      }
      if (attempt >= 5) {
        expect(btn).toBeEnabled(); // never captured — surface a clear failure
        break;
      }
      await user.keyboard("{Escape}");
    }
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
    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Selection Harness" }));
  });
});
