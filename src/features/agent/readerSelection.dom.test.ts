import { afterEach, describe, expect, it } from "vitest";
import {
  captureReaderSelection,
  MAX_READER_SELECTION_CHARS,
} from "@/features/agent/readerSelection.ts";

function selectContents(element: Node): Selection {
  const selection = window.getSelection();
  if (!selection) throw new Error("The test environment did not provide a selection.");
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("reader selection context", () => {
  it("captures plain text only from the current concept", () => {
    const scope = document.createElement("article");
    scope.dataset.readerSelectionScope = "";
    scope.dataset.conceptId = "product/overview";
    const paragraph = document.createElement("p");
    paragraph.textContent = "A selected reader claim.";
    scope.append(paragraph);
    document.body.append(scope);

    expect(captureReaderSelection(
      { id: "product/overview", title: "Overview\u0000 notes" },
      selectContents(paragraph),
    )).toEqual({
      status: "available",
      source: {
        title: "Selection from Overview notes",
        content: "A selected reader claim.",
        origin: "product/overview.md#reader-selection",
        mediaType: "text/plain",
      },
    });
  });

  it("rejects a selection outside the current reader", () => {
    const scope = document.createElement("article");
    scope.dataset.readerSelectionScope = "";
    scope.dataset.conceptId = "product/overview";
    document.body.append(scope);
    const outside = document.createElement("p");
    outside.textContent = "Application chrome";
    document.body.append(outside);

    expect(captureReaderSelection(
      { id: "product/overview", title: "Overview" },
      selectContents(outside),
    )).toEqual({
      status: "unavailable",
      reason: "Select text only within the current reader.",
    });
  });

  it("rejects selections above the explicit context limit", () => {
    const scope = document.createElement("article");
    scope.dataset.readerSelectionScope = "";
    scope.dataset.conceptId = "product/overview";
    scope.textContent = "x".repeat(MAX_READER_SELECTION_CHARS + 1);
    document.body.append(scope);

    expect(captureReaderSelection(
      { id: "product/overview", title: "Overview" },
      selectContents(scope),
    )).toEqual({
      status: "unavailable",
      reason: `Reader selections are limited to ${MAX_READER_SELECTION_CHARS.toLocaleString()} characters.`,
    });
  });
});
