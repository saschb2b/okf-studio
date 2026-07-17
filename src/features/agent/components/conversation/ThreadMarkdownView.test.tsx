import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadMarkdownView } from "./ThreadMarkdownView.tsx";

describe("ThreadMarkdownView", () => {
  it("shows selectable read-only Markdown and closes without writing a file", () => {
    const onClose = vi.fn();
    render(
      <ThreadMarkdownView
        title="Bundle research"
        markdown={"# Bundle research\n\nAgent: Research Harness"}
        onClose={onClose}
      />,
    );
    const source = screen.getByRole("textbox", { name: "Thread Markdown source" });
    expect(source).toHaveValue("# Bundle research\n\nAgent: Research Harness");
    expect(source).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Close Markdown view" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
