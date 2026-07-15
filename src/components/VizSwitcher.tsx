// Four-way visualization switcher for the graph pane — an icon-only segmented
// control every visualization renders as the first item of its toolbar's left
// cell, so it sits in the same spot regardless of which view is active. The
// choice persists with the layout (store: vizView). See
// docs/features/viz-views.md.

import type { ReactElement } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { useApp, VIZ_VIEWS, type VizView } from "@/store.tsx";
import "./VizPane.css";

// 16px mini-glyphs in the LayoutIcon style (currentColor, aria-hidden): the
// shape of each visualization, not an abstract symbol.

function GraphIcon() {
  return (
    <svg className="viz-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 11 8 5.5m0 0L11.5 11M8 5.5 8 5.5M5.5 11.5h5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="4.5" r="1.8" fill="currentColor" />
      <circle cx="4" cy="11.5" r="1.8" fill="currentColor" />
      <circle cx="12" cy="11.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

function TreemapIcon() {
  return (
    <svg className="viz-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.5 2.5v11M8.5 8h5M2.5 10.5h6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SunburstIcon() {
  return (
    <svg className="viz-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <path d="M8 3.5 A4.5 4.5 0 0 1 12.5 8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11.2 11.2 A4.5 4.5 0 0 1 3.5 8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 6.5 A5.7 5.7 0 0 1 6.5 2.5" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <path d="M13.5 9.5 A5.7 5.7 0 0 1 9.5 13.5" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
    </svg>
  );
}

function PackIcon() {
  return (
    <svg className="viz-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="6.4" r="2.1" fill="currentColor" />
      <circle cx="10.2" cy="9.6" r="1.6" fill="currentColor" opacity="0.65" />
      <circle cx="6.4" cy="10.6" r="1.1" fill="currentColor" opacity="0.65" />
    </svg>
  );
}

const VIEWS: Record<VizView, { label: string; aria: string; icon: ReactElement }> = {
  graph: {
    label: "Graph",
    aria: "Graph: force-directed network of cross-links",
    icon: <GraphIcon />,
  },
  treemap: {
    label: "Treemap",
    aria: "Treemap: nested rectangles sized by content",
    icon: <TreemapIcon />,
  },
  sunburst: {
    label: "Sunburst",
    aria: "Sunburst: hierarchy as concentric rings",
    icon: <SunburstIcon />,
  },
  pack: {
    label: "Circle packing",
    aria: "Circle packing: hierarchy as nested circles",
    icon: <PackIcon />,
  },
};

export function VizSwitcher() {
  const { state, actions } = useApp();
  return (
    <Tooltip.Provider delay={400}>
      <div className="graph-seg viz-switch" role="group" aria-label="Visualization">
        {VIZ_VIEWS.map((v) => (
          <Tooltip.Root key={v}>
            <Tooltip.Trigger
              render={
                <button
                  type="button"
                  className="graph-seg-btn viz-seg-btn"
                  aria-label={VIEWS[v].aria}
                  aria-pressed={state.vizView === v}
                  onClick={() => actions.setVizView(v)}
                >
                  {VIEWS[v].icon}
                </button>
              }
            />
            <Tooltip.Portal>
              <Tooltip.Positioner className="ui-tooltip-positioner" sideOffset={6}>
                <Tooltip.Popup className="ui-tooltip">{VIEWS[v].label}</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </div>
    </Tooltip.Provider>
  );
}
