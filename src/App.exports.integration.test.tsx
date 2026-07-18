import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import * as ipc from "@/shared/ipc.ts";
import {
  appendText,
  chooseThreadAction,
  fillText,
  openAgentThread,
} from "@/test/appHarness.tsx";

describe("OKF Studio knowledge-work exports", () => {
  it("blocks incomplete deep-research exports and saves a compliant revision", async () => {
    const exportSpy = vi.spyOn(ipc, "exportAgentTranscript");
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    const { user } = await openAgentThread("Research Export Harness");

    await user.click(screen.getByRole("button", { name: /Deep research/ }));
    expect(screen.getByRole("region", { name: "Research with cited evidence" }))
      .toHaveTextContent("okf-inspect, okf-research");
    await appendText(user, screen.getByLabelText("Message the agent"), "Omit research sections");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(promptSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining("Omit research sections"),
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        taskId: "okf-research",
        contextManifest: expect.objectContaining({
          accepted: true,
          bundleFingerprint: expect.stringMatching(/^okf-revision-/u),
        }),
      }),
    ));
    expect(await screen.findByText("Missing required sections.")).toBeInTheDocument();
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Research export needs a Sources list with a cited link or bundle path and an Inferences section",
    );
    expect(exportSpy).not.toHaveBeenCalled();

    await chooseThreadAction(user, "Archive thread");
    await user.click(await screen.findByRole("button", { name: "Start new thread" }));
    await user.click(screen.getByRole("button", { name: /Deep research/ }));
    await appendText(
      user,
      screen.getByLabelText("Message the agent"),
      "Which decisions are documented?",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("link", { name: "Product overview" })).toBeInTheDocument();
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("status")).toHaveTextContent("Exported");
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy).toHaveBeenCalledWith(
      expect.stringContaining("deep-research"),
      expect.stringContaining("## Inferences\n\nNone."),
    );

  });

  it("blocks dataset-change exports without a plan and affected concept set", async () => {
    const exportSpy = vi.spyOn(ipc, "exportAgentTranscript");
    const { user } = await openAgentThread("Dataset Change Harness");

    await user.click(await screen.findByRole("button", { name: /Request dataset change/ }));
    await appendText(user, screen.getByLabelText("Message the agent"), "Omit change sections");
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
    await appendText(
      user,
      screen.getByLabelText("Message the agent"),
      "Clarify the documented scope",
    );
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

  });

  it("attaches an explicit reader selection as bounded source context", async () => {
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    const { user } = await openAgentThread("Selection Harness");
    await user.click(screen.getByRole("treeitem", { name: "Overview" }));

    // Let the agent panel's draft session settle first: the reader body is
    // rendered via dangerouslySetInnerHTML, so a pending re-render recreates the
    // paragraph node and detaches an in-flight selection mid-capture.
    await waitFor(() => expect(screen.getByLabelText("Message the agent")).toBeEnabled());

    // Capture the live range on pointerdown, before opening the menu can
    // re-render the reader's HTML node.
    const paragraph = document.querySelector<HTMLElement>(".reader-main .body p");
    const selection = window.getSelection();
    if (!paragraph || !selection) throw new Error("The reader paragraph could not be selected.");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection.removeAllRanges();
    selection.addRange(range);
    const selectedText = selection.toString().trim();

    const attachmentTrigger = screen.getByRole("button", { name: "Add context or sources" });
    fireEvent.pointerDown(attachmentTrigger);
    fireEvent.click(attachmentTrigger);
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

    await fillText(user, screen.getByLabelText("Message the agent"), "Assess this excerpt");
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
  });
});
