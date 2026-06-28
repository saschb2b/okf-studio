// STUB — replaced by the Sidebar agent with bundle browser, index tree,
// search box, and type/tag filters. Minimal functional baseline for now.
import { useApp } from "../store.tsx";
import { filteredConceptIds } from "../selectors.ts";

export function Sidebar() {
  const { state, actions } = useApp();
  if (!state.bundle) return null;
  const visible = filteredConceptIds(state.bundle, {
    query: state.query,
    hiddenTypes: state.hiddenTypes,
    activeTag: state.activeTag,
  });

  return (
    <div className="sidebar-inner">
      <input
        data-search
        className="search"
        placeholder="Search…"
        value={state.query}
        onChange={(e) => actions.setQuery(e.target.value)}
      />
      <ul className="concept-list">
        {state.bundle.concepts
          .filter((c) => visible.has(c.id))
          .map((c) => (
            <li
              key={c.id}
              className={c.id === state.activeConceptId ? "active" : ""}
              onClick={() => actions.selectConcept(c.id)}
            >
              {c.title}
            </li>
          ))}
      </ul>
    </div>
  );
}
