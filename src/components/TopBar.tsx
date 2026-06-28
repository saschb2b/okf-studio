// The top chrome bar: Open Folder, back/forward history, the current bundle
// name, and the right-side cluster (Log toggle, validation badge, Settings).
// See docs/ux/browsing-layout.md.

import { Toolbar } from "@base-ui/react/toolbar";
import { Tooltip } from "@base-ui/react/tooltip";
import { useApp } from "../store.tsx";
import type { LayoutMode } from "../store.tsx";
import "./chrome.css";
import "./baseui.css";
import "./TopBar.css";

// Mac shows ⌘K; everything else shows Ctrl K. Guard for non-browser (test) envs.
const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
const searchHint = isMac ? "⌘K" : "Ctrl K";
const mod = isMac ? "⌘" : "Ctrl";

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

  const errors =
    state.bundle?.issues.filter((i) => i.level === "error").length ?? 0;
  const warns =
    state.bundle?.issues.filter((i) => i.level === "warning").length ?? 0;
  const badgeKind = errors ? "error" : warns ? "warn" : "ok";
  const badgeLabel = errors
    ? `${errors} error${errors === 1 ? "" : "s"}`
    : warns
      ? `${warns} warning${warns === 1 ? "" : "s"}`
      : "conformant";
  const badgeAria = errors
    ? `Validation: ${errors} error${errors === 1 ? "" : "s"}`
    : warns
      ? `Validation: ${warns} warning${warns === 1 ? "" : "s"}`
      : "Validation: conformant, no issues";

  const canBack = state.back.length > 0;
  const canForward = state.fwd.length > 0;

  return (
    <Tooltip.Provider delay={400}>
      <Toolbar.Root render={<header className="topbar" />}>
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <Toolbar.Button
                className="btn"
                aria-label="Open folder"
                onClick={() => void actions.openFolder()}
              >
                Open Folder…
              </Toolbar.Button>
            }
          />
          <Tooltip.Portal>
            <Tooltip.Positioner className="ui-tooltip-positioner" sideOffset={6}>
              <Tooltip.Popup className="ui-tooltip">
                Open folder (Ctrl/Cmd+O)
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>

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
              <Tooltip.Positioner
                className="ui-tooltip-positioner"
                sideOffset={6}
              >
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
              <Tooltip.Positioner
                className="ui-tooltip-positioner"
                sideOffset={6}
              >
                <Tooltip.Popup className="ui-tooltip">Forward</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Toolbar.Group>

        <span className="topbar-title" title={state.bundle?.name ?? "OKF Viewer"}>
          {state.bundle?.name ?? "OKF Viewer"}
        </span>

        <div className="topbar-spacer" />

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
                  <Tooltip.Positioner
                    className="ui-tooltip-positioner"
                    sideOffset={6}
                  >
                    <Tooltip.Popup className="ui-tooltip">
                      {label} ({hint})
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            ))}
          </Toolbar.Group>
        )}

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

        {state.bundle && (
          <Toolbar.Group className="topbar-actions">
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Toolbar.Button
                    className={`btn ghost ${state.panels.log ? "active" : ""}`}
                    aria-label="Toggle log panel"
                    aria-pressed={state.panels.log}
                    onClick={() => actions.togglePanel("log")}
                  >
                    Log
                  </Toolbar.Button>
                }
              />
              <Tooltip.Portal>
                <Tooltip.Positioner
                  className="ui-tooltip-positioner"
                  sideOffset={6}
                >
                  <Tooltip.Popup className="ui-tooltip">Log</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Toolbar.Separator />

            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Toolbar.Button
                    className={`badge ${badgeKind}`}
                    aria-label={badgeAria}
                    aria-pressed={state.panels.validation}
                    onClick={() => actions.togglePanel("validation")}
                  >
                    {badgeLabel}
                  </Toolbar.Button>
                }
              />
              <Tooltip.Portal>
                <Tooltip.Positioner
                  className="ui-tooltip-positioner"
                  sideOffset={6}
                >
                  <Tooltip.Popup className="ui-tooltip">{badgeAria}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Toolbar.Separator />

            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Toolbar.Button
                    className="btn ghost icon"
                    aria-label="Open settings"
                    onClick={() => actions.setSettingsOpen(true)}
                  >
                    <span aria-hidden="true">⚙</span>
                  </Toolbar.Button>
                }
              />
              <Tooltip.Portal>
                <Tooltip.Positioner
                  className="ui-tooltip-positioner"
                  sideOffset={6}
                >
                  <Tooltip.Popup className="ui-tooltip">
                    Settings (Ctrl/Cmd+,)
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Toolbar.Group>
        )}
      </Toolbar.Root>
    </Tooltip.Provider>
  );
}
