import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.tsx";
import { AppProvider } from "./store.tsx";

// Regression coverage for the major interactive features (bundle switcher,
// layout modes, reader rail, shortcuts overlay), driven over the mock backend.

beforeEach(() => {
  // Layout mode persists to localStorage; isolate each test.
  localStorage.clear();
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
  await screen.findByText("OKF Viewer (sample)");
}

describe("OKF Viewer features", () => {
  it("switches to reader-only layout, hiding the graph", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    expect(container.querySelector(".pane.graph")).not.toBeNull();
    await user.click(screen.getByRole("radio", { name: /reader only/i }));
    expect(container.querySelector(".pane.graph")).toBeNull();
    expect(container.querySelector(".pane.reader")).not.toBeNull();
  });

  it("shows relationships and the outline in the reader rail", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);
    // Reader-only puts the rail to the side and shows the outline.
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    const reader = container.querySelector<HTMLElement>(".reader")!;
    expect(within(reader).getByText("Links to")).toBeInTheDocument();
    expect(
      within(reader).getByRole("navigation", { name: /on this page/i }),
    ).toBeInTheDocument();
  });

  it("opens the keyboard-shortcuts overlay with ?", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);
    await user.keyboard("?");

    const dialog = await screen.findByRole("dialog");
    // Unique labels that only appear in the shortcuts overlay.
    expect(within(dialog).getByText("Cycle layout")).toBeInTheDocument();
    expect(within(dialog).getByText("Fit graph to view")).toBeInTheDocument();
  });

  it("renders ODSF design tokens and a live example preview", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    // Jump to the Button component (an ODSF concept) via the command palette.
    await user.click(screen.getByRole("button", { name: /search and commands/i }));
    const combo = await screen.findByRole("combobox");
    await user.type(combo, "Button");
    await user.click(await screen.findByRole("option", { name: /button.*component/i }));

    const reader = container.querySelector<HTMLElement>(".reader")!;
    // The token table renders the component's tokens and resolves a {ref}.
    expect(await within(reader).findByText("button-primary.background")).toBeInTheDocument();
    // The ref appears in the token table and (now) the body prose; assert ≥1.
    expect(
      within(reader).getAllByText("{colors.bgColor-success-emphasis}").length,
    ).toBeGreaterThan(0);
    // The status and applies_to labels render beside the type badge.
    expect(within(reader).getByText("stable")).toBeInTheDocument();
    expect(within(reader).getByText("web")).toBeInTheDocument();
    // The example asset renders as a live (iframe) preview, loaded via readAsset.
    expect(
      await within(reader).findByTitle("design/button.example.html"),
    ).toBeInTheDocument();
  });

  it("inlines a local image (zoomable) and offers a remote one as a link", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    // Jump to the Color concept, whose body embeds a local SVG + a remote image.
    await user.click(screen.getByRole("button", { name: /search and commands/i }));
    const combo = await screen.findByRole("combobox");
    await user.type(combo, "Color");
    // "Color" matches several concepts; the top result is the Color foundation.
    await user.click((await screen.findAllByRole("option"))[0]);

    const reader = container.querySelector<HTMLElement>(".reader")!;
    // The local image is inlined as a data URL and marked zoomable.
    await waitFor(() => {
      const img = reader.querySelector("img.md-img");
      expect(img?.getAttribute("src")).toMatch(/^data:image\/svg/);
    });
    // The remote image is not fetched — it becomes an open-in-browser control.
    expect(
      within(reader).getByRole("button", { name: /open in browser/i }),
    ).toBeInTheDocument();

    // Clicking the inlined image opens the spotlight overlay.
    await user.click(reader.querySelector<HTMLImageElement>("img.md-img")!);
    expect(
      await screen.findByRole("dialog", { name: /image preview/i }),
    ).toBeInTheDocument();
  });

  it("opens the bundle switcher listing the open folder's bundles", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: /switch bundle/i }));

    const popover = await screen.findByLabelText("Bundle switcher");
    expect(within(popover).getByText(/bundles in workspace/i)).toBeInTheDocument();
    expect(
      within(popover).getByText("OKF Viewer (sample)"),
    ).toBeInTheDocument();
  });

  it("arrow-key navigation in the command palette steps through every result, not just the first two", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: /search and commands/i }));

    await screen.findByRole("combobox");
    // Zero-query state: Recent (1: Overview) + Actions (5) — six navigable
    // results spanning two groups, reproducing the bug where the combobox's
    // `items` and `filteredItems` props disagreed on whether the list was
    // grouped, so keyboard navigation only ever toggled between the first
    // two results instead of walking the full list.
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(6);

    for (const option of options) {
      await user.keyboard("{ArrowDown}");
      await waitFor(() => expect(option).toHaveAttribute("data-highlighted"));
    }

    // One more step wraps back around to the first result.
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(options[0]).toHaveAttribute("data-highlighted"));

    await user.keyboard("{Escape}");
  });

  it("finds actions by fuzzy match, ranked ahead of concept results", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: /search and commands/i }));

    const combo = await screen.findByRole("combobox");
    // Non-contiguous subsequence match against the "Re-scan folder" action
    // label — and a query short enough to also fuzzy-match several concepts,
    // so the action must outrank them instead of sinking under a long
    // Concepts/In text list.
    await user.type(combo, "rescan");

    const action = await screen.findByRole("option", { name: /re-scan folder/i });
    const allOptions = screen.getAllByRole("option");
    expect(allOptions.indexOf(action)).toBe(0);
  });

  it("bakes the code-copy affordance and heading permalinks into the body", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    // The copy button is part of the processed body HTML (not a post-render
    // DOM append, which React's innerHTML re-application used to wipe).
    const copy = await screen.findByRole("button", { name: /copy code/i });
    await user.click(copy);
    // Re-query in the waiter: the body's innerHTML can be re-applied while the
    // clipboard write is in flight, replacing the clicked node.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /copy code/i })).toHaveTextContent("Copied"),
    );
    expect(await window.navigator.clipboard.readText()).toContain("readBundle(root)");

    // Heading permalinks are baked in too, with ids to jump to.
    const anchor = screen.getByRole("link", { name: /link to section: what it is/i });
    expect(anchor).toHaveAttribute("href", "#what-it-is");
  });

  it("explains an all-filtered index tree and routes to the full search", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    const search = screen.getByRole("searchbox", { name: /search concepts/i });

    // Matches exist (design/button and friends) but none are index entries →
    // the tree explains itself and offers the launcher.
    await user.type(search, "Button");
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/none are listed in this index/i);
    await user.click(screen.getByRole("button", { name: /open full search/i }));
    // The launcher opens seeded with the sidebar's query, results ready.
    const combo = await screen.findByRole("combobox");
    expect(combo).toHaveValue("Button");
    expect(
      await screen.findByRole("option", { name: /button.*component/i }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Nothing matches at all → the notice says so, without the launcher CTA
    // (it searches the same fields, so it cannot do better).
    await user.clear(search);
    await user.type(search, "zzzz");
    const none = await screen.findByRole("status");
    expect(none).toHaveTextContent(/no concepts match/i);
    expect(
      screen.queryByRole("button", { name: /open full search/i }),
    ).not.toBeInTheDocument();
  });
});
