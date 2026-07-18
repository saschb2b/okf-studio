import { Database, Network, Search, TriangleAlert } from "lucide-react";
import type { RetrievalResult } from "@/features/agent/retrieval/types.ts";
import "./RetrievalWorkspace.css";

interface RetrievalEvidenceSummaryProps {
  result: RetrievalResult;
  onInspect: () => void;
}

export function RetrievalEvidenceSummary({ result, onInspect }: RetrievalEvidenceSummaryProps) {
  const remote = result.receipt.providers.some((provider) => provider.remoteTextShared);
  const caveatCount = result.evidence.caveats.length + result.receipt.omissions.length;
  return (
    <section className="retrieval-summary" aria-label="Evidence used for this answer">
      <div className="retrieval-summary__identity">
        <Search size={15} aria-hidden="true" />
        <div>
          <strong>{routeLabel(result.receipt.route)}</strong>
          <span>
            {result.evidence.items.length} evidence item{result.evidence.items.length === 1 ? "" : "s"}
            {caveatCount > 0 ? ` · ${caveatCount} caveat${caveatCount === 1 ? "" : "s"}` : ""}
          </span>
        </div>
      </div>
      <div className="retrieval-summary__scope">
        <Database size={14} aria-hidden="true" />
        <span title={result.manifest.bundleName}>{result.manifest.bundleName}</span>
        {remote ? (
          <span className="retrieval-summary__network">
            <Network size={14} aria-hidden="true" /> Remote text shared
          </span>
        ) : (
          <span>Local only</span>
        )}
        {result.evidence.requiresAbstention && (
          <span className="retrieval-summary__warning">
            <TriangleAlert size={14} aria-hidden="true" /> Answer must qualify uncertainty
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn ghost"
        data-retrieval-receipt={result.receipt.receiptId}
        onClick={onInspect}
      >
        Inspect evidence
      </button>
    </section>
  );
}

export function routeLabel(route: RetrievalResult["receipt"]["route"]): string {
  switch (route) {
    case "exact-lexical": return "Exact and lexical";
    case "lexical-graph": return "Related concepts";
    case "coverage": return "Bundle coverage";
    case "temporal-conflict": return "Current and conflicting";
    case "structured": return "Structured evidence";
    case "full-context": return "Full bundle";
    case "hybrid-fallback": return "Local hybrid";
  }
}
