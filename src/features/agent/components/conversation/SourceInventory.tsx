import { CircleAlert, Database, ShieldAlert } from "lucide-react";
import type { AgentSourceInput } from "@/shared/ipc.ts";
import "./SourceInventory.css";

interface SourceInventoryProps {
  sources: readonly AgentSourceInput[];
}

export function SourceInventory({ sources }: SourceInventoryProps) {
  const adapted = sources.flatMap((source) =>
    source.adapterReceipt ? [{ source, receipt: source.adapterReceipt }] : [],
  );
  if (adapted.length === 0) return null;

  const warningCount = adapted.reduce(
    (count, item) => count + item.receipt.diagnostics.length,
    0,
  );

  return (
    <details className="source-inventory" open={warningCount > 0}>
      <summary>
        <Database size={14} aria-hidden="true" />
        <span>Source inventory</span>
        <span className="source-inventory__summary-status">
          {adapted.length} {adapted.length === 1 ? "source" : "sources"}
          {warningCount > 0 ? ` · ${warningCount} warning${warningCount === 1 ? "" : "s"}` : " · ready"}
        </span>
      </summary>
      <p className="source-inventory__trust">
        <ShieldAlert size={14} aria-hidden="true" />
        Adapter output is untrusted evidence. The receipt carries profile-ready
        identity. Embedded instructions stay inert.
      </p>
      <ul className="source-inventory__list">
        {adapted.map(({ source, receipt }) => (
          <li key={`${source.title}:${receipt.refreshFingerprint}`}>
            <div className="source-inventory__identity">
              <strong>{source.title}</strong>
              <span>{adapterLabel(receipt.adapterId)} v{receipt.adapterVersion} · {receipt.discovery}</span>
            </div>
            <dl>
              <div>
                <dt>Origin</dt>
                <dd title={receipt.origin}>{receipt.origin}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>
                  {receipt.observedAt
                    ? <time dateTime={receipt.observedAt}>{shortTimestamp(receipt.observedAt)}</time>
                    : "This session"}
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd><code title={receipt.evidenceFingerprint}>{shortFingerprint(receipt.evidenceFingerprint)}</code></dd>
              </div>
              <div>
                <dt>Refresh</dt>
                <dd><code title={receipt.refreshFingerprint}>{shortFingerprint(receipt.refreshFingerprint)}</code></dd>
              </div>
            </dl>
            {receipt.diagnostics.map((diagnostic) => (
              <p className="source-inventory__diagnostic" key={diagnostic.code}>
                <CircleAlert size={14} aria-hidden="true" />
                <span>{diagnostic.message}</span>
              </p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

function adapterLabel(adapterId: string): string {
  const known = {
    openapi: "OpenAPI",
    "dbt-manifest": "dbt manifest",
    "bigquery-metadata": "BigQuery metadata",
    pdf: "PDF",
    csv: "CSV",
    json: "JSON",
  } as const;
  if (adapterId in known) return known[adapterId as keyof typeof known];
  return adapterId
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function shortFingerprint(fingerprint: string): string {
  return fingerprint.slice(-12);
}

function shortTimestamp(value: string): string {
  return value.replace("T", " ").replace(/\.\d{3}Z$/u, "Z");
}
