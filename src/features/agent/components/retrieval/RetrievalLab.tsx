import { ArrowLeft, CircleAlert, Download, FlaskConical, Play, Square } from "lucide-react";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import {
  diffOkfRetrievalReceipts,
  exportRetrievalDiagnostics,
  retrieveOkfContext,
} from "@/shared/ipc.ts";
import type {
  ReceiptDiff,
  RetrievalResult,
  RetrievalRoute,
  RepairProposal,
} from "@/features/agent/retrieval/types.ts";
import { RETRIEVAL_ROUTES } from "@/features/agent/retrieval/types.ts";
import { RetrievalEvidenceSummary } from "./RetrievalEvidenceSummary.tsx";
import { RetrievalInspector } from "./RetrievalInspector.tsx";
import "./RetrievalWorkspace.css";

type LabState =
  | { status: "idle" }
  | { status: "loading"; query: string; route: RetrievalRoute }
  | { status: "ready"; result: RetrievalResult; comparison: RetrievalResult | null; diff: ReceiptDiff | null }
  | { status: "cancelled"; query: string }
  | { status: "error"; query: string; message: string };

interface RetrievalLabProps {
  bundleRoot: string;
  bundleName: string;
  initialResult?: RetrievalResult;
  onClose: () => void;
  onOpenConcept: (conceptId: string) => void;
  onReviewRepair?: (proposal: RepairProposal) => void;
  retrieve?: typeof retrieveOkfContext;
}

export function RetrievalLab({
  bundleRoot,
  bundleName,
  initialResult,
  onClose,
  onOpenConcept,
  onReviewRepair,
  retrieve = retrieveOkfContext,
}: RetrievalLabProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestId = useRef(0);
  const [state, setState] = useState<LabState>(() => initialResult
    ? { status: "ready", result: initialResult, comparison: null, diff: null }
    : { status: "idle" });
  const [route, setRoute] = useState<RetrievalRoute>(initialResult?.receipt.route ?? "exact-lexical");
  const [compareRoute, setCompareRoute] = useState<RetrievalRoute>("lexical-graph");
  const [inspecting, setInspecting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const ready = state.status === "ready" ? state : null;

  useEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;
    const siblings = [...parent.children].filter((element) => element !== root);
    const previous = siblings.map((element) => (element as HTMLElement).inert);
    siblings.forEach((element) => { (element as HTMLElement).inert = true; });
    closeRef.current?.focus();
    return () => {
      siblings.forEach((element, index) => { (element as HTMLElement).inert = previous[index]; });
    };
  }, []);

  async function run(query: string, selectedRoute: RetrievalRoute, compare: boolean) {
    const id = ++requestId.current;
    setState({ status: "loading", query, route: selectedRoute });
    try {
      const result = await retrieve(bundleRoot, {
        query,
        route: selectedRoute,
        contextBudgetTokens: 4096,
      });
      if (id !== requestId.current) return;
      if (compare) {
        const comparison = await retrieve(bundleRoot, {
          query,
          route: compareRoute,
          contextBudgetTokens: 4096,
        });
        if (id !== requestId.current) return;
        const diff = await diffOkfRetrievalReceipts(result.receipt, comparison.receipt);
        if (id !== requestId.current) return;
        setState({ status: "ready", result, comparison, diff });
      } else {
        setState({ status: "ready", result, comparison: null, diff: null });
      }
    } catch (error) {
      if (id !== requestId.current) return;
      setState({
        status: "error",
        query,
        message: error instanceof Error ? error.message : "Studio could not complete retrieval.",
      });
    }
  }

  function cancel() {
    requestId.current += 1;
    if (state.status === "loading") setState({ status: "cancelled", query: state.query });
  }

  function submitQuery(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const rawQuery = new FormData(event.currentTarget).get("query");
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (query) void run(query, route, false);
  }

  async function exportDiagnostic(result: RetrievalResult) {
    setExportMessage("Preparing redacted diagnostic…");
    const redacted = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      manifest: result.manifest,
      evidence: {
        manifestFingerprint: result.evidence.manifestFingerprint,
        items: result.evidence.items.map((item) => ({
          sectionId: item.sectionId,
          conceptId: item.conceptId,
          headingPath: item.headingPath,
          sourceRange: item.sourceRange,
          citations: item.citations,
          relationshipPath: item.relationshipPath,
          tokenEstimate: item.tokenEstimate,
        })),
        caveats: result.evidence.caveats,
        estimatedTokens: result.evidence.estimatedTokens,
        bytes: result.evidence.bytes,
        requiresAbstention: result.evidence.requiresAbstention,
      },
      receipt: result.receipt,
      diagnostic: result.diagnostic,
      repairs: result.repairs,
      redactions: ["evidence.items[].text"],
    };
    try {
      const filename = await exportRetrievalDiagnostics(
        `retrieval-${result.receipt.receiptId.slice(0, 12)}.json`,
        JSON.stringify(redacted, null, 2),
      );
      setExportMessage(filename ? `Saved ${filename}` : "Export cancelled");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Studio could not export the diagnostic.");
    }
  }

  if (ready && inspecting) {
    return (
      <RetrievalInspector
        result={ready.result}
        onClose={() => setInspecting(false)}
        onOpenConcept={onOpenConcept}
        onRerun={(nextRoute) => {
          setRoute(nextRoute);
          void run(ready.result.receipt.query, nextRoute, false);
        }}
      />
    );
  }

  return (
    <section
      ref={rootRef}
      className="retrieval-lab"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="retrieval-workspace__header">
        <button ref={closeRef} type="button" className="btn ghost" onClick={onClose}>
          <ArrowLeft size={15} aria-hidden="true" /> Conversation
        </button>
        <div>
          <h3 id={titleId}><FlaskConical size={17} aria-hidden="true" /> Retrieval Lab</h3>
          <p title={bundleName}>{bundleName}</p>
        </div>
      </header>

      <form className="retrieval-lab__query" onSubmit={submitQuery}>
        <label>
          Query
          <input
            name="query"
            type="search"
            required
            defaultValue={ready?.result.receipt.query ?? (state.status === "cancelled" || state.status === "error" ? state.query : "")}
            placeholder="Ask about this bundle"
          />
        </label>
        <label>
          Route
          <select value={route} onChange={(event) => setRoute(event.target.value as RetrievalRoute)}>
            {RETRIEVAL_ROUTES.map((option) => (
              <option value={option.id} key={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={state.status === "loading"}>
          <Play size={14} aria-hidden="true" /> Run
        </button>
        {state.status === "loading" && (
          <button type="button" className="btn ghost" onClick={cancel}>
            <Square size={13} aria-hidden="true" /> Cancel
          </button>
        )}
      </form>

      <div className="retrieval-workspace__body">
        {state.status === "idle" && (
          <div className="retrieval-workspace__empty">
            <FlaskConical size={24} aria-hidden="true" />
            <h4>Compare evidence paths without changing defaults</h4>
            <p>Run a query to inspect candidates, omissions, provider use, and review-only repair suggestions.</p>
          </div>
        )}
        {state.status === "loading" && (
          <div className="retrieval-workspace__empty" role="status">
            <span className="spinner" aria-hidden="true" />
            <h4>Preparing evidence</h4>
            <p>{state.route.replaceAll("-", " ")} over the active granted bundle.</p>
          </div>
        )}
        {state.status === "cancelled" && (
          <div className="retrieval-workspace__empty" role="status">
            <h4>Retrieval cancelled</h4>
            <p>The query is retained. Run it again when you are ready.</p>
          </div>
        )}
        {state.status === "error" && (
          <div className="retrieval-workspace__empty" role="alert">
            <CircleAlert size={22} aria-hidden="true" />
            <h4>Retrieval unavailable</h4>
            <p>{state.message}</p>
          </div>
        )}
        {ready && (
          <div className="retrieval-lab__results">
            <RetrievalEvidenceSummary result={ready.result} onInspect={() => setInspecting(true)} />
            <section className="retrieval-lab__diagnostic" data-class={ready.result.diagnostic.class}>
              <div>
                <strong>{ready.result.diagnostic.class.replaceAll("-", " ")}</strong>
                <p>{ready.result.diagnostic.summary}</p>
              </div>
              <p>{ready.result.diagnostic.suggestedAction}</p>
            </section>
            <section className="retrieval-lab__compare" aria-label="Compare retrieval routes">
              <label>
                Compare with
                <select value={compareRoute} onChange={(event) => setCompareRoute(event.target.value as RetrievalRoute)}>
                  {RETRIEVAL_ROUTES.filter((option) => option.id !== route).map((option) => (
                    <option value={option.id} key={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => void run(ready.result.receipt.query, route, true)}
              >
                Compare routes
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => void exportDiagnostic(ready.result)}
              >
                <Download size={14} aria-hidden="true" /> Export diagnostic
              </button>
              <span className="retrieval-lab__export-status" role="status">{exportMessage}</span>
            </section>
            {ready.diff && ready.comparison && (
              <section className="retrieval-lab__diff" aria-label="Route comparison result">
                <div><strong>{ready.diff.addedSections.length}</strong><span>added</span></div>
                <div><strong>{ready.diff.removedSections.length}</strong><span>removed</span></div>
                <div><strong>{ready.diff.changedExclusions.length}</strong><span>changed decisions</span></div>
                <div><strong>{ready.diff.tokenDelta > 0 ? "+" : ""}{ready.diff.tokenDelta}</strong><span>token change</span></div>
              </section>
            )}
            {ready.result.repairs.length > 0 && (
              <section className="retrieval-lab__repairs" aria-labelledby={`${titleId}-repairs`}>
                <header>
                  <h4 id={`${titleId}-repairs`}>Review-only knowledge repairs</h4>
                  <p>Diagnostics can propose a change. Only existing staged review can write it.</p>
                </header>
                <ul>
                  {ready.result.repairs.map((repair) => (
                    <li key={repair.proposalId}>
                      <div>
                        <strong>{repair.kind.replaceAll("-", " ")}</strong>
                        <span>{repair.conceptId}</span>
                        <p>{repair.rationale}</p>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={!onReviewRepair}
                        onClick={() => onReviewRepair?.(repair)}
                      >
                        Review proposal
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
