// Native window operations for the custom (borderless) title bar. Every call is
// a no-op outside a Tauri window, so the browser/dev preview and tests run
// unchanged. See docs/ux/browsing-layout.md and docs/architecture/ipc-and-security.md.

import { isTauri } from "@/shared/ipc.ts";

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

/**
 * Reveal the current OS window. Every app window is created hidden
 * (`visible: false`) because the frame is transparent and undecorated — shown
 * at creation it would sit on screen as an empty translucent rectangle for the
 * whole webview boot. App.tsx calls this once the first committed frame
 * paints; a Rust watchdog (lib.rs setup) is the fallback if the frontend
 * crashes before reaching it.
 */
export async function showWindowWhenPainted(): Promise<void> {
  if (!isTauri()) return;
  const w = await win();
  await w.show();
  await w.setFocus();
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  await (await win()).startDragging();
}

export async function startWindowResize(dir: ResizeDir): Promise<void> {
  if (!isTauri()) return;
  await (await win()).startResizeDragging(dir);
}

/**
 * Undock a concept into its own OS window — the browser tear-off (see
 * docs/proposals/multi-view.md). The new window runs the *full app*, booted via
 * query params onto the same bundle (`folder` re-grants the read scope, `root`
 * names the bundle) and landed on `concept` in reader-only layout; windows are
 * otherwise independent. On Tauri it's a real WebviewWindow (its `pop-*` label
 * is covered by the capability file); in a browser it degrades to window.open
 * with the same params, so the flow works in dev and tests. Resolves false when
 * the window could not be created, so the caller keeps the local tab.
 */
export async function openConceptWindow(
  folder: string,
  root: string,
  concept: string | null,
): Promise<boolean> {
  const qs = new URLSearchParams({ folder, root });
  if (concept) qs.set("concept", concept);
  if (!isTauri()) {
    const w = window.open(
      `${location.pathname}?${qs}`,
      "_blank",
      "noopener,width=980,height=760",
    );
    return w !== null;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  // Unique label per pop-out; the timestamp+counter can't collide in-session.
  const label = `pop-${Date.now().toString(36)}-${popCounter++}`;
  const win = new WebviewWindow(label, {
    url: `index.html?${qs}`,
    title: "OKF Studio",
    width: 980,
    height: 760,
    minWidth: 560,
    minHeight: 400,
    // Same borderless frame as the main window (tauri.conf.json); the app's
    // own chrome (TopBar/WindowControls/ResizeHandles) runs in every window.
    decorations: false,
    transparent: true,
    // Boots hidden like the main window; the full app runs in the pop-out,
    // so the same first-paint reveal (App.tsx → showWindowWhenPainted)
    // shows it once content is up instead of flashing a transparent shell.
    visible: false,
  });
  return new Promise((resolve) => {
    void win.once("tauri://created", () => resolve(true));
    void win.once("tauri://error", () => resolve(false));
  });
}

let popCounter = 0;

/** Subscribe to size/maximize changes; returns an unsubscribe (no-op off-Tauri). */
export async function onWindowResized(cb: () => void): Promise<() => void> {
  if (!isTauri())
    return () => {
      /* no resize events off-Tauri */
    };
  return (await win()).onResized(() => cb());
}
