import { describe, expect, it, vi } from "vitest";
import {
  copyCompleteResponse,
  copyResponseSelection,
  responseSelectionPayload,
} from "./responseClipboard.ts";

function selectElement(target: Element): Selection {
  const selection = window.getSelection();
  if (!selection) throw new Error("Selection API unavailable");
  const range = document.createRange();
  range.selectNode(target);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe("response clipboard", () => {
  it("keeps plain text and formatted HTML for a response selection", () => {
    const container = document.createElement("div");
    container.innerHTML = "Finding: <strong>two records</strong>.";
    document.body.append(container);
    const target = container.querySelector("strong");
    if (!target) throw new Error("Missing formatted text");
    const payload = responseSelectionPayload(container, selectElement(target));
    expect(payload).toEqual({ plainText: "two records", html: "<strong>two records</strong>" });
    container.remove();
  });

  it("rejects a selection outside the response", () => {
    const container = document.createElement("div");
    container.textContent = "Response";
    const outside = document.createElement("p");
    outside.textContent = "Outside";
    document.body.append(outside);
    expect(responseSelectionPayload(container, selectElement(outside))).toBeNull();
    outside.remove();
  });

  it("writes rich clipboard data when available and falls back to plain text", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<strong>Formatted response</strong>";
    document.body.append(container);
    const target = container.querySelector("strong");
    if (!target) throw new Error("Missing formatted text");
    const selection = selectElement(target);
    const write = vi.fn().mockResolvedValue(undefined);
    class FakeClipboardItem {
      constructor(public readonly data: Record<string, Blob>) {}
    }
    await expect(copyResponseSelection(
      container,
      selection,
      { write },
      FakeClipboardItem as unknown as typeof ClipboardItem,
    )).resolves.toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(Object.keys((write.mock.calls[0][0][0] as FakeClipboardItem).data)).toEqual([
      "text/plain",
      "text/html",
    ]);

    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyResponseSelection(
      container,
      selection,
      { writeText },
      undefined,
    )).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Formatted response");
    container.remove();
  });

  it("copies the complete response as its original Markdown", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyCompleteResponse("**Finding:** documented.", {
      writeText,
    })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("**Finding:** documented.");
  });
});
