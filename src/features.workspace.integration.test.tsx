import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { openBundle, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio workspace features", () => {
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
});
