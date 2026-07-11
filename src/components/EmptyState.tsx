// Empty / loading / error states for the workspace area. Report, never refuse:
// every state explains what happened and offers a way forward.
// See docs/ux/empty-and-error-states.md.

import { Globe } from "lucide-react";
import { useApp } from "../store.tsx";
import { modKey } from "../platform.ts";
import { REMOTE_EXAMPLES } from "../remoteSource.ts";
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
      <h1 className="hero-title">OKF Studio</h1>
      <p className="hero-tagline">
        Point it at a folder. Read your knowledge as a graph.
      </p>
      <div className="hero-cta">
        <button className="btn primary lg" onClick={() => void actions.openFolder()}>
          Open Folder…
        </button>
        <button className="btn lg" onClick={() => actions.setRemoteOpen(true)}>
          Open from URL…
        </button>
      </div>
      <p className="hero-hint">
        <kbd>{modKey}</kbd> <kbd>O</kbd> for a folder ·{" "}
        <kbd>{modKey}</kbd> <kbd>⇧</kbd> <kbd>O</kbd> for a URL
      </p>
      <p className="empty-line hero-what">
        An OKF bundle is a folder of markdown concepts, cross-linked into a
        graph. Point at a local folder, or fetch one from a URL — it's read only
        either way.
      </p>

      {REMOTE_EXAMPLES.length > 0 && (
        <div className="hero-examples">
          <span className="hero-examples-label muted">New here? Try one:</span>
          {REMOTE_EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              type="button"
              className="hero-example"
              onClick={() => actions.setRemoteOpen(true, ex.url)}
            >
              <span className="hero-example-title">
                <Globe size={14} aria-hidden="true" /> {ex.title}
              </span>
              <span className="hero-example-blurb muted">{ex.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
