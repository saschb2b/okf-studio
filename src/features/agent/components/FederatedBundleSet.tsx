import { CircleAlert, Database, RefreshCw } from "lucide-react";
import type {
  BundleLibraryEntry,
  FederatedBundleStatus,
  LibraryGrantState,
} from "@/features/agent/federation.ts";
import "./FederatedBundleSet.css";

export type FederatedBundleSetState = "loading" | "ready" | "empty" | "error" | "previewing";

interface FederatedBundleSetProps {
  state: FederatedBundleSetState;
  entries: readonly BundleLibraryEntry[];
  selectedIds: readonly string[];
  statuses?: readonly FederatedBundleStatus[];
  error?: string;
  maxSelected?: number;
  onToggle: (bundleId: string, selected: boolean) => void;
  onRetry: () => void;
}

export function FederatedBundleSet({
  state,
  entries,
  selectedIds,
  statuses = [],
  error,
  maxSelected = 8,
  onToggle,
  onRetry,
}: FederatedBundleSetProps) {
  const selected = new Set(selectedIds);
  const statusById = new Map(statuses.map((status) => [status.bundleId, status]));
  const evidenceCount = selectedIds.filter((bundleId) => {
    const entry = entries.find((candidate) => candidate.bundleId === bundleId);
    return Boolean(entry && !entry.active);
  }).length;

  return (
    <section className="federated-bundle-set" aria-labelledby="federated-bundle-set-title">
      <header className="federated-bundle-set__header">
        <div className="federated-bundle-set__title-row">
          <Database size={16} aria-hidden="true" />
          <h3 id="federated-bundle-set-title">Bundle set</h3>
        </div>
        <span className="federated-bundle-set__count">
          {evidenceCount} evidence {evidenceCount === 1 ? "bundle" : "bundles"}
        </span>
      </header>
      <p className="federated-bundle-set__description">
        The current bundle remains the only write destination. Choose up to {maxSelected - 1} other
        granted bundles as read-only evidence.
      </p>

      {state === "loading" && (
        <div className="federated-bundle-set__state" role="status">
          <RefreshCw className="federated-bundle-set__spin" size={16} aria-hidden="true" />
          Loading granted bundles…
        </div>
      )}
      {state === "error" && (
        <div className="federated-bundle-set__state" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error ?? "Studio could not load the granted bundle library."}</span>
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        </div>
      )}
      {state === "empty" && (
        <div className="federated-bundle-set__state" role="status">
          <Database size={16} aria-hidden="true" />
          Open another bundle once to add it to this Rust-owned library.
        </div>
      )}
      {(state === "ready" || state === "previewing") && entries.length > 0 && (
        <div className="federated-bundle-set__list">
          {entries.map((entry) => {
            const status = statusById.get(entry.bundleId);
            const grantState = status?.grantState ?? entry.grantState;
            const checked = entry.active || selected.has(entry.bundleId);
            const unavailable = grantState !== "available";
            const atLimit = !checked && selected.size >= maxSelected;
            const fingerprint = status?.revisionFingerprint ?? entry.revisionFingerprint;
            return (
              <label
                className="federated-bundle-set__row"
                data-state={grantState}
                key={entry.bundleId}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={entry.active || (unavailable && !checked) || atLimit || state === "previewing"}
                  onChange={(event) => onToggle(entry.bundleId, event.currentTarget.checked)}
                />
                <span className="federated-bundle-set__identity">
                  <span className="federated-bundle-set__name">
                    <strong>{entry.title}</strong>
                    <small>{entry.active ? "Destination" : stateLabel(grantState)}</small>
                  </span>
                  <span className="federated-bundle-set__meta">
                    bundle {entry.bundleId.slice(0, 8)} · {entry.conceptCount.toLocaleString()} concepts
                    {entry.types.length > 0 ? ` · ${entry.types.slice(0, 2).join(", ")}` : ""}
                  </span>
                  {checked && fingerprint && (
                    <code title={fingerprint}>{shortFingerprint(fingerprint)}</code>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {state === "previewing" && (
        <div className="federated-bundle-set__preview" role="status">
          <RefreshCw className="federated-bundle-set__spin" size={14} aria-hidden="true" />
          Checking grants and revisions…
        </div>
      )}
    </section>
  );
}

function stateLabel(state: LibraryGrantState): string {
  switch (state) {
    case "available":
      return "Read-only evidence";
    case "missing":
      return "Folder missing";
    case "revoked":
      return "Grant revoked";
    case "changed":
      return "Revision changed";
  }
}

function shortFingerprint(fingerprint: string): string {
  const suffix = fingerprint.replace(/^okf-health-revision-/, "");
  return `revision ${suffix.slice(0, 12)}`;
}
