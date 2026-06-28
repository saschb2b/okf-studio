// Bundle switcher — shown only when a folder holds more than one OKF bundle.
// Lists each detected BundleRoot with its name, relative path, concept count,
// okf_version, and colored dots for the types it declares. Selecting one calls
// actions.selectBundle(root); the active root is marked. See
// docs/features/bundle-browser.md.

import { useApp } from "../../store.tsx";
import { buildTypePalette, resolveDark } from "../../theme.ts";
import type { BundleRoot } from "../../types.ts";

const MAX_DOTS = 6;

export function BundleBrowser() {
  const { state, actions } = useApp();

  // Collapse/hide when only one bundle exists.
  if (state.bundles.length <= 1) return null;

  const dark = resolveDark(state.settings.theme);

  return (
    <section className="sb-section sb-bundles" aria-label="Bundles">
      <h2 className="sb-section-title">Bundles</h2>
      <ul className="sb-bundle-list">
        {state.bundles.map((b) => (
          <BundleItem
            key={b.root}
            bundle={b}
            active={b.root === state.activeRoot}
            dark={dark}
            onSelect={() => void actions.selectBundle(b.root)}
          />
        ))}
      </ul>
    </section>
  );
}

function BundleItem({
  bundle,
  active,
  dark,
  onSelect,
}: {
  bundle: BundleRoot;
  active: boolean;
  dark: boolean;
  onSelect: () => void;
}) {
  // Palette is built from this bundle's own declared types so the dots match the
  // graph legend once the bundle is opened.
  const palette = buildTypePalette(bundle.types, dark);
  const dots = bundle.types.slice(0, MAX_DOTS);
  const overflow = bundle.types.length - dots.length;

  return (
    <li>
      <button
        type="button"
        className={`sb-bundle${active ? " is-active" : ""}`}
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="sb-bundle-head">
          <span className="sb-bundle-name">{bundle.name}</span>
          {bundle.okfVersion && (
            <span className="sb-bundle-ver">v{bundle.okfVersion}</span>
          )}
        </span>
        <span className="sb-bundle-path" title={bundle.relPath}>
          {bundle.relPath || "."}
        </span>
        <span className="sb-bundle-meta">
          <span className="sb-bundle-count">
            {bundle.conceptCount} concept{bundle.conceptCount === 1 ? "" : "s"}
          </span>
          <span className="sb-dots" aria-hidden="true">
            {dots.map((t) => (
              <span
                key={t}
                className="sb-dot"
                style={{ background: palette.color(t) }}
                title={t}
              />
            ))}
            {overflow > 0 && <span className="sb-dot-more">+{overflow}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
