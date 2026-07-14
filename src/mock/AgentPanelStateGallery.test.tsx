import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AgentPanelStateGallery } from "./AgentPanelStateGallery.tsx";

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
    ["active-queue", "Next message"],
    ["permission", "Allow Read generated report?"],
    ["staged", "Enhancement draft"],
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
});
