import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

async function openFolder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
  // Wait for the bundle to load (name reaches the top bar).
  await screen.findByText("OKF Viewer (sample)");
}

describe("OKF Viewer app", () => {
  it("shows the first-run empty state", () => {
    renderApp();
    expect(
      screen.getByText(/Point it at a folder\. Read your knowledge as a graph\./i),
    ).toBeInTheDocument();
  });

  it("opens a folder and lists the bundle's concepts in the sidebar", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFolder(user);

    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    expect(within(sidebar).getByRole("treeitem", { name: /Overview/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole("treeitem", { name: /Graph View/i })).toBeInTheDocument();
  });

  it("selects the default concept and syncs selection into the reader", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFolder(user);

    const reader = container.querySelector<HTMLElement>(".reader")!;
    // Default selection is the first index concept (Overview).
    expect(within(reader).getByRole("heading", { name: "Overview" })).toBeInTheDocument();

    // Selecting another concept in the sidebar updates the reader.
    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    await user.click(within(sidebar).getByRole("treeitem", { name: /Graph View/i }));
    expect(
      await within(reader).findByRole("heading", { name: "Graph View" }),
    ).toBeInTheDocument();
  });

  it("reports the bundle as conformant in the validation badge", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);
    expect(screen.getByText(/conformant/i)).toBeInTheDocument();
  });
});
