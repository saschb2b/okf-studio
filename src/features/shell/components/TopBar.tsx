// The top chrome bar: Open Folder, back/forward history, the current bundle
// name, and the right-side cluster (layout switch · window controls). App-level
// actions (Settings, shortcuts) live in the [ActivityBar]; the validation issue
// indicator and Log toggle in the [StatusBar]; reading prefs ("Aa") with the
// content in the [Reader]. The title bar holds only frequent, primary controls.
// See docs/ux/browsing-layout.md.

import { useRef } from "react";
import type { CSSProperties, MouseEvent, ReactElement } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Toolbar } from "@base-ui/react/toolbar";
import { Tooltip } from "@base-ui/react/tooltip";
import { useApp } from "@/shared/store.tsx";
import type { LayoutMode } from "@/shared/store.tsx";
import { isMac, modKey } from "@/shared/platform/platform.ts";
import { startWindowDrag, toggleMaximizeWindow } from "@/shared/platform/window.ts";
import { BundleSwitcher } from "@/features/bundle/components/BundleSwitcher.tsx";
import { WindowControls } from "@/features/shell/components/WindowControls.tsx";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./TopBar.css";

// Mac shows ⌘K; everything else shows Ctrl K.
const searchHint = isMac ? "⌘K" : "Ctrl K";
const mod = modKey;

// One shared "window" frame so the three icons read as a family. Each pane is
// solid when its content is shown and a faint ghost when it's collapsed, so the
// glyph mirrors what's actually on screen (left = graph, right = reader). The
// 1.1px center gap is the divider — negative space, not a drawn line, so it
// stays visible even when both panes are filled (split).
function LayoutIcon({ left, right }: { left: boolean; right: boolean }) {
  return (
    <svg
      className="layout-ico"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="pane"
        data-on={left}
        d="M4.3 4 H7.45 V12 H4.3 A1.8 1.8 0 0 1 2.5 10.2 V5.8 A1.8 1.8 0 0 1 4.3 4 Z"
      />
      <path
        className="pane"
        data-on={right}
        d="M8.55 4 H11.7 A1.8 1.8 0 0 1 13.5 5.8 V10.2 A1.8 1.8 0 0 1 11.7 12 H8.55 Z"
      />
      <rect
        x="2.5"
        y="4"
        width="11"
        height="8"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

// 3-way layout segmented control. Order graph -> split -> reader so the panes
// read left (explore) to right (read), matching the Ctrl/Cmd+1/2/3 hotkeys.
const LAYOUTS: {
  mode: LayoutMode;
  label: string;
  hint: string;
  icon: ReactElement;
}[] = [
  { mode: "graph", label: "Graph only", hint: `${mod}+1`, icon: <LayoutIcon left right={false} /> },
  { mode: "split", label: "Split", hint: `${mod}+2`, icon: <LayoutIcon left right /> },
  { mode: "reader", label: "Reader only", hint: `${mod}+3`, icon: <LayoutIcon left={false} right /> },
];

export function TopBar() {
  const { state, actions } = useApp();

  // Custom title-bar dragging, driven manually rather than via
  // data-tauri-drag-region: the built-in double-click "restore" leaves a
  // borderless window at its maximized size (tauri-apps/tauri#11945). We use the
  // JS window API (which resizes correctly) and a move-threshold so a
  // double-click (maximize/restore) and a drag never race.
  const dragArmed = useRef(false);

  function onBarMouseDown(e: MouseEvent<HTMLElement>) {
    if (e.button !== 0) return;
    // Only the bar's own background is a drag handle — never a child control.
    if (!(e.target as HTMLElement).matches(".topbar, .topbar-spacer")) return;
    if (e.detail === 2) {
      dragArmed.current = false;
      void toggleMaximizeWindow();
    } else {
      dragArmed.current = true; // start the OS move on first motion, not on press
    }
  }
  function onBarMouseMove(e: MouseEvent<HTMLElement>) {
    if (dragArmed.current && e.buttons === 1) {
      dragArmed.current = false;
      void startWindowDrag();
    }
  }
  function onBarMouseUp() {
    dragArmed.current = false;
  }

  const canBack = state.back.length > 0;
  const canForward = state.fwd.length > 0;

  return (
    <Tooltip.Provider delay={400}>
      <Toolbar.Root
        render={
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Toolbar.Root injects role="toolbar"; handlers implement window dragging (no keyboard equivalent exists)
          <div
            className="topbar"
            onMouseDown={onBarMouseDown}
            onMouseMove={onBarMouseMove}
            onMouseUp={onBarMouseUp}
          />
        }
      >
        <div className="topbar-left">
          <BundleSwitcher />
        </div>

        {/* Window-centered command center: back/forward immediately left of the
            search, in the spirit of VS Code's command center. */}
        <div className="topbar-center">
          <Toolbar.Group className="topbar-nav">
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Toolbar.Button
                    className="btn ghost icon"
                    aria-label="Go back"
                    disabled={!canBack}
                    onClick={() => actions.back()}
                  >
                    <ArrowLeft size={17} aria-hidden="true" />
                  </Toolbar.Button>
                }
              />
              <Tooltip.Portal>
                <Tooltip.Positioner className="ui-tooltip-positioner" sideOffset={6}>
                  <Tooltip.Popup className="ui-tooltip">Back</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Toolbar.Button
                    className="btn ghost icon"
                    aria-label="Go forward"
                    disabled={!canForward}
                    onClick={() => actions.forward()}
                  >
                    <ArrowRight size={17} aria-hidden="true" />
                  </Toolbar.Button>
                }
              />
              <Tooltip.Portal>
                <Tooltip.Positioner className="ui-tooltip-positioner" sideOffset={6}>
                  <Tooltip.Popup className="ui-tooltip">Forward</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Toolbar.Group>

          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Toolbar.Button
                  id="topbar-search"
                  className="topbar-search"
                  aria-label="Search and commands"
                  aria-keyshortcuts="Control+K Meta+K"
                  onClick={() => actions.setPalette(true)}
                >
                  <Search className="topbar-search-icon" size={15} aria-hidden="true" />
                  <span className="topbar-search-label">Search…</span>
                  <kbd className="topbar-search-kbd" aria-hidden="true">
                    {searchHint}
                  </kbd>
                </Toolbar.Button>
              }
            />
            <Tooltip.Portal>
              <Tooltip.Positioner className="ui-tooltip-positioner" sideOffset={6}>
                <Tooltip.Popup className="ui-tooltip">
                  Search and commands ({searchHint} or /)
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>

        <div className="topbar-right">
          {state.bundle && (
            <Toolbar.Group
              className="layout-switch"
              role="radiogroup"
              aria-label="Workspace layout"
              // Drives the sliding thumb (::before): 0/1/2 = the active segment.
              style={
                {
                  "--seg": Math.max(
                    0,
                    LAYOUTS.findIndex((l) => l.mode === state.layout),
                  ),
                } as CSSProperties
              }
            >
              {LAYOUTS.map(({ mode, label, hint, icon }) => (
                <Tooltip.Root key={mode}>
                  <Tooltip.Trigger
                    render={
                      <Toolbar.Button
                        className={`btn ghost icon layout-btn ${
                          state.layout === mode ? "active" : ""
                        }`}
                        role="radio"
                        aria-checked={state.layout === mode}
                        aria-label={label}
                        onClick={() => actions.setLayout(mode)}
                      >
                        {icon}
                      </Toolbar.Button>
                    }
                  />
                  <Tooltip.Portal>
                    <Tooltip.Positioner className="ui-tooltip-positioner" sideOffset={6}>
                      <Tooltip.Popup className="ui-tooltip">
                        {label} ({hint})
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ))}
            </Toolbar.Group>
          )}

          <WindowControls />
        </div>
      </Toolbar.Root>
    </Tooltip.Provider>
  );
}
