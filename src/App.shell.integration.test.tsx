import { describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { fillText, openFolder, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio shell", () => {
  it("shows the first-run empty state", async () => {
    const recentBundles = vi.spyOn(ipc, "recentBundles");
    renderApp();
    await waitFor(() => expect(recentBundles).toHaveBeenCalledOnce());
    expect(
      screen.getByText(/Explore connected knowledge with the agents you already use\./i),
    ).toBeInTheDocument();
  });

  it("names Studio in the empty-folder recovery state", async () => {
    vi.spyOn(ipc, "scanBundles").mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);

    const heading = await screen.findByRole("heading", { name: "No OKF bundles found" });
    expect(heading.parentElement).toHaveTextContent(
      "Point Studio at a folder that contains one.",
    );
  });

  it("explains the remote-open network boundary before fetching", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /^Open from URL…/ }));

    expect(screen.getByRole("dialog", { name: "Open from URL" })).toBeInTheDocument();
    expect(
      screen.getByText(/No request is sent until you choose Open\./),
    ).toBeInTheDocument();
  });

  it("keeps a remote fetch failure visible and retryable", async () => {
    vi.spyOn(ipc, "fetchRemoteBundle").mockRejectedValueOnce(
      new Error("The remote bundle could not be fetched securely."),
    );
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /^Open from URL…/ }));
    await fillText(
      user,
      screen.getByLabelText("Paste a GitHub URL or a link to an archive"),
      "https://github.com/owner/repo",
    );
    await user.click(screen.getByRole("button", { name: /^Open$/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The remote bundle could not be fetched securely.",
    );
    expect(screen.getByRole("button", { name: /^Open$/ })).toBeEnabled();
  });

  it("opens the disconnected agent panel from the status bar", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

    expect(screen.getByRole("complementary", { name: /agent panel/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect an agent" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    expect(screen.getByRole("heading", { name: /choose how agents run/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ACP Registry" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Claude Agent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Codex" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gemini CLI" })).toBeInTheDocument();
    await waitFor(() => {
      const installButtons = screen.getAllByRole("button", { name: "Install" });
      expect(installButtons).toHaveLength(9);
      expect(installButtons[0]).toBeEnabled();
    });
    expect(screen.getAllByText(/managed Node v24\.11\.0/i)).toHaveLength(8);
    expect(screen.getAllByText(/platform archive pinned by Studio-measured checksum/i))
      .toHaveLength(1);
    const hostSummary = await screen.findByText(/Restricted agent host:/);
    await user.click(hostSummary);
    expect(screen.getByText(/no verified confinement backend for this platform/i))
      .toBeInTheDocument();
  });

  it("moves focus into and out of the agent panel with its shortcut", async () => {
    const user = userEvent.setup();
    renderApp();

    // Focus moves inside a requestAnimationFrame after the panel renders, so
    // every assertion waits for that frame instead of racing it.
    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Connect an agent" })).toHaveFocus(),
    );

    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /toggle agent panel/i })).toHaveFocus(),
    );
  });

  it("keeps panel focus visible through switchers and popovers", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Keyboard Harness",
      executable: "C:\\tools\\keyboard.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");
    const reveal = vi.spyOn(Element.prototype, "scrollIntoView");

    try {
      const user = userEvent.setup();
      renderApp();
      await openFolder(user);

      await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
      const threadActions = screen.getByRole("button", { name: "More thread actions" });
      await waitFor(() => expect(threadActions).toHaveFocus());

      await user.keyboard("{Enter}");
      expect(await screen.findByRole("menuitem", { name: "History" })).toHaveFocus();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(threadActions).toHaveFocus());

      const addContext = screen.getByRole("button", { name: "Add context or sources" });
      addContext.focus();
      await user.keyboard("{Enter}");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Attach context" })).toHaveFocus();
      });
      await user.keyboard("{Escape}");
      await waitFor(() => expect(addContext).toHaveFocus());

      reveal.mockClear();
      await user.click(screen.getByRole("button", {
        name: "Start another thread with Keyboard Harness",
      }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^Switch to Thread 2: New thread, / }))
          .toHaveFocus(),
      );
      expect(reveal).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

      await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /toggle agent panel/i })).toHaveFocus(),
      );
    } finally {
      cleanup();
      await ipc.disconnectAgent(connection.connectionId);
      await ipc.removeCustomAgent(profile.id);
    }
  });

  it("persists the agent panel width and visibility", async () => {
    const recentBundles = vi.spyOn(ipc, "recentBundles");
    const user = userEvent.setup();
    const first = renderApp();
    await waitFor(() => expect(recentBundles).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));

    const splitter = screen.getByRole("separator", { name: /resize agent panel/i });
    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    // The stored width is the window-relative clamp midpoint plus one step;
    // the exact value follows the environment width, so assert the shape and
    // that the same width returns on the next launch.
    const stored = JSON.parse(
      localStorage.getItem("okf-studio:agent-panel")!,
    ) as { open: boolean; width: number };
    expect(stored.open).toBe(true);
    expect(stored.width).toBeGreaterThanOrEqual(336);

    first.unmount();
    renderApp();
    await waitFor(() => expect(recentBundles).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("complementary", { name: /agent panel/i })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /resize agent panel/i })).toHaveAttribute(
      "aria-valuenow",
      String(stored.width),
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
