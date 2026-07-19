import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { evidenceAssessment, routeLabel } from "@/features/agent/retrieval/presentation.ts";
import type {
  ProviderReceipt,
  RetrievalOmission,
  RetrievalResult,
  RetrievalRoute,
} from "@/features/agent/retrieval/types.ts";
import { RETRIEVAL_ROUTES } from "@/features/agent/retrieval/types.ts";
import { plainExcerpt } from "@/shared/render/markdown.ts";
import "./RetrievalWorkspace.css";

interface RetrievalInspectorProps {
  result: RetrievalResult;
  rerunning?: boolean;
  rerunError?: string | null;
  onClose: () => void;
  onOpenConcept: (conceptId: string) => void;
  onRerun: (route: RetrievalRoute) => void;
}

export function RetrievalInspector({
  result,
  rerunning = false,
  rerunError = null,
  onClose,
  onOpenConcept,
  onRerun,
}: RetrievalInspectorProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedRoute, setSelectedRoute] = useState(result.receipt.route);
  const assessment = evidenceAssessment(result);
  const conflictConceptIds = new Set(
    result.evidence.caveats
      .filter((caveat) => caveat.kind === "conflict")
      .flatMap((caveat) => caveat.conceptIds),
  );
  const conceptCount = new Set(result.evidence.items.map((item) => item.conceptId)).size;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <section className="retrieval-inspector" aria-labelledby={titleId}>
      <header className="retrieval-workspace__header">
        <button ref={closeRef} type="button" className="btn ghost" onClick={onClose}>
          <ArrowLeft size={15} aria-hidden="true" /> Conversation
        </button>
        <div>
          <h3 id={titleId}>Evidence behind this answer</h3>
          <p>{result.evidence.items.length} excerpts from {result.manifest.bundleName}</p>
        </div>
      </header>

      <div className="retrieval-workspace__body">
        {rerunError && (
          <div className="retrieval-inspector__error" role="alert">
            <ShieldAlert size={16} aria-hidden="true" />
            <div>
              <strong>Evidence search failed</strong>
              <p>{rerunError}</p>
            </div>
          </div>
        )}

        <section
          className={`retrieval-inspector__assessment retrieval-inspector__assessment--${assessment.tone}`}
          aria-labelledby={`${titleId}-assessment`}
        >
          {assessment.tone === "warning"
            ? <TriangleAlert size={18} aria-hidden="true" />
            : <CheckCircle2 size={18} aria-hidden="true" />}
          <div>
            <h4 id={`${titleId}-assessment`}>{assessment.title}</h4>
            <p>{assessment.description}</p>
            {result.diagnostic.class === "conflicting-evidence" && (
              <p>
                Sources that may conflict are marked below. This is about the source material,
                not an app error.
              </p>
            )}
          </div>
        </section>

        {result.evidence.caveats.length > 0 && (
          <section className="retrieval-inspector__explanation" aria-labelledby={`${titleId}-explanation`}>
            <h4 id={`${titleId}-explanation`}>What Studio noticed</h4>
            <ul>
              {result.evidence.caveats.map((caveat) => (
                <li key={`${caveat.kind}:${caveat.conceptIds.join(":")}`}>{caveat.message}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="retrieval-inspector__section" aria-labelledby={`${titleId}-included`}>
          <header>
            <div>
              <h4 id={`${titleId}-included`}>Sources used</h4>
              <p>Open a source to read the excerpt in its full concept.</p>
            </div>
            <span>{result.evidence.items.length} excerpts · {conceptCount} concepts</span>
          </header>
          {result.evidence.items.length === 0 ? (
            <div className="retrieval-workspace__empty">
              <h5>No supporting evidence found</h5>
              <p>{result.diagnostic.suggestedAction}</p>
            </div>
          ) : (
            <ol className="retrieval-evidence-list">
              {result.evidence.items.map((item) => {
                const mayConflict = conflictConceptIds.has(item.conceptId);
                return (
                  <li key={item.sectionId} data-conflict={mayConflict || undefined}>
                    <button type="button" onClick={() => onOpenConcept(item.conceptId)}>
                      <FileText size={15} aria-hidden="true" />
                      <span>
                        <span className="retrieval-evidence-list__title">
                          <strong>{item.conceptTitle}</strong>
                          {mayConflict && <em>May conflict</em>}
                        </span>
                        <small>
                          {item.headingPath.join(" / ") || item.conceptId} · lines {item.sourceRange.startLine}–{item.sourceRange.endLine}
                        </small>
                      </span>
                    </button>
                    <p>{plainExcerpt(item.text, 320)}</p>
                    {item.relationshipPath.length > 1 && (
                      <code>{item.relationshipPath.join(" → ")}</code>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <SearchAgain
          titleId={titleId}
          route={selectedRoute}
          rerunning={rerunning}
          onRouteChange={setSelectedRoute}
          onRerun={() => onRerun(selectedRoute)}
        />

        <TechnicalDetails titleId={titleId} result={result} />
      </div>
    </section>
  );
}

interface SearchAgainProps {
  titleId: string;
  route: RetrievalRoute;
  rerunning: boolean;
  onRouteChange: (route: RetrievalRoute) => void;
  onRerun: () => void;
}

function SearchAgain({
  titleId,
  route,
  rerunning,
  onRouteChange,
  onRerun,
}: SearchAgainProps) {
  return (
    <section className="retrieval-inspector__search" aria-labelledby={`${titleId}-search`}>
      <div>
        <h4 id={`${titleId}-search`}>Search for different evidence</h4>
        <p>
          Try another search approach if these sources are not useful. This updates the evidence
          view only; it does not resend your prompt or rewrite the answer.
        </p>
      </div>
      <div className="retrieval-inspector__search-controls">
        <label>
          Search method
          <select
            value={route}
            disabled={rerunning}
            onChange={(event) => onRouteChange(event.target.value as RetrievalRoute)}
          >
            {RETRIEVAL_ROUTES.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" disabled={rerunning} onClick={onRerun}>
          <RefreshCw size={14} aria-hidden="true" />
          {rerunning ? "Searching…" : "Search evidence again"}
        </button>
      </div>
      <p className="retrieval-inspector__search-status" aria-live="polite">
        {rerunning ? "Searching the bundle for a new set of evidence…" : ""}
      </p>
    </section>
  );
}

function TechnicalDetails({ titleId, result }: { titleId: string; result: RetrievalResult }) {
  return (
    <details className="retrieval-inspector__technical">
      <summary>
        <span>
          <strong>Technical details</strong>
          <small>Search method, ranked candidates, capabilities, and receipt ID</small>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="retrieval-inspector__technical-body">
        <section aria-labelledby={`${titleId}-method`}>
          <h4 id={`${titleId}-method`}>How Studio searched</h4>
          <p><strong>{routeLabel(result.receipt.route)}.</strong> {result.receipt.routeReason}</p>
        </section>

        <section aria-labelledby={`${titleId}-candidates`}>
          <header>
            <h4 id={`${titleId}-candidates`}>Candidates considered</h4>
            <span>{result.receipt.candidates.length} ranked</span>
          </header>
          <div className="retrieval-candidate-table" role="table" aria-label="Retrieval candidates">
            <div role="row" className="retrieval-candidate-table__header">
              <span role="columnheader">Source</span>
              <span role="columnheader">Match</span>
              <span role="columnheader">Decision</span>
            </div>
            {result.receipt.candidates.map((candidate) => (
              <div role="row" key={candidate.sectionId} data-included={candidate.included || undefined}>
                <span role="cell" title={candidate.conceptId}>{candidate.conceptId}</span>
                <span role="cell">{candidate.score.total.toFixed(1)}</span>
                <span role="cell">{candidateDecision(candidate.included, candidate.exclusion)}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby={`${titleId}-providers`}>
          <h4 id={`${titleId}-providers`}>Search capabilities</h4>
          <p>
            Optional capabilities can improve matching, but Studio can search the local bundle
            without them. No source text leaves this device unless a capability says it was shared.
          </p>
          <ul className="retrieval-provider-list">
            {result.receipt.providers.map((provider) => (
              <li key={provider.capability}>
                <strong>{providerLabel(provider.capability)}</strong>
                <span>{providerState(provider)}</span>
                <p>{provider.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${titleId}-receipt`}>
          <h4 id={`${titleId}-receipt`}>Evidence receipt</h4>
          <p>
            Use this ID when comparing the same search across bundle revisions.
            <code>{result.receipt.receiptId}</code>
          </p>
        </section>
      </div>
    </details>
  );
}

function candidateDecision(included: boolean, omission: RetrievalOmission | null): string {
  if (included) return "Used in the answer";
  switch (omission?.reason) {
    case "filter-mismatch": return "Did not match the selected scope";
    case "duplicate-evidence": return "Duplicate of stronger evidence";
    case "context-budget": return "Did not fit the evidence limit";
    case "lower-rank": return "Ranked below the selected sources";
    case "missing-grant": return "Outside the granted bundle scope";
    case "stale-manifest": return "Bundle changed after ranking";
    case "provider-unavailable": return "Required search capability unavailable";
    case "unsupported-authority": return "Authority could not be established";
    case undefined: return "Not used";
  }
}

function providerLabel(capability: string): string {
  switch (capability) {
    case "local-retrieval": return "Local bundle search";
    case "dense-retrieval": return "Semantic matching";
    case "reranking": return "Result refinement";
    default: return capability.replaceAll("-", " ");
  }
}

function providerState(provider: ProviderReceipt): string {
  if (provider.remoteTextShared) return "Source text shared";
  switch (provider.state) {
    case "local": return "Local only";
    case "configured": return "Available";
    case "unavailable": return "Not configured";
    case "degraded": return "Limited";
    case "cancelled": return "Stopped";
  }
}
