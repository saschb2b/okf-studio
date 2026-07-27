// Type filters (the legend). Lists every `type` present in the bundle with its
// palette color swatch and a count. Clicking a type toggles it in/out of view;
// hidden types render struck/greyed. A "Show all" affordance restores them when
// any are hidden. The type list is derived from the bundle — never hard-coded.
// See docs/features/search-and-filter.md.

import { Toggle } from "@base-ui/react/toggle";
import { useApp } from "@/shared/store.tsx";
import { distinctTypes } from "@/shared/selectors.ts";
import { buildTypePalette, resolveDark } from "@/shared/theme.ts";
import "@/shared/styles/chrome.css";

export function TypeFilters() {
  const { state, actions } = useApp();
  const bundle = state.bundle;
  if (!bundle) return null;

  const types = distinctTypes(bundle);
  if (types.length === 0) return null;

  const dark = resolveDark(state.settings.theme);
  const palette = buildTypePalette(types, dark);

  // Count concepts per type for the legend.
  const counts = new Map<string, number>();
  for (const c of bundle.concepts) {
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  }

  const anyHidden = state.hiddenTypes.length > 0;

  return (
    <div className="sb-section" aria-label="Type filters">
      {anyHidden && (
        <div className="sb-section-head sb-section-head--end">
          <button
            type="button"
            className="sb-link-btn"
            onClick={() => actions.showAllTypes()}
          >
            Show all
          </button>
        </div>
      )}
      <ul className="sb-legend">
        {types.map((t) => {
          const visible = !state.hiddenTypes.includes(t);
          return (
            <li key={t}>
              <Toggle
                className={`ui-toggle sb-legend-item${visible ? "" : " is-hidden"}`}
                pressed={visible}
                onPressedChange={() => actions.toggleType(t)}
                aria-label={visible ? `Hide ${t}` : `Show ${t}`}
                title={visible ? `Hide ${t}` : `Show ${t}`}
              >
                <span
                  className="sb-swatch"
                  style={{ background: palette.color(t) }}
                  aria-hidden="true"
                />
                <span className="sb-legend-label">{t}</span>
                <span className="sb-legend-count">{counts.get(t) ?? 0}</span>
              </Toggle>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
