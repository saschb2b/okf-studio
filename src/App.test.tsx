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

    expect(await within(card).findByRole("button", { name: "Installed" })).toBeDisabled();
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
    expect(await screen.findByRole("heading", { name: "Local Harness" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open a bundle to start" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByText(/Connected to Local Harness over ACP v1/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("Not connected.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Local Harness" }));
  });

  it("creates a bundle-scoped session and renders streamed agent text", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Research Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\research.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Research Harness" }));
    await screen.findByText(/Connected to Research Harness over ACP v1/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.type(screen.getByLabelText("Message the agent"), "Summarize the bundle");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Summarize the bundle")).toBeInTheDocument();
    expect(await screen.findByText("Browser ACP received: Summarize the bundle")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Send" })).toBeEnabled();

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
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Turn cancelled.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Research Harness" }));
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
