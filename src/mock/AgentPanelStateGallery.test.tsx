import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AgentPanelStateGallery } from "@/mock/AgentPanelStateGallery.tsx";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("AgentPanelStateGallery", () => {
  it.each([
    ["first-use", "Connect an agent"],
    ["saved-work", "Pick up where you left off"],
    ["stale-history", "Saved thread unavailable"],
    ["no-history", "No previous sessions"],
    ["limited-agent", "Ask about this bundle"],
    ["session-controls", "Configure the next turn"],
    ["session-one-option", "One advertised choice"],
    ["session-dynamic", "Reasoning option removed"],
    ["session-pending", "Model change pending"],
    ["session-failure", "Model change failed"],
    ["live-work-max", "Allow Read generated report?"],
    ["active-queue", "Next message"],
    ["permission", "Allow Read generated report?"],
    ["staged", "Enhancement draft"],
    ["retrieval-turn", "Related concepts"],
    ["retrieval-inspector", "Evidence behind this answer"],
    ["retrieval-lab", "Evidence Lab"],
    ["disconnected", "Your bundle is still open"],
  ])("renders the %s fixture", (scenario, expectedText) => {
    window.history.replaceState(null, "", `/?agent-gallery=${scenario}&width=440`);
    render(<AgentPanelStateGallery />);

    expect(screen.getByRole("main")).toHaveTextContent(expectedText);
    expect(screen.getByRole("region", { name: "Agent panel fixture" }))
      .toBeInTheDocument();
  });

  it("keeps one primary continuation when current and archived work coexist", () => {
    window.history.replaceState(null, "", "/?agent-gallery=saved-work&width=440");
    render(<AgentPanelStateGallery />);

    const resumes = screen.getAllByRole("button", { name: "Resume" });
    expect(resumes).toHaveLength(2);
    expect(resumes[0]).toHaveClass("primary");
    expect(resumes[1]).not.toHaveClass("primary");
  });

  it("keeps thread navigation and actions in one conversation toolbar", () => {
    window.history.replaceState(null, "", "/?agent-gallery=active-queue&width=360");
    render(<AgentPanelStateGallery />);

    const actions = screen.getByRole("toolbar", {
      name: "Quarterly source reconciliation actions",
    });
    const navigation = screen.getByRole("navigation", { name: "Research agent threads" });
    expect(actions.closest("header")).toContainElement(navigation);
  });

  it("keeps scenario and width choices in a reproducible URL", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/?agent-gallery=first-use&width=440&hierarchy=stacked",
    );
    render(<AgentPanelStateGallery />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Gallery state" }), "staged");
    await user.click(screen.getByRole("button", { name: "560px" }));
    await user.click(screen.getByRole("button", { name: "Merged" }));

    expect(window.location.search).toBe(
      "?agent-gallery=staged&width=560&hierarchy=merged",
    );
    expect(screen.getByRole("button", { name: "560px" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Enhancement draft")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Agent and thread prototype" }))
      .toBeInTheDocument();
  });

  it("keeps staged recovery above the internally scrolling file list", () => {
    window.history.replaceState(null, "", "/?agent-gallery=staged&width=360");
    render(<AgentPanelStateGallery />);

    const stagedReview = screen.getByRole("region", { name: "Staged changes" });
    const alert = within(stagedReview).getByRole("alert");
    const fileList = within(stagedReview).getByRole("list");
    expect(
      alert.compareDocumentPosition(fileList) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("collapses non-blocking work and keeps focus on the shelf control", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/?agent-gallery=active-queue&width=360");
    render(<AgentPanelStateGallery />);

    const collapse = screen.getByRole("button", { name: "Collapse live work" });
    await user.click(collapse);

    expect(collapse).toHaveFocus();
    expect(collapse).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Next message" })).not.toBeInTheDocument();
    expect(screen.queryByText("Trace source references")).not.toBeInTheDocument();
  });

  it("keeps a blocking permission visible without an empty disclosure", () => {
    window.history.replaceState(null, "", "/?agent-gallery=permission&width=360");
    render(<AgentPanelStateGallery />);

    expect(screen.getByRole("region", { name: "Permission request" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Allow once" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Collapse live work" })).not.toBeInTheDocument();
  });

  it.each([360, 440, 560])(
    "keeps every live-work section mounted at %ipx",
    (width) => {
      window.history.replaceState(
        null,
        "",
        `/?agent-gallery=live-work-max&width=${width}`,
      );
      render(<AgentPanelStateGallery />);

      const shelf = screen.getByRole("region", { name: "Live work" });
      expect(within(shelf).getByRole("region", { name: "Permission request" }))
        .toBeVisible();
      expect(within(shelf).getAllByText("Trace source references")).toHaveLength(2);
      expect(within(shelf).getByRole("region", { name: "Staged changes" })).toBeVisible();
      expect(within(shelf).getByRole("region", { name: "Next message" })).toBeVisible();
      expect(within(shelf).getAllByRole("alert")).toHaveLength(1);
      expect(shelf.querySelector("[aria-live]")).toBeNull();
    },
  );

  it("keeps blocking work visible and focus stable when maximum live work collapses", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/?agent-gallery=live-work-max&width=360");
    render(<AgentPanelStateGallery />);

    const collapse = screen.getByRole("button", { name: "Collapse live work" });
    await user.click(collapse);

    expect(collapse).toHaveFocus();
    expect(screen.getByRole("region", { name: "Permission request" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Staged changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Next message" })).not.toBeInTheDocument();
  });
});
