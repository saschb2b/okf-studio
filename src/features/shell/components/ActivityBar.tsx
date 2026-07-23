// The persistent far-left Activity Bar (VS Code / Zed pattern). It stays visible
// regardless of whether the sidebar pane is open, and is the home for app-level
// affordances rather than floating them in the title bar:
//   - top: view switchers (Navigate / Filter) that drive the sidebar's lens and
//     visibility — clicking the active view collapses the sidebar, clicking a
//     hidden view opens it to that lens;
//   - bottom: global actions (Keyboard shortcuts, Settings) pinned to the foot,
//     where desktop apps put "Manage"-style entries.
// See docs/ux/browsing-layout.md.

import { Tooltip } from "@base-ui/react/tooltip";
import { Filter, Keyboard, LayoutDashboard, ListTree, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { hasUnseenUpdate, useApp } from "@/shared/store.tsx";
import type { Lens } from "@/shared/store.tsx";
import { modKey } from "@/shared/platform/platform.ts";
import "@/shared/styles/baseui.css";
import "./ActivityBar.css";

/** One icon button in the rail, wrapped in a right-anchored tooltip. */
function ActivityButton({
  label,
  ariaLabel,
  active,
  badge,
  badgeTone,
  onClick,
  children,
}: {
  label: string;
  /** Overrides the accessible name when it should differ from the tooltip. */
  ariaLabel?: string;
  /** Pressed state for view-switcher buttons; omit for plain actions. */
  active?: boolean;
  badge?: boolean;
  /** Dot color role: accent (default) for state, warn for attention. */
  badgeTone?: "warn";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            className="activity-btn"
            aria-label={ariaLabel ?? label}
            aria-pressed={active}
            onClick={onClick}
          >
            <span className="activity-icon" aria-hidden="true">
              {children}
            </span>
            {badge && (
              <span
                className={`activity-badge${badgeTone ? ` activity-badge--${badgeTone}` : ""}`}
                aria-hidden="true"
              />
            )}
          </button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner className="ui-tooltip-positioner" side="right" sideOffset={8}>
          <Tooltip.Popup className="ui-tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ActivityBar() {
  const { state, actions } = useApp();
  const filterActive = state.hiddenTypes.length > 0 || state.activeTag !== null;
  const sidebarOpen = state.panels.sidebar;
  // A new release the user hasn't acknowledged yet: warn dot on the gear
  // (SteamOS-style), named in the tooltip and the accessible label. The trail
  // continues inside Settings on the Updates nav item.
  const updateReady = hasUnseenUpdate(state);

  // VS Code semantics: a view icon opens the sidebar to its lens; re-clicking the
  // already-visible view collapses the sidebar.
  function selectLens(lens: Lens) {
    if (!sidebarOpen) {
      actions.togglePanel("sidebar", true);
      actions.setLens(lens);
    } else if (state.lens === lens) {
      actions.togglePanel("sidebar", false);
    } else {
      actions.setLens(lens);
    }
  }

  return (
    <Tooltip.Provider delay={400}>
      <nav className="activity-bar" aria-label="Activity bar">
        <div className="activity-group activity-top">
          {state.bundle && (
            <>
              <ActivityButton
                label={`Bundle home   O`}
                ariaLabel="Bundle home"
                active={state.overview}
                onClick={() => actions.setOverview(!state.overview)}
              >
                <LayoutDashboard size={18} />
              </ActivityButton>
              <ActivityButton
                label="Navigate"
                active={sidebarOpen && state.lens === "navigate"}
                onClick={() => selectLens("navigate")}
              >
                <ListTree size={18} />
              </ActivityButton>
              <ActivityButton
                label="Filter"
                active={sidebarOpen && state.lens === "filter"}
                badge={filterActive}
                onClick={() => selectLens("filter")}
              >
                <Filter size={18} />
              </ActivityButton>
            </>
          )}
        </div>

        <div className="activity-group activity-bottom">
          <ActivityButton
            label="Keyboard shortcuts   ?"
            ariaLabel="Keyboard shortcuts"
            onClick={() => actions.setHelp(true)}
          >
            <Keyboard size={18} />
          </ActivityButton>
          <ActivityButton
            label={
              updateReady
                ? `Settings · Update available   ${modKey} ,`
                : `Settings   ${modKey} ,`
            }
            ariaLabel={updateReady ? "Open settings, update available" : "Open settings"}
            badge={updateReady}
            badgeTone="warn"
            onClick={() => actions.setSettingsOpen(true)}
          >
            <Settings size={18} />
          </ActivityButton>
        </div>
      </nav>
    </Tooltip.Provider>
  );
}
