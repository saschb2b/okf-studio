// STUB — replaced by the Reader/Log agent with rendered markdown entries.
import { useApp } from "../store.tsx";

export function LogView() {
  const { state, actions } = useApp();
  const log = state.bundle?.log ?? [];

  return (
    <div className="panel log">
      <header>
        <b>Change Log</b>
        <button className="btn ghost" onClick={() => actions.togglePanel("log", false)}>
          ×
        </button>
      </header>
      {log.length === 0 ? (
        <p className="muted">No log.md in this bundle.</p>
      ) : (
        log.map((e, n) => (
          <div key={n} className="log-entry">
            <h4>{e.date}</h4>
            <ul>
              {e.entries.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
