import type { AgentSourceInput } from "../ipc.ts";

export const MAX_READER_SELECTION_CHARS = 64 * 1024;

export type ReaderSelectionCapture =
  | { status: "available"; source: AgentSourceInput }
  | { status: "unavailable"; reason: string };

interface ReaderConceptIdentity {
  id: string;
  title: string;
}

function safeSourceTitle(title: string): string {
  const cleaned = Array.from(title, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
  }).join("").replace(/\s+/g, " ").trim();
  return Array.from(`Selection from ${cleaned || "reader"}`).slice(0, 256).join("");
}

export function captureReaderSelection(
  concept: ReaderConceptIdentity | null,
  selection: Selection | null = window.getSelection(),
): ReaderSelectionCapture {
  if (!concept) {
    return { status: "unavailable", reason: "Open a concept and select reader text first." };
  }
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return { status: "unavailable", reason: "Select text in the reader first." };
  }
  const scope = document.querySelector<HTMLElement>("[data-reader-selection-scope]");
  if (scope?.dataset.conceptId !== concept.id) {
    return { status: "unavailable", reason: "The reader selection is no longer current." };
  }
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!scope.contains(range.startContainer) || !scope.contains(range.endContainer)) {
      return { status: "unavailable", reason: "Select text only within the current reader." };
    }
  }
  const content = selection.toString().trim();
  if (!content) {
    return { status: "unavailable", reason: "Select text in the reader first." };
  }
  if (Array.from(content).length > MAX_READER_SELECTION_CHARS) {
    return {
      status: "unavailable",
      reason: `Reader selections are limited to ${MAX_READER_SELECTION_CHARS.toLocaleString()} characters.`,
    };
  }
  return {
    status: "available",
    source: {
      title: safeSourceTitle(concept.title),
      content,
      origin: `${concept.id}.md#reader-selection`,
      mediaType: "text/plain",
    },
  };
}
