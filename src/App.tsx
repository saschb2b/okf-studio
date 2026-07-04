import { useRef } from "react";
import type * as React from "react";
import { useApp, PANE_CLAMPS } from "./store.tsx";
import { useGlobalKeys } from "./keys.ts";
import { TopBar } from "./components/TopBar.tsx";
import { ActivityBar } from "./components/ActivityBar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { GraphView } from "./components/GraphView.tsx";
import { Reader } from "./components/Reader.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { ValidationPanel } from "./components/ValidationPanel.tsx";
import { LineagePanel } from "./components/LineagePanel.tsx";
import { LogView } from "./components/LogView.tsx";
import { Settings } from "./components/Settings.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { OpenRemoteDialog } from "./components/OpenRemoteDialog.tsx";
import { OverviewView } from "./components/OverviewView.tsx";
import { ResizeHandles } from "./components/ResizeHandles.tsx";
import { ShortcutsHelp } from "./components/ShortcutsHelp.tsx";

export function App() {
  const { state } = useApp();
  useGlobalKeys();

  return (
    <div className="app" data-maximized={state.maximized || undefined}>
      <TopBar />
      <div className="app-main">
        <ActivityBar />
        {state.bundle ? <Workspace /> : <EmptyState />}
      </div>
      <StatusBar />

      {/* Base UI Dialogs: mounted whenever a bundle is open; their `open` prop
          (from store state) drives visibility, so they manage their own
          focus/Escape/transitions. */}
      {state.bundle && (
        <>
          <LogView />
          <ValidationPanel />
          <LineagePanel />
          <CommandPalette />
        </>
      )}
      {/* Settings, the shortcuts overlay, and Open-from-URL work without a
          bundle (Open-from-URL is a first-run entry point); always mounted. */}
      <Settings />
      <ShortcutsHelp />
      <OpenRemoteDialog />

      {/* Borderless-window resize handles (Tauri only). */}
      <ResizeHandles />
    </div>
  );
}

/**
 * The three-pane workspace. The active layout mode (`state.layout`) decides
 * which panes render and which dividers exist; the grid track widths come from
 * `state.paneSizes` (px when the user has dragged, otherwise a CSS default).
 * See docs/proposals/reader-first-layout.md.
 */
function Workspace() {
  const { state } = useApp();
  const ref = useRef<HTMLDivElement>(null);

  const showSidebar = state.panels.sidebar;

  // Overview takes over the content area: sidebar (if open) + the overview,
  // which scrolls its own content. Selecting any concept dismisses it.
  if (state.overview) {
    const sidebarTrack =
      showSidebar && state.paneSizes.sidebar !== null
        ? `${state.paneSizes.sidebar}px`
        : showSidebar
          ? "var(--sidebar-default)"
          : null;
    return (
      <div
        ref={ref}
        className="workspace"
        data-layout="overview"
        style={{
          gridTemplateColumns: [sidebarTrack, "minmax(0, 1fr)"]
            .filter(Boolean)
            .join(" "),
        }}
      >
        {showSidebar && (
          <aside className="pane sidebar">
            <Sidebar />
          </aside>
        )}
        <OverviewView />
      </div>
    );
  }

  // reader pane visible: in split (unless `]` collapsed it) and reader mode.
  const showReader =
    (state.layout === "split" && state.panels.reader) ||
    state.layout === "reader";
  // graph pane visible: in split and graph mode.
  const showGraph = state.layout === "split" || state.layout === "graph";

  // Build the grid template from visible panes + persisted sizes. A sidebar
  // width of `null` falls back to its default token; the reader's `null` keeps
  // its co-equal fractional weight so a fresh split favors content. The graph
  // always takes the remaining 1fr.
  const sidebarTrack = showSidebar
    ? state.paneSizes.sidebar !== null
      ? `${state.paneSizes.sidebar}px`
      : "var(--sidebar-default)"
    : null;
  const readerTrack = showReader
    ? state.paneSizes.reader !== null
      ? `${state.paneSizes.reader}px`
      : "var(--reader-default)"
    : null;

  // Dividers only exist in split mode, where a drag has another pane to give
  // width to. Each one occupies its own narrow grid track.
  const splitMode = state.layout === "split";
  const sidebarDivider = showSidebar && splitMode && showGraph;
  const readerDivider = showGraph && showReader && splitMode;

  // Interleave pane tracks and divider tracks so the grid template lists every
  // child's column (sidebar | div | graph | div | reader).
  const columns = [
    sidebarTrack,
    sidebarDivider ? "var(--divider-w)" : null,
    showGraph ? "minmax(var(--graph-min), 1fr)" : null,
    readerDivider ? "var(--divider-w)" : null,
    // In reader-only mode the reader takes the elastic space; otherwise its
    // track sizes the pane and the graph flexes.
    showReader ? (showGraph ? readerTrack : "minmax(0, 1fr)") : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={ref}
      className="workspace"
      data-layout={state.layout}
      style={{ gridTemplateColumns: columns }}
    >
      {showSidebar && (
        <aside className="pane sidebar">
          <Sidebar />
        </aside>
      )}

      {sidebarDivider && <Divider pane="sidebar" gridRef={ref} />}

      {showGraph && (
        <main className="pane graph">
          <GraphView />
        </main>
      )}

      {readerDivider && <Divider pane="reader" gridRef={ref} />}

      {showReader && (
        <section className="pane reader">
          <Reader />
        </section>
      )}
    </div>
  );
}

/**
 * A keyboard-operable, draggable column divider.
 *
 * - `pane` is the track it resizes (`sidebar` measured from its left edge, or
 *   `reader` measured from the grid's right edge).
 * - Drag with the pointer, or focus and use arrow keys. Double-click (or
 *   Home/End) resets the track to its CSS default.
 */
function Divider({
  pane,
  gridRef,
}: {
  pane: "sidebar" | "reader";
  gridRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { state, actions } = useApp();
  const clamp = PANE_CLAMPS[pane];
  // A focusable role="separator" requires aria-valuenow; when the pane is at its
  // CSS default (no dragged px), report the clamp midpoint as a best effort.
  const valueNow =
    state.paneSizes[pane] ?? Math.round((clamp.min + clamp.max) / 2);

  function current(): number {
    const stored = state.paneSizes[pane];
    if (stored !== null) return stored;
    // Default state: read the rendered track width so the first drag continues
    // smoothly from wherever the default put it.
    const grid = gridRef.current;
    const sel = pane === "sidebar" ? ".sidebar" : ".reader";
    const el = grid?.querySelector(sel) as HTMLElement | null;
    return el?.getBoundingClientRect().width ?? clamp.min;
  }

  function widthFromPointer(clientX: number): number {
    const grid = gridRef.current;
    if (!grid) return current();
    const rect = grid.getBoundingClientRect();
    // sidebar grows to the right; reader grows to the left.
    return pane === "sidebar"
      ? clientX - rect.left
      : rect.right - clientX;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // Suppress the column-track transition during the drag so it tracks the
    // pointer 1:1 (the transition is only wanted for mode changes).
    gridRef.current?.classList.add("dragging");
    const move = (ev: PointerEvent) => {
      actions.setPaneSize(pane, widthFromPointer(ev.clientX));
    };
    const up = () => {
      gridRef.current?.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 48 : 16;
    // Arrow direction maps to "wider" depending on which side the pane sits.
    const grow = pane === "sidebar" ? "ArrowRight" : "ArrowLeft";
    const shrink = pane === "sidebar" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) {
      e.preventDefault();
      actions.setPaneSize(pane, current() + step);
    } else if (e.key === shrink) {
      e.preventDefault();
      actions.setPaneSize(pane, current() - step);
    } else if (e.key === "Home" || e.key === "End" || e.key === "Enter") {
      e.preventDefault();
      actions.setPaneSize(pane, null); // reset to default
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a focusable window-splitter separator is interactive (WAI-ARIA APG)
    <div
      className="pane-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={
        pane === "sidebar" ? "Resize sidebar" : "Resize reader"
      }
      aria-valuemin={clamp.min}
      aria-valuemax={clamp.max}
      aria-valuenow={valueNow}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => actions.setPaneSize(pane, null)}
      onKeyDown={onKeyDown}
    />
  );
}
