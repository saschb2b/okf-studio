// Settings & Preferences — a local modal built on Base UI's Dialog (focus trap,
// Escape, backdrop, scroll-lock, ARIA all handled by the library) with Base UI
// Select / Checkbox / NumberField. Appearance is our design tokens. Opens with
// Ctrl/Cmd+, . See docs/ux/settings.md.

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Checkbox } from "@base-ui/react/checkbox";
import { NumberField } from "@base-ui/react/number-field";
import { useApp } from "../store.tsx";
import { recentFolders } from "../ipc.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { ThemeMode } from "../types.ts";
import "./chrome.css";
import "./baseui.css";
import "./Settings.css";

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function shortPath(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

export function Settings() {
  const { state, actions } = useApp();
  const s = state.settings;
  const [recents, setRecents] = useState<string[]>([]);

  // Load the recent-folders list whenever the dialog opens.
  useEffect(() => {
    if (!state.settingsOpen) return;
    let alive = true;
    void recentFolders().then((list) => {
      if (alive) setRecents(list);
    });
    return () => {
      alive = false;
    };
  }, [state.settingsOpen]);

  return (
    <Dialog.Root
      open={state.settingsOpen}
      onOpenChange={(open) => actions.setSettingsOpen(open)}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog settings-dialog">
          <header className="ui-dialog-head">
            <Dialog.Title className="ui-dialog-title">Settings</Dialog.Title>
            <Dialog.Close className="btn ghost icon" aria-label="Close settings">
              <span aria-hidden="true">×</span>
            </Dialog.Close>
          </header>

          <div className="field">
            <span className="field-label">Theme</span>
            <Select.Root
              value={s.theme}
              onValueChange={(v) => actions.updateSettings({ theme: v as ThemeMode })}
            >
              <Select.Trigger className="ui-select-trigger">
                <Select.Value>
                  {(value) => THEME_LABELS[(value as ThemeMode) ?? "system"]}
                </Select.Value>
                <Select.Icon className="ui-select-icon" aria-hidden="true">
                  ▾
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner className="ui-select-positioner" sideOffset={4}>
                  <Select.Popup className="ui-select-popup">
                    {(Object.keys(THEME_LABELS) as ThemeMode[]).map((mode) => (
                      <Select.Item key={mode} value={mode} className="ui-select-item">
                        <Select.ItemText>{THEME_LABELS[mode]}</Select.ItemText>
                        <Select.ItemIndicator className="ui-select-check">
                          ✓
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
          </div>

          <label className="field check">
            <Checkbox.Root
              className="ui-checkbox"
              checked={s.reduceMotion}
              onCheckedChange={(checked) =>
                actions.updateSettings({ reduceMotion: checked === true })
              }
            >
              <Checkbox.Indicator className="ui-checkbox-indicator" aria-hidden="true">
                ✓
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span className="field-label">Reduce motion</span>
          </label>

          <div className="field">
            <span className="field-label">Scan max depth</span>
            <NumberField.Root
              value={s.scanMaxDepth}
              min={1}
              max={64}
              onValueChange={(v) => {
                if (v != null) actions.updateSettings({ scanMaxDepth: Math.floor(v) });
              }}
            >
              <NumberField.Group className="ui-numberfield-group">
                <NumberField.Decrement className="ui-numberfield-btn" aria-label="Decrease">
                  &minus;
                </NumberField.Decrement>
                <NumberField.Input className="ui-numberfield-input" />
                <NumberField.Increment className="ui-numberfield-btn" aria-label="Increase">
                  +
                </NumberField.Increment>
              </NumberField.Group>
            </NumberField.Root>
            <span className="field-hint muted">
              How deep autodetect descends into subfolders.
            </span>
          </div>

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
                      onClick={() => {
                        void actions.openFolderPath(folder);
                        actions.setSettingsOpen(false);
                      }}
                    >
                      <span className="recent-name">{shortPath(folder)}</span>
                      <span className="recent-path muted">{folder}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="ui-dialog-foot">
            <button
              className="btn"
              onClick={() => actions.updateSettings(DEFAULT_SETTINGS)}
            >
              Reset to defaults
            </button>
            <Dialog.Close className="btn primary">Close</Dialog.Close>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
