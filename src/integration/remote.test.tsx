import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { fillText, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio remote bundle features", () => {
  it("explains a URL that fetches successfully but holds no OKF bundle", async () => {
    const user = userEvent.setup();
    // The URL is reachable (fetch resolves) but the folder has no bundle.
    vi.spyOn(ipc, "fetchRemoteBundle").mockResolvedValue({ folder: "/tmp/empty" });
    vi.spyOn(ipc, "scanBundles").mockResolvedValue([]);
    renderApp();

    // Open the remote dialog from the first-run empty state.
    await user.click(screen.getByRole("button", { name: /open from url/i }));
    const dialog = await screen.findByRole("dialog", { name: /open from url/i });
    await fillText(
      user,
      within(dialog).getByLabelText(/paste a github url/i),
      "https://github.com/owner/repo/tree/main/samples/x",
    );
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));

    // The dialog stays open and explains the outcome — no bundle ever opened,
    // so the app is still on the first-run empty state, not a workspace.
    await within(dialog).findByText(/no okf bundle at that url/i);
    expect(screen.queryByText("OKF Studio (sample)")).not.toBeInTheDocument();
  });

  it("offers a picker when a URL resolves to several bundles", async () => {
    const user = userEvent.setup();
    const roots = [
      { root: "/r/alpha", name: "Alpha", relPath: "alpha", okfVersion: null, confidence: "candidate", conceptCount: 5, types: ["Note"] },
      { root: "/r/beta", name: "Beta", relPath: "beta", okfVersion: null, confidence: "candidate", conceptCount: 11, types: ["Note", "Table"] },
    ] as const;
    vi.spyOn(ipc, "fetchRemoteBundle").mockResolvedValue({ folder: "/r" });
    vi.spyOn(ipc, "scanBundles").mockResolvedValue(roots as never);
    renderApp();

    await user.click(screen.getByRole("button", { name: /open from url/i }));
    const dialog = await screen.findByRole("dialog", { name: /open from url/i });
    await fillText(
      user,
      within(dialog).getByLabelText(/paste a github url/i),
      "https://github.com/owner/repo/tree/main/bundles",
    );
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));

    // A picker lists both bundles rather than auto-opening the first.
    await within(dialog).findByText(/2 bundles here/i);
    expect(within(dialog).getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    const beta = within(dialog).getByRole("button", { name: /Beta/ });

    // Picking one opens it (the mock backend serves the sample bundle) and the
    // dialog closes.
    await user.click(beta);
    await screen.findByRole("button", { name: /switch bundle/i });
    expect(screen.queryByRole("dialog", { name: /open from url/i })).not.toBeInTheDocument();
  });
});
