// Native window operations for the custom (borderless) title bar. Every call is
// a no-op outside a Tauri window, so the browser/dev preview and tests run
// unchanged. See docs/ux/browsing-layout.md and docs/architecture/ipc-and-security.md.

import { isTauri } from "./ipc.ts";

export type ResizeDir =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await (await win()).minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await (await win()).toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  await (await win()).close();
}

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri()) return false;
  return (await win()).isMaximized();
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  await (await win()).startDragging();
}

export async function startWindowResize(dir: ResizeDir): Promise<void> {
  if (!isTauri()) return;
  await (await win()).startResizeDragging(dir);
}

/** Subscribe to size/maximize changes; returns an unsubscribe (no-op off-Tauri). */
export async function onWindowResized(cb: () => void): Promise<() => void> {
  if (!isTauri())
    return () => {
      /* no resize events off-Tauri */
    };
  return (await win()).onResized(() => cb());
}
