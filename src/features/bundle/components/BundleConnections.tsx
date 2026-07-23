import { Tabs } from "@base-ui/react/tabs";
import {
  CircleCheck,
  ExternalLink,
  FileJson,
  Languages,
  Link2,
  Paperclip,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  exportSemanticWeb,
  importSemanticWeb,
} from "@/shared/ipc.ts";
import type { Bundle } from "@/shared/types.ts";
import { useInteropReport } from "@/shared/useInteropReport.ts";
import {
  externalReferenceNeedsAttention,
  formatInteropBytes,
  sidecarNeedsAttention,
} from "@/features/bundle/interop.ts";
import type {
  ExternalBundleReference,
  InteropReport,
  SemanticImportPreview,
  SidecarResource,
} from "@/features/bundle/interop.ts";
import "./BundleConnections.css";

interface BundleConnectionActions {
  onOpenConcept: (conceptId: string) => void;
  onReviewExternal: (url: string) => void;
}

export function BundleConnectionsSummary({
  bundle,
  onOpen,
}: {
  bundle: Bundle;
  onOpen: () => void;
}) {
  const state = useInteropReport(bundle);

  if (state.status === "loading" || state.status === "idle") {
    return <ConnectionStatus message="Inspecting connections…" />;
  }
  if (state.status === "error" || !state.report) {
    return <ConnectionStatus message={`Connections unavailable: ${state.message}`} isAlert />;
  }
  return <BundleConnectionsSummaryView report={state.report} onOpen={onOpen} />;
}

export function BundleConnectionsSummaryView({
  report,
  onOpen,
}: {
  report: InteropReport;
  onOpen: () => void;
}) {
  const problemCount = interopProblemCount(report);
  return (
    <section className="connections-summary" aria-labelledby="connections-summary-title">
      <header>
        <div>
          <h2 id="connections-summary-title">Connections</h2>
          <p>External knowledge, relationship exchange, languages, and resources.</p>
        </div>
        <span className="bundle-connections__boundary">Optional conventions</span>
      </header>

      <dl>
        <div>
          <dt>External sources</dt>
          <dd>{report.externalBundles.length}</dd>
        </div>
        <div>
          <dt>Portable relationships</dt>
          <dd>{report.semanticWeb.exportableRelationships}</dd>
        </div>
        <div>
          <dt>Language sets</dt>
          <dd>{report.multilingual.groups.length}</dd>
        </div>
        <div>
          <dt>Resources</dt>
          <dd>{report.sidecars.length}</dd>
        </div>
      </dl>

      <div className="connections-summary__footer">
        <span data-status={problemCount > 0 ? "warning" : "ready"}>
          {problemCount > 0
            ? <TriangleAlert size={15} aria-hidden="true" />
            : <CircleCheck size={15} aria-hidden="true" />}
          {problemCount > 0
            ? `${problemCount} item${problemCount === 1 ? " needs" : "s need"} review`
            : "Declarations inspected"}
        </span>
        <button type="button" className="btn primary" onClick={onOpen}>
          Open connections
        </button>
      </div>
    </section>
  );
}

export function BundleConnectionsWorkspace({
  bundle,
  onOpenConcept,
  onReviewExternal,
}: {
  bundle: Bundle;
} & BundleConnectionActions) {
  const state = useInteropReport(bundle);

  if (state.status === "loading" || state.status === "idle") {
    return <ConnectionStatus message="Inspecting connections and exchange declarations…" />;
  }
  if (state.status === "error" || !state.report) {
    return <ConnectionStatus message={`Connections unavailable: ${state.message}`} isAlert />;
  }
  return (
    <BundleConnectionsWorkspaceView
      bundleRoot={bundle.root}
      report={state.report}
      onOpenConcept={onOpenConcept}
      onReviewExternal={onReviewExternal}
    />
  );
}

export function BundleConnectionsWorkspaceView({
  bundleRoot,
  report,
  onOpenConcept,
  onReviewExternal,
}: {
  bundleRoot: string;
  report: InteropReport;
  onOpenConcept?: (conceptId: string) => void;
  onReviewExternal?: (url: string) => void;
}) {
  return (
    <Tabs.Root defaultValue="sources" className="connections-workspace">
      <Tabs.List className="connections-workspace__tabs" activateOnFocus>
        <Tabs.Tab value="sources">
          <Link2 size={15} aria-hidden="true" />
          External sources
          <span>{report.externalBundles.length}</span>
        </Tabs.Tab>
        <Tabs.Tab value="exchange">
          <FileJson size={15} aria-hidden="true" />
          Relationship exchange
          <span>{report.semanticWeb.exportableRelationships}</span>
        </Tabs.Tab>
        <Tabs.Tab value="report">
          <TriangleAlert size={15} aria-hidden="true" />
          Diagnostics
          <span>{interopProblemCount(report)}</span>
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="sources" className="connections-workspace__panel">
        <ExternalSources
          references={report.externalBundles}
          onReviewExternal={onReviewExternal}
        />
      </Tabs.Panel>

      <Tabs.Panel value="exchange" className="connections-workspace__panel">
        <RelationshipExchange bundleRoot={bundleRoot} report={report} />
      </Tabs.Panel>

      <Tabs.Panel value="report" className="connections-workspace__panel">
        <InteroperabilityReport report={report} onOpenConcept={onOpenConcept} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function ExternalSources({
  references,
  onReviewExternal,
}: {
  references: ExternalBundleReference[];
  onReviewExternal?: (url: string) => void;
}) {
  return (
    <section className="connections-focus" aria-labelledby="external-sources-title">
      <header className="connections-focus__head">
        <span aria-hidden="true"><Link2 size={18} /></span>
        <div>
          <h2 id="external-sources-title">External sources</h2>
          <p>
            Review declared knowledge bundles and resolve them through an explicit network action.
            Nothing is fetched when this workspace opens.
          </p>
        </div>
      </header>

      {references.length > 0 ? (
        <ul className="bundle-connections__rows">
          {references.map((reference) => (
            <li key={reference.alias}>
              <div className="bundle-connections__row-copy">
                <span className="bundle-connections__row-title">
                  {reference.alias}
                  <ConnectionBadge reference={reference} />
                </span>
                <span title={reference.url}>{reference.url}</span>
                <small>{reference.message}</small>
              </div>
              {onReviewExternal ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onReviewExternal(reference.url)}
                >
                  {reference.status === "not-resolved" ? "Resolve source" : "Review source"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No external sources"
          detail="This bundle does not declare any external knowledge bundles."
        />
      )}
    </section>
  );
}

function RelationshipExchange({
  bundleRoot,
  report,
}: {
  bundleRoot: string;
  report: InteropReport;
}) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<SemanticImportPreview | null>(null);

  async function exportRelationships() {
    setBusy("export");
    setNotice(null);
    try {
      const destination = await exportSemanticWeb(bundleRoot);
      if (destination) setNotice(`Saved ${destination}.`);
    } catch (cause: unknown) {
      setNotice(errorText(cause));
    }
    setBusy(null);
  }

  async function previewImport() {
    setBusy("import");
    setNotice(null);
    try {
      const result = await importSemanticWeb();
      if (result) {
        setPreview(result);
        setNotice(
          `Previewed ${result.relationships.length} relationship${result.relationships.length === 1 ? "" : "s"}. Nothing was written.`,
        );
      }
    } catch (cause: unknown) {
      setNotice(errorText(cause));
    }
    setBusy(null);
  }

  return (
    <section className="connections-focus" aria-labelledby="relationship-exchange-title">
      <header className="connections-focus__head">
        <span aria-hidden="true"><FileJson size={18} /></span>
        <div>
          <h2 id="relationship-exchange-title">Relationship exchange</h2>
          <p>
            Move the portable relationship subset between Studio and JSON-LD. Import remains a
            read-only preview.
          </p>
        </div>
      </header>

      <dl className="connections-exchange__metrics">
        <div>
          <dt>Portable relationships</dt>
          <dd>{report.semanticWeb.exportableRelationships}</dd>
        </div>
        <div>
          <dt>Unsupported relationships</dt>
          <dd>{report.semanticWeb.unsupportedRelationships}</dd>
        </div>
      </dl>
      <p className="connections-exchange__message">{report.semanticWeb.message}</p>

      <div className="bundle-connections__actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy !== null}
          onClick={() => void exportRelationships()}
        >
          {busy === "export" ? "Exporting…" : "Export JSON-LD"}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy !== null}
          onClick={() => void previewImport()}
        >
          {busy === "import" ? "Importing…" : "Preview JSON-LD import"}
        </button>
      </div>

      {preview ? (
        <div className="bundle-connections__preview" role="status">
          <strong>
            {preview.relationships.length} relationship
            {preview.relationships.length === 1 ? "" : "s"} in preview
          </strong>
          <span>
            {preview.losses.length} unsupported or lossy construct
            {preview.losses.length === 1 ? "" : "s"}. Nothing was written.
          </span>
          {preview.losses.map((loss) => (
            <span key={`${loss.path}:${loss.message}`}>
              {loss.path}: {loss.message}
            </span>
          ))}
        </div>
      ) : null}
      {notice ? <p className="bundle-connections__notice" role="status">{notice}</p> : null}
    </section>
  );
}

function InteroperabilityReport({
  report,
  onOpenConcept,
}: {
  report: InteropReport;
  onOpenConcept?: (conceptId: string) => void;
}) {
  return (
    <section className="interop-report" aria-labelledby="interop-report-title">
      <header className="connections-focus__head">
        <span aria-hidden="true"><TriangleAlert size={18} /></span>
        <div>
          <h2 id="interop-report-title">Interoperability diagnostics</h2>
          <p>
            Technical evidence for optional conventions. These findings do not change OKF
            validation.
          </p>
        </div>
      </header>

      <ReportSection
        icon={<Languages size={16} />}
        title="Language conventions"
        count={report.multilingual.groups.length}
      >
        {report.multilingual.groups.length > 0 ? (
          <ul className="interop-report__rows">
            {report.multilingual.groups.map((group) => (
              <li key={group.identity}>
                <strong>{group.identity}</strong>
                <span>
                  {group.variants.map((variant) =>
                    `${variant.language.toUpperCase()} · ${variant.convention}`).join(" / ")}
                </span>
                {onOpenConcept ? (
                  <div className="interop-report__actions">
                    {group.variants.map((variant) => (
                      <button
                        type="button"
                        key={variant.conceptId}
                        onClick={() => onOpenConcept(variant.conceptId)}
                      >
                        Open {variant.language.toUpperCase()}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="bundle-connections__empty">No language variants were detected.</p>
        )}

        <details className="interop-report__comparison">
          <summary>Compare detected conventions</summary>
          <ul>
            {report.multilingual.conventions.map((finding) => (
              <li key={finding.convention}>
                <strong>{finding.convention} · {finding.observed}</strong>
                <span>{finding.strengths.join(" ")}</span>
                <span>Gap: {finding.gaps.join(" ")}</span>
              </li>
            ))}
          </ul>
        </details>
      </ReportSection>

      <ReportSection
        icon={<ExternalLink size={16} />}
        title="External source declarations"
        count={report.externalBundles.length}
      >
        <ReportExternalRows references={report.externalBundles} />
      </ReportSection>

      <ReportSection
        icon={<FileJson size={16} />}
        title="Relationship portability"
        count={report.semanticWeb.exportableRelationships}
      >
        <p className="interop-report__message">{report.semanticWeb.message}</p>
      </ReportSection>

      <ReportSection
        icon={<Paperclip size={16} />}
        title="Resource integrity"
        count={report.sidecars.length}
      >
        <ReportResourceRows resources={report.sidecars} onOpenConcept={onOpenConcept} />
      </ReportSection>

      {report.diagnostics.map((diagnostic) => (
        <p className="interop-report__diagnostic" key={diagnostic}>
          <TriangleAlert size={14} aria-hidden="true" />
          {diagnostic}
        </p>
      ))}
      {report.truncated ? (
        <p className="interop-report__diagnostic">
          <TriangleAlert size={14} aria-hidden="true" />
          The report reached an inspection bound and is incomplete.
        </p>
      ) : null}
    </section>
  );
}

function ReportSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="interop-report__section">
      <header>
        <span aria-hidden="true">{icon}</span>
        <h3>{title}</h3>
        <span>{count}</span>
      </header>
      <div className="interop-report__section-body">{children}</div>
    </section>
  );
}

function ReportExternalRows({ references }: { references: ExternalBundleReference[] }) {
  if (references.length === 0) {
    return <p className="bundle-connections__empty">No external sources are declared.</p>;
  }
  return (
    <ul className="interop-report__rows">
      {references.map((reference) => (
        <li key={reference.alias}>
          <strong>{reference.alias} · {externalStatusLabel(reference.status)}</strong>
          <span>{reference.message}</span>
          <code>{reference.identityPrefix}concept-id</code>
        </li>
      ))}
    </ul>
  );
}

function ReportResourceRows({
  resources,
  onOpenConcept,
}: {
  resources: SidecarResource[];
  onOpenConcept?: (conceptId: string) => void;
}) {
  if (resources.length === 0) {
    return <p className="bundle-connections__empty">No resources are declared.</p>;
  }
  return (
    <ul className="interop-report__rows">
      {resources.map((resource) => (
        <li key={`${resource.conceptId}:${resource.path}`}>
          <strong>{resource.path} · {resourceStatusLabel(resource.status)}</strong>
          <span>{resource.mediaType} · {formatInteropBytes(resource.size)}</span>
          <span>{resource.message}</span>
          {onOpenConcept ? (
            <div className="interop-report__actions">
              <button type="button" onClick={() => onOpenConcept(resource.conceptId)}>
                Open concept
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ConnectionBadge({ reference }: { reference: ExternalBundleReference }) {
  return (
    <span className="bundle-connections__status" data-status={reference.status}>
      {externalStatusLabel(reference.status)}
    </span>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="connections-empty">
      <CircleCheck size={18} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function ConnectionStatus({
  message,
  isAlert = false,
}: {
  message: string;
  isAlert?: boolean;
}) {
  return (
    <section className="bundle-connections bundle-connections--status" aria-label="Connections">
      <p role={isAlert ? "alert" : "status"}>{message}</p>
    </section>
  );
}

function interopProblemCount(report: InteropReport): number {
  return report.externalBundles.filter(externalReferenceNeedsAttention).length +
    report.sidecars.filter(sidecarNeedsAttention).length +
    report.diagnostics.length +
    (report.truncated ? 1 : 0);
}

function externalStatusLabel(status: ExternalBundleReference["status"]): string {
  switch (status) {
    case "cached":
      return "Available";
    case "digest-mismatch":
      return "Revision changed";
    case "unavailable":
      return "Unavailable";
    case "not-resolved":
      return "Not resolved";
  }
}

function resourceStatusLabel(status: SidecarResource["status"]): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "missing":
      return "Missing";
    case "digest-mismatch":
      return "Digest mismatch";
    case "invalid-declaration":
      return "Invalid declaration";
    case "too-large":
      return "Too large";
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
