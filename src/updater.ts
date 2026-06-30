// Opt-in update check. The app never checks on its own — this runs only when the
// user clicks "Check for updates" in Settings, which keeps the local-first,
// offline-by-default stance (the one user-initiated network path). It checks the
// latest GitHub release via the Tauri updater plugin, then downloads, installs,
// and relaunches. See docs/ux/settings.md and docs/architecture/build-and-release.md.

import { isTauri } from "./ipc.ts";

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; version: string }
  | { kind: "uptodate" }
  | { kind: "error"; message: string };

/**
 * Check for, download, install, and relaunch into an update. Reports progress
 * through `setStatus`; never throws (errors surface as an `error` status). On a
 * successful update the app relaunches, so this does not return normally.
 */
export async function checkForUpdate(setStatus: (s: UpdateStatus) => void): Promise<void> {
  if (!isTauri()) {
    setStatus({ kind: "error", message: "Updates are only available in the desktop app." });
    return;
  }
  setStatus({ kind: "checking" });
  try {
    // Imported lazily so the web/dev build (no Tauri) never pulls these in.
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      setStatus({ kind: "uptodate" });
      return;
    }
    setStatus({ kind: "downloading", version: update.version });
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
