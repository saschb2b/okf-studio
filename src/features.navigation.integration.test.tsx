import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fillText, openBundleAtOverview, openBundle, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio navigation features", () => {
  it("arrow-key navigation in the command palette steps through every result, not just the first two", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("button", { name: /search and commands/i }));

    const combo = await screen.findByRole("combobox");
    // Driven by a query rather than the zero state. This guards the bug where
    // the combobox's `items` and `filteredItems` props disagreed on whether the
    // list was grouped, so keyboard navigation only ever toggled between the
    // first two results instead of walking the full list — which is a bug about
    // traversing GROUPS, and a query is what produces several of them. The zero
    // state used to stand in for "a long list" by listing every command; it now
    // deliberately shows a short suggested set, so it no longer can.
    await fillText(user, combo, "e");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(8));
    const groups = screen.getAllByRole("group");
    expect(groups.length).toBeGreaterThan(1);

    // Walk the live result count: this protects traversal across groups rather
    // than freezing a command catalog.
    const options = screen.getAllByRole("option");

    // With a query, autoHighlight already marks the first result — that is the
    // row Enter would take — so the walk starts from the second.
    await waitFor(() => expect(options[0]).toHaveAttribute("data-highlighted"));
    for (const option of options.slice(1)) {
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
    await fillText(user, combo, "rescan");

    const action = await screen.findByRole("option", { name: /re-scan folder/i });
    const allOptions = screen.getAllByRole("option");
    expect(allOptions.indexOf(action)).toBe(0);
  });

  it("bakes the code-copy affordance and heading permalinks into the body", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundleAtOverview(user);

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

  it("routes concept links inside the change-log timeline instead of navigating", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    await user.click(screen.getByRole("button", { name: /toggle log panel/i }));
    const panel = await screen.findByRole("dialog", { name: /change log/i });
    const link = within(panel).getByRole("link", { name: /concept reader/i });
    await user.click(link);

    // The shared selection moved to the linked concept; the app didn't navigate.
    const reader = container.querySelector<HTMLElement>(".reader")!;
    expect(
      await within(reader).findByRole("heading", { name: "Concept Reader" }),
    ).toBeInTheDocument();
  });

  it("reveals a concept selected elsewhere by expanding its index directory", async () => {
    const user = userEvent.setup();
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView");
    renderApp();
    await openBundle(user);

    // design/button lives behind the collapsed design/ directory row.
    expect(screen.queryByRole("treeitem", { name: /^button$/i })).not.toBeInTheDocument();

    // Select it from the launcher (a selection made outside the tree).
    await user.click(screen.getByRole("button", { name: /search and commands/i }));
    const combo = await screen.findByRole("combobox");
    await fillText(user, combo, "Button");
    await user.keyboard("{Enter}");

    // The tree expanded the chain and the row is now present and current.
    const row = await screen.findByRole("treeitem", { name: /^button$/i });
    expect(row).toHaveAttribute("aria-current", "true");
    // …and was scrolled into view AFTER it rendered (a one-shot rAF used to
    // race the expansion commit and miss the row entirely).
    await waitFor(() => {
      expect(scrollSpy.mock.instances).toContain(row);
    });
    scrollSpy.mockRestore();
  });

  it("plans delegated work from the launcher without connecting an agent", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    // Planning needs no agent and no connection: it reads the parsed bundle.
    // That is the point of the screen, so the test reaches it the way a user
    // would, from the launcher, with nothing else set up.
    await user.click(screen.getByRole("button", { name: /search and commands/i }));
    const combo = await screen.findByRole("combobox");
    await fillText(user, combo, "Plan delegated");
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Plan delegated work" })).toBeInTheDocument();

    // The summary is the answer: how many runs, over how many concepts.
    const summary = await within(dialog).findByText(/of \d+ concepts/);
    expect(summary).toBeInTheDocument();

    // Switching the decomposition replans rather than leaving a stale answer.
    const before = summary.textContent;
    await user.click(within(dialog).getByRole("button", { name: "By folder" }));
    await waitFor(() =>
      expect(within(dialog).getByText(/of \d+ concepts/).textContent).not.toBe(before),
    );

    // Every plan states what it was computed against, so a stale one can be
    // recognised rather than trusted.
    expect(within(dialog).getByText(/Computed against/)).toBeInTheDocument();
  });

  it("survives an index that links back to its parent", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    // design/ ends with a link back up to the root index, the shape of every
    // "Weiter"/"See also" tail, so root and design point at each other. The
    // reveal walk followed that blindly, bounced root to design to root until
    // the stack blew, and took the whole window down on startup (an owner's
    // bundle restored on launch showed nothing but a blank window).
    // Selecting a concept the index never lists forces the walk down every
    // branch instead of stopping at the first match.
    await user.click(screen.getByRole("button", { name: /search and commands/i }));
    const combo = await screen.findByRole("combobox");
    await fillText(user, combo, "Recognized revenue");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("heading", { name: "Recognized revenue", level: 1 }),
    ).toBeInTheDocument();

    // The back-link row is still there and still opens the root's folder home;
    // it just doesn't nest a second copy of an ancestor beneath itself.
    await user.click(screen.getByRole("treeitem", { name: /^design\// }));
    const back = await screen.findByRole("treeitem", { name: "OKF Studio (sample)" });
    expect(back).not.toHaveAttribute("aria-expanded");
    await user.click(back);
    expect(
      await screen.findByRole("heading", { name: "OKF Studio (sample)", level: 1 }),
    ).toBeInTheDocument();
  });

  it("explains an expanded directory that holds no concepts", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    // styles/ resolves to a synthesized index with zero entries (assets only).
    await user.click(screen.getByRole("treeitem", { name: /^styles\// }));
    expect(
      await screen.findByText(/no concepts in this folder/i),
    ).toBeInTheDocument();
  });

  it("explains an all-filtered index tree and routes to the full search", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    const search = screen.getByRole("searchbox", { name: /search and filter/i });

    // Matches exist (the Revenue cluster) but none are index entries → the
    // tree explains itself and offers the launcher.
    await fillText(user, search, "Revenue");
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/none are listed in this index/i);
    await user.click(screen.getByRole("button", { name: /open full search/i }));
    // The launcher opens seeded with the sidebar's query, results ready.
    const combo = await screen.findByRole("combobox");
    expect(combo).toHaveValue("Revenue");
    expect(
      await screen.findAllByRole("option", { name: /revenue/i }),
    ).not.toHaveLength(0);
    await user.keyboard("{Escape}");

    // Nothing matches at all → the notice says so, without the launcher CTA
    // (it searches the same fields, so it cannot do better).
    await fillText(user, search, "zzzz");
    const none = await screen.findByRole("status");
    expect(none).toHaveTextContent(/no concepts match/i);
    expect(
      screen.queryByRole("button", { name: /open full search/i }),
    ).not.toBeInTheDocument();
  });

  it("lands on the root folder home, showing its index.md prose and entry cards", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    // The default landing is the bundle root's folder home (index.md), not a
    // concept: its authored intro renders, and its entries are navigation cards.
    const home = container.querySelector<HTMLElement>(".folder-home")!;
    expect(home).not.toBeNull();
    expect(
      within(home).getByRole("heading", { name: "OKF Studio (sample)", level: 1 }),
    ).toBeInTheDocument();
    expect(home).toHaveTextContent(/built-in\s+sample bundle/i);
    expect(
      within(home).queryByRole("heading", { name: /interoperability/i }),
    ).not.toBeInTheDocument();
    // A card opens the concept it lists.
    await user.click(within(home).getByRole("button", { name: /^Overview(?:\s|$)/i }));
    const reader = container.querySelector<HTMLElement>(".reader")!;
    expect(
      await within(reader).findByRole("heading", { name: "Overview", level: 1 }),
    ).toBeInTheDocument();
  });

  it("opens a directory as a folder home from its index-tree row", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    // Clicking a directory row opens that folder's home (and reveals its rows).
    await user.click(screen.getByRole("treeitem", { name: /^design\// }));
    const reader = container.querySelector<HTMLElement>(".reader")!;
    const home = await within(reader).findByRole("article", { name: /Design folder home/i });
    // The directory row reads as selected once its home is the active view.
    expect(screen.getByRole("treeitem", { name: /^design\// })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Its children are cards (title + description); picking one opens the concept.
    await user.click(within(home).getByRole("button", { name: /^Button\b/ }));
    expect(
      await within(reader).findByRole("heading", { name: "Button", level: 1 }),
    ).toBeInTheDocument();
  });

  it("returns to the root folder home from the sidebar Home row", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    // Dive into a concept, then use the sidebar Home row to come back.
    await user.click(screen.getByRole("treeitem", { name: "Graph View" }));
    const reader = container.querySelector<HTMLElement>(".reader")!;
    await within(reader).findByRole("heading", { name: "Graph View", level: 1 });

    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    await user.click(within(sidebar).getByRole("button", { name: "OKF Studio (sample)" }));
    expect(
      await within(reader).findByRole("article", { name: /OKF Studio \(sample\) folder home/i }),
    ).toBeInTheDocument();
  });

  it("opens a folder home from a clickable section heading", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    // The "Product" section groups product/* concepts and product/ has an
    // index, so its heading is a treeitem door to that folder home, not just a
    // label.
    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    await user.click(within(sidebar).getByRole("treeitem", { name: "Product" }));
    const reader = container.querySelector<HTMLElement>(".reader")!;
    expect(
      await within(reader).findByRole("article", { name: /Product folder home/i }),
    ).toBeInTheDocument();
  });

  it("uses a folder index's authored groups inside the root navigation", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    expect(within(sidebar).getByText("Open and explore")).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("treeitem", { name: "Graph View" }),
    ).toHaveAttribute("aria-level", "2");
    expect(
      within(sidebar).getAllByRole("treeitem", { name: "Graph View" }),
    ).toHaveLength(1);
  });

  it("hides a Subdirectories listing that only duplicates folder-door headings", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);

    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    // The fixture's root index has a "Subdirectories" section whose only entry
    // (product/) is already the clickable "Product" heading — the sidebar drops
    // the whole redundant section (the source index.md still lists it).
    expect(within(sidebar).queryByText("Subdirectories")).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("treeitem", { name: /^product\// }),
    ).not.toBeInTheDocument();
    // …but the door it duplicated is still there.
    expect(within(sidebar).getByRole("treeitem", { name: "Product" })).toBeInTheDocument();
    // A non-redundant directory listing (design/ has no section heading) stays.
    expect(
      within(sidebar).getByRole("treeitem", { name: /^design\// }),
    ).toBeInTheDocument();
  });
});
