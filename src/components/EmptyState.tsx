// STUB — the empty/error/loading states agent expands these (no-bundles-found,
// permission denied, etc.). See docs/ux/empty-and-error-states.md.
import { useApp } from "../store.tsx";

export function EmptyState() {
  const { state, actions } = useApp();

  if (state.loading) return <div className="empty">Scanning…</div>;
  if (state.error)
    return (
      <div className="empty">
        <p className="err">{state.error}</p>
        <button className="btn" onClick={() => void actions.openFolder()}>
          Try another folder
        </button>
      </div>
    );
  if (state.folder && state.bundles.length === 0)
    return (
      <div className="empty">
        <h2>No OKF bundles found</h2>
        <p>An OKF bundle is a folder of markdown files, each with a <code>type</code> in its frontmatter.</p>
        <button className="btn" onClick={() => void actions.openFolder()}>
          Open another folder
        </button>
      </div>
    );

  return (
    <div className="empty">
      <h1>OKF Viewer</h1>
      <p>Point it at a folder. Read your knowledge as a graph.</p>
      <button className="btn primary" onClick={() => void actions.openFolder()}>
        Open Folder…
      </button>
    </div>
  );
}
