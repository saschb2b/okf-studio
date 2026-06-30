// The top chrome bar: Open Folder, back/forward history, the current bundle
// name, and the right-side cluster (layout switch, reading prefs). App-level
// actions (Settings, shortcuts) live in the [ActivityBar]; the validation issue
// indicator and the Log toggle live in the [StatusBar] — neither floats here.
// See docs/ux/browsing-layout.md.

import { useRef } from "react";
import type { MouseEvent } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import { Tooltip } from "@base-ui/react/tooltip";
import { useApp } from "../store.tsx";
import type { LayoutMode } from "../store.tsx";
import { isMac, modKey } from "../platform.ts";
import { startWindowDrag, toggleMaximizeWindow } from "../window.ts";
import { BundleSwitcher } from "./BundleSwitcher.tsx";
import { ReaderPrefs } from "./ReaderPrefs.tsx";
import { WindowControls } from "./WindowControls.tsx";
import "./chrome.css";
import "./baseui.css";
import "./TopBar.css";

// Mac shows ⌘K; everything else shows Ctrl K.
const searchHint = isMac ? "⌘K" : "Ctrl K";
const mod = modKey;

// 3-way layout segmented control. Order graph -> split -> reader so the icons
// read left (explore) to right (read), matching the Ctrl/Cmd+1/2/3 hotkeys.
const LAYOUTS: { mode: LayoutMode; label: string; hint: string; icon: string }[] =
  [
    { mode: "graph", label: "Graph only", hint: `${mod}+1`, icon: "◧" },
    { mode: "split", label: "Split", hint: `${mod}+2`, icon: "▥" },
    { mode: "reader", label: "Reader only", hint: `${mod}+3`, icon: "◨" },
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
                    ←
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
                    →
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
                  className="topbar-search"
                  aria-label="Search and commands"
                  aria-keyshortcuts="Control+K Meta+K"
                  onClick={() => actions.setPalette(true)}
                >
                  <span className="topbar-search-icon" aria-hidden="true">
                    ⌕
                  </span>
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
                        <span aria-hidden="true">{icon}</span>
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

          {state.bundle && state.layout !== "graph" && (
            <Toolbar.Group className="topbar-actions">
              <ReaderPrefs />
            </Toolbar.Group>
          )}

          <WindowControls />
        </div>
      </Toolbar.Root>
    </Tooltip.Provider>
  );
}
