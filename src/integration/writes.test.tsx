import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import * as ipc from "@/shared/ipc.ts";
import { waitForTurnQuiescent } from "@/shared/agentEvents.ts";
import { chooseThreadAction, fillText, openAgentThread } from "@/test/appHarness.tsx";

type AppUser = Awaited<ReturnType<typeof openAgentThread>>["user"];

async function enableWrites(user: AppUser) {
  await fillText(user, screen.getByLabelText("Message the agent"), "Stage: setup.md");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(/Bundle write denied:/);
  const grant = await screen.findByRole("button", { name: "Allow edits in this thread" });
  await waitFor(() => expect(grant).toBeEnabled());
  await user.click(grant);
  await waitFor(() => expect(grant).toHaveAttribute("aria-pressed", "true"));
}

async function stageFile(user: AppUser, path: string) {
  await fillText(user, screen.getByLabelText("Message the agent"), `Stage: ${path}`);
  // Subscribed before the send: the turn can finish between the click and the
  // wait, and a milestone missed that way would hang rather than flake.
  const turnQuiet = waitForTurnQuiescent();
  await user.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(`Browser ACP staged: ${path}`);
  await turnQuiet;
  await screen.findByRole("button", { name: "Send" });
}

describe("OKF Studio reviewed writes", () => {
  it("hands the newest bundle proposal to reviewed staging", async () => {
    const { user } = await openAgentThread("Creation Harness");

    await user.click(screen.getByRole("button", { name: /Create bundle/ }));
    await user.click(screen.getByRole("button", { name: "Send" }));
    const proposal = await screen.findByRole("region", {
      name: "Proposed OKF bundle structure",
    });
    expect(within(proposal).getByText("overview.md")).toBeInTheDocument();
    const generate = await within(proposal).findByRole(
      "button",
      { name: "Generate in staging" },
      { timeout: 3_000 },
    );
    expect(generate).toBeDisabled();
    expect(within(proposal).getByText(/Allow edits for this thread/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Allow edits in this thread" }));
    vi.spyOn(ipc, "setAgentStageMode").mockRejectedValueOnce(
      new Error("The staging workspace is temporarily unavailable."),
    );
    await user.click(generate);
    expect(await within(proposal).findByRole("alert")).toHaveTextContent(
      "Staging failed. The staging workspace is temporarily unavailable.",
    );
    await user.click(within(proposal).getByRole("button", { name: "Retry staging" }));
    expect(await screen.findByText("Generated 3 proposed files in Studio staging."))
      .toBeInTheDocument();
    expect(await screen.findByText("Fresh bundle draft")).toBeInTheDocument();
    expect(screen.getByTitle("overview.md")).toBeInTheDocument();
    expect(screen.getByTitle("agent-system.md")).toBeInTheDocument();
    expect(screen.getByTitle("index.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("status", { name: "Staged validation result" }))
      .toHaveTextContent("OKF validation passed");
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
    await fillText(user, folderName, "CON");
    await user.click(screen.getByRole("button", { name: "Choose parent and create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("portable across Windows");
    expect(screen.getByRole("button", { name: "Retry create" })).toBeInTheDocument();
    await fillText(user, folderName, "customer-knowledge");
    await user.click(screen.getByRole("button", { name: "Choose parent and create" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Created 3 files in customer-knowledge.",
    );
    expect(screen.queryByText("Fresh bundle draft")).not.toBeInTheDocument();

  });

  it("requires explicit existing-file choices before validating an enhancement", async () => {
    const { user } = await openAgentThread("Enhancement Harness");

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
      .toHaveTextContent("OKF validation passed");
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeInTheDocument();

  });

  it("gates agent writes behind the thread grant and stages them for review", async () => {
    vi.spyOn(ipc, "agentStagedFileDiff")
      .mockRejectedValueOnce(new Error("Diff fixture unavailable."));
    const { user } = await openAgentThread("Write Harness");

    expect(screen.queryByRole("button", { name: "Allow edits in this thread" }))
      .not.toBeInTheDocument();

    // Without the grant, a write attempt explains what is missing.
    await fillText(user, screen.getByLabelText("Message the agent"), "Stage: proposals/draft.md");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(
      /Bundle write denied: writes require the Allow edits in this thread grant/,
    )).toBeInTheDocument();
    expect(screen.getByText("Not staged")).toBeInTheDocument();
    expect(screen.queryByText("Staged changes")).not.toBeInTheDocument();

    const grantToggle = await screen.findByRole("button", { name: "Allow edits in this thread" });
    await waitFor(() => expect(grantToggle).toBeEnabled());
    vi.spyOn(ipc, "setAgentWriteGrant").mockRejectedValueOnce(
      new Error("The edit grant could not be saved."),
    );
    await user.click(grantToggle);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Edit access failed. The edit grant could not be saved.",
    );
    await user.click(screen.getByRole("button", { name: "Retry edit access" }));
    await waitFor(() => expect(grantToggle).toHaveAttribute("aria-pressed", "true"));

    await fillText(user, screen.getByLabelText("Message the agent"), "Stage: proposals/draft.md");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Browser ACP staged: proposals/draft.md"))
      .toBeInTheDocument();
    expect(screen.getByText("Staged")).toBeInTheDocument();
    // A successful edit rests collapsed, then reveals its bounded diff on demand.
    const editCard = screen.getAllByLabelText("Tool: Edit the bundle").at(-1);
    if (!editCard) throw new Error("The edit tool card was not rendered.");
    expect(editCard).toHaveClass("agent-tool--card");
    expect(editCard).not.toHaveAttribute("open");
    const editSummary = editCard.querySelector("summary");
    if (!editSummary) throw new Error("The edit tool card has no disclosure summary.");
    await user.click(editSummary);
    expect(editCard).toHaveAttribute("open");
    expect(within(editCard).getByText("product/overview.md")).toBeVisible();
    expect(within(editCard).getByText("-The old scope line.")).toBeVisible();
    expect(within(editCard).getByText("+The revised scope line.")).toBeVisible();
    expect(await screen.findByText("Staged changes")).toBeInTheDocument();
    expect(screen.getByText("proposals/draft.md")).toBeInTheDocument();
    expect(screen.getByText(/not applied to the bundle/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("alert", { name: "Staged validation result" }))
      .toHaveTextContent("OKF validation found errors");
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
    expect(screen.queryByText("OKF validation found errors")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("status", { name: "Staged validation result" }))
      .toHaveTextContent("OKF validation passed");

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

  });

  it("rejects one staged file and retries a failed discard", async () => {
    const { user } = await openAgentThread("Discard Harness");
    await enableWrites(user);

    await stageFile(user, "proposals/draft.md");
    await stageFile(user, "proposals/notes.md");
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

    vi.spyOn(ipc, "discardAgentStagedChanges").mockRejectedValueOnce(
      new Error("The staging store is busy."),
    );
    await user.click(screen.getByRole("button", { name: "Discard all" }));
    const stagedReview = screen.getByRole("region", { name: "Staged changes" });
    const stagingAlert = await within(stagedReview).findByText(
      "Staging action failed. The staging store is busy.",
    );
    const stagedFile = within(stagedReview).getByText("proposals/notes.md");
    expect(
      stagingAlert.compareDocumentPosition(stagedFile) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    await user.click(within(stagedReview).getByRole("button", { name: "Retry discard" }));
    await waitFor(() =>
      expect(screen.queryByText("Staged changes")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Message the agent")).toHaveFocus(),
    );

  });

  it("applies a valid stage and restores its checkpoint after reconnecting", async () => {
    const { user } = await openAgentThread("Restore Harness");
    await enableWrites(user);

    await stageFile(user, "proposals/valid.md");
    await user.click(await screen.findByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("status", { name: "Staged validation result" }))
      .toHaveTextContent("OKF validation passed");
    await user.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(await screen.findByText("Applied 1 file to the bundle."))
      .toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(await screen.findByRole("button", { name: "Connect Restore Harness" }));
    await screen.findByText(/Connected to Restore Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await fillText(user, screen.getByLabelText("Message the agent"), "Resume after restart");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Browser ACP received: Resume after restart");
    vi.spyOn(ipc, "restoreAgentStagedCheckpoint").mockRejectedValueOnce(
      new Error("The checkpoint is temporarily locked."),
    );
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Restore failed. The checkpoint is temporarily locked.",
    );
    await user.click(screen.getByRole("button", { name: "Retry restore" }));
    expect(await screen.findByText("Restored 1 file from the checkpoint."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Restore Harness" }));
  });
});
