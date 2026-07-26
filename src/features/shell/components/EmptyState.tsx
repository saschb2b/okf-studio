// Empty / loading / error states for the workspace area. Report, never refuse:
// every state explains what happened and offers a way forward.
// See docs/ux/empty-and-error-states.md.

import { BookOpen, FilePlus2, FolderOpen, Globe } from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import { modKey, shiftKey } from "@/shared/platform/platform.ts";
import { REMOTE_EXAMPLES } from "@/features/bundle/remoteSource.ts";
import appIcon from "@/assets/icon.svg";
import "@/shared/styles/chrome.css";
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
          with a non-empty <code>type</code> in its YAML frontmatter. Point
          Studio at a folder that contains one.
        </p>
        <p className="empty-path muted">{state.folder}</p>
        <div className="hero-cta">
          <button className="btn primary" onClick={() => void actions.openFolder()}>
            Open another folder
          </button>
          <button className="btn" onClick={() => actions.setCreateOpen(true)}>
            Create a new bundle…
          </button>
        </div>
      </div>
    );
  }

  // First run — nothing open yet. One scannable action list (the welcome-list
  // pattern) instead of a row of equal buttons: each action names who it's
  // for, shortcuts sit inline on their action, and the sample bundle is a
  // first-class row instead of a footnote. See docs/ux/first-run.md.
  return (
    <div className="empty hero">
      <img className="hero-mark" src={appIcon} alt="" aria-hidden="true" />
      <h1 className="hero-title">OKF Studio</h1>
      <p className="hero-tagline">
        Explore connected knowledge with the agents you already use.
      </p>

      <nav className="hero-actions" aria-label="Get started">
        <button
          type="button"
          className="hero-action hero-action--primary"
          onClick={() => void actions.openFolder()}
        >
          <FolderOpen size={18} aria-hidden="true" />
          <span className="hero-action-text">
            <span className="hero-action-label">Open folder…</span>
            <span className="hero-action-desc">
              Browse OKF bundles already on disk
            </span>
          </span>
          <kbd className="kbd">{modKey}</kbd> <kbd className="kbd">O</kbd>
        </button>
        <button
          type="button"
          className="hero-action"
          onClick={() => actions.setCreateOpen(true)}
        >
          <FilePlus2 size={18} aria-hidden="true" />
          <span className="hero-action-text">
            <span className="hero-action-label">Create new bundle…</span>
            <span className="hero-action-desc">
              Start fresh from a short form — no agent needed
            </span>
          </span>
        </button>
        <button
          type="button"
          className="hero-action"
          onClick={() => actions.setRemoteOpen(true)}
        >
          <Globe size={18} aria-hidden="true" />
          <span className="hero-action-text">
            <span className="hero-action-label">Open from URL…</span>
            <span className="hero-action-desc">
              Fetch a GitHub repo or archive into a local cache
            </span>
          </span>
          <kbd className="kbd">{modKey}</kbd> <kbd className="kbd">{shiftKey}</kbd> <kbd className="kbd">O</kbd>
        </button>
        {REMOTE_EXAMPLES.map((ex) => (
          <button
            key={ex.url}
            type="button"
            className="hero-action"
            onClick={() => actions.setRemoteOpen(true, ex.url)}
          >
            <BookOpen size={18} aria-hidden="true" />
            <span className="hero-action-text">
              <span className="hero-action-label">Try {ex.title}</span>
              <span className="hero-action-desc">{ex.blurb}</span>
            </span>
          </button>
        ))}
      </nav>

      <p className="hero-note">
        Opening never changes a bundle's files. Agents connect only when you
        choose.
      </p>
    </div>
  );
}
