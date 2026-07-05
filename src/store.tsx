// Central app state: one source of truth for the active concept, the loaded
// bundle, filters, panels, and settings. Components read via useApp() and call
// actions; no pane holds competing selection state. See
// docs/architecture/frontend-architecture.md.

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Bundle,
  BundleRoot,
  Concept,
  RecentBundle,
  RemoteSource,
  Settings,
} from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import { applyTheme } from "./theme.ts";
import * as ipc from "./ipc.ts";
import { isWindowMaximized, onWindowResized } from "./window.ts";

export type PanelName = "sidebar" | "reader" | "log" | "validation" | "lineage";

/**
 * Result of a remote open. `opened` — a single bundle was fetched and opened;
 * `empty` — the URL was reachable but held no OKF bundle; `multiple` — the
 * fetched folder holds several bundles, so the caller (the dialog) offers a
 * picker rather than guessing which one to open. Fetch failures throw instead.
 */
export type RemoteOpenOutcome =
  | { status: "opened" }
  | { status: "empty" }
  | { status: "multiple"; folder: string; bundles: BundleRoot[] };

/** Which sidebar lens is showing: navigation (Index/Bundles) or filtering. */
export type Lens = "navigate" | "filter";

/**
 * Workspace layout mode (manual control always wins). "split" shows the graph
 * and reader side by side (default, reader weighted co-equal); "reader" hides
 * the graph for a focused read; "graph" hides the reader to explore. The
 * sidebar collapses independently via panels.sidebar. See
 * docs/proposals/reader-first-layout.md.
 */
export type LayoutMode = "split" | "reader" | "graph";

/**
 * Persisted pane widths in px. `null` means "use the default" — for the reader
 * the default is a co-equal fractional weight (set in CSS), so a fresh layout
 * favors content without pinning a pixel value. A drag writes a px value; a
 * double-click on a divider resets it back to null.
 */
export interface PaneSizes {
  sidebar: number | null;
  reader: number | null;
}

/** Min/max clamps (px) for draggable dividers; see reader-first-layout.md. */
export const PANE_CLAMPS = {
  sidebar: { min: 200, max: 360 },
  reader: { min: 320, max: 720 },
  /** The graph soaks up the remaining 1fr; we only guard a floor for it. */
  graphMin: 280,
} as const;

const LAYOUT_KEY = "okf-viewer:layout";

interface PersistedLayout {
  mode: LayoutMode;
  sizes: PaneSizes;
}

function loadLayout(): PersistedLayout {
  const fallback: PersistedLayout = {
    mode: "split",
    sizes: { sidebar: null, reader: null },
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<PersistedLayout>;
    const mode: LayoutMode =
      p.mode === "reader" || p.mode === "graph" ? p.mode : "split";
    const sizes: PaneSizes = {
      sidebar: typeof p.sizes?.sidebar === "number" ? p.sizes.sidebar : null,
      reader: typeof p.sizes?.reader === "number" ? p.sizes.reader : null,
    };
    return { mode, sizes };
  } catch {
    return fallback;
  }
}

function saveLayout(mode: LayoutMode, sizes: PaneSizes): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ mode, sizes }));
  } catch {
    // Persistence is best-effort; ignore quota/serialization errors.
  }
}

/**
 * Graph rendering mode. "focus" renders the ego neighborhood of the selected
 * concept; "overview" renders the whole (filtered) graph. See
 * docs/proposals/graph-from-picture-to-tool.md.
 */
export type GraphMode = "focus" | "overview";

/** How aggressively the graph prunes edges to a readable backbone (see
 *  src/graph/backbone.ts). "all" draws every cross-link (the raw, dense graph). */
export type LinkDensity = "sparse" | "balanced" | "all";

export interface State {
  folder: string | null;
  bundles: BundleRoot[];
  recents: RecentBundle[];
  switcherOpen: boolean;
  /** The bundle Overview/health landing view takes over the content area. */
  overview: boolean;
  remoteOpen: boolean;
  /** One-shot URL to prefill (and auto-fetch) the next time the remote dialog
   *  opens — the first-run example cards hand their URL off this way. */
  remoteSeed: string | null;
  maximized: boolean;
  activeRoot: string | null;
  bundle: Bundle | null;
  loading: boolean;
  error: string | null;
  activeConceptId: string | null;
  back: string[];
  fwd: string[];
  query: string;
  hiddenTypes: string[];
  activeTag: string | null;
  lens: Lens;
  graphMode: GraphMode;
  focusDepth: number;
  linkDensity: LinkDensity;
  layout: LayoutMode;
  paneSizes: PaneSizes;
  panels: Record<PanelName, boolean>;
  palette: boolean;
  /** One-shot initial query for the next palette open (e.g. the sidebar's
   *  "Open full search" hand-off); null means keep the palette's own value. */
  paletteSeed: string | null;
  settingsOpen: boolean;
  help: boolean;
  settings: Settings;
}

const persistedLayout = loadLayout();

const initialState: State = {
  folder: null,
  bundles: [],
  recents: [],
  switcherOpen: false,
  overview: false,
  remoteOpen: false,
  remoteSeed: null,
  maximized: false,
  activeRoot: null,
  bundle: null,
  loading: false,
  error: null,
  activeConceptId: null,
  back: [],
  fwd: [],
  query: "",
  hiddenTypes: [],
  activeTag: null,
  lens: "navigate",
  graphMode: "focus",
  focusDepth: 1,
  linkDensity: "balanced",
  layout: persistedLayout.mode,
  paneSizes: persistedLayout.sizes,
  panels: { sidebar: true, reader: true, log: false, validation: false, lineage: false },
  palette: false,
  paletteSeed: null,
  settingsOpen: false,
  help: false,
  settings: DEFAULT_SETTINGS,
};

type Msg =
  | { t: "loading"; v: boolean }
  | { t: "error"; v: string | null }
  | { t: "openFolder"; folder: string; bundles: BundleRoot[] }
  | { t: "recents"; v: RecentBundle[] }
  | { t: "switcher"; v: boolean }
  | { t: "overview"; v: boolean }
  | { t: "showOnlyType"; v: string }
  | { t: "remoteOpen"; v: boolean; seed?: string }
  | { t: "maximized"; v: boolean }
  | { t: "setBundle"; root: string; bundle: Bundle }
  | { t: "select"; id: string | null }
  | { t: "back" }
  | { t: "fwd" }
  | { t: "query"; v: string }
  | { t: "toggleType"; v: string }
  | { t: "showAllTypes" }
  | { t: "tag"; v: string | null }
  | { t: "lens"; v: Lens }
  | { t: "graphMode"; v: GraphMode }
  | { t: "focusDepth"; v: number }
  | { t: "linkDensity"; v: LinkDensity }
  | { t: "layout"; v: LayoutMode }
  | { t: "cycleLayout" }
  | { t: "paneSize"; pane: "sidebar" | "reader"; v: number | null }
  | { t: "panel"; name: PanelName; v?: boolean }
  | { t: "palette"; v: boolean; seed?: string }
  | { t: "settingsOpen"; v: boolean }
  | { t: "help"; v: boolean }
  | { t: "settings"; v: Settings };

function defaultConcept(bundle: Bundle): string | null {
  for (const idx of bundle.indexes) {
    for (const sec of idx.sections) {
      const e = sec.entries.find((x) => x.kind === "concept");
      if (e) return e.target;
    }
  }
  return bundle.concepts[0]?.id ?? null;
}

function reducer(s: State, m: Msg): State {
  switch (m.t) {
    case "loading":
      return { ...s, loading: m.v };
    case "error":
      return { ...s, error: m.v, loading: false };
    case "openFolder":
      return { ...s, folder: m.folder, bundles: m.bundles, error: null };
    case "recents":
      return { ...s, recents: m.v };
    case "switcher":
      return { ...s, switcherOpen: m.v };
    case "overview":
      return { ...s, overview: m.v };
    case "showOnlyType": {
      // Show only concepts of type `v` — hide every other type present. Leaves
      // the overview and reveals the Filter lens so the applied filter is visible.
      const all = [
        ...new Set((s.bundle?.concepts ?? []).map((c) => c.type).filter(Boolean)),
      ];
      return {
        ...s,
        hiddenTypes: all.filter((t) => t !== m.v),
        overview: false,
        lens: "filter",
      };
    }
    case "remoteOpen":
      return { ...s, remoteOpen: m.v, remoteSeed: m.v ? (m.seed ?? null) : null };
    case "maximized":
      return { ...s, maximized: m.v };
    case "setBundle": {
      const keep =
        s.activeConceptId &&
        m.bundle.concepts.some((c) => c.id === s.activeConceptId)
          ? s.activeConceptId
          : defaultConcept(m.bundle);
      return {
        ...s,
        activeRoot: m.root,
        bundle: m.bundle,
        activeConceptId: keep,
        loading: false,
        error: null,
        // reset view state when switching bundles (but not on live-reload of same root)
        back: m.root === s.activeRoot ? s.back : [],
        fwd: m.root === s.activeRoot ? s.fwd : [],
        query: m.root === s.activeRoot ? s.query : "",
        hiddenTypes: m.root === s.activeRoot ? s.hiddenTypes : [],
        activeTag: m.root === s.activeRoot ? s.activeTag : null,
      };
    }
    case "select":
      // Selecting a concept always leaves the Overview landing (you're diving in).
      if (m.id === s.activeConceptId) return s.overview ? { ...s, overview: false } : s;
      return {
        ...s,
        activeConceptId: m.id,
        back: s.activeConceptId ? [...s.back, s.activeConceptId] : s.back,
        fwd: [],
        palette: false,
        overview: false,
      };
    case "back": {
      if (!s.back.length) return s;
      const prev = s.back[s.back.length - 1];
      return {
        ...s,
        back: s.back.slice(0, -1),
        fwd: s.activeConceptId ? [s.activeConceptId, ...s.fwd] : s.fwd,
        activeConceptId: prev,
      };
    }
    case "fwd": {
      if (!s.fwd.length) return s;
      const next = s.fwd[0];
      return {
        ...s,
        fwd: s.fwd.slice(1),
        back: s.activeConceptId ? [...s.back, s.activeConceptId] : s.back,
        activeConceptId: next,
      };
    }
    case "query":
      return { ...s, query: m.v };
    case "toggleType":
      return {
        ...s,
        hiddenTypes: s.hiddenTypes.includes(m.v)
          ? s.hiddenTypes.filter((t) => t !== m.v)
          : [...s.hiddenTypes, m.v],
      };
    case "showAllTypes":
      return { ...s, hiddenTypes: [] };
    case "tag":
      return { ...s, activeTag: m.v };
    case "lens":
      return { ...s, lens: m.v };
    case "graphMode":
      return { ...s, graphMode: m.v };
    case "focusDepth":
      // Clamp to the supported 1/2/3 depth control.
      return { ...s, focusDepth: Math.min(3, Math.max(1, Math.round(m.v))) };
    case "linkDensity":
      return { ...s, linkDensity: m.v };
    case "layout": {
      if (m.v === s.layout) return s;
      saveLayout(m.v, s.paneSizes);
      return { ...s, layout: m.v };
    }
    case "cycleLayout": {
      const order: LayoutMode[] = ["split", "reader", "graph"];
      const next = order[(order.indexOf(s.layout) + 1) % order.length];
      saveLayout(next, s.paneSizes);
      return { ...s, layout: next };
    }
    case "paneSize": {
      const v =
        m.v === null
          ? null
          : Math.round(
              Math.min(
                PANE_CLAMPS[m.pane].max,
                Math.max(PANE_CLAMPS[m.pane].min, m.v),
              ),
            );
      const paneSizes = { ...s.paneSizes, [m.pane]: v };
      saveLayout(s.layout, paneSizes);
      return { ...s, paneSizes };
    }
    case "panel":
      return {
        ...s,
        panels: {
          ...s.panels,
          [m.name]: m.v ?? !s.panels[m.name],
        },
      };
    case "palette":
      return { ...s, palette: m.v, paletteSeed: m.v ? (m.seed ?? null) : null };
    case "settingsOpen":
      return { ...s, settingsOpen: m.v };
    case "help":
      return { ...s, help: m.v };
    case "settings":
      return { ...s, settings: m.v };
  }
}

export interface Actions {
  openFolder(): Promise<void>;
  openFolderPath(folder: string, remote?: RemoteSource): Promise<void>;
  /** Fetch a remote bundle and report the outcome (see RemoteOpenOutcome);
   *  throws on fetch failure. A single bundle opens directly; several defer to
   *  the caller's picker via `openRemoteChoice`. */
  openRemote(source: RemoteSource): Promise<RemoteOpenOutcome>;
  /** Open one specific bundle from a already-fetched remote folder (the picker). */
  openRemoteChoice(
    root: string,
    folder: string,
    bundles: BundleRoot[],
    source: RemoteSource,
  ): Promise<void>;
  refreshRemote(entry: RecentBundle): Promise<void>;
  selectBundle(root: string, folder?: string, remote?: RemoteSource): Promise<void>;
  openRecentBundle(entry: RecentBundle): Promise<void>;
  pinBundle(root: string): Promise<void>;
  forgetBundle(root: string): Promise<void>;
  setSwitcher(open: boolean): void;
  setOverview(open: boolean): void;
  showOnlyType(type: string): void;
  setRemoteOpen(open: boolean, seed?: string): void;
  rescan(): Promise<void>;
  selectConcept(id: string | null): void;
  back(): void;
  forward(): void;
  setQuery(q: string): void;
  toggleType(t: string): void;
  showAllTypes(): void;
  setTag(tag: string | null): void;
  setLens(lens: Lens): void;
  setGraphMode(mode: GraphMode): void;
  setFocusDepth(depth: number): void;
  setLinkDensity(density: LinkDensity): void;
  setLayout(mode: LayoutMode): void;
  cycleLayout(): void;
  setPaneSize(pane: "sidebar" | "reader", value: number | null): void;
  togglePanel(name: PanelName, value?: boolean): void;
  setPalette(open: boolean, seed?: string): void;
  setSettingsOpen(open: boolean): void;
  setHelp(open: boolean): void;
  updateSettings(patch: Partial<Settings>): void;
  openExternal(url: string): void;
}

// Split the store into two contexts (the state/dispatch pattern): the data and
// the (stable) action set. Keeping them apart means the ActionsCtx value never
// changes, so an action-only consumer (useAppActions) never re-renders when the
// data changes; and each context throws its own clear "outside provider" error.
const StateCtx = createContext<State | null>(null);
const ActionsCtx = createContext<Actions | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Latest state for async actions to read. Updated in an effect (not during
  // render) so it never mutates a ref while rendering; actions run from event
  // handlers/effects after commit, so they always see the current value.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Build the action set once (useState's lazy initializer): every action closes
  // only over the stable `dispatch` and the always-fresh `stateRef`, so a single
  // object stays correct forever — and a stable reference keeps the ActionsCtx
  // value from ever changing, so action-only consumers don't re-render on data.
  const [actions] = useState<Actions>(() => {
    const a: Actions = {
    async openFolder() {
      const folder = await ipc.pickFolder();
      if (!folder) return;
      await a.openFolderPath(folder);
    },
    async openFolderPath(folder, remote) {
      dispatch({ t: "loading", v: true });
      try {
        const bundles = await ipc.scanBundles(
          folder,
          stateRef.current.settings.scanMaxDepth,
        );
        dispatch({ t: "openFolder", folder, bundles });
        if (bundles.length >= 1)
          await a.selectBundle(bundles[0].root, folder, remote);
        else dispatch({ t: "loading", v: false });
      } catch (e) {
        dispatch({ t: "error", v: String(e) });
      }
    },
    async openRemote(source) {
      // The detector runs in two phases, both surfaced by the dialog, and
      // NOTHING is switched until we know there's a bundle to open:
      //   1. Fetch — a network/HTTP failure throws (the dialog shows an error).
      //   2. Scan the fetched cache. Zero bundles → return "empty": the URL was
      //      reachable but holds no conformant OKF bundle (e.g. a repo of plain
      //      files, or the wrong subpath). The dialog shows a distinct, calm
      //      "not a bundle" explanation rather than silently leaving the
      //      previous bundle in place.
      const { folder } = await ipc.fetchRemoteBundle(source);
      const bundles = await ipc.scanBundles(
        folder,
        stateRef.current.settings.scanMaxDepth,
      );
      if (bundles.length === 0) return { status: "empty" };
      // Several bundles at that URL → let the user pick which one, rather than
      // silently opening the first. The dialog renders the choices.
      if (bundles.length > 1) return { status: "multiple", folder, bundles };
      dispatch({ t: "remoteOpen", v: false });
      dispatch({ t: "openFolder", folder, bundles });
      // Tagged with its origin so the recent entry remembers where it came from.
      await a.selectBundle(bundles[0].root, folder, source);
      return { status: "opened" };
    },
    async openRemoteChoice(root, folder, bundles, source) {
      dispatch({ t: "remoteOpen", v: false });
      dispatch({ t: "openFolder", folder, bundles });
      await a.selectBundle(root, folder, source);
    },
    async refreshRemote(entry) {
      if (!entry.remote) return;
      dispatch({ t: "loading", v: true });
      try {
        const { folder } = await ipc.fetchRemoteBundle(entry.remote);
        await a.openFolderPath(folder, entry.remote);
      } catch (e) {
        dispatch({ t: "error", v: String(e) });
      }
    },
    async selectBundle(root, folder, remote) {
      dispatch({ t: "loading", v: true });
      try {
        const bundle = await ipc.readBundle(root);
        dispatch({ t: "setBundle", root, bundle });
        // Record this bundle in recents, keyed by root, with the folder that
        // granted its read scope so it can be re-granted on reopen. `remote`
        // (when present) remembers the URL it was fetched from.
        const f = folder ?? stateRef.current.folder;
        if (f) {
          const types = [
            ...new Set(bundle.concepts.map((c) => c.type).filter(Boolean)),
          ].sort();
          const recents = await ipc.pushRecentBundle({
            root,
            folder: f,
            name: bundle.name,
            conceptCount: bundle.concepts.length,
            types,
            remote,
          });
          dispatch({ t: "recents", v: recents });
        }
      } catch (e) {
        dispatch({ t: "error", v: String(e) });
      }
    },
    async openRecentBundle(entry) {
      dispatch({ t: "loading", v: true });
      try {
        // Re-grant the folder scope, then open the specific bundle (falling
        // back to the first if it has moved/disappeared inside the folder).
        let folder = entry.folder;
        let bundles = await ipc.scanBundles(
          folder,
          stateRef.current.settings.scanMaxDepth,
        );
        // A remote bundle's folder is a local cache that may have been evicted;
        // if nothing's there, re-fetch from source (still explicit — the user
        // clicked this recent) before giving up.
        if (bundles.length === 0 && entry.remote) {
          folder = (await ipc.fetchRemoteBundle(entry.remote)).folder;
          bundles = await ipc.scanBundles(
            folder,
            stateRef.current.settings.scanMaxDepth,
          );
        }
        dispatch({ t: "openFolder", folder, bundles });
        const root = bundles.some((b) => b.root === entry.root)
          ? entry.root
          : bundles[0]?.root;
        if (root) await a.selectBundle(root, folder, entry.remote);
        else dispatch({ t: "loading", v: false });
      } catch (e) {
        dispatch({ t: "error", v: String(e) });
      }
    },
    async pinBundle(root) {
      dispatch({ t: "recents", v: await ipc.pinBundle(root) });
    },
    async forgetBundle(root) {
      dispatch({ t: "recents", v: await ipc.forgetBundle(root) });
    },
    setSwitcher(open) {
      dispatch({ t: "switcher", v: open });
    },
    setOverview(open) {
      dispatch({ t: "overview", v: open });
    },
    showOnlyType(type) {
      dispatch({ t: "showOnlyType", v: type });
    },
    setRemoteOpen(open, seed) {
      dispatch({ t: "remoteOpen", v: open, seed });
    },
    async rescan() {
      const { folder, activeRoot } = stateRef.current;
      if (!folder) return;
      const bundles = await ipc.scanBundles(
          folder,
          stateRef.current.settings.scanMaxDepth,
        );
      dispatch({ t: "openFolder", folder, bundles });
      const root = activeRoot ?? bundles[0]?.root;
      if (root) await a.selectBundle(root);
    },
    selectConcept(id) {
      dispatch({ t: "select", id });
    },
    back() {
      dispatch({ t: "back" });
    },
    forward() {
      dispatch({ t: "fwd" });
    },
    setQuery(q) {
      dispatch({ t: "query", v: q });
    },
    toggleType(t) {
      dispatch({ t: "toggleType", v: t });
    },
    showAllTypes() {
      dispatch({ t: "showAllTypes" });
    },
    setTag(tag) {
      dispatch({ t: "tag", v: tag });
    },
    setLens(lens) {
      dispatch({ t: "lens", v: lens });
    },
    setGraphMode(mode) {
      dispatch({ t: "graphMode", v: mode });
    },
    setFocusDepth(depth) {
      dispatch({ t: "focusDepth", v: depth });
    },
    setLinkDensity(density) {
      dispatch({ t: "linkDensity", v: density });
    },
    setLayout(mode) {
      dispatch({ t: "layout", v: mode });
    },
    cycleLayout() {
      dispatch({ t: "cycleLayout" });
    },
    setPaneSize(pane, value) {
      dispatch({ t: "paneSize", pane, v: value });
    },
    togglePanel(name, value) {
      dispatch({ t: "panel", name, v: value });
    },
    setPalette(open, seed) {
      dispatch({ t: "palette", v: open, seed });
    },
    setSettingsOpen(open) {
      dispatch({ t: "settingsOpen", v: open });
    },
    setHelp(open) {
      dispatch({ t: "help", v: open });
    },
    updateSettings(patch) {
      const next = { ...stateRef.current.settings, ...patch };
      dispatch({ t: "settings", v: next });
      void ipc.saveSettings(next);
    },
    openExternal(url) {
      void ipc.openExternal(url);
    },
    };
    return a;
  });

  // Load persisted settings once, and reopen the most recent folder if any
  // (first-run.md: "can reopen the last one automatically"). Auto-reopen is
  // desktop-only: off-Tauri the recents are a seeded fixture for the switcher
  // UI, and dev/tests should still boot into the first-run state.
  useEffect(() => {
    void (async () => {
      const s = await ipc.loadSettings();
      // Seed the ref before the auto-reopen so its scan reads the *persisted*
      // scanMaxDepth, not the default — dispatch only reaches stateRef next
      // render, and openRecentBundle reads the ref synchronously here.
      stateRef.current = { ...stateRef.current, settings: s };
      dispatch({ t: "settings", v: s });
      const recents = await ipc.recentBundles();
      dispatch({ t: "recents", v: recents });
      if (recents.length > 0 && ipc.isTauri()) {
        await actions.openRecentBundle(recents[0]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the window's maximized state for the custom frame (square corners when
  // maximized). No-op off-Tauri.
  useEffect(() => {
    if (!ipc.isTauri()) return;
    let unsub = () => {
      /* replaced once the resize listener is registered */
    };
    const sync = () =>
      void isWindowMaximized().then((m) => dispatch({ t: "maximized", v: m }));
    sync();
    void onWindowResized(sync).then((u) => {
      unsub = u;
    });
    return () => unsub();
  }, []);

  // Apply theme; re-apply on OS scheme change when following the system.
  useEffect(() => {
    applyTheme(state.settings.theme, state.settings.reduceMotion);
    if (state.settings.theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system", stateRef.current.settings.reduceMotion);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [state.settings.theme, state.settings.reduceMotion]);

  // Live reload: watch the active bundle's folder; re-read on change.
  useEffect(() => {
    const root = state.activeRoot;
    if (!root) return;
    let cancelled = false; // true once this effect (this root) is torn down
    let dispose: (() => void) | undefined;
    void ipc
      .startWatch(root, () => {
        void ipc.readBundle(root).then((bundle) => {
          // Drop a read that resolves after the user already switched roots —
          // otherwise a late callback dispatches setBundle for the *old* root
          // and clobbers the now-active bundle.
          if (!cancelled) dispatch({ t: "setBundle", root, bundle });
        });
      })
      .then((d) => {
        // If the effect was already torn down before startWatch resolved,
        // dispose immediately (the returned cleanup ran with dispose still
        // undefined) so the backend watch isn't leaked.
        if (cancelled) d();
        else dispose = d;
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [state.activeRoot]);

  return (
    <StateCtx.Provider value={state}>
      <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
    </StateCtx.Provider>
  );
}

/** Subscribe to the store's state. Re-renders when the data changes. */
export function useAppState(): State {
  const s = useContext(StateCtx);
  if (s === null) throw new Error("useAppState must be used within AppProvider");
  return s;
}

/** The store's action set. A stable reference, so a component that reads only
 *  actions (no state) never re-renders on a data change. */
export function useAppActions(): Actions {
  const a = useContext(ActionsCtx);
  if (a === null) throw new Error("useAppActions must be used within AppProvider");
  return a;
}

/** Convenience for the common case that a component needs both. Subscribes to
 *  state (so it re-renders on data changes) — prefer useAppActions alone when a
 *  component only dispatches. */
export function useApp() {
  return { state: useAppState(), actions: useAppActions() };
}

/** Convenience: the currently selected concept, or null. */
export function useActiveConcept(): Concept | null {
  const state = useAppState();
  if (!state.bundle || !state.activeConceptId) return null;
  return state.bundle.concepts.find((c) => c.id === state.activeConceptId) ?? null;
}
