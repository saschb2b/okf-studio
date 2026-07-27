// The manual door to the attestation engine: paste a receipt, get a verdict.
//
// This is a tool, not a gate. The gate is in the agent panel, where a number is
// actually asserted and where an interruption is the thing that works —
// security research is consistent that a passive indicator is ignored while an
// active one is heeded. Someone who opens this dialog is already motivated, so
// that finding does not apply to it.
//
// It exists because a receipt has to come from somewhere. Studio does not run
// computations, so today the only receipts in the world were produced outside
// it — by a person at a query console. Without this door the engine has no
// reachable caller at all.
//
// A dialog rather than a rail panel: pasting JSON into a 320px column is a
// worse job than the task deserves.

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { Check, X } from "lucide-react";
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

  // Which declared fields the pasted text currently carries. Live feedback
  // rather than a static sentence listing requirements: the commonest way to
  // fail this is an incomplete receipt, and finding that out after pressing
  // Check is a worse trade than seeing it fill in as you paste.
  const parsed = text.trim() ? parseReceipt(text) : null;
  const present = new Set(parsed?.ok ? Object.keys(parsed.receipt) : []);

  async function check() {
    const result = parseReceipt(text);
    if (!result.ok) {
      setError(result.error);
      setReport(null);
      setDropped([]);
      return;
    }
    setError(null);
    setDropped(result.dropped);
    setChecking(true);
    // `.then(onResolve, onReject)` rather than try/catch/finally: the React
    // Compiler does not handle a `finally` clause, and this is the same control
    // flow without it.
    const outcome = await attest(bundleRoot, concept.id, result.receipt).then(
      (checked) => ({ checked, failed: false }),
      () => ({ checked: null, failed: true }),
    );
    setChecking(false);
    if (outcome.failed) {
      setError("Studio could not complete the attestation.");
      setReport(null);
      return;
    }
    setReport(outcome.checked);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Reset on close, so reopening never shows the previous run's verdict
        // beside a new receipt.
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
        <Dialog.Popup className="ui-dialog attest-dialog">
          <header className="attest-dialog__header">
            <div>
              <Dialog.Title className="ui-dialog-title">Check a run</Dialog.Title>
              <p className="attest-dialog__subtitle">
                Compared against the computation <strong>{concept.title}</strong> sanctions.
                Studio runs nothing.
              </p>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </header>

          <div className="attest-dialog__field">
            <div className="attest-dialog__field-head">
              <label className="attest-dialog__label" htmlFor="attest-receipt">
                Receipt JSON
              </label>
              <span className="attest-dialog__hint">
                {/* Enter inserts a newline in a textarea, so the submit
                    shortcut has to be the modified one. */}
                <kbd>Ctrl</kbd>
                <kbd>Enter</kbd>
                to check
              </span>
            </div>
            <textarea
              id="attest-receipt"
              className="attest-dialog__input"
              value={text}
              spellCheck={false}
              rows={9}
              placeholder={'{\n  "job_id": "bq:job-1",\n  "executed_sql": "SELECT …",\n  "result": "12345"\n}'}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void check();
                }
              }}
            />
          </div>

          {/* Fixed height so the dialog does not jump between the requirements
              row, an error, and the dropped-fields note. */}
          <div className="attest-dialog__status">
            {error
              ? <p className="attest-dialog__error" role="alert">{error}</p>
              : declared.length > 0
                ? (
                  <div className="attest-dialog__required">
                    <span className="attest-dialog__required-label">Required evidence</span>
                    <ul className="attest-dialog__chips">
                      {declared.map((field) => {
                        const has = present.has(field);
                        return (
                          <li
                            key={field}
                            className={`attest-dialog__chip${has ? " is-present" : ""}`}
                          >
                            {has && <Check size={11} aria-hidden="true" />}
                            <code>{field}</code>
                            <span className="sr-only">{has ? " present" : " missing"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )
                : (
                  <p className="attest-dialog__hint">
                    This contract declares no required evidence, so a run returns nothing
                    for an attester to inspect.
                  </p>
                )}
          </div>

          {/* Named rather than silently ignored: a receipt that looks complete
              because a nested field was stringified is worse than one that says
              which fields could not be used. */}
          {dropped.length > 0 && (
            <p className="attest-dialog__dropped">
              Not compared, because they are not single values:{" "}
              {dropped.map((field) => <code key={field}>{field}</code>)}
            </p>
          )}

          {report && (
            <div className="attest-dialog__verdict">
              <AttestationVerdict report={report} />
            </div>
          )}

          <footer className="ui-dialog-foot">
            <Dialog.Close className="btn ghost" disabled={checking}>
              Close
            </Dialog.Close>
            <button
              type="button"
              className="btn primary"
              onClick={() => void check()}
              disabled={checking || !text.trim()}
            >
              {checking ? "Checking…" : report ? "Check again" : "Check"}
            </button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
