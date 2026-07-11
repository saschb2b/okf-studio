import { beforeEach, describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.tsx";
import { AppProvider } from "./store.tsx";

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
    expect(screen.getAllByRole("button", { name: "Install" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Install" })[0]).toBeDisabled();
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
