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
      <main className="empty" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p className="empty-line">Scanning…</p>
      </main>
    );
  }

  // Failure — permission denied, path gone, or an unreadable folder.
  if (state.error) {
    return (
      <main className="empty" role="alert">
        <h2>Couldn’t open that folder</h2>
        <p className="empty-err">{state.error}</p>
        <button className="btn primary" onClick={() => void actions.openFolder()}>
          Try another folder
        </button>
      </main>
    );
  }

  // A folder was chosen, but no OKF bundle was detected inside it.
  if (state.folder && state.bundles.length === 0) {
    return (
      <main className="empty">
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
      </main>
    );
  }

  // First run — nothing open yet. A branded header, then two labeled groups
  // of action cards: Start (the three ways in) and Explore (curated sample
  // bundles). Each card carries an icon chip, a label, a one-line description,
  // and its shortcut in one right-aligned key group. See docs/ux/first-run.md.
  return (
    <main className="empty hero">
      <div className="hero-brand">
        <img className="hero-mark" src={appIcon} alt="" aria-hidden="true" />
        <h1 className="hero-title">OKF Studio</h1>
        <p className="hero-tagline">
          Explore connected knowledge with the agents you already use.
        </p>
      </div>

      <nav className="hero-body" aria-label="Get started">
        <section className="hero-group">
          <h2 className="hero-group-label">Start</h2>
          <div className="hero-actions">
            <button
              type="button"
              className="hero-action hero-action--primary"
              onClick={() => void actions.openFolder()}
            >
              <span className="hero-action-chip" aria-hidden="true">
                <FolderOpen size={18} />
              </span>
              <span className="hero-action-text">
                <span className="hero-action-label">Open folder…</span>
                <span className="hero-action-desc">
                  Browse OKF bundles already on disk
                </span>
              </span>
              <span className="hero-action-keys" aria-hidden="true">
                <kbd className="kbd">{modKey}</kbd>
                <kbd className="kbd">O</kbd>
              </span>
            </button>
            <button
              type="button"
              className="hero-action"
              onClick={() => actions.setCreateOpen(true)}
            >
              <span className="hero-action-chip" aria-hidden="true">
                <FilePlus2 size={18} />
              </span>
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
              <span className="hero-action-chip" aria-hidden="true">
                <Globe size={18} />
              </span>
              <span className="hero-action-text">
                <span className="hero-action-label">Open from URL…</span>
                <span className="hero-action-desc">
                  Fetch a GitHub repo or archive into a local cache
                </span>
              </span>
              <span className="hero-action-keys" aria-hidden="true">
                <kbd className="kbd">{modKey}</kbd>
                <kbd className="kbd">{shiftKey}</kbd>
                <kbd className="kbd">O</kbd>
              </span>
            </button>
          </div>
        </section>

        <section className="hero-group">
          <h2 className="hero-group-label">Explore</h2>
          <div className="hero-actions">
            {REMOTE_EXAMPLES.map((ex) => (
              <button
                key={ex.url}
                type="button"
                className="hero-action"
                onClick={() => actions.setRemoteOpen(true, ex.url)}
              >
                <span className="hero-action-chip" aria-hidden="true">
                  <BookOpen size={18} />
                </span>
                <span className="hero-action-text">
                  <span className="hero-action-label">Try {ex.title}</span>
                  <span className="hero-action-desc">{ex.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </nav>

      <p className="hero-note">
        Opening never changes a bundle's files. Agents connect only when you
        choose.
      </p>
    </main>
  );
}
