import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
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
  "not-selected": "Not selected or linked from a retained concept",
  "audience-mismatch": "Audience does not match",
  "sensitivity-exceeds-maximum": "Sensitivity exceeds the reviewed maximum",
  "unknown-sensitivity": "Sensitivity is unknown",
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
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [sensitiveTerms, setSensitiveTerms] = useState("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<ProjectionPlan | null>(null);
  const [result, setResult] = useState<ProjectionExportResult | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [busy, setBusy] = useState<"plan" | "export" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleConcepts = bundle.concepts.filter((concept) => {
    const needle = query.trim().toLocaleLowerCase();
    return needle.length === 0 ||
      concept.title.toLocaleLowerCase().includes(needle) ||
      concept.id.toLocaleLowerCase().includes(needle) ||
      concept.type.toLocaleLowerCase().includes(needle);
  });
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
    setIncludeUnknown(false);
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
        <Dialog.Popup className="ui-dialog projection-dialog" aria-label="Recipient projection">
          <header className="ui-dialog-head projection-dialog__head">
            <div>
              <Dialog.Title className="ui-dialog-title">Recipient projection</Dialog.Title>
              <Dialog.Description className="projection-dialog__description">
                Build a separate, least-disclosure copy. The source bundle is never edited.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Close recipient projection">
              <X size={16} />
            </Dialog.Close>
          </header>

          <div
            className={`projection-dialog__body${plan ? " projection-dialog__body--reviewed" : ""}`}
          >
            <section className="projection-config" aria-label="Projection choices">
              <div className="projection-fields">
                <label>
                  <span>Recipient</span>
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- the explicit modal action should place focus in its first field
                    autoFocus
                    value={recipient}
                    disabled={busy !== null}
                    placeholder="Partner team"
                    onChange={(event) => {
                      setRecipient(event.target.value);
                      invalidateReview();
                    }}
                  />
                </label>
                <label>
                  <span>Recipient audiences</span>
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
                  <span>Maximum sensitivity</span>
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
                <label>
                  <span>Exact text to redact</span>
                  <textarea
                    rows={2}
                    value={sensitiveTerms}
                    disabled={busy !== null}
                    placeholder="One term per line"
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
                Include concepts with no sensitivity hint
              </label>
              <p className="projection-guidance">
                Audience and sensitivity fields are advisory handling hints, not access control.
                Studio applies them conservatively and shows every omission before export.
              </p>

              <div className="projection-concept-head">
                <label>
                  <span className="sr-only">Filter concepts</span>
                  <input
                    type="search"
                    value={query}
                    placeholder="Filter concepts"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <span>{selectedIds.size} selected</span>
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
              <ul className="projection-concepts" aria-label="Concepts to seed the projection">
                {visibleConcepts.map((concept) => (
                  <li key={concept.id}>
                    <label>
                      <input
                        aria-label={`Select ${concept.title}`}
                        type="checkbox"
                        checked={selectedIds.has(concept.id)}
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
                ))}
              </ul>
            </section>

            <section className="projection-review" aria-label="Reviewed projection plan">
              {plan === null ? (
                <div className="projection-empty">
                  <h2>Review before writing</h2>
                  <p>
                    Choose a recipient and seed concepts, then review the transitive inclusions,
                    exact omissions, link rewrites, and redactions.
                  </p>
                </div>
              ) : (
                <ProjectionPlanReview plan={plan} />
              )}
              {result && <ProjectionResult result={result} />}
              {result?.status === "existing-destination" && (
                <label className="projection-replace">
                  <input
                    type="checkbox"
                    checked={overwriteConfirmed}
                    onChange={(event) => setOverwriteConfirmed(event.target.checked)}
                  />
                  Replace only the marked prior OKF Studio projection at this destination
                </label>
              )}
              {error && <p className="projection-error" role="alert">{error}</p>}
            </section>
          </div>

          <footer className="ui-dialog-foot projection-dialog__foot">
            <p aria-live="polite">
              {busy === "plan" && "Building the read-only plan…"}
              {busy === "export" && "Writing and auditing the separate copy…"}
              {busy === null && plan === null && "No filesystem writes occur during review."}
              {busy === null && plan !== null && result === null &&
                `${plan.included.length} concepts ready for an explicit export.`}
            </p>
            <Dialog.Close className="btn ghost" disabled={busy !== null}>Cancel</Dialog.Close>
            {plan === null ? (
              <button type="button" className="btn primary" disabled={!canPlan} onClick={() => void reviewPlan()}>
                {busy === "plan" ? "Reviewing…" : "Review plan"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy !== null}
                  onClick={invalidateReview}
                >
                  Change choices
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canExport ||
                    (result?.status === "existing-destination" && !overwriteConfirmed)}
                  onClick={() => void exportProjectionCopy()}
                >
                  {busy === "export"
                    ? "Exporting…"
                    : result?.status === "existing-destination"
                      ? "Choose parent & replace"
                      : "Choose parent & export"}
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
  return (
    <div className="projection-plan">
      <div className="projection-plan__title">
        <div>
          <h2>Reviewed plan</h2>
          <p><code>{plan.destinationFolderName}</code></p>
        </div>
        <span>{plan.included.length} included · {plan.omissions.length} omitted</span>
      </div>
      <p className="projection-source-note">
        Source fingerprint <code>{plan.sourceBundleFingerprint.slice(0, 16)}</code>. Export is
        cancelled if the source changes after this review.
      </p>
      {plan.warnings.map((warning) => (
        <p className="projection-warning" key={warning}>
          <AlertTriangle size={15} /> {warning}
        </p>
      ))}
      <details open>
        <summary>Included concepts ({plan.included.length})</summary>
        <ul>
          {plan.included.map((concept) => (
            <li key={concept.id}>
              <strong>{concept.title}</strong>
              <span>
                {concept.reason === "explicit"
                  ? "Selected explicitly"
                  : `Linked from ${concept.linkedFrom ?? "a retained concept"}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Omissions ({plan.omissions.length})</summary>
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
        <summary>Link consequences ({sumOccurrences(plan.linkConsequences)})</summary>
        {plan.linkConsequences.length === 0 ? (
          <p>No retained link is affected.</p>
        ) : (
          <ul>
            {plan.linkConsequences.map((link) => (
              <li key={`${link.sourceId}:${link.target}:${link.outcome}`}>
                <strong>{link.sourceId} → {link.target}</strong>
                <span>
                  {link.outcome === "rewritten-omitted"
                    ? "Rewritten to the projection omissions note"
                    : "Already broken in the source"}
                  {" "}({link.occurrences})
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details>
        <summary>Exact redactions ({sumOccurrences(plan.redactions)})</summary>
        {plan.redactions.length === 0 ? (
          <p>No reviewed term occurs in retained concepts.</p>
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
    </div>
  );
}

export function ProjectionResult({ result }: { result: ProjectionExportResult }) {
  const exported = result.status === "exported";
  return (
    <div className={`projection-result projection-result--${result.status}`} role="status">
      <h2>
        {exported ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
        {exported && "Projection exported"}
        {result.status === "blocked-by-audit" && "Export blocked by erasure audit"}
        {result.status === "existing-destination" && "Destination already exists"}
      </h2>
      <p>
        {exported
          ? result.destination
          : result.status === "blocked-by-audit"
            ? "Studio removed the temporary copy. Inspect the retained audit before trying again."
            : "Studio did not replace the existing folder. Confirm replacement only if it is the prior marked projection."}
      </p>
      <dl>
        <div><dt>Source unchanged</dt><dd>{result.sourceUnchanged ? "Yes" : "No"}</dd></div>
        <div><dt>Validation</dt><dd>{result.validation.errors} errors, {result.validation.warnings} warnings</dd></div>
        <div><dt>Erasure audit</dt><dd>{result.audit.passed ? "Passed" : `${result.audit.findings.length} finding(s)`}</dd></div>
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

function errorText(raised: unknown): string {
  return raised instanceof Error ? raised.message : String(raised);
}
