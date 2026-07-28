import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { AgentStagedFileDiff, AgentStagedValidationInfo } from "@/features/agent/connection.ts";
import {
  applyConceptMove,
  conceptMoveDiff,
  discardConceptMove,
  restoreConceptMove,
  selectConceptMoveHunk,
  stageConceptRetirement,
  validateConceptMove,
} from "@/shared/ipc.ts";
import type { ConceptRetirementReview, RetirementAction } from "@/shared/ipc.ts";
import type { Bundle, Concept } from "@/shared/types.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./ConceptMoveDialog.css";
import "./ConceptRetirementDialog.css";

const SESSION_DAY = new Date().toISOString().slice(0, 10);

const RETIREMENT_CHOICES: readonly {
  action: RetirementAction;
  label: string;
  description: string;
}[] = [
  {
    action: "deprecate",
    label: "Deprecate",
    description: "Keep the claims searchable, but warn retrieval that they are deprecated.",
  },
  {
    action: "redirect",
    label: "Redirect",
    description: "Replace the old page with a portable pointer and rewrite confirmed inbound links.",
  },
  {
    action: "tombstone",
    label: "Tombstone",
    description: "Remove the former claims while preserving the identity and retirement explanation.",
  },
  {
    action: "delete",
    label: "Delete",
    description: "Remove the file and redirect inbound links. Restore remains available after Apply.",
  },
];

type RetirementResult =
  | { status: "idle" }
  | { status: "applied"; files: number }
  | { status: "restored"; files: number };

export function ConceptRetirementDialog({
  open,
  bundle,
  concept,
  finalFocus,
  onOpenChange,
  onOpenConcept,
}: {
  open: boolean;
  bundle: Bundle;
  concept: Concept;
  /** Where focus lands on close. Named explicitly because the control that
   *  opens this lives in a menu, and that item is gone by the time it shuts. */
  finalFocus?: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onOpenConcept: (conceptId: string) => void;
}) {
  const firstChoiceRef = useRef<HTMLInputElement>(null);
  const [action, setAction] = useState<RetirementAction>("deprecate");
  const [replacementId, setReplacementId] = useState("");
  const [reason, setReason] = useState("");
  const [decisionDate, setDecisionDate] = useState(SESSION_DAY);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [review, setReview] = useState<ConceptRetirementReview | null>(null);
  const [diffs, setDiffs] = useState<Partial<Record<string, AgentStagedFileDiff>>>({});
  const [validation, setValidation] = useState<AgentStagedValidationInfo | null>(null);
  const [result, setResult] = useState<RetirementResult>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const replacementRequired = action === "redirect"
    || (action === "delete" && concept.citedBy.length > 0);
  const canBegin = reason.trim().length > 0
    && decisionDate.length > 0
    && (!replacementRequired || replacementId.length > 0)
    && (action !== "delete" || deleteConfirmed);
  const allHunksKept = review?.plan.changes.every((change) => {
    const diff = diffs[change.path];
    return diff?.truncated === false
      && diff.hunks.every((hunk) => hunk.reviewed && hunk.selected);
  }) ?? false;

  async function beginReview() {
    setBusy(true);
    setError("");
    try {
      const next = await stageConceptRetirement(bundle.root, {
        sourceId: concept.id,
        action,
        replacementId: replacementId || null,
        reason,
        decisionDate,
      });
      setReview(next);
      setDiffs({});
      setValidation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not plan this retirement.");
    }
    setBusy(false);
  }

  async function openDiff(path: string) {
    setBusy(true);
    setError("");
    try {
      const diff = await conceptMoveDiff(bundle.root, path);
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
        bundle.root,
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
      setValidation(await validateConceptMove(bundle.root));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not validate this retirement.");
    }
    setBusy(false);
  }

  async function apply() {
    if (!validation) return;
    setBusy(true);
    setError("");
    try {
      const applied = await applyConceptMove(bundle.root, validation.revision);
      setResult({ status: "applied", files: applied.appliedFiles });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not apply this retirement.");
    }
    setBusy(false);
  }

  async function restore() {
    setBusy(true);
    setError("");
    try {
      const restored = await restoreConceptMove(bundle.root);
      setResult({ status: "restored", files: restored.restoredFiles });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not restore this retirement.");
    }
    setBusy(false);
  }

  async function discardAndClose() {
    setBusy(true);
    setError("");
    try {
      await discardConceptMove(bundle.root);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not discard this retirement.");
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
          className="ui-dialog concept-move-dialog concept-retirement-dialog"
          initialFocus={firstChoiceRef}
          finalFocus={finalFocus}
        >
          <header className="concept-move-dialog__header">
            <div>
              <Dialog.Title>Retire concept</Dialog.Title>
              <Dialog.Description>
                Choose what readers and retrieval should encounter instead of{" "}
                <code>{concept.id}</code>.
              </Dialog.Description>
            </div>
            <button
              type="button"
              className="btn ghost icon"
              aria-label="Close retire concept"
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
              <fieldset className="concept-retirement-choices">
                <legend>Retirement choice</legend>
                {RETIREMENT_CHOICES.map((choice, index) => (
                  <label
                    key={choice.action}
                    className="concept-retirement-choice"
                    aria-label={`${choice.label}. ${choice.description}`}
                    data-selected={action === choice.action || undefined}
                    data-destructive={choice.action === "delete" || undefined}
                  >
                    <input
                      ref={index === 0 ? firstChoiceRef : undefined}
                      type="radio"
                      name="retirement-choice"
                      value={choice.action}
                      checked={action === choice.action}
                      onChange={() => {
                        setAction(choice.action);
                        setDeleteConfirmed(false);
                      }}
                    />
                    <span>
                      <strong>{choice.label}</strong>
                      <small>{choice.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label htmlFor="concept-retirement-replacement">
                Replacement concept{replacementRequired ? " (required)" : " (optional)"}
              </label>
              <select
                id="concept-retirement-replacement"
                value={replacementId}
                required={replacementRequired}
                onChange={(event) => setReplacementId(event.target.value)}
              >
                <option value="">No replacement</option>
                {bundle.concepts
                  .filter((candidate) => candidate.id !== concept.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title} ({candidate.id})
                    </option>
                  ))}
              </select>
              {action === "delete" && concept.citedBy.length > 0 ? (
                <p>
                  This concept has {concept.citedBy.length} inbound link
                  {concept.citedBy.length === 1 ? "" : "s"}. Choose a replacement so Studio can
                  rewrite them.
                </p>
              ) : null}

              <label htmlFor="concept-retirement-reason">Reason</label>
              <textarea
                id="concept-retirement-reason"
                value={reason}
                maxLength={1024}
                required
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why this concept should no longer be treated as current"
              />

              <label htmlFor="concept-retirement-date">Decision date</label>
              <input
                id="concept-retirement-date"
                type="date"
                value={decisionDate}
                required
                onChange={(event) => setDecisionDate(event.target.value)}
              />

              {action === "delete" ? (
                <label className="concept-retirement-confirm">
                  <input
                    type="checkbox"
                    checked={deleteConfirmed}
                    onChange={(event) => setDeleteConfirmed(event.target.checked)}
                  />
                  <span>
                    I understand Apply will remove <code>{concept.id}.md</code>. Studio will keep a
                    restore checkpoint.
                  </span>
                </label>
              ) : null}

              <button
                type="submit"
                className={action === "delete" ? "btn danger" : "btn primary"}
                disabled={busy || !canBegin}
              >
                Review {action}
              </button>
            </form>
          ) : null}

          {review && result.status === "idle" ? (
            <div className="concept-move-dialog__review">
              <section
                className="concept-move-summary concept-retirement-summary"
                aria-label="Retirement impact"
              >
                <div>
                  <code>{review.plan.sourceId}</code>
                  {review.plan.replacementId ? (
                    <>
                      <ArrowRight size={14} aria-hidden="true" />
                      <code>{review.plan.replacementId}</code>
                    </>
                  ) : null}
                </div>
                <p>
                  <strong>{review.plan.action}</strong> · {review.plan.changes.length} files ·{" "}
                  {review.plan.affectedLinks} links · {review.plan.affectedIndexes} indexes
                </p>
                <p>{review.plan.retrievalConsequence}</p>
                {review.plan.warnings.map((warning) => (
                  <p key={warning} className="concept-move-summary__warning">{warning}</p>
                ))}
              </section>

              <ul className="concept-move-files" aria-label="Retirement file review">
                {review.plan.changes.map((change) => {
                  const diff = diffs[change.path];
                  return (
                    <li key={change.path} data-kind={change.kind}>
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
                  aria-label="Concept retirement validation"
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
                  disabled={busy || !allHunksKept}
                  onClick={() => void validate()}
                >
                  Validate
                </button>
                <button
                  type="button"
                  className={review.plan.action === "delete" ? "btn danger" : "btn primary"}
                  disabled={busy || !validation || validation.errors > 0}
                  onClick={() => void apply()}
                >
                  Apply {review.plan.action}
                </button>
              </footer>
            </div>
          ) : null}

          {result.status !== "idle" ? (
            <section className="concept-move-result" role="status">
              <Check size={20} aria-hidden="true" />
              <h3>{result.status === "applied" ? "Retirement applied" : "Retirement restored"}</h3>
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
                    {review?.plan.replacementId ? (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => onOpenConcept(review.plan.replacementId ?? concept.id)}
                      >
                        Open replacement
                      </button>
                    ) : (
                      <button type="button" className="btn primary" onClick={close}>Done</button>
                    )}
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
