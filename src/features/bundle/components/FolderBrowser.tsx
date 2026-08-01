// Studio's own folder browser, which stands in for the native folder dialog on
// Android. Android offers an app no folder picker whose result the app can then
// read with ordinary file calls, so Studio walks the directory tree itself over
// all-files access. See src-tauri/src/mobile_storage.rs and
// docs/architecture/build-and-release.md.
//
// Two screens in one dialog: the grant prompt while shared storage is
// unreadable, and the tree once it is readable.

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, CornerLeftUp, Folder, FolderOpen } from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import {
  hasStorageAccess,
  listFolders,
  requestStorageAccess,
  storageAccessState,
  type FolderListing,
} from "@/shared/ipc.ts";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./FolderBrowser.css";

export function FolderBrowser() {
  const { state, actions } = useApp();
  const [granted, setGranted] = useState(false);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = state.folderBrowserOpen;
  // Where the browser stands. A ref, not state, because the refresh below reads
  // it without wanting to re-run when it changes.
  const at = useRef<string | null>(null);

  async function show(path: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await listFolders(path);
      at.current = next.path;
      setListing(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  // Check access when the dialog opens, and keep checking while it is refused.
  //
  // The user grants it on a system screen outside the app, so the answer
  // changes while Studio is in the background. Coming back should be the
  // signal, but an Android WebView fires neither `focus` nor `visibilitychange`
  // dependably when its activity resumes: with only those listeners the dialog
  // sat on the grant prompt after the permission was already on. Both are still
  // used, and a poll runs underneath them for as long as the answer is no, so
  // returning to a granted app costs at most a second before the tree appears.
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    async function refresh() {
      if (stopped) return;
      const may = hasStorageAccess();
      setGranted(may);
      if (!may) return;
      stopPolling();
      const access = await storageAccessState();
      const next = at.current ?? access.startPath;
      try {
        const listing = await listFolders(next);
        at.current = listing.path;
        setListing(listing);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    const recheck = () => void refresh();
    void refresh();
    // The poll runs only while access is refused, so a granted app never keeps
    // a timer. The first refused check starts it; the first granted one, in
    // refresh above, stops it.
    if (!hasStorageAccess()) timer = setInterval(recheck, 1000);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      stopped = true;
      stopPolling();
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [open]);

  // Bound outside the JSX so the null check narrows the type for the handler.
  const parent = listing?.parent ?? null;

  async function choose(path: string) {
    setBusy(true);
    setError(null);
    try {
      await actions.openBrowsedFolder(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        actions.setFolderBrowserOpen(next);
        if (!next) {
          setListing(null);
          setError(null);
          setBusy(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog folder-browser" aria-label="Open folder">
          <header className="ui-dialog-head">
            <Dialog.Title className="ui-dialog-title">Open folder</Dialog.Title>
            <Dialog.Close className="btn ghost icon" aria-label="Close">
              ✕
            </Dialog.Close>
          </header>

          {granted ? (
            <>
              <p className="folder-browser__path" aria-live="polite">
                {listing?.path ?? "…"}
              </p>

              <ul className="folder-browser__list">
                {parent != null && (
                  <li>
                    <button
                      type="button"
                      className="folder-browser__row"
                      onClick={() => void show(parent)}
                      disabled={busy}
                    >
                      <CornerLeftUp size={18} aria-hidden="true" />
                      <span className="folder-browser__name">Up one folder</span>
                    </button>
                  </li>
                )}
                {listing?.entries.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className="folder-browser__row"
                      onClick={() => void show(entry.path)}
                      disabled={busy || !entry.readable}
                    >
                      <Folder size={18} aria-hidden="true" />
                      <span className="folder-browser__name">{entry.name}</span>
                      {entry.readable ? (
                        <ChevronRight size={16} aria-hidden="true" className="folder-browser__go" />
                      ) : (
                        <span className="folder-browser__refused">No access</span>
                      )}
                    </button>
                  </li>
                ))}
                {listing?.entries.length === 0 && (
                  <li className="folder-browser__empty muted">No folders in here.</li>
                )}
              </ul>

              {error && <p className="folder-browser__error">{error}</p>}

              <footer className="folder-browser__foot">
                <p className="folder-browser__hint muted">
                  Studio reads the folder you open here and every bundle inside it.
                </p>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !listing}
                  onClick={() => listing && void choose(listing.path)}
                >
                  <FolderOpen size={16} aria-hidden="true" />
                  Open this folder
                </button>
              </footer>
            </>
          ) : (
            <div className="folder-browser__grant">
              <p>
                Android keeps your files away from apps until you say otherwise.
                Studio needs file access to open a bundle from your tablet, and
                it reads only the folders you open here.
              </p>
              <p className="muted">
                The switch is on a system screen. Turn on file access for OKF
                Studio, then come back.
              </p>
              {error && <p className="folder-browser__error">{error}</p>}
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setError(null);
                  requestStorageAccess();
                }}
              >
                Open the file-access screen
              </button>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
