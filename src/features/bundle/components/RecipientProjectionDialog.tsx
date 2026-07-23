import { Dialog } from "@base-ui/react/dialog";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FolderOutput,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { exportOkfProjection, planOkfProjection } from "@/shared/ipc.ts";
import { KNOWN_SENSITIVITIES, type KnownSensitivity } from "@/shared/access.ts";
import type { Bundle } from "@/shared/types.ts";
import type {
  ProjectionExportInput,
  ProjectionExportResult,
  ProjectionInput,
  ProjectionPlan,
} from "@/features/bundle/projection.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./RecipientProjectionDialog.css";

type PlanProjection = (bundleRoot: string, input: ProjectionInput) => Promise<ProjectionPlan>;
type ExportProjection = (
  bundleRoot: string,
  input: ProjectionExportInput,
) => Promise<ProjectionExportResult | null>;

interface RecipientProjectionDialogProps {
  open: boolean;
  bundle: Bundle;
  onOpenChange: (open: boolean) => void;
  planProjection?: PlanProjection;
  exportProjection?: ExportProjection;
}

const OMISSION_LABELS: Record<ProjectionPlan["omissions"][number]["reason"], string> = {
  "not-selected": "Not part of this copy",
  "audience-mismatch": "Does not match the optional audience filter",
  "sensitivity-exceeds-maximum": "Above the chosen sensitivity limit",
  "unknown-sensitivity": "Has no recognized sensitivity label",
  "ignored-by-rule": "Excluded by .okfignore",
};

export function RecipientProjectionDialog({
  open,
  bundle,
  onOpenChange,
  planProjection = planOkfProjection,
  exportProjection = exportOkfProjection,
}: RecipientProjectionDialogProps) {
  const [recipient, setRecipient] = useState("");
  const [audiences, setAudiences] = useState("");
  const [maxSensitivity, setMaxSensitivity] = useState<KnownSensitivity>("internal");
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [sensitiveTerms, setSensitiveTerms] = useState("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<ProjectionPlan | null>(null);
  const [result, setResult] = useState<ProjectionExportResult | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [busy, setBusy] = useState<"plan" | "export" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim().toLocaleLowerCase();
  const visibleConcepts = bundle.concepts.filter((concept) =>
    needle.length === 0 ||
    concept.title.toLocaleLowerCase().includes(needle) ||
    concept.id.toLocaleLowerCase().includes(needle) ||
    concept.type.toLocaleLowerCase().includes(needle)
  );
  const input = projectionInput();
  const canPlan = input.recipient.length > 0 && input.selectedConceptIds.length > 0 && busy === null;
  const canExport = plan !== null && plan.included.length > 0 && busy === null;

  function projectionInput(): ProjectionInput {
    return {
      recipient: recipient.trim(),
      recipientAudiences: splitValues(audiences),
      maxSensitivity,
      includeUnknownSensitivity: includeUnknown,
      selectedConceptIds: [...selectedIds].sort(),
      sensitiveTerms: splitValues(sensitiveTerms),
    };
  }

  function invalidateReview() {
    setPlan(null);
    setResult(null);
    setOverwriteConfirmed(false);
    setError(null);
  }

  function reset() {
    setRecipient("");
    setAudiences("");
    setMaxSensitivity("internal");
    setIncludeUnknown(true);
    setSelectedIds(new Set());
    setSensitiveTerms("");
    setQuery("");
    setPlan(null);
    setResult(null);
    setOverwriteConfirmed(false);
    setBusy(null);
    setError(null);
  }

  async function reviewPlan() {
    if (!canPlan) return;
    setBusy("plan");
    setError(null);
    setResult(null);
    try {
      setPlan(await planProjection(bundle.root, input));
    } catch (raised: unknown) {
      setError(errorText(raised));
    }
    setBusy(null);
  }

  async function exportProjectionCopy() {
    if (!canExport) return;
    setBusy("export");
    setError(null);
    try {
      const exported = await exportProjection(bundle.root, {
        planRevision: plan.revision,
        projection: input,
        overwriteConfirmed,
      });
      if (exported) setResult(exported);
    } catch (raised: unknown) {
      setError(errorText(raised));
    }
    setBusy(null);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog projection-dialog" aria-label="Create a shareable bundle">
          <header className="ui-dialog-head projection-dialog__head">
            <div>
              <Dialog.Title className="ui-dialog-title">Create a shareable bundle</Dialog.Title>
              <Dialog.Description className="projection-dialog__description">
                Make a separate OKF bundle from the knowledge you choose. Your open bundle stays
                unchanged.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Close shareable bundle dialog">
              <X size={16} />
            </Dialog.Close>
          </header>

          <ol className="projection-steps" aria-label="Shareable bundle progress">
            <li className={plan === null ? "is-current" : "is-complete"}>
              <span>1</span>
              Choose content
            </li>
            <li className={plan === null ? "" : "is-current"}>
              <span>2</span>
              Review and save
            </li>
          </ol>

          <div className="projection-dialog__body">
            {plan === null ? (
              <section className="projection-choice" aria-labelledby="projection-choice-title">
                <div className="projection-name">
                  <div>
                    <h2 id="projection-choice-title">Who is this copy for?</h2>
                    <p>
                      Studio uses this name in the new bundle and its folder name.
                    </p>
                  </div>
                  <label>
                    <span>Recipient or group</span>
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- the explicit modal action should place focus in its first field
                      autoFocus
                      value={recipient}
                      disabled={busy !== null}
                      placeholder="Research partner"
                      onChange={(event) => {
                        setRecipient(event.target.value);
                        invalidateReview();
                      }}
                    />
                  </label>
                </div>

                <div className="projection-picker">
                  <div className="projection-section-head">
                    <div>
                      <h2>Choose what to share</h2>
                      <p>
                        Linked concepts may be added so the new bundle still makes sense. You will
                        see every addition and omission before saving.
                      </p>
                    </div>
                    <strong>{selectedIds.size} selected</strong>
                  </div>

                  <div className="projection-picker-tools">
                    <label className="projection-search">
                      <Search size={15} aria-hidden="true" />
                      <span className="sr-only">Find concepts</span>
                      <input
                        type="search"
                        value={query}
                        placeholder="Find a concept"
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy !== null}
                      onClick={() => {
                        setSelectedIds(new Set(bundle.concepts.map((concept) => concept.id)));
                        invalidateReview();
                      }}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy !== null || selectedIds.size === 0}
                      onClick={() => {
                        setSelectedIds(new Set());
                        invalidateReview();
                      }}
                    >
                      Clear
                    </button>
                  </div>

                  <details className="projection-safeguards">
                    <summary>
                      <span>
                        <ShieldCheck size={17} aria-hidden="true" />
                        Sharing safeguards
                      </span>
                      <small>Optional</small>
                    </summary>
                    <p>
                      Narrow the copy with advisory labels or remove exact text. Leave the audience
                      field empty to ignore audience labels.
                    </p>
                    <div className="projection-fields">
                      <label>
                        <span>Only these audiences</span>
                        <input
                          value={audiences}
                          disabled={busy !== null}
                          placeholder="partners, research"
                          onChange={(event) => {
                            setAudiences(event.target.value);
                            invalidateReview();
                          }}
                        />
                      </label>
                      <label>
                        <span>Include sensitivity up to</span>
                        <select
                          value={maxSensitivity}
                          disabled={busy !== null}
                          onChange={(event) => {
                            setMaxSensitivity(event.target.value as KnownSensitivity);
                            invalidateReview();
                          }}
                        >
                          {KNOWN_SENSITIVITIES.map((value) => (
                            <option key={value} value={value}>{sentenceCase(value)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="projection-field-wide">
                        <span>Text to remove</span>
                        <textarea
                          rows={2}
                          value={sensitiveTerms}
                          disabled={busy !== null}
                          placeholder="One exact word or phrase per line"
                          onChange={(event) => {
                            setSensitiveTerms(event.target.value);
                            invalidateReview();
                          }}
                        />
                      </label>
                    </div>
                    <label className="projection-check">
                      <input
                        type="checkbox"
                        checked={includeUnknown}
                        disabled={busy !== null}
                        onChange={(event) => {
                          setIncludeUnknown(event.target.checked);
                          invalidateReview();
                        }}
                      />
                      Include selected concepts without a recognized sensitivity label
                    </label>
                    <p className="projection-guidance">
                      These labels help with review. They are not access control, encryption, or proof
                      that the source was classified correctly.
                    </p>
                  </details>

                  <ul className="projection-concepts" aria-label="Concepts to share">
                    {visibleConcepts.map((concept) => {
                      const selected = selectedIds.has(concept.id);
                      return (
                        <li key={concept.id} className={selected ? "is-selected" : ""}>
                          <label>
                            <input
                              aria-label={`Share ${concept.title}`}
                              type="checkbox"
                              checked={selected}
                              disabled={busy !== null}
                              onChange={(event) => {
                                const next = new Set(selectedIds);
                                if (event.target.checked) next.add(concept.id);
                                else next.delete(concept.id);
                                setSelectedIds(next);
                                invalidateReview();
                              }}
                            />
                            <span>
                              <strong>{concept.title}</strong>
                              <small>{concept.type} · {concept.id}</small>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {visibleConcepts.length === 0 ? (
                      <li className="projection-concepts__empty">No concepts match “{query}”.</li>
                    ) : null}
                  </ul>
                </div>

                {error && <p className="projection-error" role="alert">{error}</p>}
              </section>
            ) : (
              <section className="projection-review" aria-label="Review shareable bundle">
                <ProjectionPlanReview plan={plan} />
                {result && <ProjectionResult result={result} />}
                {result?.status === "existing-destination" && (
                  <label className="projection-replace">
                    <input
                      type="checkbox"
                      checked={overwriteConfirmed}
                      onChange={(event) => setOverwriteConfirmed(event.target.checked)}
                    />
                    Replace the existing copy only if it was created by OKF Studio
                  </label>
                )}
                {error && <p className="projection-error" role="alert">{error}</p>}
              </section>
            )}
          </div>

          <footer className="ui-dialog-foot projection-dialog__foot">
            <p aria-live="polite">
              {busy === "plan" && "Preparing the preview…"}
              {busy === "export" && "Creating and checking the new bundle…"}
              {busy === null && plan === null && (
                recipient.trim().length === 0
                  ? "Name the recipient and choose at least one concept."
                  : selectedIds.size === 0
                    ? "Choose at least one concept."
                    : "Ready to preview. Nothing has been written."
              )}
              {busy === null && plan !== null && result === null && plan.included.length > 0 &&
                `${plan.included.length} concepts are ready for the new bundle.`}
              {busy === null && plan !== null && result === null && plan.included.length === 0 &&
                "Adjust your selection or safeguards before saving."}
            </p>
            {plan === null ? (
              <>
                <Dialog.Close className="btn ghost" disabled={busy !== null}>Cancel</Dialog.Close>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canPlan}
                  onClick={() => void reviewPlan()}
                >
                  {busy === "plan" ? "Preparing…" : "Preview bundle"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy !== null}
                  onClick={invalidateReview}
                >
                  <ArrowLeft size={15} />
                  Back to selection
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canExport ||
                    (result?.status === "existing-destination" && !overwriteConfirmed)}
                  onClick={() => void exportProjectionCopy()}
                >
                  <FolderOutput size={15} />
                  {busy === "export"
                    ? "Creating…"
                    : result?.status === "existing-destination"
                      ? "Choose location and replace"
                      : "Choose save location"}
                </button>
              </>
            )}
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProjectionPlanReview({ plan }: { plan: ProjectionPlan }) {
  const linkChanges = sumOccurrences(plan.linkConsequences);
  const exactRedactions = sumOccurrences(plan.redactions);
  const unlabelledIncluded = plan.included.filter((concept) =>
    concept.access.knownSensitivity === null
  ).length;
  const otherWarnings = plan.warnings.filter((warning) =>
    !warning.startsWith("No selected concept passed")
  );

  return (
    <div className="projection-plan">
      <div className={`projection-review-intro${plan.included.length === 0 ? " is-blocked" : ""}`}>
        {plan.included.length === 0 ? (
          <AlertTriangle size={20} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={20} aria-hidden="true" />
        )}
        <div>
          <h2>
            {plan.included.length === 0
              ? "Nothing can be shared with these safeguards"
              : "Your new bundle is ready to save"}
          </h2>
          <p>
            {plan.included.length === 0
              ? "Every selected concept was left out. Go back and adjust the audience or sensitivity settings."
              : <>Studio will create <code>{plan.destinationFolderName}</code> inside the folder you choose.</>}
          </p>
        </div>
      </div>

      <dl className="projection-summary" aria-label="Bundle preview summary">
        <div>
          <dt>{plan.included.length}</dt>
          <dd>In new bundle</dd>
        </div>
        <div>
          <dt>{plan.omissions.length}</dt>
          <dd>Left out</dd>
        </div>
        <div>
          <dt>{linkChanges}</dt>
          <dd>Link updates</dd>
        </div>
        <div>
          <dt>{exactRedactions}</dt>
          <dd>Text removals</dd>
        </div>
      </dl>

      {unlabelledIncluded > 0 ? (
        <p className="projection-notice">
          <ShieldCheck size={16} aria-hidden="true" />
          {unlabelledIncluded} included {plural(unlabelledIncluded, "concept has", "concepts have")} no
          recognized sensitivity label. Your safeguards allow unlabeled content.
        </p>
      ) : null}
      {otherWarnings.map((warning) => (
        <p className="projection-warning" key={warning}>
          <AlertTriangle size={15} aria-hidden="true" /> {warning}
        </p>
      ))}

      <details open>
        <summary>What will be shared ({plan.included.length})</summary>
        {plan.included.length === 0 ? (
          <p>No concepts passed the selected safeguards.</p>
        ) : (
          <ul>
            {plan.included.map((concept) => (
              <li key={concept.id}>
                <strong>{concept.title}</strong>
                <span>
                  {concept.reason === "explicit"
                    ? "You selected this"
                    : `Included because it is linked from ${concept.linkedFrom ?? "another concept"}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details>
        <summary>What will stay behind ({plan.omissions.length})</summary>
        <ul>
          {plan.omissions.map((omission) => (
            <li key={`${omission.kind}:${omission.id}`}>
              <strong>{omission.title}</strong>
              <span>{OMISSION_LABELS[omission.reason]}</span>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Link updates ({linkChanges})</summary>
        {plan.linkConsequences.length === 0 ? (
          <p>No links need to change.</p>
        ) : (
          <ul>
            {plan.linkConsequences.map((link) => (
              <li key={`${link.sourceId}:${link.target}:${link.outcome}`}>
                <strong>{link.sourceId} → {link.target}</strong>
                <span>
                  {link.outcome === "rewritten-omitted"
                    ? "Will point to an omission note"
                    : "Was already broken in the source"}
                  {" "}({link.occurrences})
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details>
        <summary>Text removals ({exactRedactions})</summary>
        {plan.redactions.length === 0 ? (
          <p>No requested text appears in the shared concepts.</p>
        ) : (
          <ul>
            {plan.redactions.map((redaction) => (
              <li key={`${redaction.file}:${redaction.category}:${redaction.value}`}>
                <strong>{redaction.value}</strong>
                <span>{redaction.file} · {redaction.occurrences} occurrence(s)</span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details className="projection-technical">
        <summary>How Studio protects the source</summary>
        <p>
          Preview fingerprint <code>{plan.sourceBundleFingerprint.slice(0, 16)}</code>. Studio
          cancels the save if the source or these choices change. It validates the new bundle and
          checks that omitted names and requested text did not leak before moving it into place.
        </p>
      </details>
    </div>
  );
}

export function ProjectionResult({ result }: { result: ProjectionExportResult }) {
  const exported = result.status === "exported";
  return (
    <div className={`projection-result projection-result--${result.status}`} role="status">
      <h2>
        {exported ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
        {exported && "Shareable bundle created"}
        {result.status === "blocked-by-audit" && "Save blocked by the privacy check"}
        {result.status === "existing-destination" && "A copy with this name already exists"}
      </h2>
      <p>
        {exported
          ? result.destination
          : result.status === "blocked-by-audit"
            ? "Studio removed the temporary copy. Review the audit report before trying again."
            : "Studio left the existing folder unchanged. Replacement is allowed only for a copy previously created by OKF Studio."}
      </p>
      <dl>
        <div><dt>Source unchanged</dt><dd>{result.sourceUnchanged ? "Yes" : "No"}</dd></div>
        <div><dt>Bundle check</dt><dd>{result.validation.errors} errors, {result.validation.warnings} warnings</dd></div>
        <div><dt>Privacy check</dt><dd>{result.audit.passed ? "Passed" : `${result.audit.findings.length} finding(s)`}</dd></div>
        <div><dt>Audit report</dt><dd>{result.auditReport}</dd></div>
      </dl>
      {result.audit.findings.length > 0 && (
        <ul>
          {result.audit.findings.map((finding) => (
            <li key={`${finding.path}:${finding.category}:${finding.value}`}>
              {finding.path}: {finding.category} “{finding.value}” ({finding.occurrences})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function splitValues(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function sentenceCase(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function sumOccurrences(items: readonly { occurrences: number }[]): number {
  return items.reduce((sum, item) => sum + item.occurrences, 0);
}

function plural(count: number, singular: string, multiple: string): string {
  return count === 1 ? singular : multiple;
}

function errorText(raised: unknown): string {
  return raised instanceof Error ? raised.message : String(raised);
}
