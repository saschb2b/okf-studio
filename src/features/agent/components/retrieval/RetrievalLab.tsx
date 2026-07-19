import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  FlaskConical,
  GitCompareArrows,
  Play,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { evidenceAssessment, routeLabel } from "@/features/agent/retrieval/presentation.ts";
import type {
  ReceiptDiff,
  RetrievalResult,
  RetrievalRoute,
  RepairProposal,
} from "@/features/agent/retrieval/types.ts";
import { RETRIEVAL_ROUTES } from "@/features/agent/retrieval/types.ts";
import {
  diffOkfRetrievalReceipts,
  exportRetrievalDiagnostics,
  retrieveOkfContext,
} from "@/shared/ipc.ts";
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
  const [compareRoute, setCompareRoute] = useState<RetrievalRoute>(
    initialResult?.receipt.route === "lexical-graph" ? "exact-lexical" : "lexical-graph",
  );
  const [inspecting, setInspecting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const ready = state.status === "ready" ? state : null;
  const selectedRoute = RETRIEVAL_ROUTES.find((option) => option.id === route);

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

  async function run(query: string, selected: RetrievalRoute, compare: boolean) {
    const id = ++requestId.current;
    setState({ status: "loading", query, route: selected });
    try {
      const result = await retrieve(bundleRoot, {
        query,
        route: selected,
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
        message: error instanceof Error ? error.message : "Studio could not complete the evidence search.",
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

  function changeRoute(nextRoute: RetrievalRoute) {
    setRoute(nextRoute);
    if (nextRoute === compareRoute) {
      setCompareRoute(RETRIEVAL_ROUTES.find((option) => option.id !== nextRoute)?.id ?? "exact-lexical");
    }
  }

  function useComparison() {
    if (!ready?.comparison) return;
    const priorRoute = ready.result.receipt.route;
    const result = ready.comparison;
    setRoute(result.receipt.route);
    setCompareRoute(priorRoute);
    setState({ status: "ready", result, comparison: null, diff: null });
  }

  async function exportDiagnostic(result: RetrievalResult) {
    setExportMessage("Preparing a source-text-redacted report…");
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
      setExportMessage(error instanceof Error ? error.message : "Studio could not export the technical report.");
    }
  }

  if (ready && inspecting) {
    return (
      <RetrievalInspector
        result={ready.result}
        onClose={() => setInspecting(false)}
        onOpenConcept={onOpenConcept}
        onRerun={(nextRoute) => {
          changeRoute(nextRoute);
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
          <h3 id={titleId}><FlaskConical size={17} aria-hidden="true" /> Evidence Lab</h3>
          <p>Understand and improve how Studio finds support in {bundleName}</p>
        </div>
      </header>

      <div className="retrieval-lab__intro">
        <strong>Test the evidence search without changing your conversation</strong>
        <p>
          Enter a question to see what Studio can find, compare another search method, or inspect
          the sources. The Lab does not contact an agent, rewrite an answer, or change the bundle.
        </p>
      </div>

      <form className="retrieval-lab__query" onSubmit={submitQuery}>
        <label className="retrieval-lab__question">
          Question to investigate
          <input
            name="query"
            type="search"
            required
            defaultValue={ready?.result.receipt.query ?? (state.status === "cancelled" || state.status === "error" ? state.query : "")}
            placeholder="For example: What does this bundle say about validation?"
          />
        </label>
        <button type="submit" className="btn primary" disabled={state.status === "loading"}>
          <Play size={14} aria-hidden="true" /> Find evidence
        </button>
        {state.status === "loading" && (
          <button type="button" className="btn ghost" onClick={cancel}>
            <Square size={13} aria-hidden="true" /> Stop
          </button>
        )}
        <details className="retrieval-lab__options">
          <summary>
            <span>
              <strong>Search options</strong>
              <small>{routeLabel(route)}</small>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <label>
            Search method
            <select value={route} onChange={(event) => changeRoute(event.target.value as RetrievalRoute)}>
              {RETRIEVAL_ROUTES.map((option) => (
                <option value={option.id} key={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <p>{selectedRoute?.description}</p>
        </details>
      </form>

      <div className="retrieval-workspace__body">
        {state.status === "idle" && (
          <div className="retrieval-workspace__empty">
            <FlaskConical size={24} aria-hidden="true" />
            <h4>Investigate a question</h4>
            <p>Studio will show the evidence it finds and explain anything that may limit trust.</p>
          </div>
        )}
        {state.status === "loading" && (
          <div className="retrieval-workspace__empty" role="status">
            <span className="spinner" aria-hidden="true" />
            <h4>Finding evidence</h4>
            <p>Searching {bundleName} with {routeLabel(state.route)}.</p>
          </div>
        )}
        {state.status === "cancelled" && (
          <div className="retrieval-workspace__empty" role="status">
            <h4>Search stopped</h4>
            <p>Your question is still in the field above. Start again when you are ready.</p>
          </div>
        )}
        {state.status === "error" && (
          <div className="retrieval-workspace__empty" role="alert">
            <CircleAlert size={22} aria-hidden="true" />
            <h4>Evidence search unavailable</h4>
            <p>{state.message}</p>
          </div>
        )}
        {ready && (
          <LabResults
            titleId={titleId}
            ready={ready}
            route={route}
            compareRoute={compareRoute}
            exportMessage={exportMessage}
            onInspect={() => setInspecting(true)}
            onCompareRouteChange={setCompareRoute}
            onCompare={() => void run(ready.result.receipt.query, route, true)}
            onUseComparison={useComparison}
            onExport={() => void exportDiagnostic(ready.result)}
            onReviewRepair={onReviewRepair}
          />
        )}
      </div>
    </section>
  );
}

interface LabResultsProps {
  titleId: string;
  ready: Extract<LabState, { status: "ready" }>;
  route: RetrievalRoute;
  compareRoute: RetrievalRoute;
  exportMessage: string;
  onInspect: () => void;
  onCompareRouteChange: (route: RetrievalRoute) => void;
  onCompare: () => void;
  onUseComparison: () => void;
  onExport: () => void;
  onReviewRepair?: (proposal: RepairProposal) => void;
}

function LabResults({
  titleId,
  ready,
  route,
  compareRoute,
  exportMessage,
  onInspect,
  onCompareRouteChange,
  onCompare,
  onUseComparison,
  onExport,
  onReviewRepair,
}: LabResultsProps) {
  const assessment = evidenceAssessment(ready.result);
  return (
    <div className="retrieval-lab__results">
      <section className={`retrieval-lab__outcome retrieval-lab__outcome--${assessment.tone}`}>
        {assessment.tone === "warning"
          ? <TriangleAlert size={18} aria-hidden="true" />
          : <CheckCircle2 size={18} aria-hidden="true" />}
        <div>
          <span>{ready.result.evidence.items.length} excerpts · {routeLabel(ready.result.receipt.route)}</span>
          <h4>{assessment.title}</h4>
          <p>{assessment.description}</p>
        </div>
        <button type="button" className="btn" onClick={onInspect}>Review sources</button>
      </section>

      <section className="retrieval-lab__compare" aria-labelledby={`${titleId}-compare`}>
        <header>
          <GitCompareArrows size={18} aria-hidden="true" />
          <div>
            <h4 id={`${titleId}-compare`}>Try another search method</h4>
            <p>
              Compare the current evidence with another method. This does not change the original
              answer or your bundle.
            </p>
          </div>
        </header>
        <div className="retrieval-lab__compare-controls">
          <label>
            Compare with
            <select value={compareRoute} onChange={(event) => onCompareRouteChange(event.target.value as RetrievalRoute)}>
              {RETRIEVAL_ROUTES.filter((option) => option.id !== route).map((option) => (
                <option value={option.id} key={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={onCompare}>Compare evidence</button>
        </div>
      </section>

      {ready.diff && ready.comparison && (
        <section className="retrieval-lab__comparison-result" aria-label="Evidence comparison result">
          <header>
            <div>
              <h4>What changed</h4>
              <p>
                {routeLabel(ready.comparison.receipt.route)} found {ready.diff.addedSections.length} new
                excerpts and left out {ready.diff.removedSections.length} from the current set.
              </p>
            </div>
            <button type="button" className="btn" onClick={onUseComparison}>
              Use this evidence set
            </button>
          </header>
          <div className="retrieval-lab__diff">
            <div><strong>{ready.diff.addedSections.length}</strong><span>new excerpts</span></div>
            <div><strong>{ready.diff.removedSections.length}</strong><span>replaced excerpts</span></div>
            <div><strong>{ready.diff.changedExclusions.length}</strong><span>changed choices</span></div>
            <div>
              <strong>{ready.diff.tokenDelta > 0 ? "+" : ""}{ready.diff.tokenDelta}</strong>
              <span>evidence size</span>
            </div>
          </div>
        </section>
      )}

      {ready.result.repairs.length > 0 && (
        <section className="retrieval-lab__repairs" aria-labelledby={`${titleId}-repairs`}>
          <header>
            <h4 id={`${titleId}-repairs`}>Possible bundle improvements</h4>
            <p>
              Studio found changes that may make future evidence easier to find. Nothing changes
              until you review and apply it.
            </p>
          </header>
          <ul>
            {ready.result.repairs.map((repair) => (
              <li key={repair.proposalId}>
                <div>
                  <strong>{repairLabel(repair.kind)}</strong>
                  <span>{repair.conceptId}</span>
                  <p>{repair.rationale}</p>
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!onReviewRepair}
                  onClick={() => onReviewRepair?.(repair)}
                >
                  Review change
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="retrieval-lab__technical">
        <summary>
          <span>
            <strong>Technical report</strong>
            <small>Diagnostic class, receipt, and source-text-redacted export</small>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div>
          <p><strong>Diagnostic:</strong> {ready.result.diagnostic.summary}</p>
          <p><strong>Receipt:</strong> <code>{ready.result.receipt.receiptId}</code></p>
          <button type="button" className="btn ghost" onClick={onExport}>
            <Download size={14} aria-hidden="true" /> Export technical report
          </button>
          <span className="retrieval-lab__export-status" role="status">{exportMessage}</span>
        </div>
      </details>
    </div>
  );
}

function repairLabel(kind: RepairProposal["kind"]): string {
  switch (kind) {
    case "add-description": return "Add a clearer description";
    case "add-link": return "Connect related concepts";
    case "repair-link": return "Repair a broken concept link";
    case "add-citation": return "Add a supporting citation";
    case "split-concept": return "Separate unrelated knowledge";
    case "add-index-entry": return "Add the concept to navigation";
    case "clarify-title": return "Clarify the concept title";
  }
}
