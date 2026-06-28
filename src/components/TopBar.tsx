import { useApp } from "../store.tsx";

export function TopBar() {
  const { state, actions } = useApp();
  const errors = state.bundle?.issues.filter((i) => i.level === "error").length ?? 0;
  const warns = state.bundle?.issues.filter((i) => i.level === "warning").length ?? 0;
  const badge = errors ? "error" : warns ? "warn" : "ok";

  return (
    <header className="topbar">
      <button className="btn" onClick={() => void actions.openFolder()}>
        Open Folder…
      </button>
      <span className="topbar-title">{state.bundle?.name ?? "OKF Viewer"}</span>
      <div className="spacer" />
      {state.bundle && (
        <>
          <button className="btn ghost" onClick={() => actions.togglePanel("log")}>
            Log
          </button>
          <button
            className={`badge ${badge}`}
            onClick={() => actions.togglePanel("validation")}
            title="Validation"
          >
            {errors ? `${errors} error${errors > 1 ? "s" : ""}` : warns ? `${warns} warning${warns > 1 ? "s" : ""}` : "conformant"}
          </button>
          <button className="btn ghost" title="Settings" onClick={() => actions.setSettingsOpen(true)}>
            ⚙
          </button>
        </>
      )}
    </header>
  );
}
