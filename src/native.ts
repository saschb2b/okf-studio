// Native desktop behaviors — suppress the web defaults the system webview gives
// us for free (page zoom, default context menu) so the app feels like a native
// desktop app, not a website. See docs/proposals/native-feel.md.
//
// This module is framework-free: it only touches the DOM and `window`. It never
// reads or writes React state directly. To preserve the accessibility intent of
// the zoom keys/gestures it *remaps* them — instead of swallowing them inertly,
// it dispatches an `okf:zoom` CustomEvent that the React side (the Reader)
// listens for and applies to the reader text-size setting.

/** Detail of the `okf:zoom` event: bump in (+1), out (-1), or reset (0). */
export type ZoomIntent = 1 | -1 | 0;

/** The custom event name the React side listens for to adjust reader text size. */
export const ZOOM_EVENT = "okf:zoom";

/** Selectors that own their own zoom (the graph canvas) — leave their events alone. */
const GRAPH_SELECTOR = ".graph-canvas, .graph";
/** The reader keeps a useful native context menu (copy / select-all). */
const READER_SELECTOR = ".reader";

function isInside(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

function emitZoom(intent: ZoomIntent): void {
  window.dispatchEvent(new CustomEvent<ZoomIntent>(ZOOM_EVENT, { detail: intent }));
}

/**
 * Install document-level guards against web page-zoom and the default browser
 * context menu, and remap the zoom affordance to reader text-size.
 *
 * Returns a cleanup function that removes every listener. The app root never
 * needs to clean up (it lives for the process), but the cleanup keeps the module
 * testable and tidy.
 */
export function installNativeBehaviors(): () => void {
  // --- Block browser page-zoom hotkeys: Ctrl/Cmd + (+ / - / = / 0). ---------
  // Capture phase so we beat the webview's own handling. We remap (not just
  // swallow) to keep the a11y "make it bigger" intent alive via reader scale.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      emitZoom(1);
    } else if (e.key === "-") {
      e.preventDefault();
      emitZoom(-1);
    } else if (e.key === "0") {
      e.preventDefault();
      emitZoom(0);
    }
  };

  // --- Block ctrl+wheel / trackpad pinch page-zoom. -------------------------
  // Trackpad pinch arrives as a wheel event with `ctrlKey` set. We must register
  // non-passive to be allowed to preventDefault, and in the capture phase so we
  // see it first. We act ONLY when ctrlKey is set, so ordinary scroll stays
  // effectively passive (we return immediately). Over the graph canvas we let
  // the event through untouched so GraphView's own cursor-anchored zoom works —
  // we do not double-handle it here.
  const onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) return;
    if (isInside(e.target, GRAPH_SELECTOR)) return; // graph owns its own zoom
    e.preventDefault();
    emitZoom(e.deltaY < 0 ? 1 : -1);
  };

  // --- Suppress the default browser context menu on the app chrome. ---------
  // The reader keeps its menu so text stays copyable / selectable there.
  const onContextMenu = (e: MouseEvent): void => {
    if (isInside(e.target, READER_SELECTOR)) return;
    e.preventDefault();
  };

  document.addEventListener("keydown", onKeyDown, { capture: true });
  document.addEventListener("wheel", onWheel, { passive: false, capture: true });
  document.addEventListener("contextmenu", onContextMenu);

  return () => {
    document.removeEventListener("keydown", onKeyDown, { capture: true });
    document.removeEventListener("wheel", onWheel, { capture: true });
    document.removeEventListener("contextmenu", onContextMenu);
  };
}
