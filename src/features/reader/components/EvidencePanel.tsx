import {
  CircleAlert,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type {
  ConceptEvidence,
  EvidenceSource,
} from "@/shared/evidence.ts";
import { fetchAgentSourceUrl } from "@/shared/ipc.ts";
import "./EvidencePanel.css";

interface EvidencePanelProps {
  evidence: ConceptEvidence;
  onOpenExternal: (url: string) => void;
}

type LiveCheck =
  | { status: "checking" }
  | {
      status: "available" | "changed";
      checkedAt: string;
      fingerprint: string | null;
    }
  | { status: "error"; checkedAt: string; message: string };

export function EvidencePanel({
  evidence,
  onOpenExternal,
}: EvidencePanelProps) {
  const [checks, setChecks] = useState<ReadonlyMap<string, LiveCheck>>(
    () => new Map(),
  );
  if (evidence.sources.length === 0 && evidence.diagnostics.length === 0) {
    return null;
  }

  async function checkSource(source: EvidenceSource) {
    if (!source.uri || checks.get(source.id)?.status === "checking") return;
    setChecks((current) => new Map(current).set(source.id, { status: "checking" }));
    try {
      const fetched = await fetchAgentSourceUrl(source.uri);
      const fingerprint = normalizeDigest(
        fetched.adapterReceipt?.sourceFingerprint ?? fetched.sourceDigest ?? null,
      );
      const expected = normalizeDigest(source.sourceDigest);
      const status = expected && fingerprint && expected !== fingerprint
        ? "changed"
        : "available";
      setChecks((current) => new Map(current).set(source.id, {
        status,
        checkedAt: new Date().toISOString(),
        fingerprint,
      }));
    } catch (error: unknown) {
      setChecks((current) => new Map(current).set(source.id, {
        status: "error",
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "The source check failed.",
      }));
    }
  }

  return (
    <section className="rail-module evidence-panel" aria-labelledby="evidence-panel-title">
      <h3 className="rail-title" id="evidence-panel-title">
        Evidence
        {evidence.sources.length > 0 && (
          <span className="rail-count">{evidence.sources.length}</span>
        )}
      </h3>
      <p className="evidence-panel__boundary">
        <ShieldCheck size={14} aria-hidden="true" />
        Authored evidence, not a truth verdict. No request runs until Check source.
      </p>
      {evidence.sources.length > 0 && (
        <ul className="evidence-panel__sources">
          {evidence.sources.map((source) => (
            <EvidenceSourceRow
              key={source.id}
              source={source}
              check={checks.get(source.id)}
              onCheck={() => void checkSource(source)}
              onOpen={() => source.uri && onOpenExternal(source.uri)}
            />
          ))}
        </ul>
      )}
      {evidence.diagnostics.length > 0 && (
        <ul className="evidence-panel__diagnostics" aria-label="Evidence advice">
          {evidence.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.kind}:${diagnostic.sourceId}:${diagnostic.line ?? "none"}:${index}`}>
              <CircleAlert size={13} aria-hidden="true" />
              <span>
                {diagnostic.message}
                {diagnostic.line ? ` Body line ${diagnostic.line}.` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceSourceRow({
  source,
  check,
  onCheck,
  onOpen,
}: {
  source: EvidenceSource;
  check: LiveCheck | undefined;
  onCheck: () => void;
  onOpen: () => void;
}) {
  const status = checkStatus(source, check);
  const checkedAt = check && check.status !== "checking"
    ? check.checkedAt
    : source.lastCheckedAt;
  const detail = check?.status === "error"
    ? check.message
    : source.locator;
  return (
    <li>
      <header>
        <strong>{source.title}</strong>
        <span
          className="evidence-panel__status"
          data-status={status}
          role="status"
          aria-live="polite"
        >
          {statusLabel(status)}
        </span>
      </header>
      {detail && <p title={detail}>{detail}</p>}
      <dl>
        {source.observedAt && (
          <div>
            <dt>Observed</dt>
            <dd>
              <time dateTime={source.observedAt} title={source.observedAt}>
                {shortDate(source.observedAt)}
              </time>
            </dd>
          </div>
        )}
        {checkedAt && (
          <div>
            <dt>Checked</dt>
            <dd>
              <time dateTime={checkedAt} title={checkedAt}>
                {shortDate(checkedAt)}
              </time>
            </dd>
          </div>
        )}
        {source.adapterId && (
          <div>
            <dt>Adapter</dt>
            <dd>{source.adapterId}{source.adapterVersion === null ? "" : ` v${source.adapterVersion}`}</dd>
          </div>
        )}
        {source.sourceDigest && (
          <div>
            <dt>Digest</dt>
            <dd><code title={source.sourceDigest}>{source.sourceDigest.slice(-10)}</code></dd>
          </div>
        )}
      </dl>
      {source.uri && (
        <div className="evidence-panel__actions">
          <button type="button" onClick={onOpen}>
            <ExternalLink size={13} aria-hidden="true" />
            Open
          </button>
          <button
            type="button"
            disabled={check?.status === "checking"}
            onClick={onCheck}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={check?.status === "checking" ? "is-spinning" : undefined}
            />
            {check?.status === "checking" ? "Checking…" : "Check source"}
          </button>
        </div>
      )}
    </li>
  );
}

function checkStatus(
  source: EvidenceSource,
  check: LiveCheck | undefined,
): "unchecked" | "available" | "changed" | "unavailable" | "checking" {
  if (check?.status === "error") return "unavailable";
  if (check) return check.status;
  return source.lastStatus;
}

function statusLabel(status: ReturnType<typeof checkStatus>): string {
  const labels = {
    unchecked: "Not checked",
    checking: "Checking",
    available: "Available",
    changed: "Changed",
    unavailable: "Unavailable",
  };
  return labels[status];
}

function shortDate(value: string): string {
  return value.slice(0, 10);
}

function normalizeDigest(value: string | null): string | null {
  const digest = value?.toLowerCase().replace(/^sha256-/u, "") ?? "";
  return /^[a-f0-9]{64}$/u.test(digest) ? digest : null;
}
