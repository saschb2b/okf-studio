// STUB — replaced by the palette agent with fuzzy match + quick actions.
import { useState } from "react";
import { useApp } from "../store.tsx";

export function CommandPalette() {
  const { state, actions } = useApp();
  const [q, setQ] = useState("");
  if (!state.bundle) return null;
  const needle = q.toLowerCase();
  const matches = state.bundle.concepts
    .filter((c) => c.title.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle))
    .slice(0, 20);

  return (
    <div className="overlay" onClick={() => actions.setPalette(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Jump to a concept…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul>
          {matches.map((c) => (
            <li key={c.id} onClick={() => actions.selectConcept(c.id)}>
              <span>{c.title}</span> <small>{c.id}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
