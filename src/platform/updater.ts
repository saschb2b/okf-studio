// Opt-in update flow. The app never checks on its own — this runs only when the
// user clicks "Check for updates" in Settings, keeping the local-first,
// offline-by-default stance (the one user-initiated network path). It's a two
// step flow: check, then (on confirm) install. How the install resolves depends
// on the running package:
//   - AppImage / Windows  → download, verify the signature, install, relaunch.
//   - .deb (or any non-AppImage Linux) → the Tauri updater can't replace the
//     install in place, so we surface the new version and a Download link to the
//     releases page instead of a failing install.
// See docs/ux/settings.md and docs/architecture/build-and-release.md.

import { isTauri } from "@/ipc.ts";

/** The release the user is pointed at for a manual download (.deb path). */
export const RELEASES_URL = "https://github.com/saschb2b/okf-viewer/releases/latest";

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  // A newer version exists. `canInstall` is false for .deb-style installs that
  // must download the package manually.
  | { kind: "available"; version: string; canInstall: boolean }
  | { kind: "installing"; version: string }
  | { kind: "uptodate" }
  | { kind: "error"; message: string };

/** Whether the running install can update itself in place (Rust command). */
async function canSelfUpdate(): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("can_self_update");
  } catch {
    return true; // command unavailable → assume installable, fail loudly on install
  }
}

/** Check the latest release; report whether an update is available. Never throws. */
export async function checkForUpdate(setStatus: (s: UpdateStatus) => void): Promise<void> {
  if (!isTauri()) {
    setStatus({ kind: "error", message: "Updates are only available in the desktop app." });
    return;
  }
  setStatus({ kind: "checking" });
  try {
    const canInstall = await canSelfUpdate();
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      setStatus({ kind: "uptodate" });
      return;
    }
    setStatus({ kind: "available", version: update.version, canInstall });
  } catch (e) {
    setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

/** Download, install, and relaunch into the available update. Never returns on
 *  success (the app relaunches). Never throws. */
export async function installUpdate(
  setStatus: (s: UpdateStatus) => void,
  version: string,
): Promise<void> {
  setStatus({ kind: "installing", version });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      setStatus({ kind: "uptodate" });
      return;
    }
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
