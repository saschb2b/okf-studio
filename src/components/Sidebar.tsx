// Left pane of the Browsing Layout. A persistent search box atop the active
// lens's content — Navigate (the index tree) or Filter (types + tags), chosen
// from the Activity Bar so filtering and navigation no longer compete for one
// long scroll. The content renders inside a themed Base UI ScrollArea. Renders
// nothing until a bundle is loaded. Switching *bundles* lives in the top-left
// Bundle Switcher; the lens/visibility switchers live in the [ActivityBar].
// See docs/ux/browsing-layout.md.

import { Collapsible } from "@base-ui/react/collapsible";
import { ScrollArea } from "@base-ui/react/scroll-area";
import type { ReactNode } from "react";
import "./baseui.css";
import "./Sidebar.css";
import { useApp } from "../store.tsx";
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

export function Sidebar() {
  const { state, actions } = useApp();
  if (!state.bundle) return null;

  return (
    <nav className="sb" aria-label="Bundle navigation">
      <div className="sb-search-wrap">
        <input
          data-search
          type="search"
          className="sb-search"
          placeholder="Search concepts…"
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
