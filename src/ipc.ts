// IPC layer: the only place the frontend talks to the backend. In a Tauri
// window it calls Rust commands and plugins; in a browser or test it falls back
// to an in-memory mock, so the UI runs and tests pass without the backend.

import type { Bundle, BundleRoot, RecentBundle, Settings } from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import { MOCK_BUNDLE, MOCK_FOLDER, MOCK_ROOTS } from "./mock/fixture.ts";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return MOCK_FOLDER;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Open a folder of OKF bundles",
  });
  return typeof picked === "string" ? picked : null;
}

export async function scanBundles(folder: string): Promise<BundleRoot[]> {
  if (!isTauri()) return MOCK_ROOTS;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BundleRoot[]>("scan_bundles", { folder });
}

export async function readBundle(root: string): Promise<Bundle> {
  if (!isTauri()) return MOCK_BUNDLE;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Bundle>("read_bundle", { root });
}

/** Open an external URL in the OS browser (never fetched in-app). */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

// --- Settings & recent bundles, persisted via the store plugin ---

const STORE_FILE = "okf-viewer.json";
const RECENTS_KEY = "recentBundles";
const RECENTS_CAP = 12;

async function store() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load(STORE_FILE);
}

export async function loadSettings(): Promise<Settings> {
  if (!isTauri()) return DEFAULT_SETTINGS;
  const s = await (await store()).get<Partial<Settings>>("settings");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!isTauri()) return;
  const st = await store();
  await st.set("settings", settings);
  await st.save();
}

export async function recentBundles(): Promise<RecentBundle[]> {
  if (!isTauri()) return [];
  return (await (await store()).get<RecentBundle[]>(RECENTS_KEY)) ?? [];
}

/** Keep every pinned entry; cap the unpinned tail of a newest-first list. */
function capRecents(list: RecentBundle[]): RecentBundle[] {
  let unpinned = 0;
  return list.filter((r) => (r.pinned ? true : ++unpinned <= RECENTS_CAP));
}

/** Record a freshly-opened bundle at the top of recents (dedup by root). */
export async function pushRecentBundle(
  entry: Omit<RecentBundle, "ts" | "pinned">,
): Promise<RecentBundle[]> {
  if (!isTauri()) return [];
  const st = await store();
  const prev = (await st.get<RecentBundle[]>(RECENTS_KEY)) ?? [];
  const pinned = prev.find((r) => r.root === entry.root)?.pinned ?? false;
  const next = capRecents([
    { ...entry, ts: Date.now(), pinned },
    ...prev.filter((r) => r.root !== entry.root),
  ]);
  await st.set(RECENTS_KEY, next);
  await st.save();
  return next;
}

export async function pinBundle(root: string): Promise<RecentBundle[]> {
  if (!isTauri()) return [];
  const st = await store();
  const prev = (await st.get<RecentBundle[]>(RECENTS_KEY)) ?? [];
  const next = prev.map((r) =>
    r.root === root ? { ...r, pinned: !r.pinned } : r,
  );
  await st.set(RECENTS_KEY, next);
  await st.save();
  return next;
}

export async function forgetBundle(root: string): Promise<RecentBundle[]> {
  if (!isTauri()) return [];
  const st = await store();
  const prev = (await st.get<RecentBundle[]>(RECENTS_KEY)) ?? [];
  const next = prev.filter((r) => r.root !== root);
  await st.set(RECENTS_KEY, next);
  await st.save();
  return next;
}

// --- Live reload: watch the open folder ---

export interface BundleChanged {
  root: string;
  conceptIds: string[];
}

/** Begin watching a folder. Returns a disposer that stops the watch. */
export async function startWatch(
  folder: string,
  onChanged: (e: BundleChanged) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<BundleChanged>("bundle-changed", (ev) =>
    onChanged(ev.payload),
  );
  await invoke("start_watch", { folder });
  return () => {
    unlisten();
    void invoke("stop_watch").catch(() => {});
  };
}
