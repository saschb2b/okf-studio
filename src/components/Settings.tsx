// Settings & Preferences — a local modal built on Base UI's Dialog (focus trap,
// Escape, backdrop, scroll-lock, ARIA all handled by the library) with Base UI
// Select / Checkbox / NumberField. Appearance is our design tokens. Opens with
// Ctrl/Cmd+, . See docs/ux/settings.md.

import { useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Checkbox } from "@base-ui/react/checkbox";
import { NumberField } from "@base-ui/react/number-field";
import { useApp } from "../store.tsx";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { ThemeMode } from "../types.ts";
import { ZOOM_EVENT } from "../native.ts";
import type { ZoomIntent } from "../native.ts";
import "./chrome.css";
import "./baseui.css";
import "./Settings.css";

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

// Reader text-size presets, shown in the Settings select. The keyboard remap
// (Ctrl/Cmd +/-/0) steps through the same range; see the okf:zoom handler below.
const READER_SCALE_MIN = 0.8;
const READER_SCALE_MAX = 1.6;
const READER_SCALE_STEP = 0.1;

const SCALE_OPTIONS = [0.9, 1.0, 1.15, 1.3] as const;
const SCALE_LABELS: Record<string, string> = {
  "0.9": "Small",
  "1": "Default",
  "1.15": "Large",
  "1.3": "Larger",
};

function clampScale(v: number): number {
  return Math.min(READER_SCALE_MAX, Math.max(READER_SCALE_MIN, v));
}

/** Round to one decimal so persisted scale values stay clean. */
function roundScale(v: number): number {
  return Math.round(v * 10) / 10;
}

function scaleLabel(v: number): string {
  return SCALE_LABELS[String(v)] ?? `${Math.round(v * 100)}%`;
}

export function Settings() {
  const { state, actions } = useApp();
  const s = state.settings;

  // Remap the suppressed browser zoom keys/gestures to reader text-size.
  // native.ts dispatches `okf:zoom` on window when Ctrl/Cmd +/-/0 or Ctrl+wheel
  // fire off the graph; we apply it via the store so it persists like any other
  // setting. Settings is always mounted, so this works in every layout mode.
  useEffect(() => {
    const onZoom = (e: Event): void => {
      const intent = (e as CustomEvent<ZoomIntent>).detail;
      if (intent === 0) {
        actions.updateSettings({ readerScale: 1 });
        return;
      }
      const next = clampScale(s.readerScale + intent * READER_SCALE_STEP);
      actions.updateSettings({ readerScale: roundScale(next) });
    };
    window.addEventListener(ZOOM_EVENT, onZoom);
    return () => window.removeEventListener(ZOOM_EVENT, onZoom);
    // Re-bind when scale changes so the closure reads the current value.
  }, [s.readerScale, actions]);

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
              onValueChange={(v) => {
                if (v) actions.updateSettings({ theme: v });
              }}
            >
              <Select.Trigger className="ui-select-trigger" aria-label="Theme">
                <Select.Value>
                  {(value) => THEME_LABELS[(value as ThemeMode | null) ?? "system"]}
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
                actions.updateSettings({ reduceMotion: checked })
              }
            >
              <Checkbox.Indicator className="ui-checkbox-indicator" aria-hidden="true">
                ✓
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span className="field-label">Reduce motion</span>
          </label>

          <div className="field">
            <span className="field-label">Reader text size</span>
            <Select.Root
              value={s.readerScale}
              onValueChange={(v) =>
                actions.updateSettings({ readerScale: roundScale(Number(v)) })
              }
            >
              <Select.Trigger className="ui-select-trigger" aria-label="Reader text size">
                <Select.Value>
                  {(value) => scaleLabel((value as number | null) ?? 1)}
                </Select.Value>
                <Select.Icon className="ui-select-icon" aria-hidden="true">
                  ▾
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner className="ui-select-positioner" sideOffset={4}>
                  <Select.Popup className="ui-select-popup">
                    {SCALE_OPTIONS.map((scale) => (
                      <Select.Item
                        key={scale}
                        value={scale}
                        className="ui-select-item"
                      >
                        <Select.ItemText>{scaleLabel(scale)}</Select.ItemText>
                        <Select.ItemIndicator className="ui-select-check">
                          ✓
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            <span className="field-hint muted">
              Scales the reader pane only. Ctrl/Cmd&nbsp;+/−/0 also adjusts it.
            </span>
          </div>

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
                <NumberField.Input
                  className="ui-numberfield-input"
                  aria-label="Scan max depth"
                />
                <NumberField.Increment className="ui-numberfield-btn" aria-label="Increase">
                  +
                </NumberField.Increment>
              </NumberField.Group>
            </NumberField.Root>
            <span className="field-hint muted">
              How deep autodetect descends into subfolders.
            </span>
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
