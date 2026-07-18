import { Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  attentionRuns,
  deterministicHealthRoutineInput,
  deterministicSourceRoutineInput,
} from "@/features/agent/routines.ts";
import type { OkfRoutineWorkspace } from "@/features/agent/routines.ts";
import {
  okfRoutineWorkspace,
  onOkfRoutinesChange,
  removeOkfRoutine,
  runOkfRoutine,
  saveOkfRoutine,
} from "@/shared/ipc.ts";
import "./OkfRoutineSettings.css";

type RoutineState =
  | { status: "loading" }
  | { status: "ready"; workspace: OkfRoutineWorkspace }
  | { status: "error"; message: string };

export interface OkfRoutineSettingsViewProps {
  bundleName: string;
  state: RoutineState;
  busyId?: string | null;
  onCreate: (name: string, scheduled: boolean, sourcePath: string | null) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
}

function ageLabel(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.floor(hours / 24)} d ago`;
}

export function OkfRoutineSettingsView({
  bundleName,
  state,
  busyId = null,
  onCreate,
  onRun,
  onDelete,
}: OkfRoutineSettingsViewProps) {
  const [name, setName] = useState("Bundle health check");
  const [scheduled, setScheduled] = useState(false);
  const [sourceCheck, setSourceCheck] = useState(false);
  const [sourcePath, setSourcePath] = useState("");
  const attention = state.status === "ready" ? attentionRuns(state.workspace.runs) : [];

  return (
    <section className="okf-routines" aria-label="OKF routines">
      <header>
        <div>
          <strong>Local routines</strong>
          <span>{bundleName}</span>
        </div>
        {state.status === "ready" && <span>{state.workspace.routines.length} saved</span>}
      </header>
      <p>
        Routine schema v1 runs deterministic checks only. Effective scope is this bundle,
        no agent or model, no tools, offline network, selected bundle sources only, and no staging.
      </p>
      <form
        className="okf-routines__create"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && (!sourceCheck || sourcePath.trim())) {
            onCreate(name, scheduled, sourceCheck ? sourcePath : null);
          }
        }}
      >
        <label>
          <span>Name</span>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            aria-label="Routine name"
          />
        </label>
        <label className="okf-routines__schedule">
          <input
            type="checkbox"
            checked={scheduled}
            onChange={(event) => setScheduled(event.target.checked)}
          />
          Daily schedule
        </label>
        <label className="okf-routines__schedule">
          <input
            type="checkbox"
            checked={sourceCheck}
            onChange={(event) => setSourceCheck(event.target.checked)}
          />
          Check a bundle source
        </label>
        {sourceCheck && (
          <label className="okf-routines__source">
            <span>Bundle-relative source</span>
            <input
              value={sourcePath}
              maxLength={1_024}
              placeholder="assets/export.json"
              onChange={(event) => setSourcePath(event.target.value)}
              aria-label="Bundle-relative source"
            />
          </label>
        )}
        <button
          type="submit"
          className="btn"
          disabled={busyId !== null || !name.trim() || (sourceCheck && !sourcePath.trim())}
        >
          <Plus size={14} aria-hidden="true" />
          Save routine
        </button>
      </form>
      <p className="okf-routines__policy">
        Missed scheduled runs are skipped unless catch-up is explicitly enabled. Runs stop closed
        when the bundle grant, source, timeout, or application lifetime ends.
      </p>

      {state.status === "loading" && <p role="status">Loading local routines...</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "ready" && state.workspace.routines.length === 0 && (
        <p className="okf-routines__empty">No routines saved for this bundle.</p>
      )}
      {state.status === "ready" && state.workspace.routines.length > 0 && (
        <ul className="okf-routines__list">
          {state.workspace.routines.map((routine) => (
            <li key={routine.id}>
              <div>
                <strong>{routine.name}</strong>
                <span>
                  {routine.trigger.mode === "scheduled" ? "Daily" : "Manual"}
                  {routine.nextRunAtMs ? ` · next ${new Date(routine.nextRunAtMs).toLocaleString()}` : ""}
                </span>
              </div>
              <dl>
                <div><dt>Task</dt><dd>{routine.scope.task === "health-rescan" ? "Health rescan" : "Source fingerprint"}</dd></div>
                <div><dt>Network</dt><dd>Offline</dd></div>
                <div><dt>Agent / model</dt><dd>None</dd></div>
                <div><dt>Tools / staging</dt><dd>None</dd></div>
                <div><dt>Sources</dt><dd>{routine.scope.sources.length || "None"}</dd></div>
                <div><dt>Timeout</dt><dd>{routine.timeoutSeconds} seconds</dd></div>
                <div><dt>Catch-up</dt><dd>{routine.trigger.catchUpAfterDowntime ? "Once" : "Skip"}</dd></div>
              </dl>
              <div className="okf-routines__actions">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busyId !== null}
                  onClick={() => onRun(routine.id)}
                >
                  <Play size={14} aria-hidden="true" />
                  {busyId === routine.id ? "Running..." : "Run now"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busyId !== null}
                  aria-label={`Delete routine ${routine.name}`}
                  onClick={() => onDelete(routine.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {state.status === "ready" && (
        <section className="okf-routines__attention" aria-label="Routine attention inbox">
          <header>
            <strong>Attention inbox</strong>
            <span>{attention.length} items</span>
          </header>
          {attention.length === 0 ? (
            <p>No routine results need attention.</p>
          ) : (
            <ul>
              {attention.map((run) => (
                <li key={run.id}>
                  <div>
                    <strong>{run.reason}</strong>
                    <span>{run.routineName} · {ageLabel(run.completedAtMs)}</span>
                  </div>
                  <span>{run.nextAction}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}

export function OkfRoutineSettings({
  bundleRoot,
  bundleName,
}: {
  bundleRoot: string;
  bundleName: string;
}) {
  const [state, setState] = useState<RoutineState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setState({ status: "ready", workspace: await okfRoutineWorkspace(bundleRoot) });
    } catch {
      setState({ status: "error", message: "Studio could not load local routines." });
    }
  }

  useEffect(() => {
    let active = true;
    const reload = () => void okfRoutineWorkspace(bundleRoot)
      .then((workspace) => { if (active) setState({ status: "ready", workspace }); })
      .catch(() => { if (active) setState({ status: "error", message: "Studio could not load local routines." }); });
    reload();
    const stop = onOkfRoutinesChange(reload);
    return () => { active = false; stop(); };
  }, [bundleRoot]);

  async function perform(id: string, operation: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await operation();
      await refresh();
    } catch {
      setState({ status: "error", message: "The routine action failed closed. Review its bundle grant and scope." });
    }
    setBusyId(null);
  }

  return (
    <OkfRoutineSettingsView
      bundleName={bundleName}
      state={state}
      busyId={busyId}
      onCreate={(name, scheduled, sourcePath) => void perform("create", () =>
        saveOkfRoutine(sourcePath
          ? deterministicSourceRoutineInput(bundleRoot, name, scheduled, sourcePath)
          : deterministicHealthRoutineInput(bundleRoot, name, scheduled)))}
      onRun={(id) => void perform(id, () => runOkfRoutine(id))}
      onDelete={(id) => void perform(id, () => removeOkfRoutine(id))}
    />
  );
}
