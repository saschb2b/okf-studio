import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import * as ipc from "@/shared/ipc.ts";
import {
  chooseThreadAction,
  fillText,
  openAgentThread,
  openAttachmentMenu,
} from "@/test/appHarness.tsx";

describe("OKF Studio agent turns", () => {
  it("wires one accepted turn into lifecycle output, title, and export", async () => {
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    const exportSpy = vi.spyOn(ipc, "exportAgentTranscript");
    const { user } = await openAgentThread("Turn Harness");

    expect(screen.getByText(/read-only access to this bundle/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Create bundle/ }));
    expect(screen.getByLabelText<HTMLTextAreaElement>("Message the agent").value)
      .toContain("fenced `okf-proposal` JSON block");
    await user.clear(screen.getByLabelText("Message the agent"));

    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach context" }));
    await user.click(screen.getByRole("button", { name: "Add Overview to context" }));
    await fillText(user, screen.getByLabelText("Message the agent"), "Summarize the **bundle**");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(promptSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "Summarize the **bundle**",
      ["product/overview.md"],
      [],
    ));
    const plan = await screen.findByRole("region", { name: "Agent plan" });
    expect(await within(plan).findByText("2 of 2 complete")).toBeInTheDocument();
    const tool = await screen.findByRole("article", { name: "Tool: Search the bundle" });
    expect(tool).toHaveClass("agent-tool--completed");
    expect(screen.getAllByRole("article", { name: "Tool: Search the bundle" })).toHaveLength(1);
    const responseText = await screen.findByText(/Browser ACP received:/);
    expect(responseText.closest("article")).toHaveTextContent(
      "Browser ACP received: Summarize the bundle",
    );
    expect(document.querySelector(".agent-composer__usage")).toHaveTextContent("3% context");
    expect(screen.getByRole("heading", { name: "Summarize the bundle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Overview from context" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename thread: Summarize the bundle" }));
    await fillText(user, screen.getByLabelText("Thread title"), "Bundle research");
    await user.click(screen.getByRole("button", { name: "Save title" }));
    exportSpy.mockRejectedValueOnce(new Error("The selected folder is read-only."));
    await chooseThreadAction(user, "Export thread");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Export failed. The selected folder is read-only.",
    );
    await chooseThreadAction(user, "Export thread");
    expect(exportSpy).toHaveBeenLastCalledWith(
      "bundle-research-thread.md",
      expect.stringContaining("# Bundle research\n\nAgent: Turn Harness"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Exported bundle-research-thread.md",
    );
  });

  it("keeps a rejected draft and its explicit sources for retry", async () => {
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    const { user } = await openAgentThread("Context Harness");

    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Attach issue" }));
    await user.click(screen.getByRole("button", { name: /Attach warning: features\/concept-reader/ }));
    await openAttachmentMenu(user);
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await fillText(user, screen.getByLabelText("Title"), "Interview notes");
    await fillText(
      user,
      screen.getByLabelText("Content"),
      "The owner confirmed the definition.",
    );
    await user.click(screen.getByRole("button", { name: "Attach source" }));

    promptSpy.mockRejectedValueOnce(new Error("Agent session was not ready."));
    await fillText(user, screen.getByLabelText("Message the agent"), "Summarize the evidence");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Agent session was not ready.");
    expect(within(screen.getByRole("region", { name: "Conversation transcript" }))
      .queryByText("Summarize the evidence")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Message the agent")).toHaveValue("Summarize the evidence");
    expect(screen.getByRole("button", { name: "Remove Interview notes source" }))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(promptSpy).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "Summarize the evidence",
      [],
      [
        {
          title: "Warning: features/concept-reader",
          content: "features/concept-reader.md: link target not found -> features/does-not-exist",
          origin: "features/concept-reader.md",
          mediaType: "text/plain",
        },
        {
          title: "Interview notes",
          content: "The owner confirmed the definition.",
        },
      ],
    ));
    expect(await screen.findByText("Browser ACP received: Summarize the evidence"))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Interview notes source" }))
      .not.toBeInTheDocument();
  });

  it("reuses an exact remembered permission only inside its thread", async () => {
    const { user } = await openAgentThread("Permission Harness");

    await fillText(user, screen.getByLabelText("Message the agent"), "Edit: refresh the index");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const permissionHeading = await screen.findByRole("heading", { name: "Permission needed" });
    const permissionCard = permissionHeading.closest("article");
    if (!permissionCard) throw new Error("Permission card was not rendered.");
    await user.click(within(permissionCard).getByRole("checkbox", {
      name: /remember an allow once or reject choice/i,
    }));
    vi.spyOn(ipc, "respondAgentPermission").mockRejectedValueOnce(new Error("Approval failed"));
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(await within(permissionCard).findByRole("alert")).toHaveTextContent("Approval failed");

    await user.click(screen.getByRole("button", {
      name: "Start another thread with Permission Harness",
    }));
    await user.click(screen.getByRole("button", { name: "Close thread surface" }));
    await user.click(screen.getByRole("button", { name: "Close thread" }));
    expect(within(permissionCard).getByRole("alert")).toHaveTextContent("Approval failed");
    await user.click(within(permissionCard).getByRole("button", { name: "Allow once" }));
    expect(await screen.findByText(/Browser ACP received:.*Edit: refresh the index/))
      .toBeInTheDocument();

    await fillText(user, screen.getByLabelText("Message the agent"), "Edit: refresh the links");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Browser ACP received:.*Edit: refresh the links/))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Permission needed" })).not.toBeInTheDocument();
  });

  it("restores a queued follow-up when automatic start fails", async () => {
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    const { user } = await openAgentThread("Queue Harness");

    await fillText(user, screen.getByLabelText("Message the agent"), "Run a long investigation");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("button", { name: "Stop" });
    await waitFor(() => expect(screen.getByLabelText("Message the agent")).toBeEnabled());
    await fillText(user, screen.getByLabelText("Message the agent"), "Explain the implications");
    await user.click(screen.getByRole("button", { name: "Queue" }));
    expect(await screen.findByRole("region", { name: "Next message" })).toBeInTheDocument();

    promptSpy.mockRejectedValueOnce(new Error("Queued follow-up did not start."));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Queued follow-up did not start.");
    expect(screen.getByLabelText("Message the agent")).toHaveValue("Explain the implications");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Browser ACP received: Explain the implications"))
      .toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Next message" })).not.toBeInTheDocument();
  });

  it("keeps partial output while a failed turn is retried", async () => {
    const promptSpy = vi.spyOn(ipc, "promptAgent");
    const { user } = await openAgentThread("Retry Harness");

    await fillText(
      user,
      screen.getByLabelText("Message the agent"),
      "Fail once: simulate a dropped connection",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The agent started a response before the connection failed."))
      .toBeInTheDocument();
    const failedStatus = await screen.findByText(
      "Turn failed. The mock agent connection closed.",
    );
    const failedTurn = failedStatus.closest("article");
    if (!failedTurn) throw new Error("The failed turn record was not rendered.");

    promptSpy.mockRejectedValueOnce(new Error("The retry was not accepted."));
    await user.click(await within(failedTurn).findByRole("button", { name: "Retry turn" }));
    const failedRetry = await within(failedTurn).findByRole("alert");
    expect(failedRetry).toHaveTextContent(
      "Retry failed. The retry was not accepted.",
    );
    await user.click(await within(failedTurn).findByRole("button", { name: "Retry turn" }));
    expect(await screen.findByText("Browser ACP received: Fail once: simulate a dropped connection"))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry turn" })).not.toBeInTheDocument();
  });
});
