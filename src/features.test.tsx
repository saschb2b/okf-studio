import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/App.tsx";
import { AppProvider } from "@/shared/store.tsx";
import { dropIndexFor } from "@/features/shell/components/TabStrip.tsx";
import * as ipc from "@/shared/ipc.ts";

// Regression coverage for the major interactive features (bundle switcher,
// layout modes, reader rail, shortcuts overlay), driven over the mock backend.

beforeEach(() => {
  // Layout mode persists to localStorage; isolate each test.
  localStorage.clear();
});

afterEach(() => {
  // Some tests spy on the IPC layer; restore so the mock backend is intact.
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
  // The bundle name now appears in several places once open (top bar, sidebar
  // home, folder-home landing); gate on the singular switcher button instead.
  await screen.findByRole("button", { name: /switch bundle/i });
}

/** Open the bundle and select the Overview concept. The default landing is now
 *  the bundle's folder home (index.md), so tests that exercise a concept's
 *  reader — its rail, body, or the palette's "recent" — start from here. */
async function openBundleAtOverview(user: ReturnType<typeof userEvent.setup>) {
  await openBundle(user);
  await user.click(screen.getByRole("treeitem", { name: "Overview" }));
  await screen.findByRole("heading", { name: "Overview", level: 1 });
}

describe("OKF Studio features", () => {
  it("creates a new bundle from the first-run empty state", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(ipc, "createBundle");
    renderApp();

    await user.click(screen.getByRole("button", { name: /create new bundle/i }));
    const dialog = await screen.findByRole("dialog", { name: /create new bundle/i });
    await user.type(within(dialog).getByLabelText("Bundle title"), "Team Knowledge");
    // The folder name derives live from the title until edited by hand.
    expect(within(dialog).getByLabelText("Folder name")).toHaveValue("team-knowledge");
    await user.click(
      within(dialog).getByRole("button", { name: /choose location & create/i }),
    );

    // The mock "creates" the sample bundle; the app opens it like any folder.
    await screen.findByRole("button", { name: /switch bundle/i });
    expect(createSpy).toHaveBeenCalledWith({
      folderName: "team-knowledge",
      title: "Team Knowledge",
      description: "",
      firstConceptTitle: "Welcome",
      firstConceptType: "Note",
      includeGuide: true,
    });
    expect(
      screen.queryByRole("dialog", { name: /create new bundle/i }),
    ).not.toBeInTheDocument();
  });

  it("offers New bundle in the switcher, keeps the form on cancel, and surfaces errors", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    await user.click(screen.getByRole("button", { name: /switch bundle/i }));
    await user.click(await screen.findByRole("button", { name: /new bundle/i }));
    const dialog = await screen.findByRole("dialog", { name: /create new bundle/i });
    await user.type(within(dialog).getByLabelText("Bundle title"), "Field Notes");

    // The OS picker was cancelled: no navigation, the filled form remains.
    const createSpy = vi.spyOn(ipc, "createBundle").mockResolvedValueOnce(null);
    await user.click(
      within(dialog).getByRole("button", { name: /choose location & create/i }),
    );
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(within(dialog).getByLabelText("Bundle title")).toHaveValue("Field Notes");

    // A creation failure surfaces inline and keeps the dialog open.
    createSpy.mockRejectedValueOnce(
      new Error("A folder named field-notes already exists there."),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /choose location & create/i }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already exists/);
    expect(within(dialog).getByLabelText("Folder name")).toHaveValue("field-notes");
  });

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
    // The default landing is the folder home, which has no rail; open a concept
    // (Overview, which has links and headings) to exercise the rail.
    const sidebar = container.querySelector<HTMLElement>(".sidebar")!;
    await user.click(within(sidebar).getByRole("treeitem", { name: /Overview/i }));
    // Reader-only puts the rail to the side and shows the outline.
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    const reader = container.querySelector<HTMLElement>(".reader")!;
    expect(await within(reader).findByText("Links to")).toBeInTheDocument();
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
      within(popover).getByText("OKF Studio (sample)"),
    ).toBeInTheDocument();

    // Seeded recents render, split into Pinned and Recent groups.
    expect(
      within(popover).getByText("Primer design system"),
    ).toBeInTheDocument();
    expect(within(popover).getByText(/pinned/i)).toBeInTheDocument();
    expect(within(popover).getByText("Team Handbook")).toBeInTheDocument();

    // ArrowDown from the search enters the list at the FIRST row (a double
    // handler used to skip it); ArrowUp from there returns to the search.
    const search = within(popover).getByRole("searchbox");
    expect(search).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      within(popover).getByRole("button", { name: /OKF Studio \(sample\)/i }),
    ).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(search).toHaveFocus();

    // A query that matches nothing says so in both groups — not the
    // "bundles you open will show up here" onboarding copy.
    await user.type(search, "zzzz");
    expect(within(popover).getAllByText("No matches.")).toHaveLength(2);
  });

  it("arrow-key navigation in the command palette steps through every result, not just the first two", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("button", { name: /search and commands/i }));

    await screen.findByRole("combobox");
    // Zero-query state: Recent (1: Overview) + Actions (14) — fifteen
    // navigable results spanning two groups, reproducing the bug where the
    // combobox's `items` and `filteredItems` props disagreed on whether the
    // list was grouped, so keyboard navigation only ever toggled between the
    // first two results instead of walking the full list.
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(15);

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
    await user.type(combo, "Button");
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
    await user.type(search, "Revenue");
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
    await user.clear(search);
    await user.type(search, "zzzz");
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
    // A card opens the concept it lists.
    await user.click(within(home).getByRole("button", { name: /Overview/i }));
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

  it("explains a URL that fetches successfully but holds no OKF bundle", async () => {
    const user = userEvent.setup();
    // The URL is reachable (fetch resolves) but the folder has no bundle.
    vi.spyOn(ipc, "fetchRemoteBundle").mockResolvedValue({ folder: "/tmp/empty" });
    vi.spyOn(ipc, "scanBundles").mockResolvedValue([]);
    renderApp();

    // Open the remote dialog from the first-run empty state.
    await user.click(screen.getByRole("button", { name: /open from url/i }));
    const dialog = await screen.findByRole("dialog", { name: /open from url/i });
    await user.type(
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
    await user.type(
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

// Reader tabs & pop-out windows — docs/proposals/multi-view.md.
describe("multi-view (tabs & windows)", () => {
  it("opens a background tab with Ctrl+click and switches on activate", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    // Quiet chrome: no strip while a single tab is open.
    expect(
      screen.queryByRole("tablist", { name: /open concepts/i }),
    ).not.toBeInTheDocument();

    // Ctrl+click a "Links to" rail row → a background tab; the reader stays put.
    const rail = container.querySelector<HTMLElement>(".reader-rail")!;
    await user.keyboard("{Control>}");
    await user.click(within(rail).getByRole("button", { name: "Graph View" }));
    await user.keyboard("{/Control}");

    const strip = await screen.findByRole("tablist", { name: /open concepts/i });
    const tabs = within(strip).getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    // Background open: the opener tab stays active, the reader stays on it.
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    const article = container.querySelector<HTMLElement>(".reader-main")!;
    expect(
      within(article).getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();

    // Activating the new tab shows its concept.
    await user.click(tabs[1]);
    expect(
      await within(container.querySelector<HTMLElement>(".reader-main")!).findByRole(
        "heading",
        { name: "Graph View" },
      ),
    ).toBeInTheDocument();
  });

  it("keeps history per tab, cycles with Ctrl+Tab, closes with Ctrl+W", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));
    const rail = () => container.querySelector<HTMLElement>(".reader-rail")!;
    const article = () => container.querySelector<HTMLElement>(".reader-main")!;
    const back = screen.getByRole("button", { name: /go back/i });

    // Base UI toolbar buttons disable via aria-disabled (still focusable),
    // so jest-dom's toBeDisabled/toBeEnabled don't apply.
    const disabled = () => back.getAttribute("aria-disabled") === "true";

    // Navigate the first tab (Overview → Graph View): its history grows.
    await user.click(within(rail()).getByRole("button", { name: "Graph View" }));
    await within(article()).findByRole("heading", { name: "Graph View" });
    expect(disabled()).toBe(false);

    // Open Concept Reader in a background tab and switch to it: a fresh tab
    // has its own empty history, so Back disables even though tab 1 has one.
    // (Graph View's rail lists Concept Reader under both Cited by and Links
    // to — either row opens the same concept.)
    await user.keyboard("{Control>}");
    await user.click(
      within(rail()).getAllByRole("button", { name: "Concept Reader" })[0],
    );
    await user.keyboard("{/Control}");
    const strip = await screen.findByRole("tablist", { name: /open concepts/i });
    await user.click(within(strip).getAllByRole("tab")[1]);
    await within(article()).findByRole("heading", { name: "Concept Reader" });
    expect(disabled()).toBe(true);

    // Ctrl+Tab cycles back to tab 1 — its history (and Back) return.
    await user.keyboard("{Control>}{Tab}{/Control}");
    await within(article()).findByRole("heading", { name: "Graph View" });
    expect(disabled()).toBe(false);

    // Ctrl+W closes the active tab; its right neighbor takes over and the
    // strip (now a single tab) disappears.
    await user.keyboard("{Control>}w{/Control}");
    await within(article()).findByRole("heading", { name: "Concept Reader" });
    expect(
      screen.queryByRole("tablist", { name: /open concepts/i }),
    ).not.toBeInTheDocument();
  });

  it("Ctrl+T opens an empty active tab (no launcher), which the launcher can then fill", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    await user.keyboard("{Control>}t{/Control}");
    // A fresh, active "New tab" with the reader's empty state — and no dialog
    // auto-opened (owner feedback: Ctrl+T must not also pop the launcher).
    const strip = await screen.findByRole("tablist", { name: /open concepts/i });
    expect(
      within(strip).getByRole("tab", { name: "New tab" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/no concept selected/i)).toBeInTheDocument();

    // Picking a concept (here via the launcher) fills the new tab.
    await user.keyboard("{Control>}k{/Control}");
    const combo = await screen.findByRole("combobox");
    await user.type(combo, "Glossary");
    // "Glossary" also full-text-matches other concepts; the top hit is the
    // title match.
    await user.click((await screen.findAllByRole("option"))[0]);

    const article = container.querySelector<HTMLElement>(".reader-main")!;
    await within(article).findByRole("heading", { name: "Glossary" });
    const tabs = within(
      screen.getByRole("tablist", { name: /open concepts/i }),
    ).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Glossary"]);
  });

  it("computes drag-reorder targets from neighbor midpoints (dropIndexFor)", () => {
    const mids = [50, 150, 250];
    // Dragging right: a slot is taken only once its midpoint is crossed.
    expect(dropIndexFor(mids, 0, 60)).toBe(0);
    expect(dropIndexFor(mids, 0, 160)).toBe(1);
    expect(dropIndexFor(mids, 0, 260)).toBe(2);
    // Dragging left mirrors it.
    expect(dropIndexFor(mids, 2, 140)).toBe(1);
    expect(dropIndexFor(mids, 2, 40)).toBe(0);
    // No midpoint crossed → stays put.
    expect(dropIndexFor(mids, 1, 150)).toBe(1);
  });

  it("drags a tab to a new position without changing the selection", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    const rail = container.querySelector<HTMLElement>(".reader-rail")!;
    await user.keyboard("{Control>}");
    await user.click(within(rail).getByRole("button", { name: "Graph View" }));
    await user.keyboard("{/Control}");
    const strip = await screen.findByRole("tablist", { name: /open concepts/i });

    // Drag the (active) first tab rightward past its neighbor. jsdom reports
    // zero-width rects, so any positive x counts as crossing — the point here
    // is the pointer wiring and the reorder-without-activation contract; the
    // midpoint geometry is covered by the dropIndexFor unit test.
    // jsdom has no PointerEvent, which drops clientX from fireEvent.pointer*;
    // MouseEvent carries the coordinates and React dispatches by event name.
    const overview = within(strip).getByRole("tab", { name: "Overview" });
    fireEvent(
      overview,
      new MouseEvent("pointerdown", { button: 0, clientX: 0, bubbles: true }),
    );
    fireEvent(
      overview,
      new MouseEvent("pointermove", { clientX: 100, bubbles: true }),
    );
    fireEvent(overview, new MouseEvent("pointerup", { bubbles: true }));

    const tabs = within(strip).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Graph View", "Overview"]);
    // Reordering must not activate or navigate: Overview is still selected.
    expect(within(strip).getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const article = container.querySelector<HTMLElement>(".reader-main")!;
    expect(
      within(article).getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
  });

  it("peeks a concept on hover (rail row and body link) before opening", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    // Dwell on a rail row → the card previews the target: type, title,
    // description, an excerpt, and the open-in-tab gesture hint.
    const rail = container.querySelector<HTMLElement>(".reader-rail")!;
    await user.hover(within(rail).getByRole("button", { name: "Graph View" }));
    const card = await screen.findByRole("tooltip", { name: /preview: graph view/i });
    expect(within(card).getByText("Graph View")).toBeInTheDocument();
    expect(
      within(card).getByText(/force-directed graph of concepts/i),
    ).toBeInTheDocument();
    expect(within(card).getByText(/renders the bundle as a/i)).toBeInTheDocument();
    expect(within(card).getByText(/click: new tab/i)).toBeInTheDocument();

    // Leaving the trigger dismisses it.
    await user.unhover(within(rail).getByRole("button", { name: "Graph View" }));
    expect(screen.queryByRole("tooltip", { name: /preview/i })).not.toBeInTheDocument();

    // A body concept link peeks too; an external link never does.
    const body = container.querySelector<HTMLElement>(".body.markdown")!;
    await user.hover(body.querySelector<HTMLElement>('a[data-link="concept"]')!);
    await screen.findByRole("tooltip", { name: /preview/i });
    await user.unhover(body.querySelector<HTMLElement>('a[data-link="concept"]')!);
    expect(screen.queryByRole("tooltip", { name: /preview/i })).not.toBeInTheDocument();
  });

  it("middle-click closes a tab (the VS Code gesture)", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    const rail = container.querySelector<HTMLElement>(".reader-rail")!;
    await user.keyboard("{Control>}");
    await user.click(within(rail).getByRole("button", { name: "Graph View" }));
    await user.keyboard("{/Control}");
    const strip = await screen.findByRole("tablist", { name: /open concepts/i });

    // Middle-button press+release on the background tab closes it.
    const tab = within(strip).getByRole("tab", { name: "Graph View" });
    await user.pointer([
      { keys: "[MouseMiddle>]", target: tab },
      { keys: "[/MouseMiddle]", target: tab },
    ]);
    expect(
      screen.queryByRole("tablist", { name: /open concepts/i }),
    ).not.toBeInTheDocument();
  });

  it("moves a tab to its own window (window.open off-Tauri) and closes it locally", async () => {
    const user = userEvent.setup();
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({} as ReturnType<typeof window.open>);
    const { container } = renderApp();
    await openBundleAtOverview(user);
    await user.click(screen.getByRole("radio", { name: /reader only/i }));

    // Two tabs so the tear-off may close the local one.
    const rail = container.querySelector<HTMLElement>(".reader-rail")!;
    await user.keyboard("{Control>}");
    await user.click(within(rail).getByRole("button", { name: "Graph View" }));
    await user.keyboard("{/Control}");
    await screen.findByRole("tablist", { name: /open concepts/i });

    await user.click(
      screen.getByRole("button", { name: /move tab to new window/i }),
    );

    // The new window boots via query params on the same folder/root, landed on
    // the active tab's concept…
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    const url = String(openSpy.mock.calls[0][0]);
    expect(url).toContain("folder=");
    expect(url).toContain("root=");
    expect(url).toContain("concept=product%2Foverview");
    // …and the local tab closed (tear-off, not copy): the strip is gone and
    // the remaining tab took over.
    await waitFor(() =>
      expect(
        screen.queryByRole("tablist", { name: /open concepts/i }),
      ).not.toBeInTheDocument(),
    );
    const article = container.querySelector<HTMLElement>(".reader-main")!;
    expect(
      within(article).getByRole("heading", { name: "Graph View" }),
    ).toBeInTheDocument();
  });

  it("boots a pop-out window onto its target bundle and concept from query params", async () => {
    // The boot target is parsed at store-module load, so evaluate a fresh
    // store/App against a pop-out query string.
    window.history.replaceState(
      null,
      "",
      "/?folder=%2Fmock&root=%2Fmock&concept=features%2Fconcept-reader",
    );
    vi.resetModules();
    try {
      const { AppProvider: FreshProvider } = await import("@/shared/store.tsx");
      const { App: FreshApp } = await import("@/App.tsx");
      const { container } = render(
        <FreshProvider>
          <FreshApp />
        </FreshProvider>,
      );
      // No "Open folder" click: the window boots straight onto the bundle,
      // reader-only with the sidebar tucked away, landed on the concept…
      const article = await waitFor(() => {
        const el = container.querySelector<HTMLElement>(".reader-main");
        expect(el).not.toBeNull();
        return el!;
      });
      await within(article).findByRole("heading", { name: "Concept Reader" });
      expect(container.querySelector(".pane.graph")).toBeNull();
      expect(container.querySelector(".pane.sidebar")).toBeNull();
      // …with an empty history (no phantom Back entry). Base UI toolbar
      // buttons disable via aria-disabled.
      expect(
        within(container).getByRole("button", { name: /go back/i }),
      ).toHaveAttribute("aria-disabled", "true");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});
