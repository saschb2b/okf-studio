import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { App } from "@/App.tsx";
import { AppProvider } from "@/store.tsx";

// The visualization switcher: four views in the graph pane (graph, treemap,
// sunburst, circle packing), the persisted preference, and the graph-only
// chrome unmounting when a hierarchy view is active. Driven over the mock
// backend like features.test.tsx.

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

async function openBundle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
  await screen.findByRole("button", { name: /switch bundle/i });
}

function switcher() {
  return screen.getByRole("group", { name: "Visualization" });
}

describe("visualization switcher", () => {
  it("offers all four views and defaults to the graph", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    const seg = switcher();
    const graphBtn = within(seg).getByRole("button", { name: /^graph:/i });
    expect(graphBtn).toHaveAttribute("aria-pressed", "true");
    for (const name of [/^treemap:/i, /^sunburst:/i, /^circle packing:/i]) {
      expect(within(seg).getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  it("switching to treemap swaps the pane and drops graph-only chrome", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    // Graph chrome present first.
    expect(
      screen.getByRole("button", { name: /overview: show the whole graph/i }),
    ).toBeInTheDocument();

    await user.click(within(switcher()).getByRole("button", { name: /^treemap:/i }));

    // The canvas graph and its mode toggle unmount with it.
    expect(container.querySelector(".graph-canvas")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /overview: show the whole graph/i }),
    ).toBeNull();
    // The switcher survives the swap (it's part of every view's toolbar).
    expect(
      within(switcher()).getByRole("button", { name: /^treemap:/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("zooms the hierarchy view to a folder when its folder home is opened", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    // Switch to a hierarchy view first, then open a subfolder's home: the
    // selection change drills the view into that folder's group (the same
    // recenter-on-select the views already do for a concept).
    await user.click(within(switcher()).getByRole("button", { name: /^treemap:/i }));
    // No drill trail at the whole-bundle root.
    expect(
      screen.queryByRole("navigation", { name: /drill-down path/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: /^design\// }));

    const crumbs = await screen.findByRole("navigation", { name: /drill-down path/i });
    expect(within(crumbs).getByText("Design")).toBeInTheDocument();
  });

  it("keeps the selected section when switching into a hierarchy view", async () => {
    const user = userEvent.setup();
    // StrictMode on purpose: the mount-drill vs. reset-on-root effects race, and
    // only StrictMode's double-invoke exposed the reset winning (the app runs in
    // StrictMode). A plain render would pass even with the bug present.
    render(
      <StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </StrictMode>,
    );
    await openBundle(user);

    // Select a folder while on the default graph view (the graph zooms to it).
    await user.click(screen.getByRole("treeitem", { name: /^design\// }));
    // Switching to the treemap must mount already drilled into that section,
    // not reset to the whole-bundle root.
    await user.click(within(switcher()).getByRole("button", { name: /^treemap:/i }));

    const crumbs = await screen.findByRole("navigation", { name: /drill-down path/i });
    expect(within(crumbs).getByText("Design")).toBeInTheDocument();
  });

  it("persists the chosen view and restores it on next launch", async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await openBundle(user);
    await user.click(within(switcher()).getByRole("button", { name: /^sunburst:/i }));

    const saved = JSON.parse(localStorage.getItem("okf-viewer:layout")!);
    expect(saved.viz).toBe("sunburst");

    // A fresh mount (next launch) boots straight into the persisted view.
    first.unmount();
    const second = renderApp();
    await openBundle(user);
    expect(
      within(switcher()).getByRole("button", { name: /^sunburst:/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(second.container.querySelector(".graph-canvas")).toBeNull();
  });

  it("falls back to the graph for an unknown persisted value", async () => {
    localStorage.setItem(
      "okf-viewer:layout",
      JSON.stringify({ mode: "split", sizes: { sidebar: null, reader: null }, viz: "spiral" }),
    );
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);
    expect(container.querySelector(".graph-canvas")).not.toBeNull();
    expect(
      within(switcher()).getByRole("button", { name: /^graph:/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("cycles the views with the V key", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    await user.keyboard("v");
    expect(
      within(switcher()).getByRole("button", { name: /^treemap:/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("v");
    expect(
      within(switcher()).getByRole("button", { name: /^sunburst:/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("v");
    expect(
      within(switcher()).getByRole("button", { name: /^circle packing:/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("v");
    expect(
      within(switcher()).getByRole("button", { name: /^graph:/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the views as command-palette actions", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByPlaceholderText(/run a command/i);
    await user.type(input, "View: Circle");
    const option = await screen.findByText("View: Circle packing");
    await user.click(option);
    expect(
      within(switcher()).getByRole("button", { name: /^circle packing:/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
