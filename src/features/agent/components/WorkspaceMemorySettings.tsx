import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceMemoryItem } from "@/features/agent/workspaceMemory.ts";
import {
  deleteWorkspaceMemoryItem,
  loadWorkspaceMemory,
  onWorkspaceMemoryChange,
} from "@/shared/ipc.ts";
import "./WorkspaceMemorySettings.css";

type MemoryState =
  | { status: "loading" }
  | { status: "ready"; items: readonly WorkspaceMemoryItem[] }
  | { status: "error"; message: string };

export interface WorkspaceMemorySettingsViewProps {
  bundleName: string;
  fingerprint: string;
  state: MemoryState;
  deletingId?: string | null;
  onDelete: (id: string) => void;
}

function dateLabel(value: number | null): string {
  if (value === null) return "Never";
  return new Date(value).toLocaleString();
}

function originLabel(item: WorkspaceMemoryItem): string {
  if (item.origin === "agent-suggestion-accepted") return "Accepted agent suggestion";
  if (item.origin === "studio-observation") return "Deterministic Studio observation";
  return "Explicit user action";
}

export function WorkspaceMemorySettingsView({
  bundleName,
  fingerprint,
  state,
  deletingId = null,
  onDelete,
}: WorkspaceMemorySettingsViewProps) {
  return (
    <section className="workspace-memory-settings" aria-label="Workspace memory">
      <header>
        <div>
          <strong>Workspace memory</strong>
          <span>{bundleName}</span>
        </div>
        {state.status === "ready" && <span>{state.items.length} items</span>}
      </header>
      <p>
        Local metadata only. Memory never stores prompt or response bodies, authored facts,
        citations, staged files, or credentials.
      </p>
      {state.status === "loading" && <p role="status">Loading workspace memory...</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "ready" && state.items.length === 0 && (
        <p className="workspace-memory-settings__empty">No memory for this bundle.</p>
      )}
      {state.status === "ready" && state.items.length > 0 && (
        <ul>
          {state.items.map((item) => {
            const stale = item.validationFingerprint !== fingerprint;
            return (
              <li key={item.id}>
                <div className="workspace-memory-settings__title">
                  <strong>{item.label}</strong>
                  <span>{item.kind.replaceAll("-", " ")}{stale ? " · stale" : " · current"}</span>
                </div>
                {item.contextEffect && <p>{item.contextEffect}</p>}
                <dl>
                  <div><dt>Origin</dt><dd>{originLabel(item)}</dd></div>
                  <div><dt>Owner</dt><dd>{item.owner === "user" ? "User" : "Studio"}</dd></div>
                  <div><dt>Last validation</dt><dd>{dateLabel(item.lastValidatedAt)}</dd></div>
                  <div><dt>Last use</dt><dd>{dateLabel(item.lastUsedAt)}</dd></div>
                  <div><dt>Retention</dt><dd>{item.retentionDays} days</dd></div>
                </dl>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={deletingId !== null}
                  aria-label={`Delete memory ${item.label}`}
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {deletingId === item.id ? "Deleting..." : "Delete"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function WorkspaceMemorySettings({
  bundleRoot,
  bundleName,
  fingerprint,
}: {
  bundleRoot: string;
  bundleName: string;
  fingerprint: string;
}) {
  const [state, setState] = useState<MemoryState>({ status: "loading" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => void loadWorkspaceMemory(bundleRoot).then(
      (items) => { if (active) setState({ status: "ready", items }); },
      () => { if (active) setState({ status: "error", message: "Studio could not load workspace memory." }); },
    );
    refresh();
    const stop = onWorkspaceMemoryChange(refresh);
    return () => { active = false; stop(); };
  }, [bundleRoot]);

  async function deleteItem(id: string) {
    setDeletingId(id);
    try {
      await deleteWorkspaceMemoryItem(id);
      setState((current) => current.status === "ready"
        ? { status: "ready", items: current.items.filter((item) => item.id !== id) }
        : current);
      setDeletingId(null);
    } catch {
      setState({ status: "error", message: "Studio could not delete this memory item." });
      setDeletingId(null);
    }
  }

  return (
    <WorkspaceMemorySettingsView
      bundleName={bundleName}
      fingerprint={fingerprint}
      state={state}
      deletingId={deletingId}
      onDelete={(id) => void deleteItem(id)}
    />
  );
}
