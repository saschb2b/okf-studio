import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor, within, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fillText, openBundleAtOverview, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio tabs and windows", () => {
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
    await fillText(user, combo, "Glossary");
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
