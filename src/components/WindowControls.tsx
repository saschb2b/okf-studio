// Minimize / maximize-restore / close controls for the custom title bar. The
// maximize icon swaps to a restore glyph when the window is maximized. Off-Tauri
// the buttons render but do nothing (window.ts guards). See docs/ux/browsing-layout.md.

import { useApp } from "../store.tsx";
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from "../window.ts";
import "./WindowControls.css";

export function WindowControls() {
  // Maximized state is tracked centrally in the store (see AppProvider).
  const maxed = useApp().state.maximized;

  return (
    <div className="win-controls">
      <button
        type="button"
        className="win-btn"
        aria-label="Minimize"
        onClick={() => void minimizeWindow()}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <line x1="2.5" y1="6" x2="9.5" y2="6" />
        </svg>
      </button>
      <button
        type="button"
        className="win-btn"
        aria-label={maxed ? "Restore" : "Maximize"}
        onClick={() => void toggleMaximizeWindow()}
      >
        {maxed ? (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.5" y="3.5" width="6" height="6" rx="0.5" />
            <path d="M4.5 3.5 V2.5 H9.5 V7.5 H8.5" fill="none" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.5" y="2.5" width="7" height="7" rx="0.5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="win-btn win-close"
        aria-label="Close"
        onClick={() => void closeWindow()}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3 L9 9 M9 3 L3 9" />
        </svg>
      </button>
    </div>
  );
}
