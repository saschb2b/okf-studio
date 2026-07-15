import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BundleProposalPreview } from "@/components/BundleProposalPreview.tsx";

describe("BundleProposalPreview", () => {
  it("shows the full pre-generation structure and boundary", () => {
    render(
      <BundleProposalPreview
        result={{
          status: "ready",
          proposal: {
            concepts: [{
              path: "product/overview.md",
              title: "Product overview",
              type: "Product",
              links: ["architecture/system.md"],
            }],
            indexes: [{ path: "index.md", concepts: ["product/overview.md"] }],
            linkCount: 1,
          },
        }}
      />,
    );

    expect(screen.getByRole("region", { name: "Proposed OKF bundle structure" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("product/overview.md")).toHaveLength(2);
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("architecture/system.md")).toBeInTheDocument();
    expect(screen.getByText("index.md")).toBeInTheDocument();
    expect(screen.getByText("Preview only. No files have been generated or staged."))
      .toBeInTheDocument();
  });

  it("makes an invalid contract an actionable alert", () => {
    render(
      <BundleProposalPreview
        result={{ status: "invalid", message: "The proposal block is not valid JSON." }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Proposal preview unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Ask the agent to return a corrected");
  });
});
