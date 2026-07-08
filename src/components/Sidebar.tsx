// Left pane of the Browsing Layout. A persistent search box atop the active
// lens's content — Navigate (the index tree) or Filter (types + tags), chosen
// from the Activity Bar so filtering and navigation no longer compete for one
// long scroll. The content renders inside a themed Base UI ScrollArea. Renders
// nothing until a bundle is loaded. Switching *bundles* lives in the top-left
// Bundle Switcher; the lens/visibility switchers live in the [ActivityBar].
// See docs/ux/browsing-layout.md.

import { Collapsible } from "@base-ui/react/collapsible";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import "./baseui.css";
import "./Sidebar.css";
import { useApp } from "../store.tsx";
import { filteredConceptIds } from "../selectors.ts";
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
          <ChevronRight size={14} />
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

  // The one filter state, shown as a live result count. The search field speaks
  // the faceted grammar (query.ts); type/tag facets AND in via the Filter lens.
  const total = state.bundle.concepts.length;
  const filtering =
    state.query.trim() !== "" ||
    state.hiddenTypes.length > 0 ||
    state.activeTag !== null;
  const shown = filtering
    ? filteredConceptIds(state.bundle, {
        query: state.query,
        hiddenTypes: state.hiddenTypes,
        activeTag: state.activeTag,
      }).size
    : total;

  function clearAll() {
    actions.setQuery("");
    actions.showAllTypes();
    actions.setTag(null);
  }

  return (
    <nav className="sb" aria-label="Bundle navigation">
      <div className="sb-search-wrap">
        <input
          data-search
          type="search"
          className="sb-search"
          placeholder="Search, or filter: type: tag: degree>…"
          aria-label="Search and filter concepts"
          title="Filter with fields: type:Table tag:revenue degree>5 is:orphan has:broken — or plain text"
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
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {filtering && (
        <div className="sb-result-count" aria-live="polite">
          <span className={shown === 0 ? "sb-count-none" : undefined}>
            {shown} of {total} concepts
          </span>
          <button type="button" className="sb-link-btn" onClick={clearAll}>
            Clear
          </button>
        </div>
      )}

      <div className="sb-body">
        <ScrollArea.Root className="ui-scrollarea sb-scroll">
          <ScrollArea.Viewport className="ui-scrollarea-viewport sb-scroll-viewport">
            <div className="sb-sections">
              {state.lens === "navigate" ? (
                // The navigate lens is only the index tree, so it needs no
                // collapsible "Index" section around it — the tree (with its
                // folder-home header row) is the whole content.
                <IndexTree />
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
