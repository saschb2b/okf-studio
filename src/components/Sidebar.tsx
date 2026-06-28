// Left pane of the Browsing Layout. Composes the bundle switcher, the search box,
// the type-filter legend, the tag browser, and the index tree. Renders nothing
// until a bundle is loaded. See docs/ux/browsing-layout.md.

import "./Sidebar.css";
import { useApp } from "../store.tsx";
import { BundleBrowser } from "./sidebar/BundleBrowser.tsx";
import { TypeFilters } from "./sidebar/TypeFilters.tsx";
import { TagBrowser } from "./sidebar/TagBrowser.tsx";
import { IndexTree } from "./sidebar/IndexTree.tsx";

export function Sidebar() {
  const { state, actions } = useApp();
  if (!state.bundle) return null;

  return (
    <nav className="sb" aria-label="Bundle navigation">
      <BundleBrowser />

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

      <TypeFilters />
      <TagBrowser />
      <IndexTree />
    </nav>
  );
}
