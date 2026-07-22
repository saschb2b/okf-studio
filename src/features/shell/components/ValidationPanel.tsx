// Compatibility Clinic — a tolerant, read-only report over parser, link,
// index, and extension behavior. OKF conformance remains distinct from
// portability advice. Safe repairs are only proposals until reviewed staging.

import { Download, Sparkles, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useEffect, useState } from "react";
import { exportCompatibilityDiagnostic, readCompatibilityReport } from "@/shared/ipc.ts";
import { useApp } from "@/shared/store.tsx";
import type {
  CompatibilityCategory,
  CompatibilityFinding,
  CompatibilityReport,
  Issue,
} from "@/shared/types.ts";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./ValidationPanel.css";

const CATEGORY_ORDER: CompatibilityCategory[] = ["parser", "link", "index", "extension"];
const CATEGORY_LABELS: Record<CompatibilityCategory, string> = {
  parser: "Parser",
  link: "Links",
  index: "Indexes",
  extension: "Extensions",
};

type ReportState =
  | { status: "idle" }
  | { status: "ready"; bundleRoot: string; report: CompatibilityReport }
  | { status: "error"; bundleRoot: string; message: string };

type ExportState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "message"; message: string };

function findingKey(finding: CompatibilityFinding): string {
  return [
    finding.ruleId,
    finding.file,
    finding.conceptId ?? "bundle",
    finding.repair?.authored ?? "",
    finding.message,
  ].join(":");
}

function conformanceIssue(finding: CompatibilityFinding): Issue | null {
  if (finding.basis !== "okf-conformance") return null;
  if (finding.level !== "error" && finding.level !== "warning") return null;
  return {
    conceptId: finding.conceptId,
    level: finding.level,
    message: finding.message,
  };
}

function FindingGroup({
  category,
  findings,
  onJump,
  onTask,
}: {
  category: CompatibilityCategory;
  findings: CompatibilityFinding[];
  onJump: (conceptId: string) => void;
  onTask: (finding: CompatibilityFinding, issue: Issue, focusId: string) => void;
}) {
  if (findings.length === 0) return null;
  const heading = CATEGORY_LABELS[category];

  return (
    <section className="vp-group" aria-label={`${heading} (${findings.length})`}>
      <h3 className="vp-group-head">
        {heading}
        <span className="vp-count">{findings.length}</span>
      </h3>
      <ul className="vp-issues">
        {findings.map((finding) => {
          const key = findingKey(finding);
          const target = finding.conceptId;
          const issue = conformanceIssue(finding);
          const taskId = `compatibility-task-${key}`;
          const body = (
            <>
              <span className={`vp-issue-dot ${finding.level}`} aria-hidden="true" />
              <span className="vp-msg">{finding.message}</span>
              <span className="vp-finding-meta">
                <code>{finding.file}</code>
                <code>{finding.ruleId}</code>
              </span>
              {finding.repair ? (
                <span className="vp-repair">
                  <code>{finding.repair.authored}</code>
                  <span aria-hidden="true">→</span>
                  <code>{finding.repair.replacement}</code>
                </span>
              ) : null}
            </>
          );

          return (
            <li key={key} className="vp-issue">
              {target ? (
                <button
                  type="button"
                  className="vp-issue-body clickable"
                  aria-label={`${finding.level}: ${finding.message}. Open ${target}.`}
                  onClick={() => onJump(target)}
                >
                  {body}
                </button>
              ) : (
                <div className="vp-issue-body">{body}</div>
              )}
              {issue ? (
                <button
                  id={taskId}
                  type="button"
                  className="vp-issue-agent"
                  aria-label={`Work on ${finding.file} with an OKF agent`}
                  onClick={() => onTask(finding, issue, taskId)}
                >
                  <Sparkles size={14} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ValidationPanel() {
  const { state, actions } = useApp();
  const isOpen = state.panels.validation;
  const bundleRoot = state.activeRoot;
  const bundle = state.bundle;
  const [reportState, setReportState] = useState<ReportState>({ status: "idle" });
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  useEffect(() => {
    if (!isOpen || !bundleRoot || !bundle) return;
    let ignore = false;
    void readCompatibilityReport(bundleRoot).then(
      (report) => {
        if (!ignore) {
          setReportState({ status: "ready", bundleRoot, report });
          setExportState({ status: "idle" });
        }
      },
      (error: unknown) => {
        if (ignore) return;
        setReportState({
          status: "error",
          bundleRoot,
          message: error instanceof Error ? error.message : "Studio could not build the compatibility report.",
        });
      },
    );
    return () => {
      ignore = true;
    };
  }, [isOpen, bundleRoot, bundle]);

  const report = reportState.status === "ready" && reportState.bundleRoot === bundleRoot
    ? reportState.report
    : null;
  const reportError = reportState.status === "error" && reportState.bundleRoot === bundleRoot
    ? reportState.message
    : null;
  const findingCount = report?.findings.length ?? 0;

  async function exportReport() {
    if (!report || !bundle) return;
    setExportState({ status: "saving" });
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      bundle: { name: bundle.name, okfVersion: bundle.okfVersion },
      report,
      redactions: ["bundle.root", "concept.body", "frontmatter.values"],
    };
    const safeName = bundle.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "bundle";
    try {
      const filename = await exportCompatibilityDiagnostic(
        `compatibility-${safeName}.json`,
        JSON.stringify(payload, null, 2),
      );
      setExportState({
        status: "message",
        message: filename ? `Saved ${filename}` : "Export cancelled.",
      });
    } catch (error) {
      setExportState({
        status: "message",
        message: error instanceof Error ? error.message : "Studio could not export the compatibility report.",
      });
    }
  }

  return (
    <Dialog.Root
      modal={false}
      open={isOpen}
      onOpenChange={(open) => actions.togglePanel("validation", open)}
      disablePointerDismissal
    >
      <Dialog.Portal>
        <Dialog.Popup className="panel validation" aria-label="Compatibility Clinic">
          <header className="panel-head">
            <Dialog.Title render={<b />}>Compatibility Clinic</Dialog.Title>
            <div className="vp-head-actions">
              <button
                type="button"
                className="btn ghost icon"
                aria-label="Export compatibility report"
                title="Export machine-readable report"
                disabled={!report || exportState.status === "saving"}
                onClick={() => void exportReport()}
              >
                <Download size={16} aria-hidden="true" />
              </button>
              <Dialog.Close className="btn ghost icon" aria-label="Close Compatibility Clinic">
                <X size={16} aria-hidden="true" />
              </Dialog.Close>
            </div>
          </header>

          <div className="vp-intro">
            <p>OKF errors stay separate from optional portability advice and preserved fields.</p>
            {report ? (
              <p className="vp-summary" aria-live="polite">
                {findingCount === 0 ? "No compatibility findings." : `${findingCount} findings across ${CATEGORY_ORDER.filter((category) => report.findings.some((finding) => finding.category === category)).length} groups.`}
                {report.truncated ? " The report reached its 4,096-finding display limit." : ""}
              </p>
            ) : null}
            {exportState.status === "message" ? <p className="vp-export-status" role="status">{exportState.message}</p> : null}
          </div>

          {!report && !reportError ? (
            <p className="vp-state" role="status">Checking parser and portability behavior…</p>
          ) : null}
          {reportError ? (
            <p className="vp-state error" role="alert">{reportError}</p>
          ) : null}
          {report?.findings.length === 0 ? (
            <p className="vp-conformant">
              <span className="vp-dot ok" aria-hidden="true" />
              Portable across the checks Studio can run locally.
            </p>
          ) : null}
          {report && report.findings.length > 0 ? (
            <ScrollArea.Root className="ui-scrollarea vp-scroll">
              <ScrollArea.Viewport className="ui-scrollarea-viewport">
                <div className="vp-body">
                  {CATEGORY_ORDER.map((category) => (
                    <FindingGroup
                      key={category}
                      category={category}
                      findings={report.findings.filter((finding) => finding.category === category)}
                      onJump={(conceptId) => actions.selectConcept(conceptId)}
                      onTask={(finding, issue, focusId) => actions.openOkfTaskLauncher({
                        kind: "validation-finding",
                        id: `compatibility:${finding.ruleId}:${finding.file}`,
                        title: finding.file,
                        issue,
                      }, { preferredTaskId: "okf-repair", returnFocusId: focusId })}
                    />
                  ))}
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="ui-scrollarea-scrollbar" orientation="vertical">
                <ScrollArea.Thumb className="ui-scrollarea-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
