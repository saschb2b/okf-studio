// Create a new OKF bundle from a form — static generation, no agent. The
// form collects a title (which derives the folder name until it is edited),
// an optional description, and the first concept; Rust shows the OS
// parent-folder picker, writes a small conformant bundle atomically,
// self-checks it with okf-core, and the store opens the result like any
// picked folder. Built on Base UI's Dialog, matching the Open-from-URL
// modal. See docs/features/create-bundle.md.

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useApp } from "@/shared/store.tsx";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./CreateBundleDialog.css";

/** Mirror of the Rust slug: lowercase alphanumeric runs joined by dashes. */
export function suggestedFolderName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

export function CreateBundleDialog() {
  const { state, actions } = useApp();
  const [title, setTitle] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderEdited, setFolderEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [conceptTitle, setConceptTitle] = useState("Welcome");
  const [conceptType, setConceptType] = useState("Note");
  const [includeGuide, setIncludeGuide] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveFolder = folderEdited ? folderName : suggestedFolderName(title);
  const canCreate = title.trim().length > 0 && effectiveFolder.length > 0 && !busy;

  function reset() {
    setTitle("");
    setFolderName("");
    setFolderEdited(false);
    setDescription("");
    setConceptTitle("Welcome");
    setConceptType("Note");
    setIncludeGuide(true);
    setBusy(false);
    setError(null);
  }

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const created = await actions.createBundle({
        folderName: effectiveFolder,
        title: title.trim(),
        description: description.trim(),
        firstConceptTitle: conceptTitle.trim() || "Welcome",
        firstConceptType: conceptType.trim() || "Note",
        includeGuide,
      });
      if (created) reset();
      else setBusy(false); // Picker cancelled — keep the filled form.
    } catch (raised: unknown) {
      setBusy(false);
      setError(raised instanceof Error ? raised.message : String(raised));
    }
  }

  return (
    <Dialog.Root
      open={state.createOpen}
      onOpenChange={(open) => {
        actions.setCreateOpen(open);
        if (!open) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog create-dialog" aria-label="Create new bundle">
          <header className="ui-dialog-head">
            <Dialog.Title className="ui-dialog-title">Create new bundle</Dialog.Title>
            <Dialog.Close className="btn ghost icon" aria-label="Close">
              ✕
            </Dialog.Close>
          </header>

          <form
            className="create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="create-field">
              <label className="create-label" htmlFor="create-title">Bundle title</label>
              <input
                id="create-title"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="create-input"
                placeholder="Team knowledge"
                value={title}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (error) setError(null);
                }}
              />
            </div>

            <div className="create-field">
              <label className="create-label" htmlFor="create-folder">Folder name</label>
              <input
                id="create-folder"
                className="create-input create-input--mono"
                placeholder="team-knowledge"
                value={effectiveFolder}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setFolderEdited(true);
                  setFolderName(event.target.value);
                  if (error) setError(null);
                }}
              />
              <p className="create-hint muted">
                Created inside a parent folder you pick next.
              </p>
            </div>

            <div className="create-field">
              <label className="create-label" htmlFor="create-description">
                Description <span className="muted">(one sentence, optional)</span>
              </label>
              <input
                id="create-description"
                className="create-input"
                placeholder="What this bundle holds and who it serves."
                value={description}
                disabled={busy}
                autoComplete="off"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="create-row">
              <div className="create-field">
                <label className="create-label" htmlFor="create-concept-title">First concept</label>
                <input
                  id="create-concept-title"
                  className="create-input"
                  value={conceptTitle}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => setConceptTitle(event.target.value)}
                />
              </div>
              <div className="create-field">
                <label className="create-label" htmlFor="create-concept-type">Type</label>
                <input
                  id="create-concept-type"
                  className="create-input"
                  value={conceptType}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setConceptType(event.target.value)}
                />
              </div>
            </div>

            <label className="create-guide">
              <input
                type="checkbox"
                checked={includeGuide}
                disabled={busy}
                onChange={(event) => setIncludeGuide(event.target.checked)}
              />
              Include a starter guide concept (how to grow the bundle, linked with the first concept)
            </label>

            {error && (
              <p className="create-error" role="alert">{error}</p>
            )}

            <div className="create-actions">
              <p className="create-hint muted" aria-live="polite">
                {busy
                  ? "Creating…"
                  : "Studio writes a conformant OKF v0.1 starter (index, log, concepts) and opens it."}
              </p>
              <Dialog.Close className="btn ghost" disabled={busy}>Cancel</Dialog.Close>
              <button type="submit" className="btn primary" disabled={!canCreate}>
                {busy ? "Creating…" : "Choose location & create"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
