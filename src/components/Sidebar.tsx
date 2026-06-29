// Left pane of the Browsing Layout. A persistent search box sits atop a Zed-style
// activity rail that swaps the sidebar body between two lenses — Navigate (the
// index tree) and Filter (types + tags) — so filtering and navigation no longer
// compete for one long scroll. The active lens's content renders inside a themed
// Base UI ScrollArea. An active-filter dot on the Filter rail icon keeps a
// narrowed graph discoverable even while the Filter lens is hidden. Renders
// nothing until a bundle is loaded. Switching *bundles* lives in the top-left
// Bundle Switcher, not here. See docs/ux/browsing-layout.md.

import { Collapsible } from "@base-ui/react/collapsible";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import "./baseui.css";
import "./Sidebar.css";
import { useApp } from "../store.tsx";
import type { Lens } from "../store.tsx";
import { TypeFilters } from "./sidebar/TypeFilters.tsx";
import { TagBrowser } from "./sidebar/TagBrowser.tsx";
import { IndexTree } from "./sidebar/IndexTree.tsx";

/** A collapsible top-level sidebar section with a chevron + title trigger. */
function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root
      defaultOpen
      className={`sb-collapsible${className ? ` ${className}` : ""}`}
    >
      <Collapsible.Trigger className="ui-collapsible-trigger">
        <span className="ui-collapsible-chevron" aria-hidden="true">
          ▸
        </span>
        {title}
      </Collapsible.Trigger>
      <Collapsible.Panel className="ui-collapsible-panel">
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

/** One icon button in the activity rail, wrapped in a tooltip. */
function RailButton({
  value,
  label,
  badge,
  children,
}: {
  value: Lens;
  label: string;
  badge?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Toggle value={value} className="sb-rail-btn" aria-label={label}>
            <span className="sb-rail-icon" aria-hidden="true">
              {children}
            </span>
            {badge && <span className="sb-rail-badge" aria-hidden="true" />}
          </Toggle>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner className="ui-tooltip-positioner" side="right" sideOffset={6}>
          <Tooltip.Popup className="ui-tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Sidebar() {
  const { state, actions } = useApp();
  if (!state.bundle) return null;

  const filterActive = state.hiddenTypes.length > 0 || !!state.activeTag;

  return (
    <nav className="sb" aria-label="Bundle navigation">
      <div className="sb-search-wrap">
        <input
          data-search
          type="search"
          className="sb-search"
          placeholder="Search concepts…   /"
          aria-label="Search concepts"
          value={state.query}
          onChange={(e) => actions.setQuery(e.target.value)}
        />
        {state.query && (
          <button
            type="button"
            className="sb-search-clear"
            aria-label="Clear search"
            onClick={() => actions.setQuery("")}
          >
            ×
          </button>
        )}
      </div>

      <div className="sb-body">
        <Tooltip.Provider delay={400}>
          <ToggleGroup
            className="sb-rail"
            aria-label="Sidebar lens"
            value={[state.lens]}
            onValueChange={(next) => {
              // Single-select: keep the current lens if a re-press would empty it.
              const lens = (next[0] as Lens | undefined) ?? state.lens;
              actions.setLens(lens);
            }}
          >
            <RailButton value="navigate" label="Navigate">
              ☰
            </RailButton>
            <RailButton value="filter" label="Filter" badge={filterActive}>
              ⚲
            </RailButton>
          </ToggleGroup>
        </Tooltip.Provider>

        <ScrollArea.Root className="ui-scrollarea sb-scroll">
          <ScrollArea.Viewport className="ui-scrollarea-viewport sb-scroll-viewport">
            <div className="sb-sections">
              {state.lens === "navigate" ? (
                <Section title="Index" className="sb-collapsible-tree">
                  <IndexTree />
                </Section>
              ) : (
                <>
                  <Section title="Types">
                    <TypeFilters />
                  </Section>
                  <Section title="Tags">
                    <TagBrowser />
                  </Section>
                </>
              )}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="ui-scrollarea-scrollbar">
            <ScrollArea.Thumb className="ui-scrollarea-thumb" />
          </ScrollArea.Scrollbar>
          <ScrollArea.Corner />
        </ScrollArea.Root>
      </div>
    </nav>
  );
}
