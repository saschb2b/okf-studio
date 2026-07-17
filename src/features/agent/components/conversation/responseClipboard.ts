export interface ResponseSelectionPayload {
  plainText: string;
  html: string;
}

interface ClipboardWriter {
  write?: (data: ClipboardItems) => Promise<void>;
  writeText?: (data: string) => Promise<void>;
}

export function responseSelectionPayload(
  container: HTMLElement,
  selection: Selection | null,
): ResponseSelectionPayload | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const plainText = selection.toString();
  if (!plainText.trim()) return null;

  const wrapper = document.createElement("div");
  wrapper.append(range.cloneContents());
  return { plainText, html: wrapper.innerHTML };
}

export async function copyResponseSelection(
  container: HTMLElement,
  selection: Selection | null = window.getSelection(),
  clipboard?: ClipboardWriter,
  ClipboardItemClass?: typeof ClipboardItem,
): Promise<boolean> {
  const payload = responseSelectionPayload(container, selection);
  const browserNavigator: { clipboard?: ClipboardWriter } = navigator;
  const globalClipboard: { ClipboardItem?: typeof ClipboardItem } = globalThis;
  const activeClipboard = clipboard ?? browserNavigator.clipboard;
  const ActiveClipboardItem = ClipboardItemClass ??
    globalClipboard.ClipboardItem;
  if (!payload || !activeClipboard) return false;
  if (activeClipboard.write && ActiveClipboardItem && payload.html) {
    await activeClipboard.write([
      new ActiveClipboardItem({
        "text/plain": new Blob([payload.plainText], { type: "text/plain" }),
        "text/html": new Blob([payload.html], { type: "text/html" }),
      }),
    ]);
    return true;
  }
  if (!activeClipboard.writeText) return false;
  await activeClipboard.writeText(payload.plainText);
  return true;
}

export async function copyCompleteResponse(
  markdown: string,
  clipboard?: ClipboardWriter,
): Promise<boolean> {
  const browserNavigator: { clipboard?: ClipboardWriter } = navigator;
  const activeClipboard = clipboard ?? browserNavigator.clipboard;
  if (!activeClipboard?.writeText) return false;
  await activeClipboard.writeText(markdown);
  return true;
}
