import { ChevronRight, Network, Search, TriangleAlert } from "lucide-react";
import { evidenceStatus, routeLabel } from "@/features/agent/retrieval/presentation.ts";
import type { RetrievalResult } from "@/features/agent/retrieval/types.ts";
import "./RetrievalWorkspace.css";

interface RetrievalEvidenceSummaryProps {
  result: RetrievalResult;
  onInspect: () => void;
}

export function RetrievalEvidenceSummary({ result, onInspect }: RetrievalEvidenceSummaryProps) {
  const remote = result.receipt.providers.some((provider) => provider.remoteTextShared);
  const itemCount = result.evidence.items.length;
  const status = evidenceStatus(result);
  const route = routeLabel(result.receipt.route);
  const itemLabel = `${itemCount} excerpt${itemCount === 1 ? "" : "s"}`;
  const statusLabel = status ? `, ${status.label}: ${status.description}` : "";
  const remoteLabel = remote ? ", source text was shared with a remote provider" : "";

  return (
    <section className="retrieval-summary" aria-label="Evidence used for this answer">
      <button
        type="button"
        className="retrieval-summary__trigger"
        data-retrieval-receipt={result.receipt.receiptId}
        onClick={onInspect}
        aria-label={`Inspect evidence: ${itemLabel}, ${route}${statusLabel}${remoteLabel}`}
      >
        <Search size={15} aria-hidden="true" />
        <span className="retrieval-summary__copy">
          <span className="retrieval-summary__identity">{itemLabel} · {route}</span>
          {status && (
            <span className="retrieval-summary__status">
              <TriangleAlert size={14} aria-hidden="true" /> {status.label}
            </span>
          )}
          {remote && (
            <span className="retrieval-summary__status">
              <Network size={14} aria-hidden="true" /> Shared remotely
            </span>
          )}
        </span>
        <span className="retrieval-summary__action">Inspect</span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </section>
  );
}
