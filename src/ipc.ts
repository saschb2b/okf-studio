// IPC layer: the only place the frontend talks to the backend. In a Tauri
// window it calls Rust commands and plugins; in a browser or test it falls back
// to an in-memory mock, so the UI runs and tests pass without the backend.

import type {
  Bundle,
  BundleRoot,
  RecentBundle,
  RemoteSource,
  Settings,
} from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import {
  MOCK_ASSETS,
  MOCK_BUNDLE,
  MOCK_FOLDER,
  MOCK_RECENTS,
  MOCK_ROOTS,
} from "./mock/fixture.ts";

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

/**
 * Fetch a remote bundle source into a local cache directory and return that
 * directory's path — which the caller then treats exactly like a picked folder
 * (scan → open → watch → recents). This is a *user-initiated* network call (the
 * app makes no automatic ones); the Rust command applies https-only, size-cap,
 * and archive-extraction containment guards. Off-Tauri it resolves to the mock
 * folder after a short delay, so the dialog's fetch progress is exercised in dev.
 */
export async function fetchRemoteBundle(
  source: RemoteSource,
): Promise<{ folder: string }> {
  if (!isTauri()) {
    await new Promise((r) => setTimeout(r, 600));
    return { folder: MOCK_FOLDER };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const folder = await invoke<string>("fetch_remote_bundle", { source });
  return { folder };
}

export async function scanBundles(
  folder: string,
  maxDepth = 8,
): Promise<BundleRoot[]> {
  if (!isTauri()) return MOCK_ROOTS;
  const { invoke } = await import("@tauri-apps/api/core");
  // Tauri maps `maxDepth` to the command's `max_depth` argument.
  return invoke<BundleRoot[]>("scan_bundles", { folder, maxDepth });
}

export async function readBundle(root: string): Promise<Bundle> {
  if (!isTauri()) return MOCK_BUNDLE;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Bundle>("read_bundle", { root });
}

/**
 * Read one companion asset's text (an ODSF `*.example.html` preview or a
 * `styles/*.css` it links) for the design-system renderer. `rel` is a
 * bundle-relative path; the Rust core guards against escaping the bundle root
 * and only serves text assets. Resolves to `null` when the asset is absent or
 * not permitted, so the caller degrades gracefully. Off-Tauri it serves the
 * in-memory mock so previews render in the browser and tests.
 */
export async function readAsset(
  root: string,
  rel: string,
): Promise<string | null> {
  if (!isTauri()) return MOCK_ASSETS[rel.replace(/^\/+/, "")] ?? null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("read_asset", { root, rel });
}

/**
 * Read a *local* bundle image as a `data:` URL so the reader renders it inline
 * with no network fetch (the offline stance). Resolves to `null` when the image
 * is absent, not an image type, or escapes the bundle root. Off-Tauri it encodes
 * the in-memory mock asset so images render in the browser and tests.
 */
export async function readAssetDataUrl(
  root: string,
  rel: string,
): Promise<string | null> {
  if (!isTauri()) {
    const key = rel.replace(/^\/+/, "");
    const text = MOCK_ASSETS[key];
    if (!text) return null;
    const mime = key.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png";
    return `data:${mime};base64,${btoa(text)}`;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("read_asset_data_url", { root, rel });
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

// Off-Tauri, recents live in memory, seeded from the fixture so the switcher's
// recent rows (pins, hover actions) render in browser dev and tests too.
let mockRecents: RecentBundle[] | null = null;

async function readRecents(): Promise<RecentBundle[]> {
  if (!isTauri()) return (mockRecents ??= MOCK_RECENTS.map((r) => ({ ...r })));
  return (await (await store()).get<RecentBundle[]>(RECENTS_KEY)) ?? [];
}

async function writeRecents(next: RecentBundle[]): Promise<void> {
  if (!isTauri()) {
    mockRecents = next;
    return;
  }
  const st = await store();
  await st.set(RECENTS_KEY, next);
  await st.save();
}

export async function recentBundles(): Promise<RecentBundle[]> {
  return readRecents();
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
  const prev = await readRecents();
  const pinned = prev.find((r) => r.root === entry.root)?.pinned ?? false;
  const next = capRecents([
    { ...entry, ts: Date.now(), pinned },
    ...prev.filter((r) => r.root !== entry.root),
  ]);
  await writeRecents(next);
  return next;
}

export async function pinBundle(root: string): Promise<RecentBundle[]> {
  const prev = await readRecents();
  const next = prev.map((r) =>
    r.root === root ? { ...r, pinned: !r.pinned } : r,
  );
  await writeRecents(next);
  return next;
}

export async function forgetBundle(root: string): Promise<RecentBundle[]> {
  const prev = await readRecents();
  const next = prev.filter((r) => r.root !== root);
  await writeRecents(next);
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
  if (!isTauri())
    return () => {
      /* nothing to watch off-Tauri */
    };
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<BundleChanged>("bundle-changed", (ev) =>
    onChanged(ev.payload),
  );
  await invoke("start_watch", { folder });
  return () => {
    unlisten();
    void invoke("stop_watch").catch(() => {
      /* best-effort cleanup */
    });
  };
}
