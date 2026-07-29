// How a bundle-sized job would divide into delegated runs.
//
// Read-only, and deliberately so. Nothing here starts an agent, spends
// anything, or needs a connection: it answers "how big is this job, and how
// would it be split" before any of that is committed to. Asking one agent to
// audit a hundred-concept bundle silently samples it; this is the screen that
// makes the sampling visible instead.
//
// The counts come from Rust, which has already parsed the bundle, so a run is
// handed its concepts rather than sent to search for them. See
// docs/architecture/agent-orchestration.md.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import {
  activeAgentConnections,
  planAgentSlices,
  subscribeAgentConnections,
  type Assembly,
  type SliceBy,
  type SlicePlan,
} from "@/shared/ipc.ts";
import { runFanOut, type RunProgress } from "@/features/agent/fanOut.ts";
import type { Bundle } from "@/shared/types.ts";
import "./DelegationPlanDialog.css";

/** The decompositions offered, with what each is good for. */
const DECOMPOSITIONS: { by: SliceBy; label: string; hint: string }[] = [
  { by: "type", label: "By type", hint: "The questions worth asking of a runbook are not the ones worth asking of a metric." },
  { by: "folder", label: "By folder", hint: "Follows how the bundle is already organised." },
  { by: "tag", label: "By tag", hint: "A cross-cutting view. One concept can appear in several runs." },
  { by: "link-neighbourhood", label: "By link neighbourhood", hint: "Each concept with everything it links to or is cited by." },
];

/** One plan request's outcome, keyed so a stale answer is ignored on render
 *  rather than cleared by another state write inside the effect. */
type PlanState =
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; plan: SlicePlan }
  | { status: "error"; key: string; message: string };

export function DelegationPlanDialog({
  open,
  bundle,
  root,
  onOpenChange,
}: {
  open: boolean;
  bundle: Bundle | null;
  root: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Read from the connection store rather than taking a prop: planning does
  // not need a connection, so the screen should not require its caller to
  // know about one just to render.
  const connections = useSyncExternalStore(subscribeAgentConnections, activeAgentConnections);
  const connectionId = connections.at(0)?.connectionId ?? null;
  const [by, setBy] = useState<SliceBy>("type");
  const key = `${root ?? ""}:${by}`;
  const [state, setState] = useState<PlanState>({ status: "loading", key });
  const [progress, setProgress] = useState<RunProgress[] | null>(null);
  const [assembly, setAssembly] = useState<Assembly | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !root) return;
    let ignore = false;
    void planAgentSlices(root, by).then(
      (plan) => {
        if (!ignore) setState({ status: "ready", key, plan });
      },
      (cause: unknown) => {
        // Report the failure rather than an empty plan: "this bundle divides
        // into nothing" and "we could not read it" look identical otherwise.
        if (!ignore) {
          setState({
            status: "error",
            key,
            message:
              cause instanceof Error ? cause.message : "The plan could not be computed.",
          });
        }
      },
    );
    return () => {
      ignore = true;
    };
  }, [open, root, by, key]);

  // An answer for a different bundle or a different decomposition is not this
  // one's answer, so it reads as loading until the current request lands.
  const current: PlanState = state.key === key ? state : { status: "loading", key };
  const plan = current.status === "ready" ? current.plan : null;
  const byKey = new Map((progress ?? []).map((entry) => [entry.sliceKey, entry]));

  const largest =
    plan?.slices.reduce((most, slice) => Math.max(most, slice.conceptIds.length), 0) ?? 0;

  function run() {
    if (!plan || !root || !connectionId || running) return;
    setRunning(true);
    setAssembly(null);
    setRunError(null);
    void runFanOut({
      root,
      connectionId,
      slices: plan.slices,
      fingerprint: plan.fingerprint,
      capabilityId: "okf-audit",
      artifactKind: "health-report",
      // A ceiling the user can see before it is spent. A run with no
      // measurable budget is refused, so this is not optional.
      budget: { maxCost: 1, maxContextTokens: 200_000 },
      onProgress: setProgress,
    })
      .then(setAssembly, (cause: unknown) => {
        // runFanOut reports run-level problems as outcomes, so reaching here
        // means the job itself could not proceed. Saying so beats a button
        // that silently goes idle.
        setRunError(cause instanceof Error ? cause.message : "The job could not be run.");
      })
      .finally(() => setRunning(false));
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog delegation-plan">
          <header className="delegation-plan__header">
            <div>
              <Dialog.Title className="ui-dialog-title">Plan delegated work</Dialog.Title>
              <p className="delegation-plan__subtitle">
                How this bundle would divide into parallel runs. Nothing starts here.
              </p>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </header>

          <div className="delegation-plan__modes" role="group" aria-label="Divide the work">
            {DECOMPOSITIONS.map((option) => (
              <button
                key={option.by}
                type="button"
                className={`delegation-plan__mode${by === option.by ? " is-active" : ""}`}
                aria-pressed={by === option.by}
                title={option.hint}
                onClick={() => setBy(option.by)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {plan && plan.slices.length > 0 && (
            <div className="delegation-plan__actions">
              <button
                type="button"
                className="btn primary"
                disabled={!connectionId || running}
                onClick={run}
              >
                {running ? "Running…" : `Run ${plan.slices.length} runs`}
              </button>
              {!connectionId && (
                <span className="delegation-plan__note">
                  Connect an agent to run this plan. Planning needs no connection.
                </span>
              )}
            </div>
          )}

          {runError && (
            <p className="delegation-plan__note delegation-plan__note--error" role="alert">
              {runError}
            </p>
          )}

          {assembly && (
            <p
              className={`delegation-plan__summary${assembly.complete ? "" : " delegation-plan__summary--partial"}`}
              role="status"
            >
              {assembly.complete
                ? `Complete: ${assembly.coveredSlices} of ${assembly.plannedSlices} runs covered, ${assembly.itemCount} items.`
                : `Partial: ${assembly.coveredSlices} of ${assembly.plannedSlices} runs covered. ${assembly.exclusions.length} not counted.`}
            </p>
          )}

          {!bundle && <p className="delegation-plan__note">Open a bundle to plan work over it.</p>}
          {bundle && current.status === "loading" && (
            <p className="delegation-plan__note" role="status">
              Planning…
            </p>
          )}
          {current.status === "error" && (
            <p className="delegation-plan__note delegation-plan__note--error" role="alert">
              {current.message}
            </p>
          )}

          {plan && (
            <>
              <p className="delegation-plan__summary" role="status">
                <strong>{plan.slices.length}</strong>
                {plan.slices.length === 1 ? " run" : " runs"} over{" "}
                <strong>{coveredCount(plan)}</strong> of {bundle?.concepts.length ?? 0} concepts
              </p>

              {plan.slices.length === 0 ? (
                <p className="delegation-plan__note">
                  Nothing in this bundle divides this way.
                </p>
              ) : (
                <ul className="delegation-plan__runs">
                  {plan.slices.map((slice) => (
                    <li key={slice.key} className="delegation-plan__run">
                      <span className="delegation-plan__run-title">{slice.title || "Bundle root"}</span>
                      <span className="delegation-plan__bar" aria-hidden="true">
                        <span
                          className="delegation-plan__bar-fill"
                          style={{ width: `${largest ? (slice.conceptIds.length / largest) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="delegation-plan__count">
                        {byKey.get(slice.key)?.state === "running" && (
                          <span className="delegation-plan__state">running </span>
                        )}
                        {byKey.get(slice.key)?.state === "done" && (
                          <span className="delegation-plan__state">
                            {byKey.get(slice.key)?.result?.status === "completed" ? "done " : "no artifact "}
                          </span>
                        )}
                        {slice.conceptIds.length}
                        {slice.excludedConceptIds.length > 0 && (
                          <span className="delegation-plan__over">
                            {" "}
                            +{slice.excludedConceptIds.length} over
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {plan.exclusions.length > 0 && (
                <section className="delegation-plan__excluded" aria-label="Excluded from this plan">
                  <h3 className="delegation-plan__excluded-title">Not covered</h3>
                  <ul>
                    {plan.exclusions.map((exclusion, index) => (
                      <li key={`${exclusion.kind}-${index}`}>{describeExclusion(exclusion)}</li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="delegation-plan__fingerprint">
                Computed against <code>{plan.fingerprint}</code>. A change to the bundle makes this
                plan stale.
              </p>
            </>
          )}

        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Concepts a run would cover, counting one that several runs share once. */
function coveredCount(plan: SlicePlan): number {
  return new Set(plan.slices.flatMap((slice) => slice.conceptIds)).size;
}

function describeExclusion(exclusion: SlicePlan["exclusions"][number]): string {
  switch (exclusion.kind) {
    case "slicesOverWidth":
      return `${exclusion.droppedKeys.length} more group${exclusion.droppedKeys.length === 1 ? "" : "s"} past the ${exclusion.limit}-run width: ${exclusion.droppedKeys.slice(0, 3).join(", ")}${exclusion.droppedKeys.length > 3 ? "…" : ""}`;
    case "conceptsOverSliceCap":
      return `${exclusion.sliceKey}: ${exclusion.dropped} concept${exclusion.dropped === 1 ? "" : "s"} past the ${exclusion.limit} one run can hold`;
    case "unslicable":
      return `${exclusion.conceptIds.length} concept${exclusion.conceptIds.length === 1 ? "" : "s"} skipped because ${exclusion.reason}`;
  }
}
