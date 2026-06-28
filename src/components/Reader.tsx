// STUB — replaced by the Reader agent with sanitized markdown rendering, live
// intra-bundle links, and Links-to / Cited-by lists.
import { useActiveConcept, useApp } from "../store.tsx";
import { titleOf } from "../selectors.ts";

export function Reader() {
  const c = useActiveConcept();
  const { state, actions } = useApp();
  if (!c) return <div className="reader-empty">Select a concept.</div>;

  return (
    <article className="reader-inner">
      <span className="type-badge">{c.type}</span>
      <h1>{c.title}</h1>
      {c.description && <p className="desc">{c.description}</p>}
      <pre className="body">{c.body}</pre>
      {c.citedBy.length > 0 && (
        <section className="rels">
          <h3>Cited by</h3>
          <ul>
            {c.citedBy.map((id) => (
              <li key={id} onClick={() => actions.selectConcept(id)}>
                {titleOf(state.bundle, id)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
