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
import type { Bundle, BundleRoot, Concept, Settings } from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import { applyTheme } from "./theme.ts";
import * as ipc from "./ipc.ts";

export type PanelName = "sidebar" | "reader" | "log" | "validation";

/** Which sidebar lens is showing: navigation (Index/Bundles) or filtering. */
export type Lens = "navigate" | "filter";

/**
 * Graph rendering mode. "focus" renders the ego neighborhood of the selected
 * concept; "overview" renders the whole (filtered) graph. See
 * docs/proposals/graph-from-picture-to-tool.md.
 */
export type GraphMode = "focus" | "overview";

export interface State {
  folder: string | null;
  bundles: BundleRoot[];
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
  panels: Record<PanelName, boolean>;
  palette: boolean;
  settingsOpen: boolean;
  settings: Settings;
}

const initialState: State = {
  folder: null,
  bundles: [],
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
  panels: { sidebar: true, reader: true, log: false, validation: false },
  palette: false,
  settingsOpen: false,
  settings: DEFAULT_SETTINGS,
};

type Msg =
  | { t: "loading"; v: boolean }
  | { t: "error"; v: string | null }
  | { t: "openFolder"; folder: string; bundles: BundleRoot[] }
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
  | { t: "panel"; name: PanelName; v?: boolean }
  | { t: "palette"; v: boolean }
  | { t: "settingsOpen"; v: boolean }
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
    case "panel":
      return {
        ...s,
        panels: {
          ...s.panels,
          [m.name]: m.v ?? !s.panels[m.name],
        },
      };
    case "palette":
      return { ...s, palette: m.v };
    case "settingsOpen":
      return { ...s, settingsOpen: m.v };
    case "settings":
      return { ...s, settings: m.v };
  }
}

export interface Actions {
  openFolder(): Promise<void>;
  openFolderPath(folder: string): Promise<void>;
  selectBundle(root: string): Promise<void>;
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
  togglePanel(name: PanelName, value?: boolean): void;
  setPalette(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  updateSettings(patch: Partial<Settings>): void;
  openExternal(url: string): void;
}

const Ctx = createContext<{ state: State; actions: Actions } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const actions: Actions = {
    async openFolder() {
      const folder = await ipc.pickFolder();
      if (!folder) return;
      await this.openFolderPath(folder);
    },
    async openFolderPath(folder) {
      dispatch({ t: "loading", v: true });
      try {
        const bundles = await ipc.scanBundles(folder);
        dispatch({ t: "openFolder", folder, bundles });
        void ipc.pinFolder(folder);
        if (bundles.length >= 1) await this.selectBundle(bundles[0].root);
        else dispatch({ t: "loading", v: false });
      } catch (e) {
        dispatch({ t: "error", v: String(e) });
      }
    },
    async selectBundle(root) {
      dispatch({ t: "loading", v: true });
      try {
        const bundle = await ipc.readBundle(root);
        dispatch({ t: "setBundle", root, bundle });
      } catch (e) {
        dispatch({ t: "error", v: String(e) });
      }
    },
    async rescan() {
      const { folder, activeRoot } = stateRef.current;
      if (!folder) return;
      const bundles = await ipc.scanBundles(folder);
      dispatch({ t: "openFolder", folder, bundles });
      const root = activeRoot ?? bundles[0]?.root;
      if (root) await this.selectBundle(root);
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
    togglePanel(name, value) {
      dispatch({ t: "panel", name, v: value });
    },
    setPalette(open) {
      dispatch({ t: "palette", v: open });
    },
    setSettingsOpen(open) {
      dispatch({ t: "settingsOpen", v: open });
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
    void ipc.recentFolders().then((folders) => {
      if (folders.length > 0) void actions.openFolderPath(folders[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
