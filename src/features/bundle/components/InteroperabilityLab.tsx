import { AlertTriangle, Download, ExternalLink, FlaskConical, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import {
  exportOkfSidecar,
  exportSemanticWeb,
  importSemanticWeb,
  readInteropReport,
} from "@/shared/ipc.ts";
import type {
  InteropReport,
  SemanticImportPreview,
} from "@/features/bundle/interop.ts";
import "./InteroperabilityLab.css";

type ReportState =
  | { status: "loading" }
  | { status: "ready"; report: InteropReport }
  | { status: "error"; message: string };

export function InteroperabilityLab({
  bundleRoot,
  onOpenConcept,
  onReviewExternal,
}: {
  bundleRoot: string;
  onOpenConcept: (conceptId: string) => void;
  onReviewExternal: (url: string) => void;
}) {
  const [state, setState] = useState<ReportState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void readInteropReport(bundleRoot)
      .then((report) => {
        if (active) setState({ status: "ready", report });
      })
      .catch((raised: unknown) => {
        if (active) setState({ status: "error", message: errorText(raised) });
      });
    return () => {
      active = false;
    };
  }, [bundleRoot]);

  if (state.status === "loading") {
    return (
      <section className="interop-lab interop-lab--status" aria-label="Interoperability Lab">
        <p>Inspecting optional interoperability declarations…</p>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="interop-lab interop-lab--status" aria-label="Interoperability Lab">
        <p role="alert">Interoperability analysis unavailable: {state.message}</p>
      </section>
    );
  }
  if (!hasExperiment(state.report)) return null;
  return (
    <InteroperabilityLabView
      bundleRoot={bundleRoot}
      report={state.report}
      onOpenConcept={onOpenConcept}
      onReviewExternal={onReviewExternal}
    />
  );
}

export function InteroperabilityLabView({
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
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [semanticImport, setSemanticImport] = useState<SemanticImportPreview | null>(null);

  async function run(
    key: string,
    operation: () => Promise<string | SemanticImportPreview | null>,
  ) {
    setBusy(key);
    setNotice(null);
    try {
      const outcome = await operation();
      if (typeof outcome === "string") {
        setNotice(`Saved ${outcome}.`);
      } else if (outcome && typeof outcome === "object") {
        setSemanticImport(outcome);
        setNotice(
          `Imported ${outcome.relationships.length} relationship${outcome.relationships.length === 1 ? "" : "s"} into a read-only preview.`,
        );
      }
    } catch (raised: unknown) {
      setNotice(errorText(raised));
    }
    setBusy(null);
  }

  return (
    <section className="interop-lab" aria-labelledby="interop-lab-title">
      <header className="interop-lab__head">
        <div>
          <h2 id="interop-lab-title"><FlaskConical size={17} /> Interoperability Lab</h2>
          <p>Bounded experiments over preserved producer metadata.</p>
        </div>
        <span>Not OKF validation</span>
      </header>

      <div className="interop-lab__experiments">
        <details open={report.multilingual.groups.length > 0}>
          <summary>
            <Languages size={15} />
            Multilingual variants
            <span>{report.multilingual.groups.length} set(s)</span>
          </summary>
          <p>{report.multilingual.message}</p>
          {report.multilingual.groups.length === 0 ? (
            <p className="interop-lab__empty">No language convention detected.</p>
          ) : (
            <ul className="interop-lab__rows">
              {report.multilingual.groups.map((group) => (
                <li key={group.identity}>
                  <div>
                    <strong>{group.identity}</strong>
                    <span>
                      {group.variants.map((variant) =>
                        `${variant.language} · ${variant.convention}`).join(" / ")}
                    </span>
                  </div>
                  <div className="interop-lab__row-actions">
                    {group.variants.map((variant) => onOpenConcept ? (
                      <button
                        type="button"
                        key={variant.conceptId}
                        onClick={() => onOpenConcept(variant.conceptId)}
                      >
                        Open {variant.language}
                      </button>
                    ) : null)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <details className="interop-lab__nested">
            <summary>Convention comparison</summary>
            <ul className="interop-lab__comparison">
              {report.multilingual.conventions.map((finding) => (
                <li key={finding.convention}>
                  <strong>{finding.convention} · {finding.observed}</strong>
                  <span>{finding.strengths.join(" ")}</span>
                  <span>Gap: {finding.gaps.join(" ")}</span>
                </li>
              ))}
            </ul>
          </details>
        </details>

        <details open={report.externalBundles.length > 0}>
          <summary>
            <ExternalLink size={15} />
            External bundle registry
            <span>{report.externalBundles.length} reference(s)</span>
          </summary>
          <p>
            Registry entries never fetch on open. External concepts use a namespaced identity so
            they cannot impersonate a local concept.
          </p>
          {report.externalBundles.length === 0 ? (
            <p className="interop-lab__empty">No external bundle reference declared.</p>
          ) : (
            <ul className="interop-lab__rows">
              {report.externalBundles.map((reference) => (
                <li key={reference.alias}>
                  <div>
                    <strong>{reference.alias} · {reference.status}</strong>
                    <span>{reference.message}</span>
                    <code>{reference.identityPrefix}concept-id</code>
                  </div>
                  {onReviewExternal ? (
                    <button type="button" onClick={() => onReviewExternal(reference.url)}>
                      Review resolution
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </details>

        <details>
          <summary>
            <FlaskConical size={15} />
            Semantic-web exchange
            <span>{report.semanticWeb.exportableRelationships} portable relation(s)</span>
          </summary>
          <p>{report.semanticWeb.message}</p>
          <div className="interop-lab__actions">
            <button
              type="button"
              className="btn ghost"
              disabled={busy !== null}
              onClick={() => void run(
                "export-semantic",
                () => exportSemanticWeb(bundleRoot),
              )}
            >
              {busy === "export-semantic" ? "Exporting…" : "Export JSON-LD"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy !== null}
              onClick={() => void run("import-semantic", importSemanticWeb)}
            >
              {busy === "import-semantic" ? "Importing…" : "Preview JSON-LD import"}
            </button>
          </div>
          {semanticImport ? (
            <div className="interop-lab__import" role="status">
              <strong>{semanticImport.relationships.length} relationship(s) in preview</strong>
              <span>
                {semanticImport.losses.length} lossy or unsupported construct(s). Nothing was
                written to the bundle.
              </span>
              {semanticImport.losses.map((loss) => (
                <span key={`${loss.path}:${loss.message}`}>{loss.path}: {loss.message}</span>
              ))}
            </div>
          ) : null}
        </details>

        <details open={report.sidecars.length > 0}>
          <summary>
            <Download size={15} />
            Sidecar resources
            <span>{report.sidecars.length} declared</span>
          </summary>
          <p>
            Every file is contained, sized, and digest-checked. Unknown media is download-only and
            is never executed or rendered as trusted HTML.
          </p>
          {report.sidecars.length === 0 ? (
            <p className="interop-lab__empty">No sidecar resource declared.</p>
          ) : (
            <ul className="interop-lab__rows">
              {report.sidecars.map((sidecar) => {
                const key = `${sidecar.conceptId}:${sidecar.path}`;
                return (
                  <li key={key}>
                    <div>
                      <strong>{sidecar.path} · {sidecar.status}</strong>
                      <span>{sidecar.mediaType} · {formatBytes(sidecar.size)}</span>
                      <span>{sidecar.openPolicy}: {sidecar.message}</span>
                    </div>
                    <button
                      type="button"
                      disabled={sidecar.status !== "ready" || busy !== null}
                      onClick={() => void run(
                        key,
                        () => exportOkfSidecar(bundleRoot, sidecar.conceptId, sidecar.path),
                      )}
                    >
                      {busy === key ? "Exporting…" : "Export copy"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      </div>

      {report.diagnostics.map((diagnostic) => (
        <p className="interop-lab__diagnostic" key={diagnostic}>
          <AlertTriangle size={14} /> {diagnostic}
        </p>
      ))}
      {report.truncated ? (
        <p className="interop-lab__diagnostic">
          <AlertTriangle size={14} /> The report reached an experiment bound and is incomplete.
        </p>
      ) : null}
      {notice ? <p className="interop-lab__notice" role="status">{notice}</p> : null}
    </section>
  );
}

function hasExperiment(report: InteropReport): boolean {
  return report.multilingual.groups.length > 0 ||
    report.externalBundles.length > 0 ||
    report.semanticWeb.exportableRelationships > 0 ||
    report.semanticWeb.unsupportedRelationships > 0 ||
    report.sidecars.length > 0 ||
    report.diagnostics.length > 0;
}

function formatBytes(value: number | null): string {
  if (value === null) return "size unavailable";
  if (value < 1_024) return `${value} B`;
  return `${(value / 1_024).toFixed(1)} KiB`;
}

function errorText(raised: unknown): string {
  return raised instanceof Error ? raised.message : String(raised);
}
