// Empty / loading / error states for the workspace area. Report, never refuse:
// every state explains what happened and offers a way forward.
// See docs/ux/empty-and-error-states.md.

import { useApp } from "../store.tsx";
import { modKey } from "../platform.ts";
import "./chrome.css";
import "./EmptyState.css";

export function EmptyState() {
  const { state, actions } = useApp();

  // Scanning — a cancelable walk; the app stays responsive.
  if (state.loading) {
    return (
      <div className="empty" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p className="empty-line">Scanning…</p>
      </div>
    );
  }

  // Failure — permission denied, path gone, or an unreadable folder.
  if (state.error) {
    return (
      <div className="empty" role="alert">
        <h2>Couldn’t open that folder</h2>
        <p className="empty-err">{state.error}</p>
        <button className="btn primary" onClick={() => void actions.openFolder()}>
          Try another folder
        </button>
      </div>
    );
  }

  // A folder was chosen, but no OKF bundle was detected inside it.
  if (state.folder && state.bundles.length === 0) {
    return (
      <div className="empty">
        <h2>No OKF bundles found</h2>
        <p className="empty-line">
          An OKF bundle is a directory of <code>.md</code> concept files, each
          with a non-empty <code>type</code> in its YAML frontmatter. Point the
          viewer at a folder that contains one.
        </p>
        <p className="empty-path muted">{state.folder}</p>
        <button className="btn primary" onClick={() => void actions.openFolder()}>
          Open another folder
        </button>
      </div>
    );
  }

  // First run — nothing open yet.
  return (
    <div className="empty hero">
      <h1 className="hero-title">OKF Viewer</h1>
      <p className="hero-tagline">
        Point it at a folder. Read your knowledge as a graph.
      </p>
      <div className="hero-cta">
        <button className="btn primary lg" onClick={() => void actions.openFolder()}>
          Open Folder…
        </button>
        <p className="hero-hint">
          or press <kbd>{modKey}</kbd> <kbd>O</kbd>
        </p>
      </div>
      <p className="empty-line hero-what">
        An OKF bundle is a folder of markdown concepts, cross-linked into a
        graph. Pick a folder and the viewer finds every bundle inside.
      </p>
    </div>
  );
}
