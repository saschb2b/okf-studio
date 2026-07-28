// Starting speed reading from outside the reader. The mode itself is deliberately
// local state — no pacing mode is persisted, because auto-advancing text must
// never start on its own (WCAG 2.2.2) — so the global shortcut asks for it
// through a one-line event rather than through the settings store.
//
// See docs/features/speed-reading.md and docs/ux/keyboard-shortcuts.md.

export type SpeedReadMode = "focus" | "guided";

const EVENT = "okf:speed-read";

/** Ask the open reader to start a pacing mode on its active concept. */
export function requestSpeedRead(mode: SpeedReadMode): void {
  window.dispatchEvent(new CustomEvent<SpeedReadMode>(EVENT, { detail: mode }));
}

/** Listen for that request. Returns the unsubscribe. */
export function onSpeedReadRequest(handler: (mode: SpeedReadMode) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<SpeedReadMode>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
