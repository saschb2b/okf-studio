import { FileText, FolderTree, Link2, TriangleAlert, WandSparkles } from "lucide-react";
import type { BundleProposalParseResult } from "@/features/agent/bundleProposal.ts";
import "./AgentConversation.css";

interface BundleProposalPreviewProps {
  result: BundleProposalParseResult;
  onGenerate?: () => void;
  generationBlockedReason?: string | null;
  generationError?: string | null;
  isGenerating?: boolean;
}

export function BundleProposalPreview({
  result,
  onGenerate,
  generationBlockedReason = null,
  generationError = null,
  isGenerating = false,
}: BundleProposalPreviewProps) {
  if (result.status === "none") return null;
  if (result.status === "invalid") {
    return (
      <aside className="bundle-proposal bundle-proposal--invalid" role="alert">
        <TriangleAlert size={16} aria-hidden="true" />
        <div>
          <strong>Proposal preview unavailable</strong>
          <p>{result.message} Ask the agent to return a corrected <code>okf-proposal</code> block.</p>
        </div>
      </aside>
    );
  }

  const { proposal } = result;
  return (
    <section className="bundle-proposal" aria-label="Proposed OKF bundle structure">
      <header>
        <FolderTree size={16} aria-hidden="true" />
        <div>
          <strong>Bundle proposal</strong>
          <small>
            {proposal.concepts.length} concepts · {proposal.indexes.length} indexes · {proposal.linkCount} links
          </small>
        </div>
      </header>

      <details open>
        <summary>Concepts and links</summary>
        <ul className="bundle-proposal__concepts">
          {proposal.concepts.map((concept) => (
            <li key={concept.path}>
              <FileText size={14} aria-hidden="true" />
              <div>
                <div className="bundle-proposal__identity">
                  <code>{concept.path}</code>
                  <span>{concept.type}</span>
                </div>
                <strong>{concept.title}</strong>
                {concept.links.length > 0 ? (
                  <small className="bundle-proposal__links">
                    <Link2 size={12} aria-hidden="true" />
                    {concept.links.join(", ")}
                  </small>
                ) : (
                  <small>No proposed links</small>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>

      <details open>
        <summary>Indexes</summary>
        <ul className="bundle-proposal__indexes">
          {proposal.indexes.map((index) => (
            <li key={index.path}>
              <code>{index.path}</code>
              <small>{index.concepts.join(", ")}</small>
            </li>
          ))}
        </ul>
      </details>
      <footer>
        <p className="bundle-proposal__boundary">
          Preview only. No files have been generated or staged.
        </p>
        {onGenerate && (
          <div className="bundle-proposal__generation">
            <button
              type="button"
              className="btn primary"
              disabled={generationBlockedReason !== null || isGenerating}
              onClick={onGenerate}
            >
              <WandSparkles size={14} aria-hidden="true" />
              {isGenerating
                ? "Starting..."
                : generationError
                  ? "Retry staging"
                  : "Generate in staging"}
            </button>
            {generationBlockedReason && <small>{generationBlockedReason}</small>}
            {generationError && (
              <small
                className="bundle-proposal__generation-error"
                role="alert"
                title={generationError}
              >
                Staging failed. {generationError}
              </small>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}
