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
  type ReactNode,
} from "react";
import type { Bundle, BundleRoot, Concept, RecentBundle, Settings } from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import { applyTheme } from "./theme.ts";
import * as ipc from "./ipc.ts";
import { isWindowMaximized, onWindowResized } from "./window.ts";

export type PanelName = "sidebar" | "reader" | "log" | "validation";

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
  panels: { sidebar: true, reader: true, log: false, validation: false },
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
      if (m.id === s.activeConceptId) return s;
      return {
        ...s,
        activeConceptId: m.id,
        back: s.activeConceptId ? [...s.back, s.activeConceptId] : s.back,
        fwd: [],
        palette: false,
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
  openFolderPath(folder: string): Promise<void>;
  selectBundle(root: string, folder?: string): Promise<void>;
  openRecentBundle(entry: RecentBundle): Promise<void>;
  pinBundle(root: string): Promise<void>;
  forgetBundle(root: string): Promise<void>;
  setSwitcher(open: boolean): void;
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

const Ctx = createContext<{ state: State; actions: Actions } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Latest state for async actions to read. Updated in an effect (not during
  // render) so it never mutates a ref while rendering; actions run from event
  // handlers/effects after commit, so they always see the current value.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const actions: Actions = {
    async openFolder() {
      const folder = await ipc.pickFolder();
      if (!folder) return;
      await actions.openFolderPath(folder);
    },
    async openFolderPath(folder) {
      dispatch({ t: "loading", v: true });
      try {
        const bundles = await ipc.scanBundles(
          folder,
          stateRef.current.settings.scanMaxDepth,
        );
        dispatch({ t: "openFolder", folder, bundles });
        if (bundles.length >= 1) await actions.selectBundle(bundles[0].root, folder);
        else dispatch({ t: "loading", v: false });
      } catch (e) {
        dispatch({ t: "error", v: String(e) });
      }
    },
    async selectBundle(root, folder) {
      dispatch({ t: "loading", v: true });
      try {
        const bundle = await ipc.readBundle(root);
        dispatch({ t: "setBundle", root, bundle });
        // Record this bundle in recents, keyed by root, with the folder that
        // granted its read scope so it can be re-granted on reopen.
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
        const bundles = await ipc.scanBundles(
          entry.folder,
          stateRef.current.settings.scanMaxDepth,
        );
        dispatch({ t: "openFolder", folder: entry.folder, bundles });
        const root = bundles.some((b) => b.root === entry.root)
          ? entry.root
          : bundles[0]?.root;
        if (root) await actions.selectBundle(root, entry.folder);
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
    async rescan() {
      const { folder, activeRoot } = stateRef.current;
      if (!folder) return;
      const bundles = await ipc.scanBundles(
          folder,
          stateRef.current.settings.scanMaxDepth,
        );
      dispatch({ t: "openFolder", folder, bundles });
      const root = activeRoot ?? bundles[0]?.root;
      if (root) await actions.selectBundle(root);
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

  // Load persisted settings once, and reopen the most recent folder if any
  // (first-run.md: "can reopen the last one automatically").
  useEffect(() => {
    void ipc.loadSettings().then((s) => dispatch({ t: "settings", v: s }));
    void ipc.recentBundles().then((recents) => {
      dispatch({ t: "recents", v: recents });
      if (recents.length > 0) void actions.openRecentBundle(recents[0]);
    });
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
    let dispose: (() => void) | undefined;
    void ipc
      .startWatch(root, () => {
        void ipc.readBundle(root).then((bundle) =>
          dispatch({ t: "setBundle", root, bundle }),
        );
      })
      .then((d) => {
        dispose = d;
      });
    return () => dispose?.();
  }, [state.activeRoot]);

  return <Ctx.Provider value={{ state, actions }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/** Convenience: the currently selected concept, or null. */
export function useActiveConcept(): Concept | null {
  const { state } = useApp();
  if (!state.bundle || !state.activeConceptId) return null;
  return state.bundle.concepts.find((c) => c.id === state.activeConceptId) ?? null;
}
