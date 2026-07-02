// The top-left Bundle Switcher. Names the open bundle and, on click, opens a
// popover to switch among the bundles in the current folder, reopen a recent
// bundle, or open a new folder — in the spirit of Zed's project switcher.
// Recents are per-bundle; the folder underneath is the read scope. Opens with
// Ctrl/Cmd+P. See docs/features/bundle-switcher.md.

import { useRef, useState } from "react";
import type * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { Toolbar } from "@base-ui/react/toolbar";
import { useApp } from "../store.tsx";
import type { Actions } from "../store.tsx";
import { modKey } from "../platform.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import type { BundleRoot, RecentBundle } from "../types.ts";
import "./baseui.css";
import "./BundleSwitcher.css";

const MAX_DOTS = 5;

const mod = modKey;

/** Last path segment of a folder/root path, for a compact label. */
function baseName(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

export function BundleSwitcher() {
  const { state, actions } = useApp();
  const [query, setQuery] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Nothing open yet → the trigger is a direct "open a folder" button rather
  // than a popover (mirrors First Run; keeps an obvious entry point).
  if (!state.bundle) {
    return (
      <Toolbar.Button
        className="topbar-switch is-empty"
        aria-label="Open folder"
        onClick={() => void actions.openFolder()}
      >
        <span className="switch-name">Open a folder…</span>
        <span className="switch-chevron" aria-hidden="true">
          ⌄
        </span>
      </Toolbar.Button>
    );
  }

  const dark = resolveDark(state.settings.theme);
  const q = query.trim().toLowerCase();

  const matchRoot = (b: BundleRoot) =>
    !q || b.name.toLowerCase().includes(q) || b.relPath.toLowerCase().includes(q);
  const matchRecent = (r: RecentBundle) =>
    !q ||
    r.name.toLowerCase().includes(q) ||
    r.folder.toLowerCase().includes(q) ||
    r.root.toLowerCase().includes(q);

  const folderBundles = state.bundles.filter(matchRoot);
  // Recents from OTHER folders (this folder's bundles are listed above already).
  const otherRecents = state.recents
    .filter((r) => r.folder !== state.folder)
    .filter(matchRecent);
  const pinned = otherRecents.filter((r) => r.pinned);
  const recent = otherRecents.filter((r) => !r.pinned);

  const folderLabel = state.folder ? baseName(state.folder) : "";
  const close = () => actions.setSwitcher(false);

  // Lightweight roving: ArrowUp/Down move focus through the rows; the search
  // input owns typing (ArrowUp from the first row returns to it). Base UI
  // handles Escape and focus restore. This single handler owns the arrows —
  // handling them on the input too used to double-fire and skip the first row.
  function onPopupKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(
      popupRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [],
    );
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (i === -1) {
      // From the search input: only ArrowDown enters the list.
      if (e.key === "ArrowDown") {
        e.preventDefault();
        rows[0].focus();
      }
      return;
    }
    e.preventDefault();
    if (e.key === "ArrowUp") {
      if (i === 0) searchRef.current?.focus();
      else rows[i - 1].focus();
    } else {
      rows[Math.min(rows.length - 1, i + 1)].focus();
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const first = popupRef.current?.querySelector<HTMLElement>("[data-row]");
    if (first) {
      e.preventDefault();
      first.click();
    }
  }

  return (
    <Popover.Root
      open={state.switcherOpen}
      onOpenChange={(open) => {
        actions.setSwitcher(open);
        if (!open) setQuery("");
      }}
    >
      <Popover.Trigger
        render={
          <Toolbar.Button className="topbar-switch" aria-label="Switch bundle">
            <span className="switch-trigger">
              <span className="switch-name" title={state.bundle.name}>
                {state.bundle.name}
              </span>
              {folderLabel && (
                <span className="switch-folder" title={state.folder ?? ""}>
                  {folderLabel}
                </span>
              )}
            </span>
            <span className="switch-chevron" aria-hidden="true">
              ⌄
            </span>
          </Toolbar.Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover switcher-popup"
            aria-label="Bundle switcher"
          >
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard handler delegates roving focus to the focusable children (input + buttons) */}
            <div
              ref={popupRef}
              className="switcher-body"
              onKeyDown={onPopupKeyDown}
            >
              <input
                ref={searchRef}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="search"
                className="switcher-search"
                placeholder="Search bundles…"
                aria-label="Search bundles and recents"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
              />

              <div className="switcher-scroll">
                <Group label={`Bundles in ${folderLabel || "this folder"}`}>
                  {folderBundles.length ? (
                    folderBundles.map((b) => (
                      <FolderRow
                        key={b.root}
                        bundle={b}
                        active={b.root === state.activeRoot}
                        folderLabel={folderLabel}
                        dark={dark}
                        onSelect={() => {
                          void actions.selectBundle(b.root);
                          close();
                        }}
                      />
                    ))
                  ) : (
                    <p className="switcher-empty muted">No matches.</p>
                  )}
                </Group>

                {pinned.length > 0 && (
                  <Group label="Pinned">
                    {pinned.map((r) => (
                      <RecentRow
                        key={r.root}
                        entry={r}
                        dark={dark}
                        actions={actions}
                        close={close}
                      />
                    ))}
                  </Group>
                )}

                <Group label="Recent bundles">
                  {recent.length ? (
                    recent.map((r) => (
                      <RecentRow
                        key={r.root}
                        entry={r}
                        dark={dark}
                        actions={actions}
                        close={close}
                      />
                    ))
                  ) : (
                    <p className="switcher-empty muted">
                      {q ? "No matches." : "Bundles you open will show up here."}
                    </p>
                  )}
                </Group>
              </div>

              <div className="switcher-foot">
                <button
                  type="button"
                  className="switcher-foot-btn"
                  onClick={() => {
                    void actions.openFolder();
                    close();
                  }}
                >
                  <span aria-hidden="true">📂</span>
                  <span className="switcher-foot-label">Open folder…</span>
                  <kbd className="switcher-kbd">{mod} O</kbd>
                </button>
                <button
                  type="button"
                  className="switcher-foot-btn is-disabled"
                  disabled
                  title="Remote bundles are coming in a later release"
                >
                  <span aria-hidden="true">🌐</span>
                  <span className="switcher-foot-label">Open remote folder…</span>
                  <span className="switcher-soon">soon</span>
                </button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="switcher-group" aria-label={label}>
      <h3 className="switcher-group-label">{label}</h3>
      {children}
    </section>
  );
}

function Dots({ types, dark }: { types: string[]; dark: boolean }) {
  const palette = buildTypePalette(types, dark);
  const dots = types.slice(0, MAX_DOTS);
  const overflow = types.length - dots.length;
  return (
    <span className="switcher-dots" aria-hidden="true">
      {dots.map((t) => (
        <span
          key={t}
          className="switcher-dot"
          style={{ background: palette.color(t) }}
          title={t}
        />
      ))}
      {overflow > 0 && <span className="switcher-dot-more">+{overflow}</span>}
    </span>
  );
}

function FolderRow({
  bundle,
  active,
  folderLabel,
  dark,
  onSelect,
}: {
  bundle: BundleRoot;
  active: boolean;
  /** Basename of the picked folder — the sub for a bundle at its root. */
  folderLabel: string;
  dark: boolean;
  onSelect: () => void;
}) {
  // A bundle at the picked folder's root has an empty relPath; showing the
  // folder's own name beats a bare "." of punctuation.
  const sub = bundle.relPath || folderLabel;
  return (
    <button
      type="button"
      data-row
      className={`switcher-row${active ? " is-active" : ""}`}
      aria-current={active ? "true" : undefined}
      title={`${bundle.name} — ${bundle.root}`}
      onClick={onSelect}
    >
      <span className="switcher-check" aria-hidden="true">
        {active ? "✓" : ""}
      </span>
      <span className="switcher-row-main">
        <span className="switcher-row-name">{bundle.name}</span>
        <span className="switcher-row-sub">{sub}</span>
      </span>
      <span className="switcher-row-meta">
        <span className="switcher-count">{bundle.conceptCount}</span>
        <Dots types={bundle.types} dark={dark} />
      </span>
    </button>
  );
}

function RecentRow({
  entry,
  dark,
  actions,
  close,
}: {
  entry: RecentBundle;
  dark: boolean;
  actions: Actions;
  close: () => void;
}) {
  return (
    <div className="switcher-recent">
      <button
        type="button"
        data-row
        className="switcher-row"
        title={`${entry.name} — ${entry.root}`}
        onClick={() => {
          void actions.openRecentBundle(entry);
          close();
        }}
      >
        <span className="switcher-check" aria-hidden="true" />
        <span className="switcher-row-main">
          <span className="switcher-row-name">{entry.name}</span>
          <span className="switcher-row-sub">{baseName(entry.folder)}</span>
        </span>
        <span className="switcher-row-meta">
          <span className="switcher-count">{entry.conceptCount}</span>
          <Dots types={entry.types} dark={dark} />
        </span>
      </button>
      <span className="switcher-recent-actions">
        <button
          type="button"
          className="switcher-mini"
          aria-label={entry.pinned ? "Unpin bundle" : "Pin bundle"}
          aria-pressed={entry.pinned ?? false}
          onClick={() => void actions.pinBundle(entry.root)}
        >
          {entry.pinned ? "★" : "☆"}
        </button>
        <button
          type="button"
          className="switcher-mini"
          aria-label="Remove from recents"
          onClick={() => void actions.forgetBundle(entry.root)}
        >
          ✕
        </button>
      </span>
    </div>
  );
}
