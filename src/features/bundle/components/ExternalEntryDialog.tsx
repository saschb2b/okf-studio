import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AppWindow, ShieldCheck, X } from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import * as ipc from "@/shared/ipc.ts";
import type { ExternalEntryPreview } from "@/shared/ipc.ts";
import { OKF_TASKS } from "@/features/agent/taskContext.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./ExternalEntryDialog.css";

interface ExternalEntryPreviewDialogProps {
  entry: ExternalEntryPreview;
  busy?: boolean;
  continueDisabled?: boolean;
  error?: string | null;
  onDismiss: () => void;
  onContinue: () => void;
}

export function ExternalEntryPreviewDialog({
  entry,
  busy = false,
  continueDisabled = false,
  error = null,
  onDismiss,
  onContinue,
}: ExternalEntryPreviewDialogProps) {
  const task = entry.taskId ? OKF_TASKS[entry.taskId] : null;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onDismiss()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup
          className="ui-dialog external-entry"
          aria-describedby="external-entry-description"
        >
          <header className="external-entry__header">
            <span className="external-entry__mark" aria-hidden="true">
              <AppWindow size={18} />
            </span>
            <div>
              <Dialog.Title>Review external request</Dialog.Title>
              <Dialog.Description id="external-entry-description">
                {entry.source === "deepLink" ? "A link" : "A command"} asked OKF Studio to {actionLabel(entry.action)}.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Dismiss external request" disabled={busy}>
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="external-entry__body">
            <dl className="external-entry__details">
              <div>
                <dt>Target</dt>
                <dd><code>{entry.bundleRoot}</code></dd>
              </div>
              <div>
                <dt>Action</dt>
                <dd>{actionTitle(entry.action)}</dd>
              </div>
              <div>
                <dt>Concept</dt>
                <dd>{entry.conceptId ?? "Not specified"}</dd>
              </div>
              <div>
                <dt>Task</dt>
                <dd>{task?.title ?? "None"}</dd>
              </div>
              <div>
                <dt>Attachments</dt>
                <dd>None</dd>
              </div>
            </dl>

            {entry.promptDraft && (
              <section className="external-entry__draft" aria-labelledby="external-entry-draft-title">
                <h3 id="external-entry-draft-title">Untrusted prompt draft</h3>
                <p>This text is shown for review. It is not submitted to an agent.</p>
                <pre>{entry.promptDraft}</pre>
              </section>
            )}

            {entry.omittedFields.length > 0 && (
              <section className="external-entry__omitted" aria-labelledby="external-entry-omitted-title">
                <h3 id="external-entry-omitted-title">Unsupported fields omitted</h3>
                <p>{entry.omittedFields.join(", ")}</p>
              </section>
            )}

            <div className="external-entry__boundary" role="status">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                Continue opens the folder only. A new folder requires a system confirmation.
                Agent work and writes remain separate, visible actions.
              </p>
            </div>

            {error && <p className="external-entry__error" role="alert">{error}</p>}
          </div>

          <footer className="external-entry__actions">
            <Dialog.Close className="btn ghost" disabled={busy}>Dismiss</Dialog.Close>
            <button type="button" className="btn primary" disabled={busy || continueDisabled} onClick={onContinue}>
              {busy ? "Waiting for confirmation…" : "Continue"}
            </button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ExternalEntryDialog() {
  const { actions } = useApp();
  const [entries, setEntries] = useState<ExternalEntryPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continueDisabled, setContinueDisabled] = useState(false);
  const entry = entries.at(0);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;
    void ipc.pendingExternalEntries()
      .then((pending) => active && setEntries(pending))
      .catch((cause: unknown) => active && setError(errorMessage(cause)));
    void ipc.onExternalEntryRequested((incoming) => {
      if (!active) return;
      setEntries((current) => current.some(({ requestId }) => requestId === incoming.requestId)
        ? current
        : [...current, incoming]);
    }).then((dispose) => {
      if (active) unlisten = dispose;
      else dispose();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  if (!entry) return null;
  const activeEntry: ExternalEntryPreview = entry;

  function removeCurrent() {
    setEntries((current) => current.filter(({ requestId }) => requestId !== activeEntry.requestId));
    setBusy(false);
    setError(null);
    setContinueDisabled(false);
  }

  async function dismiss() {
    if (busy) return;
    await ipc.dismissExternalEntry(activeEntry.requestId).catch(() => false);
    removeCurrent();
  }

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const accepted = await ipc.acceptExternalEntry(activeEntry.requestId);
      if (!accepted) {
        removeCurrent();
        return;
      }
      const bundle = await actions.openFolderPath(accepted.bundleRoot);
      if (!bundle) {
        setBusy(false);
        setContinueDisabled(true);
        setError("The approved folder does not contain an OKF bundle.");
        return;
      }
      const concept = accepted.conceptId
        ? bundle.concepts.find(({ id }) => id === accepted.conceptId)
        : bundle.concepts[0];
      if (accepted.conceptId && !concept) {
        setBusy(false);
        setContinueDisabled(true);
        setError(`Concept “${accepted.conceptId}” is not in the opened bundle.`);
        return;
      }
      if (concept) actions.selectConcept(concept.id);
      if (accepted.action === "inspect" && !accepted.conceptId) actions.setOverview(true);
      if (accepted.action === "validate") actions.togglePanel("validation", true);
      if (accepted.action === "task") {
        if (!concept || !accepted.taskId) {
          setBusy(false);
          setContinueDisabled(true);
          setError("This bundle has no concept that can anchor the requested task.");
          return;
        }
        requestAnimationFrame(() => actions.openOkfTaskLauncher({
          kind: "external",
          id: `external:${accepted.requestId}`,
          title: concept.title,
          conceptId: concept.id,
        }, {
          preferredTaskId: accepted.taskId,
          promptDraft: accepted.promptDraft,
        }));
      }
      removeCurrent();
    } catch (cause) {
      setBusy(false);
      setError(errorMessage(cause));
    }
  }

  return (
    <ExternalEntryPreviewDialog
      entry={activeEntry}
      busy={busy}
      continueDisabled={continueDisabled}
      error={error}
      onDismiss={() => void dismiss()}
      onContinue={() => void accept()}
    />
  );
}

function actionLabel(action: ExternalEntryPreview["action"]): string {
  return action === "task" ? "prepare an OKF task" : action;
}

function actionTitle(action: ExternalEntryPreview["action"]): string {
  const labels: Record<ExternalEntryPreview["action"], string> = {
    open: "Open bundle",
    inspect: "Inspect bundle",
    validate: "Show validation",
    task: "Prepare task",
  };
  return labels[action];
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
