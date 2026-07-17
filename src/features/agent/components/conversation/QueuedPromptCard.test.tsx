import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueuedPromptCard } from "./QueuedPromptCard.tsx";

describe("QueuedPromptCard", () => {
  it("offers recall only for the still-unsent queued prompt", () => {
    const onRecall = vi.fn();
    const onRemove = vi.fn();
    render(
      <QueuedPromptCard
        prompt={{
          id: "queued-1",
          text: "Check the cited source.",
          concepts: [{ id: "product/overview", title: "Overview", type: "Product" }],
          sources: [],
        }}
        onRecall={onRecall}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("1 attachment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recall draft" }));
    expect(onRecall).toHaveBeenCalledOnce();
    expect(onRemove).not.toHaveBeenCalled();
  });
});
