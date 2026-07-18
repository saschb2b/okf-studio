import { ArrowLeft, FileText, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { RetrievalResult, RetrievalRoute } from "@/features/agent/retrieval/types.ts";
import { RETRIEVAL_ROUTES } from "@/features/agent/retrieval/types.ts";
import { routeLabel } from "./RetrievalEvidenceSummary.tsx";
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
          <h3 id={titleId}>Evidence for this answer</h3>
          <p title={result.manifest.bundleFingerprint}>
            {result.manifest.bundleName} · {shortFingerprint(result.manifest.bundleFingerprint)}
          </p>
        </div>
      </header>
      <div className="retrieval-workspace__body">
        {rerunError && (
          <div className="retrieval-inspector__error" role="alert">
            <ShieldAlert size={16} aria-hidden="true" />
            <p>Rerun failed. {rerunError}</p>
          </div>
        )}
        <section className="retrieval-inspector__route" aria-labelledby={`${titleId}-route`}>
          <div>
            <h4 id={`${titleId}-route`}>{routeLabel(result.receipt.route)}</h4>
            <p>{result.receipt.routeReason}</p>
          </div>
          <label>
            Route
            <select
              value={result.receipt.route}
              disabled={rerunning}
              onChange={(event) => onRerun(event.target.value as RetrievalRoute)}
            >
              {RETRIEVAL_ROUTES.map((route) => (
                <option key={route.id} value={route.id}>{route.label}</option>
              ))}
            </select>
          </label>
        </section>

        {result.evidence.caveats.length > 0 && (
          <section className="retrieval-inspector__caveats" aria-label="Evidence caveats">
            <ShieldAlert size={16} aria-hidden="true" />
            <ul>
              {result.evidence.caveats.map((caveat) => (
                <li key={`${caveat.kind}:${caveat.conceptIds.join(":")}`}>{caveat.message}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="retrieval-inspector__section" aria-labelledby={`${titleId}-included`}>
          <header>
            <h4 id={`${titleId}-included`}>Included evidence</h4>
            <span>{result.receipt.contextTokensUsed} of {result.receipt.contextBudgetTokens} tokens</span>
          </header>
          {result.evidence.items.length === 0 ? (
            <div className="retrieval-workspace__empty">
              <h5>No evidence matched</h5>
              <p>{result.diagnostic.suggestedAction}</p>
            </div>
          ) : (
            <ol className="retrieval-evidence-list">
              {result.evidence.items.map((item) => (
                <li key={item.sectionId}>
                  <button type="button" onClick={() => onOpenConcept(item.conceptId)}>
                    <FileText size={15} aria-hidden="true" />
                    <span>
                      <strong>{item.conceptTitle}</strong>
                      <small>{item.headingPath.join(" / ") || item.conceptId} · lines {item.sourceRange.startLine}–{item.sourceRange.endLine}</small>
                    </span>
                  </button>
                  <p>{boundedExcerpt(item.text)}</p>
                  {item.relationshipPath.length > 1 && (
                    <code>{item.relationshipPath.join(" → ")}</code>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="retrieval-inspector__section" aria-labelledby={`${titleId}-candidates`}>
          <header>
            <h4 id={`${titleId}-candidates`}>Candidate decisions</h4>
            <span>{result.receipt.candidates.length} ranked</span>
          </header>
          <div className="retrieval-candidate-table" role="table" aria-label="Retrieval candidates">
            {result.receipt.candidates.map((candidate) => (
              <div role="row" key={candidate.sectionId} data-included={candidate.included || undefined}>
                <span role="cell" title={candidate.conceptId}>{candidate.conceptId}</span>
                <span role="cell">{candidate.score.total.toFixed(1)}</span>
                <span role="cell">
                  {candidate.included ? "Included" : candidate.exclusion?.reason.replaceAll("-", " ") ?? "Not selected"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="retrieval-inspector__section" aria-labelledby={`${titleId}-providers`}>
          <header><h4 id={`${titleId}-providers`}>Provider boundary</h4></header>
          <ul className="retrieval-provider-list">
            {result.receipt.providers.map((provider) => (
              <li key={provider.capability}>
                <strong>{provider.capability.replaceAll("-", " ")}</strong>
                <span>{provider.state}</span>
                <p>{provider.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <footer className="retrieval-workspace__footer">
        <span>{result.diagnostic.summary}</span>
        <button
          type="button"
          className="btn primary"
          disabled={rerunning}
          onClick={() => onRerun(result.receipt.route)}
        >
          <RefreshCw size={14} aria-hidden="true" /> {rerunning ? "Rerunning…" : "Rerun"}
        </button>
      </footer>
    </section>
  );
}

function shortFingerprint(fingerprint: string): string {
  return fingerprint.length > 18 ? `${fingerprint.slice(0, 18)}…` : fingerprint;
}

function boundedExcerpt(text: string): string {
  const normalized = text.replaceAll(/\s+/g, " ").trim();
  return normalized.length > 320 ? `${normalized.slice(0, 319)}…` : normalized;
}
