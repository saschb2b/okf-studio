// Tag browser. OKF has no dedicated tag file, so the index is synthesized at
// render time from concept frontmatter via buildTagIndex. Lists tags with their
// counts; clicking a tag filters to it (actions.setTag), and clicking the active
// tag again clears the filter (setTag(null)). See docs/features/search-and-filter.md.

import { useApp } from "../../store.tsx";
import { buildTagIndex } from "../../selectors.ts";

export function TagBrowser() {
  const { state, actions } = useApp();
  const bundle = state.bundle;
  if (!bundle) return null;

  const tagIndex = buildTagIndex(bundle.concepts);
  if (tagIndex.size === 0) return null;

  // Sort by descending count, then alphabetically for stability.
  const tags = [...tagIndex.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  return (
    <section className="sb-section" aria-label="Tags">
      <h2 className="sb-section-title">Tags</h2>
      <ul className="sb-tags">
        {tags.map(([tag, ids]) => {
          const active = state.activeTag === tag;
          return (
            <li key={tag}>
              <button
                type="button"
                className={`sb-tag${active ? " is-active" : ""}`}
                aria-pressed={active}
                onClick={() => actions.setTag(active ? null : tag)}
              >
                <span className="sb-tag-label">#{tag}</span>
                <span className="sb-tag-count">{ids.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
