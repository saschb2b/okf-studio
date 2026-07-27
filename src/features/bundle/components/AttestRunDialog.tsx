// The manual door to the attestation engine: paste a receipt, get a verdict.
//
// This is a tool, not a gate. The gate is in the agent panel, where a number is
// actually asserted and where an interruption is the thing that works —
// security research is consistent that a passive indicator is ignored while an
// active one is heeded. Someone who opens this dialog is already motivated, so
// the passive-indicator finding does not apply to it.
//
// It exists because a receipt has to come from somewhere. Studio does not run
// computations, so today the only receipts in the world were produced outside
// it — by a data engineer at a query console. Without this door the engine has
// no reachable caller at all.
//
// A dialog rather than a rail panel: pasting JSON into a 320px column is a
// worse job than the task deserves.

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { X } from "lucide-react";
import { attestComputationRun } from "@/shared/ipc.ts";
import { parseReceipt } from "@/features/bundle/receipt.ts";
import type { AttestationReport, Concept } from "@/shared/types.ts";
import { AttestationVerdict } from "./AttestationVerdict.tsx";
import "./AttestRunDialog.css";

interface AttestRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundleRoot: string;
  concept: Concept;
  /** Injected in tests and stories; defaults to the real IPC call. */
  attest?: typeof attestComputationRun;
}

export function AttestRunDialog({
  open,
  onOpenChange,
  bundleRoot,
  concept,
  attest = attestComputationRun,
}: AttestRunDialogProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  const [report, setReport] = useState<AttestationReport | null>(null);
  const [checking, setChecking] = useState(false);

  const declared = concept.computation?.executor?.receipt ?? [];

  async function check() {
    const parsed = parseReceipt(text);
    if (!parsed.ok) {
      setError(parsed.error);
      setReport(null);
      setDropped([]);
      return;
    }
    setError(null);
    setDropped(parsed.dropped);
    setChecking(true);
    try {
      setReport(await attest(bundleRoot, concept.id, parsed.receipt));
    } catch {
      setError("Studio could not complete the attestation.");
      setReport(null);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Reset on close, so reopening never shows the previous run's verdict
        // next to a new receipt.
        if (!next) {
          setText("");
          setError(null);
          setDropped([]);
          setReport(null);
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog attest-run-dialog">
          <header className="ui-dialog-head">
            <div>
              <Dialog.Title className="ui-dialog-title">Check a run</Dialog.Title>
              <Dialog.Description className="attest-run-dialog__description">
                Paste the receipt a run of {concept.title} returned. Studio compares
                it against the computation this bundle sanctions; it does not run
                anything.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </header>

          <div className="attest-run-dialog__body">
            {declared.length > 0 && (
              <p className="attest-run-dialog__declared">
                This contract requires{" "}
                {declared.map((field, index) => (
                  <span key={field}>
                    {index > 0 && ", "}
                    <code>{field}</code>
                  </span>
                ))}
                .
              </p>
            )}

            <label className="attest-run-dialog__label" htmlFor="attest-receipt">
              Receipt JSON
            </label>
            <textarea
              id="attest-receipt"
              className="attest-run-dialog__input"
              value={text}
              spellCheck={false}
              rows={8}
              placeholder={'{\n  "job_id": "bq:job-1",\n  "executed_sql": "SELECT …",\n  "result": "12345"\n}'}
              onChange={(event) => setText(event.target.value)}
            />

            {error && (
              <p className="attest-run-dialog__error" role="alert">{error}</p>
            )}

            {/* Named rather than silently ignored: a receipt that looks complete
                because a nested field was stringified is worse than one that
                says which fields could not be used. */}
            {dropped.length > 0 && (
              <p className="attest-run-dialog__dropped">
                Not compared, because they are not single values:{" "}
                {dropped.map((field) => <code key={field}>{field}</code>)}
              </p>
            )}

            <div className="attest-run-dialog__actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => void check()}
                disabled={checking}
              >
                {checking ? "Checking…" : "Check"}
              </button>
            </div>

            {report && <AttestationVerdict report={report} />}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
