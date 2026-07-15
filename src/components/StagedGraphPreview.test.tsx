import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StagedGraphPreview } from "@/components/StagedGraphPreview.tsx";

describe("StagedGraphPreview", () => {
  it("shows the exact validated concepts, links, and staged state", () => {
    render(
      <StagedGraphPreview
        preview={{
          nodes: [
            { id: "overview", title: "Product overview", conceptType: "Product", staged: true },
            { id: "agent-system", title: "Agent system", conceptType: "Architecture", staged: false },
          ],
          edges: [{ source: "overview", target: "agent-system" }],
          totalNodes: 2,
          totalEdges: 1,
          truncated: false,
        }}
      />,
    );

    const graph = screen.getByRole("region", { name: "Staged graph preview" });
    expect(graph).toHaveTextContent("2 concepts · 1 link");
    expect(graph).toHaveTextContent("Product overview, Product, staged");
    expect(graph).toHaveTextContent("Agent system, Architecture, existing");
    expect(graph).toHaveTextContent("Link from overview to agent-system");
    expect(screen.getByRole("img", { name: "Validated graph with 2 concepts and 1 link." }))
      .toBeInTheDocument();
  });

  it("designs the empty and bounded states", () => {
    render(
      <StagedGraphPreview
        preview={{
          nodes: [],
          edges: [],
          totalNodes: 180,
          totalEdges: 720,
          truncated: true,
        }}
      />,
    );

    expect(screen.getByText("No concepts remain in the selected draft.")).toBeInTheDocument();
    expect(screen.getByText(/Preview limited to the first 128 concepts/)).toBeInTheDocument();
  });
});
