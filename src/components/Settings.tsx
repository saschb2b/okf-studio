// STUB — replaced by the settings agent (recent folders, scan tuning).
import { useApp } from "../store.tsx";
import type { ThemeMode } from "../types.ts";

export function Settings() {
  const { state, actions } = useApp();
  const s = state.settings;

  return (
    <div className="overlay" onClick={() => actions.setSettingsOpen(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label className="field">
          Theme
          <select
            value={s.theme}
            onChange={(e) => actions.updateSettings({ theme: e.target.value as ThemeMode })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={s.reduceMotion}
            onChange={(e) => actions.updateSettings({ reduceMotion: e.target.checked })}
          />
          Reduce motion
        </label>
        <button className="btn" onClick={() => actions.setSettingsOpen(false)}>
          Close
        </button>
      </div>
    </div>
  );
}
