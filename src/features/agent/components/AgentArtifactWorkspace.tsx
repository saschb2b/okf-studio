import type { AgentArtifact, AgentCriticState } from "@/features/agent/artifact.ts";
import {
  AGENT_ARTIFACT_KIND_LABELS,
  applyArtifactFieldEdits,
} from "@/features/agent/artifact.ts";
import { ArrowLeft, CircleAlert, CircleHelp, ExternalLink, FileText, RotateCcw, ScanSearch, Send, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import "./AgentArtifactWorkspace.css";

const DISPLAY_ITEM_LIMIT = 100;

export type AgentArtifactWorkspaceState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "ready"; artifact: AgentArtifact; sentRevision: number | null }
  | { status: "stale"; artifact: AgentArtifact; message: string; sentRevision: number | null };

interface AgentArtifactWorkspaceProps {
  state: AgentArtifactWorkspaceState;
  criticState?: AgentCriticState;
  criticProviderName?: string;
  criticUnavailableReason?: string | null;
  selectedConceptId?: string | null;
  sending?: boolean;
  onShowConversation: () => void;
  onRetry?: () => void;
  onOpenConcept?: (conceptId: string) => void;
  onSendRevision?: (artifact: AgentArtifact, intent: "continue" | "export") => void;
  onRunCritic?: () => void;
}

export function AgentArtifactWorkspace({
  state,
  criticState = { status: "idle" },
  criticProviderName = "Selected agent",
  criticUnavailableReason = null,
  selectedConceptId = null,
  sending = false,
  onShowConversation,
  onRetry,
  onOpenConcept,
  onSendRevision,
  onRunCritic,
}: AgentArtifactWorkspaceProps) {
  if (state.status === "empty" || state.status === "loading" || state.status === "invalid") {
    return (
      <section className="agent-artifact agent-artifact--state" aria-label="OKF work artifact">
        <button type="button" className="btn ghost agent-artifact__back" onClick={onShowConversation}>
          <ArrowLeft size={14} aria-hidden="true" />
          Conversation
        </button>
        <div
          className="agent-artifact__state"
          role={state.status === "invalid" ? "alert" : "status"}
        >
          {state.status === "invalid" && <CircleAlert size={20} aria-hidden="true" />}
          <h3>
            {state.status === "loading"
              ? "Checking artifact"
              : state.status === "invalid"
                ? "Artifact kept as prose"
                : "No structured work yet"}
          </h3>
          <p>
            {state.status === "loading"
              ? "Studio is validating identity, citations, paths, and the bundle revision."
              : state.status === "invalid"
                ? state.message
                : "When an agent returns validated OKF work, it appears here without changing transcript order."}
          </p>
          {state.status === "invalid" && onRetry && (
            <button type="button" className="btn" onClick={onRetry}>
              <RotateCcw size={14} aria-hidden="true" />
              Validate again
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <ArtifactReadyView
      key={`${state.artifact.artifactId}:${state.artifact.revision}`}
      state={state}
      criticState={criticState}
      criticProviderName={criticProviderName}
      criticUnavailableReason={criticUnavailableReason}
      selectedConceptId={selectedConceptId}
      sending={sending}
      onShowConversation={onShowConversation}
      onRetry={onRetry}
      onOpenConcept={onOpenConcept}
      onSendRevision={onSendRevision}
      onRunCritic={onRunCritic}
    />
  );
}

interface ArtifactReadyViewProps {
  state: Extract<AgentArtifactWorkspaceState, { status: "ready" | "stale" }>;
  criticState: AgentCriticState;
  criticProviderName: string;
  criticUnavailableReason: string | null;
  selectedConceptId: string | null;
  sending: boolean;
  onShowConversation: () => void;
  onRetry?: () => void;
  onOpenConcept?: (conceptId: string) => void;
  onSendRevision?: (artifact: AgentArtifact, intent: "continue" | "export") => void;
  onRunCritic?: () => void;
}

function ArtifactReadyView({
  state,
  criticState,
  criticProviderName,
  criticUnavailableReason,
  selectedConceptId,
  sending,
  onShowConversation,
  onRetry,
  onOpenConcept,
  onSendRevision,
  onRunCritic,
}: ArtifactReadyViewProps) {
  const { artifact } = state;
  const titleId = useId();
  const fieldsId = useId();
  const conceptsId = useId();
  const itemsId = useId();
  const sourcesId = useId();
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(artifact.fields.map((field) => [field.id, field.value])),
  );
  const edited = artifact.fields.some(
    (field) => field.editable && fieldValues[field.id] !== field.value,
  );
  const displayedItems = artifact.items.slice(0, DISPLAY_ITEM_LIMIT);
  const hiddenItemCount = artifact.items.length - displayedItems.length;
  const revision = artifact.revision + 1;
  const writingRevision = artifact.kind === "writing-revision";
  const claimCounts = writingRevision
    ? Object.fromEntries(["unchanged", "reworded", "added", "removed"].map((status) => [
        status,
        artifact.items.filter((item) => item.status === status).length,
      ]))
    : null;

  function send(intent: "continue" | "export") {
    onSendRevision?.(applyArtifactFieldEdits(artifact, fieldValues), intent);
  }

  return (
    <section className="agent-artifact" aria-labelledby={titleId}>
      <header className="agent-artifact__header">
        <button type="button" className="btn ghost agent-artifact__back" onClick={onShowConversation}>
          <ArrowLeft size={14} aria-hidden="true" />
          Conversation
        </button>
        <div className="agent-artifact__identity">
          <span>{AGENT_ARTIFACT_KIND_LABELS[artifact.kind]}</span>
          <span>Revision {artifact.revision}</span>
          <span className={`agent-artifact__status agent-artifact__status--${artifact.status}`}>
            {artifact.status}
          </span>
        </div>
        <h3 id={titleId}>{artifact.title}</h3>
        <p>{artifact.summary}</p>
      </header>

      {state.status === "stale" && (
        <div className="agent-artifact__notice agent-artifact__notice--error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <div>
            <strong>Artifact update rejected</strong>
            <p>{state.message}</p>
          </div>
          {onRetry && (
            <button type="button" className="btn ghost" onClick={onRetry}>
              <RotateCcw size={14} aria-hidden="true" />
              Recheck
            </button>
          )}
        </div>
      )}

      {artifact.status === "partial" && (
        <div className="agent-artifact__notice" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <p>
            Partial artifact. Missing fields: {artifact.missingFields.join(", ") || "none reported"}.
          </p>
        </div>
      )}

      {artifact.large && (
        <div className="agent-artifact__notice" role="status">
          <p>Large artifact. Studio keeps this surface bounded and reports omitted rows below.</p>
        </div>
      )}

      <div className="agent-artifact__body">
        {claimCounts && (
          <section className="agent-artifact__writing-summary" aria-label="Writing change summary">
            <div>
              <strong>{claimCounts.added + claimCounts.removed === 0 ? "Wording only" : "Knowledge changes included"}</strong>
              <span>
                {claimCounts.reworded} reworded, {claimCounts.added} added, {claimCounts.removed} removed
              </span>
            </div>
            <p>
              {claimCounts.added + claimCounts.removed === 0
                ? "The ledger reports no added or removed claim. Review each mapping before staging."
                : "Added and removed claims change bundle knowledge and require evidence-backed review."}
            </p>
          </section>
        )}
        <ArtifactVerificationPanel
          artifact={artifact}
          criticState={criticState}
        criticProviderName={criticProviderName}
        criticUnavailableReason={criticUnavailableReason}
          onRunCritic={onRunCritic}
        />
        {artifact.fields.length > 0 && (
          <section className="agent-artifact__section" aria-labelledby={fieldsId}>
            <h4 id={fieldsId}>{writingRevision ? "Revision context" : "Planning fields"}</h4>
            <dl className="agent-artifact__fields">
              {artifact.fields.map((field) => (
                <div key={field.id} className="agent-artifact__field">
                  <dt><label htmlFor={`agent-artifact-field-${field.id}`}>{field.label}</label></dt>
                  <dd>
                    {field.editable && state.status !== "stale" ? (
                      <textarea
                        id={`agent-artifact-field-${field.id}`}
                        value={fieldValues[field.id] ?? ""}
                        rows={Math.min(6, Math.max(2, fieldValues[field.id].split("\n").length + 1))}
                        onChange={(event) => setFieldValues((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))}
                      />
                    ) : (
                      <p>{field.value || "Not supplied"}</p>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {artifact.conceptReferences.length > 0 && (
          <section className="agent-artifact__section" aria-labelledby={conceptsId}>
            <h4 id={conceptsId}>Concepts</h4>
            <ul className="agent-artifact__links">
              {artifact.conceptReferences.map((concept) => (
                <li key={concept.path}>
                  <button
                    type="button"
                    className="agent-artifact__concept"
                    data-selected={concept.conceptId === selectedConceptId || undefined}
                    disabled={!concept.exists || !onOpenConcept}
                    onClick={() => onOpenConcept?.(concept.conceptId)}
                  >
                    <FileText size={14} aria-hidden="true" />
                    <span>{concept.path}</span>
                    {!concept.exists && <small>Proposed</small>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {displayedItems.length > 0 && (
          <section className="agent-artifact__section" aria-labelledby={itemsId}>
            <h4 id={itemsId}>{writingRevision ? "Claim ledger" : "Work items"}</h4>
            <ol className="agent-artifact__items">
              {displayedItems.map((item) => (
                <li key={item.id}>
                  <div className="agent-artifact__item-heading">
                    <strong>{item.label}</strong>
                    <span>{item.status.replace("-", " ")}</span>
                  </div>
                  <p>{item.detail || "No detail supplied."}</p>
                  {writingRevision && Boolean(item.before ?? item.after) && (
                    <div className="agent-artifact__claim-comparison">
                      <div>
                        <span>Before</span>
                        <p>{item.before ?? "No prior claim"}</p>
                      </div>
                      <div>
                        <span>After</span>
                        <p>{item.after ?? "Claim removed"}</p>
                      </div>
                    </div>
                  )}
                  {item.conceptPath && (
                    <small><FileText size={12} aria-hidden="true" />{item.conceptPath}</small>
                  )}
                </li>
              ))}
            </ol>
            {hiddenItemCount > 0 && (
              <p className="agent-artifact__truncation">
                {hiddenItemCount} more work items remain in the validated artifact.
              </p>
            )}
          </section>
        )}

        {artifact.sources.length > 0 && (
          <section className="agent-artifact__section" aria-labelledby={sourcesId}>
            <h4 id={sourcesId}>Sources and citations</h4>
            <ul className="agent-artifact__sources">
              {artifact.sources.map((source) => (
                <li key={source.id}>
                  <strong>{source.label}</strong>
                  <span>{source.kind}</span>
                  <code>{source.reference}</code>
                  {source.kind === "external" && <ExternalLink size={12} aria-hidden="true" />}
                </li>
              ))}
            </ul>
            {artifact.citations.length > 0 && (
              <ol className="agent-artifact__citations">
                {artifact.citations.map((citation, index) => (
                  <li key={`${citation.sourceId}:${index}`}>
                    <span>{citation.claim}</span>
                    <small>{citation.sourceId}</small>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>

      <footer className="agent-artifact__footer">
        <div>
          {edited && <span>Local edits are not sent</span>}
          {state.sentRevision !== null && <span>Sent revision {state.sentRevision}</span>}
        </div>
        <button
          type="button"
          className="btn ghost"
          disabled={sending || state.status === "stale" || !onSendRevision}
          onClick={() => send("export")}
        >
          Export through staging
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={sending || state.status === "stale" || !onSendRevision}
          onClick={() => send("continue")}
        >
          <Send size={14} aria-hidden="true" />
          {sending ? "Sending..." : `Send revision ${revision}`}
        </button>
      </footer>
    </section>
  );
}

interface ArtifactVerificationPanelProps {
  artifact: AgentArtifact;
  criticState: AgentCriticState;
  criticProviderName: string;
  criticUnavailableReason: string | null;
  onRunCritic?: () => void;
}

function ArtifactVerificationPanel({
  artifact,
  criticState,
  criticProviderName,
  criticUnavailableReason,
  onRunCritic,
}: ArtifactVerificationPanelProps) {
  const verificationId = useId();
  const criticId = useId();
  const verification = artifact.verification;
  const resultLabel = verification.completionBlocked
    ? `${verification.errors} blocking`
    : verification.warnings > 0
      ? `${verification.warnings} advisory`
      : "Checks passed";

  return (
    <section className="agent-artifact__verification" aria-labelledby={verificationId}>
      <header className="agent-artifact__verification-header">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <h4 id={verificationId}>Deterministic verification</h4>
          <p>Studio checks this exact artifact revision before any model critique.</p>
        </div>
        <span data-blocked={verification.completionBlocked || undefined}>{resultLabel}</span>
      </header>

      {verification.findings.length === 0 ? (
        <p className="agent-artifact__verification-empty">
          No deterministic completeness, identity, or evidence defect was found.
        </p>
      ) : (
        <ul className="agent-artifact__verification-findings">
          {verification.findings.map((finding) => (
            <li key={finding.ruleId} data-level={finding.level}>
              <strong>{finding.category}</strong>
              <span>{finding.message}</span>
              <small>{finding.ruleId} v{finding.ruleVersion}</small>
            </li>
          ))}
        </ul>
      )}

      <section className="agent-artifact__critic" aria-labelledby={criticId}>
        <header>
          <ScanSearch size={17} aria-hidden="true" />
          <div>
            <h5 id={criticId}>Independent critic</h5>
            <p>{criticProviderName} · separate read-only session</p>
          </div>
        </header>

        {criticState.status === "idle" && (
          <div className="agent-artifact__critic-action">
            <p>
              {criticUnavailableReason
                ?? (artifact.kind === "writing-revision"
                  ? "Optionally check clarity, structure, voice fit, and claim preservation. The critic cannot clear deterministic failures."
                  : "Optionally check semantic coverage and contradictions. The critic cannot clear deterministic failures.")}
            </p>
            <button type="button" className="btn ghost" disabled={!onRunCritic || criticUnavailableReason !== null} onClick={onRunCritic}>
              Run critic
            </button>
          </div>
        )}

        {criticState.status === "loading" && (
          <div className="agent-artifact__critic-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>Reviewing the bounded artifact context. Writes and permission escalation are disabled.</p>
          </div>
        )}

        {criticState.status === "error" && (
          <div className="agent-artifact__critic-state agent-artifact__critic-state--error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <div>
              <strong>Critic result unavailable</strong>
              <p>{criticState.message}</p>
            </div>
            <button type="button" className="btn ghost" disabled={!onRunCritic} onClick={onRunCritic}>
              Retry
            </button>
          </div>
        )}

        {criticState.status === "ready" && (
          <div className="agent-artifact__critic-report">
            <div className="agent-artifact__critic-outcome">
              <strong>{criticState.report.outcome.replaceAll("-", " ")}</strong>
              <span>
                {criticState.report.comparison.agreements.length} agreements ·{" "}
                {criticState.report.comparison.disagreements.length} disagreements ·{" "}
                {criticState.report.comparison.unverifiedQuestions.length} open questions
              </span>
              <button type="button" className="btn ghost" disabled={!onRunCritic} onClick={onRunCritic}>
                Run again
              </button>
            </div>

            <ul className="agent-artifact__critic-checks">
              {criticState.report.checks.map((check) => (
                <li key={check.category} data-status={check.status}>
                  <span>{check.category.replaceAll("-", " ")}</span>
                  <strong>{check.status}</strong>
                  <small>{check.detail}</small>
                </li>
              ))}
            </ul>

            {criticState.report.findings.length > 0 && (
              <ul className="agent-artifact__critic-findings">
                {criticState.report.findings.map((finding) => (
                  <li key={finding.id} data-severity={finding.severity}>
                    <CircleHelp size={14} aria-hidden="true" />
                    <div>
                      <strong>{finding.category.replaceAll("-", " ")}</strong>
                      <p>{finding.claim}</p>
                      <small>
                        {finding.references.map((reference) => `${reference.kind}:${reference.id}`).join(" · ")}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {(criticState.report.limitations.length > 0 || criticState.providerLimitations.length > 0) && (
              <details className="agent-artifact__critic-limitations">
                <summary>Capabilities and limitations</summary>
                <ul>
                  {criticState.report.limitations.map((limitation) => (
                    <li key={limitation.code}>{limitation.detail}</li>
                  ))}
                  {criticState.providerLimitations.map((limitation, index) => (
                    <li key={`${index}:${limitation}`}>{limitation}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
