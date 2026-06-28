// STUB — replaced by the validation agent (grouped issues, jump-to-concept).
import { useApp } from "../store.tsx";

export function ValidationPanel() {
  const { state, actions } = useApp();
  const issues = state.bundle?.issues ?? [];

  return (
    <div className="panel validation">
      <header>
        <b>Validation</b>
        <button className="btn ghost" onClick={() => actions.togglePanel("validation", false)}>
          ×
        </button>
      </header>
      {issues.length === 0 ? (
        <p className="muted">Conformant — no issues.</p>
      ) : (
        <ul className="issues">
          {issues.map((i, n) => (
            <li
              key={n}
              className={i.level}
              onClick={() => i.conceptId && actions.selectConcept(i.conceptId)}
            >
              <span className="lvl">{i.level}</span> {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
