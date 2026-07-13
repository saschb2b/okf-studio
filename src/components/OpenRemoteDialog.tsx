// Open from URL — fetch a remote OKF bundle (a GitHub repo/subpath, a git URL,
// or an archive) into a local cache, then open it like any picked folder. The
// URL is parsed network-free as you type (live preview); the fetch happens only
// when you click Open. Built on Base UI's Dialog, matching the palette/settings
// modals. See docs/features/bundle-switcher.md and docs/ux/first-run.md.

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useApp } from "../store.tsx";
import { parseRemoteSource, remoteKindLabel, REMOTE_EXAMPLES } from "../remoteSource.ts";
import type { BundleRoot, RemoteSource } from "../types.ts";
import "./chrome.css";
import "./baseui.css";
import "./OpenRemoteDialog.css";

export function OpenRemoteDialog() {
  const { state, actions } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The fetch worked but the URL held no OKF bundle — a calm, distinct outcome
  // from a fetch/network error (which is what `error` carries).
  const [notBundle, setNotBundle] = useState(false);
  // The fetched folder holds several bundles → let the user pick one.
  const [choices, setChoices] = useState<{ folder: string; bundles: BundleRoot[] } | null>(null);
  const [appliedSeed, setAppliedSeed] = useState<string | null>(null);

  // A seed (from a first-run example card) prefills the field once per open,
  // via the adjust-state-during-render pattern — the user still confirms with
  // Open, so no network happens without a click. Mirrors CommandPalette's seed.
  if (state.remoteOpen && state.remoteSeed != null && appliedSeed !== state.remoteSeed) {
    setAppliedSeed(state.remoteSeed);
    setUrl(state.remoteSeed);
  }

  const trimmed = url.trim();
  const source = parseRemoteSource(trimmed);

  function reset() {
    setUrl("");
    setBusy(false);
    setError(null);
    setNotBundle(false);
    setChoices(null);
    setAppliedSeed(null);
  }

  async function runOpen(src: RemoteSource | null) {
    if (!src || busy) return;
    setBusy(true);
    setError(null);
    setNotBundle(false);
    setChoices(null);
    try {
      const outcome = await actions.openRemote(src);
      // "opened" → the store closes the dialog and the workspace loads it.
      // "empty" → fetched fine, but no OKF bundle there; explain it in place.
      // "multiple" → several bundles at that URL; show a picker.
      if (outcome.status === "empty") {
        setNotBundle(true);
        setBusy(false);
      } else if (outcome.status === "multiple") {
        setChoices({ folder: outcome.folder, bundles: outcome.bundles });
        setBusy(false);
      }
    } catch (e) {
      // Fetch/network failure — stay open with the error so the user can retry.
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={state.remoteOpen}
      onOpenChange={(open) => {
        actions.setRemoteOpen(open);
        if (!open) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog remote-dialog" aria-label="Open from URL">
          <header className="ui-dialog-head">
            <Dialog.Title className="ui-dialog-title">Open from URL</Dialog.Title>
            <Dialog.Close className="btn ghost icon" aria-label="Close">
              ✕
            </Dialog.Close>
          </header>

          <form
            className="remote-form"
            onSubmit={(e) => {
              e.preventDefault();
              void runOpen(source);
            }}
          >
            <div className="remote-field">
            <label className="remote-label" htmlFor="remote-url">
              Paste a GitHub URL or a link to an archive
            </label>
            <input
              id="remote-url"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type="url"
              inputMode="url"
              className="remote-input"
              placeholder="https://github.com/owner/repo/tree/main/docs"
              value={url}
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
                if (notBundle) setNotBundle(false);
                if (choices) setChoices(null);
              }}
            />

            {/* Live, network-free preview of what will be fetched. */}
            <div className="remote-preview" aria-live="polite">
              {busy ? (
                <span className="remote-busy">
                  <span className="spinner" aria-hidden="true" />
                  Fetching {source?.label ?? "bundle"}…
                </span>
              ) : source ? (
                <span className="remote-chip">
                  <span className="remote-kind">{remoteKindLabel(source.kind)}</span>
                  <span className="remote-chip-label">{source.label}</span>
                </span>
              ) : trimmed ? (
                <span className="remote-hint muted">
                  Not a recognizable URL — try a GitHub link or a{" "}
                  <code>.tar.gz</code>/<code>.zip</code> archive.
                </span>
              ) : (
                <span className="remote-hint muted">
                  No request is sent until you choose Open. Studio caches the
                  download locally and opens it without modifying its files.
                </span>
              )}
            </div>

            {error && (
              <p className="remote-error" role="alert">
                {error}
              </p>
            )}

            {notBundle && source && (
              <div className="remote-notbundle" role="status">
                <p className="remote-notbundle-title">
                  No OKF bundle at that URL
                </p>
                <p className="remote-notbundle-body">
                  It downloaded fine, but <strong>{source.label}</strong> has no
                  OKF concepts. A bundle is a folder of <code>.md</code> files,
                  each with a <code>type</code> in its frontmatter.
                  {!source.subpath && (
                    <>
                      {" "}
                      If it lives in a subfolder, point at that path — e.g.{" "}
                      <code>…/tree/main/okf/bundles/name</code>.
                    </>
                  )}
                </p>
              </div>
            )}

            {choices && source && (
              <div className="remote-picker" role="group" aria-label="Choose a bundle">
                <p className="remote-picker-title">
                  {choices.bundles.length} bundles here — pick one
                </p>
                <div className="remote-picker-list">
                  {choices.bundles.map((b) => (
                    <button
                      key={b.root}
                      type="button"
                      className="remote-picker-row"
                      onClick={() =>
                        void actions.openRemoteChoice(
                          b.root,
                          choices.folder,
                          choices.bundles,
                          source,
                        )
                      }
                    >
                      <span className="remote-picker-name">{b.name}</span>
                      <span className="remote-picker-meta muted">
                        {b.conceptCount} concept{b.conceptCount === 1 ? "" : "s"}
                        {b.types.length > 0 &&
                          ` · ${b.types.length} type${b.types.length === 1 ? "" : "s"}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            </div>

            {/* The example is onboarding for the idle state; hide it once we're
                fetching or showing a result, so the dialog stays compact. */}
            {REMOTE_EXAMPLES.length > 0 && !busy && !error && !notBundle && !choices && (
              <div className="remote-examples">
                <span className="remote-examples-label muted">Try an example</span>
                {REMOTE_EXAMPLES.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    className="remote-example"
                    onClick={() => {
                      setUrl(ex.url);
                      void runOpen(parseRemoteSource(ex.url));
                    }}
                  >
                    <span className="remote-example-title">{ex.title}</span>
                    <span className="remote-example-blurb muted">{ex.blurb}</span>
                  </button>
                ))}
              </div>
            )}

            <footer className="ui-dialog-foot">
              <Dialog.Close className="btn ghost" disabled={busy}>
                Cancel
              </Dialog.Close>
              {/* With a picker showing, the rows are the open actions — no
                  single "Open" target, so drop the primary button. */}
              {!choices && (
                <button type="submit" className="btn primary" disabled={!source || busy}>
                  {busy ? "Fetching…" : "Open"}
                </button>
              )}
            </footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
