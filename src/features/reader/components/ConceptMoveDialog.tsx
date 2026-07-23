import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AgentStagedFileDiff, AgentStagedValidationInfo } from "@/features/agent/connection.ts";
import {
  applyConceptMove,
  conceptMoveDiff,
  discardConceptMove,
  restoreConceptMove,
  selectConceptMoveHunk,
  stageConceptMove,
  validateConceptMove,
} from "@/shared/ipc.ts";
import type { ConceptMoveReview } from "@/shared/ipc.ts";
import type { Concept } from "@/shared/types.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./ConceptMoveDialog.css";

type MoveResult =
  | { status: "idle" }
  | { status: "applied"; files: number }
  | { status: "restored"; files: number };

export function ConceptMoveDialog({
  open,
  bundleRoot,
  concept,
  onOpenChange,
  onOpenMovedConcept,
}: {
  open: boolean;
  bundleRoot: string;
  concept: Concept;
  onOpenChange: (open: boolean) => void;
  onOpenMovedConcept: (conceptId: string) => void;
}) {
  const filename = concept.id.split("/").at(-1) ?? "concept";
  const destinationRef = useRef<HTMLInputElement>(null);
  const [destination, setDestination] = useState(`archive/${filename}.md`);
  const [review, setReview] = useState<ConceptMoveReview | null>(null);
  const [diffs, setDiffs] = useState<Partial<Record<string, AgentStagedFileDiff>>>({});
  const [validation, setValidation] = useState<AgentStagedValidationInfo | null>(null);
  const [result, setResult] = useState<MoveResult>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allMoveHunksKept = review?.plan.changes.every((change) => {
    const diff = diffs[change.path];
    return diff?.truncated === false
      && diff.hunks.every((hunk) => hunk.reviewed && hunk.selected);
  }) ?? false;

  async function beginReview() {
    setBusy(true);
    setError("");
    try {
      const next = await stageConceptMove(bundleRoot, concept.id, destination);
      setReview(next);
      setDiffs({});
      setValidation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not plan this move.");
    }
    setBusy(false);
  }

  async function openDiff(path: string) {
    setBusy(true);
    setError("");
    try {
      const diff = await conceptMoveDiff(bundleRoot, path);
      setDiffs((current) => ({ ...current, [path]: diff }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not open this diff.");
    }
    setBusy(false);
  }

  async function chooseHunk(path: string, hunkIndex: number, selected: boolean) {
    const diff = diffs[path];
    if (!diff) return;
    setBusy(true);
    setError("");
    try {
      const next = await selectConceptMoveHunk(
        bundleRoot,
        path,
        diff.revision,
        hunkIndex,
        selected,
      );
      setDiffs((current) => ({ ...current, [path]: next }));
      setValidation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not update this review.");
    }
    setBusy(false);
  }

  async function validate() {
    setBusy(true);
    setError("");
    try {
      setValidation(await validateConceptMove(bundleRoot));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not validate this move.");
    }
    setBusy(false);
  }

  async function apply() {
    if (!validation) return;
    setBusy(true);
    setError("");
    try {
      const applied = await applyConceptMove(bundleRoot, validation.revision);
      setResult({ status: "applied", files: applied.appliedFiles });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not apply this move.");
    }
    setBusy(false);
  }

  async function restore() {
    setBusy(true);
    setError("");
    try {
      const restored = await restoreConceptMove(bundleRoot);
      setResult({ status: "restored", files: restored.restoredFiles });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not restore this move.");
    }
    setBusy(false);
  }

  async function discardAndClose() {
    setBusy(true);
    setError("");
    try {
      await discardConceptMove(bundleRoot);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not discard this move.");
    }
    setBusy(false);
  }

  function close() {
    if (review && result.status === "idle") {
      void discardAndClose();
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (!next) close();
    }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop concept-move-backdrop" />
        <Dialog.Popup
          className="ui-dialog concept-move-dialog"
          initialFocus={destinationRef}
        >
          <header className="concept-move-dialog__header">
            <div>
              <Dialog.Title>Move concept</Dialog.Title>
              <Dialog.Description>
                Relocate <code>{concept.id}</code> as one reviewed graph change.
              </Dialog.Description>
            </div>
            <button
              type="button"
              className="btn ghost icon"
              aria-label="Close move concept"
              onClick={close}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          {result.status === "idle" && !review ? (
            <form className="concept-move-dialog__form" onSubmit={(event) => {
              event.preventDefault();
              void beginReview();
            }}>
              <label htmlFor="concept-move-destination">Destination path</label>
              <input
                ref={destinationRef}
                id="concept-move-destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="archive/concept.md"
                spellCheck={false}
              />
              <p>
                Bundle-relative <code>.md</code> path. Studio keeps a redirect at the old path and
                rewrites parser-confirmed links and indexes.
              </p>
              <button type="submit" className="btn primary" disabled={busy || !destination.trim()}>
                Review move
              </button>
            </form>
          ) : null}

          {review && result.status === "idle" ? (
            <div className="concept-move-dialog__review">
              <section className="concept-move-summary" aria-label="Move impact">
                <div>
                  <code>{review.plan.sourceId}</code>
                  <ArrowRight size={14} aria-hidden="true" />
                  <code>{review.plan.destinationId}</code>
                </div>
                <p>
                  {review.plan.changes.length} files · {review.plan.affectedLinks} links ·{" "}
                  {review.plan.affectedIndexes} indexes
                </p>
                <p>
                  Stable identity:{" "}
                  <strong>{review.plan.stableId ?? "not declared"}</strong>
                </p>
                {review.plan.warnings.map((warning) => (
                  <p key={warning} className="concept-move-summary__warning">{warning}</p>
                ))}
              </section>

              <ul className="concept-move-files" aria-label="Move file review">
                {review.plan.changes.map((change) => {
                  const diff = diffs[change.path];
                  return (
                    <li key={change.path}>
                      <header>
                        <span>
                          <code>{change.path}</code>
                          <small>{change.reason} · {change.kind}</small>
                        </span>
                        {!diff ? (
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busy}
                            onClick={() => void openDiff(change.path)}
                          >
                            Review file
                          </button>
                        ) : null}
                      </header>
                      {diff ? (
                        <div className="concept-move-diff">
                          {diff.truncated ? (
                            <p role="alert">This diff exceeds the review limit and cannot be applied.</p>
                          ) : diff.hunks.map((hunk) => (
                            <section key={hunk.index}>
                              <header>
                                <code>{hunk.header}</code>
                                <span>
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    disabled={busy}
                                    aria-pressed={hunk.reviewed && hunk.selected}
                                    onClick={() => void chooseHunk(change.path, hunk.index, true)}
                                  >
                                    Keep
                                  </button>
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    disabled={busy}
                                    aria-pressed={hunk.reviewed && !hunk.selected}
                                    onClick={() => void chooseHunk(change.path, hunk.index, false)}
                                  >
                                    Reject
                                  </button>
                                </span>
                              </header>
                              <pre>{hunk.unified}</pre>
                            </section>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {validation ? (
                <section
                  className="concept-move-validation"
                  role={validation.errors === 0 ? "status" : "alert"}
                  aria-label="Concept move validation"
                >
                  {validation.errors === 0 ? <Check size={15} aria-hidden="true" /> : null}
                  <strong>
                    {validation.errors === 0 ? "OKF validation passed" : "OKF validation found errors"}
                  </strong>
                  <span>{validation.errors} errors · {validation.warnings} warnings</span>
                </section>
              ) : null}

              <footer>
                <button type="button" className="btn ghost" disabled={busy} onClick={close}>
                  Discard
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy || !allMoveHunksKept}
                  onClick={() => void validate()}
                >
                  Validate
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !validation || validation.errors > 0}
                  onClick={() => void apply()}
                >
                  Apply move
                </button>
              </footer>
            </div>
          ) : null}

          {result.status !== "idle" ? (
            <section className="concept-move-result" role="status">
              <Check size={20} aria-hidden="true" />
              <h3>{result.status === "applied" ? "Concept moved" : "Move restored"}</h3>
              <p>
                {result.files} file{result.files === 1 ? "" : "s"}{" "}
                {result.status === "applied" ? "changed in one transaction." : "restored."}
              </p>
              <div>
                {result.status === "applied" ? (
                  <>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => void restore()}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        if (review) onOpenMovedConcept(review.plan.destinationId);
                      }}
                    >
                      Open moved concept
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn primary" onClick={close}>Done</button>
                )}
              </div>
            </section>
          ) : null}

          {error ? <p className="concept-move-error" role="alert">{error}</p> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
