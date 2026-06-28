// Settings & Preferences — a small, local modal. Theme, reduce-motion, scan
// tuning, recent folders, and reset. No account, no cloud sync. Opens with
// Ctrl/Cmd+, ; closes on backdrop / Escape / Close. See docs/ux/settings.md.

import { useEffect, useRef, useState } from "react";
import { useApp } from "../store.tsx";
import { recentFolders } from "../ipc.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { ThemeMode } from "../types.ts";
import "./chrome.css";
import "./Settings.css";

export function Settings() {
  const { state, actions } = useApp();
  const s = state.settings;
  const [recents, setRecents] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  // Load the recent-folders list once when the dialog mounts.
  useEffect(() => {
    let alive = true;
    void recentFolders().then((list) => {
      if (alive) setRecents(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Move focus into the dialog on open for keyboard users.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  function close() {
    actions.setSettingsOpen(false);
  }

  function openRecent(folder: string) {
    void actions.openFolderPath(folder);
    close();
  }

  // Minimal focus trap: cycle Tab within the dialog.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function shortPath(p: string): string {
    const parts = p.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || p;
  }

  return (
    <div
      className="chrome-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className="dialog settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={onKeyDown}
      >
        <header className="settings-head">
          <h2 id="settings-title">Settings</h2>
          <button
            className="btn ghost icon"
            aria-label="Close settings"
            onClick={close}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <label className="field" htmlFor="set-theme">
          <span className="field-label">Theme</span>
          <select
            id="set-theme"
            ref={firstFieldRef}
            value={s.theme}
            onChange={(e) =>
              actions.updateSettings({ theme: e.target.value as ThemeMode })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="field check" htmlFor="set-motion">
          <input
            id="set-motion"
            type="checkbox"
            checked={s.reduceMotion}
            onChange={(e) =>
              actions.updateSettings({ reduceMotion: e.target.checked })
            }
          />
          <span className="field-label">Reduce motion</span>
        </label>

        <label className="field" htmlFor="set-depth">
          <span className="field-label">Scan max depth</span>
          <input
            id="set-depth"
            type="number"
            min={1}
            max={64}
            value={s.scanMaxDepth}
            className="num"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 1) {
                actions.updateSettings({ scanMaxDepth: Math.floor(v) });
              }
            }}
          />
          <span className="field-hint muted">
            How deep autodetect descends into subfolders.
          </span>
        </label>

        <div className="field">
          <span className="field-label">Recent folders</span>
          {recents.length === 0 ? (
            <p className="muted recents-empty">No recent folders yet.</p>
          ) : (
            <ul className="recents">
              {recents.map((folder) => (
                <li key={folder}>
                  <button
                    className="recent-item"
                    title={folder}
                    aria-label={`Open ${folder}`}
                    onClick={() => openRecent(folder)}
                  >
                    <span className="recent-name">{shortPath(folder)}</span>
                    <span className="recent-path muted">{folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="settings-foot">
          <button
            className="btn"
            onClick={() => actions.updateSettings(DEFAULT_SETTINGS)}
          >
            Reset to defaults
          </button>
          <button className="btn primary" onClick={close}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
