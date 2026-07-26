// The top-left Bundle Switcher. Names the open bundle and, on click, opens a
// popover to switch among the bundles in the current folder, reopen a recent
// bundle, or open a new folder — in the spirit of Zed's project switcher.
// Recents are per-bundle; the folder underneath is the read scope. Opens with
// Ctrl/Cmd+P. See docs/features/bundle-switcher.md.

import { Check, ChevronDown, FilePlus2, FolderOpen, Globe } from "lucide-react";
import { useRef, useState } from "react";
import type * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { Toolbar } from "@base-ui/react/toolbar";
import { useApp } from "@/shared/store.tsx";
import type { Actions } from "@/shared/store.tsx";
import { modKey, shiftKey } from "@/shared/platform/platform.ts";
import type { BundleRoot, RecentBundle } from "@/shared/types.ts";
import appIcon from "@/assets/icon.svg";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./BundleSwitcher.css";

const mod = modKey;

/** Last path segment of a folder/root path, for a compact label. */
function baseName(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

/** Compact "how long ago" for a recent's last-opened timestamp. */
function relTime(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.round(d)}d ago`;
  const w = d / 7;
  if (w < 9) return `${Math.round(w)}w ago`;
  const mo = d / 30.44;
  if (mo < 12) return `${Math.round(mo)}mo ago`;
  return `${Math.round(d / 365.25)}y ago`;
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
        <img className="switch-tile" src={appIcon} alt="" aria-hidden="true" />
        <span className="switch-name">Open a folder…</span>
        <span className="switch-chevron" aria-hidden="true">
          <ChevronDown size={14} />
        </span>
      </Toolbar.Button>
    );
  }

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
            {/* The app's brand tile anchors the fixed-width trigger — the
                classic app-icon-in-the-titlebar-corner, and a spot of color
                in an otherwise quiet chrome. */}
            <img className="switch-tile" src={appIcon} alt="" aria-hidden="true" />
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
              <ChevronDown size={14} />
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
                      <RecentRow key={r.root} entry={r} actions={actions} close={close} />
                    ))}
                  </Group>
                )}

                <Group label="Recent bundles">
                  {recent.length ? (
                    recent.map((r) => (
                      <RecentRow key={r.root} entry={r} actions={actions} close={close} />
                    ))
                  ) : (
                    <p className="switcher-empty muted">
                      {q ? "No matches." : "Bundles you open will show up here."}
                    </p>
                  )}
                </Group>
              </div>

              {/* Two action tiers: open an existing bundle (local, remote),
                  then start a new one — separated so opening and creating
                  never read as one list. One icon system (lucide). */}
              <div className="switcher-foot">
                <button
                  type="button"
                  className="switcher-foot-btn"
                  onClick={() => {
                    void actions.openFolder();
                    close();
                  }}
                >
                  <FolderOpen size={15} aria-hidden="true" />
                  <span className="switcher-foot-label">Open folder…</span>
                  <kbd className="kbd">{mod}</kbd> <kbd className="kbd">O</kbd>
                </button>
                <button
                  type="button"
                  className="switcher-foot-btn"
                  onClick={() => {
                    actions.setRemoteOpen(true);
                    close();
                  }}
                >
                  <Globe size={15} aria-hidden="true" />
                  <span className="switcher-foot-label">Open from URL…</span>
                  <kbd className="kbd">{mod}</kbd> <kbd className="kbd">{shiftKey}</kbd> <kbd className="kbd">O</kbd>
                </button>
                <div className="switcher-foot-sep" role="presentation" />
                <button
                  type="button"
                  className="switcher-foot-btn"
                  onClick={() => {
                    actions.setCreateOpen(true);
                    close();
                  }}
                >
                  <FilePlus2 size={15} aria-hidden="true" />
                  <span className="switcher-foot-label">New bundle…</span>
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

/** The row's right column: two quiet, labeled lines that align with the
 *  name/sub lines on the left ("45 concepts" over "20 types" or "2w ago"). */
function RowMeta({ count, detail }: { count: number; detail: string }) {
  return (
    <span className="switcher-row-meta">
      <span className="switcher-count">
        {count} concept{count === 1 ? "" : "s"}
      </span>
      <span className="switcher-meta-sub">{detail}</span>
    </span>
  );
}

function FolderRow({
  bundle,
  active,
  folderLabel,
  onSelect,
}: {
  bundle: BundleRoot;
  active: boolean;
  /** Basename of the picked folder — the sub for a bundle at its root. */
  folderLabel: string;
  onSelect: () => void;
}) {
  // A bundle at the picked folder's root has an empty relPath; showing the
  // folder's own name beats a bare "." of punctuation.
  const sub = bundle.relPath || folderLabel;
  const typeCount = bundle.types.length;
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
        {active && <Check size={14} />}
      </span>
      <span className="switcher-row-main">
        <span className="switcher-row-name">{bundle.name}</span>
        <span className="switcher-row-sub">{sub}</span>
      </span>
      <RowMeta count={bundle.conceptCount} detail={`${typeCount} type${typeCount === 1 ? "" : "s"}`} />
    </button>
  );
}

function RecentRow({
  entry,
  actions,
  close,
}: {
  entry: RecentBundle;
  actions: Actions;
  close: () => void;
}) {
  const remote = entry.remote;
  return (
    <div className="switcher-recent">
      <button
        type="button"
        data-row
        className="switcher-row"
        title={remote ? `${entry.name} — ${remote.input}` : `${entry.name} — ${entry.root}`}
        onClick={() => {
          void actions.openRecentBundle(entry);
          close();
        }}
      >
        <span className="switcher-check" aria-hidden="true" />
        <span className="switcher-row-main">
          <span className="switcher-row-name">
            {remote && (
              <span className="switcher-remote-badge" aria-label="Remote bundle" title="Fetched from a URL">
                <Globe size={12} aria-hidden="true" />
              </span>
            )}
            {entry.name}
          </span>
          <span className="switcher-row-sub">
            {remote ? remote.label : baseName(entry.folder)}
          </span>
        </span>
        <RowMeta count={entry.conceptCount} detail={relTime(entry.ts)} />
      </button>
      <span className="switcher-recent-actions">
        {remote && (
          <button
            type="button"
            className="switcher-mini"
            aria-label="Refresh from source"
            title="Re-fetch the latest from its URL"
            onClick={() => {
              void actions.refreshRemote(entry);
              close();
            }}
          >
            ↻
          </button>
        )}
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
