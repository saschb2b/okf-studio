import { Dialog } from "@base-ui/react/dialog";
import { CircleAlert, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import type { OkfContextPlan, OkfTaskId } from "@/features/agent/taskContext.ts";
import { OKF_TASKS } from "@/features/agent/taskContext.ts";
import type { OkfTaskOrigin } from "@/features/agent/taskLauncher.ts";
import { okfTaskOriginLabel } from "@/features/agent/taskLauncher.ts";
import { OkfContextPlanCard } from "@/features/agent/components/conversation/OkfContextPlanCard.tsx";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./OkfTaskLauncher.css";

export type OkfTaskLauncherStatus =
  | "first-use"
  | "authentication"
  | "unsupported"
  | "ready"
  | "stale"
  | "overflow"
  | "active-thread-conflict";

interface OkfTaskLauncherProps {
  open: boolean;
  origin: OkfTaskOrigin;
  status: OkfTaskLauncherStatus;
  tasks: readonly OkfTaskId[];
  selectedTaskId: OkfTaskId;
  promptDraft?: string;
  plan?: OkfContextPlan;
  bundleSet?: ReactNode;
  startDisabled?: boolean;
  connectionName?: string;
  onTaskChange: (taskId: OkfTaskId) => void;
  onPromptDraftChange?: (value: string) => void;
  onClose: () => void;
  onConnect: () => void;
  onAuthenticate: () => void;
  onRefresh: () => void;
  onStart: () => void;
}

export function OkfTaskLauncher({
  open,
  origin,
  status,
  tasks,
  selectedTaskId,
  promptDraft,
  plan,
  bundleSet,
  startDisabled = false,
  connectionName,
  onTaskChange,
  onPromptDraftChange,
  onClose,
  onConnect,
  onAuthenticate,
  onRefresh,
  onStart,
}: OkfTaskLauncherProps) {
  const state = launcherState(status, connectionName);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog okf-task-launcher" aria-describedby="okf-task-launcher-description">
          <header className="okf-task-launcher__header">
            <div className="okf-task-launcher__mark" aria-hidden="true">
              <Sparkles size={18} />
            </div>
            <div>
              <Dialog.Title>Start OKF work</Dialog.Title>
              <Dialog.Description id="okf-task-launcher-description">
                {okfTaskOriginLabel(origin)}: <strong>{origin.title}</strong>
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Cancel OKF task">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="okf-task-launcher__body">
            {status !== "first-use" && status !== "authentication" && status !== "unsupported" && (
              <fieldset className="okf-task-launcher__tasks">
              <legend>Choose a task</legend>
              {tasks.map((taskId) => {
                const task = OKF_TASKS[taskId];
                const inputId = `okf-task-${taskId}`;
                return (
                  <label key={taskId} htmlFor={inputId} aria-label={task.title}>
                    <input
                      id={inputId}
                      type="radio"
                      name="okf-task"
                      value={taskId}
                      checked={selectedTaskId === taskId}
                      onChange={() => onTaskChange(taskId)}
                    />
                    <span>
                      <strong>{task.title}</strong>
                      <small>{task.writes ? "Reviewed staging" : "Read only"}{task.network ? " · network" : " · local"}</small>
                    </span>
                  </label>
                );
              })}
              </fieldset>
            )}

            {state && (
              <section className="okf-task-launcher__state" data-status={status} role={state.role}>
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <strong>{state.title}</strong>
                <p>{state.description}</p>
              </div>
              </section>
            )}

            {promptDraft !== undefined && (
              <label className="okf-task-launcher__draft" htmlFor="okf-task-launcher-draft">
                <span>Prompt draft from external request</span>
                <textarea
                  id="okf-task-launcher-draft"
                  value={promptDraft}
                  maxLength={4096}
                  rows={4}
                  onChange={(event) => onPromptDraftChange?.(event.target.value)}
                />
                <small>
                  Edit or remove this untrusted text. It is sent only when you choose Start task.
                </small>
              </label>
            )}

            {bundleSet}

            {plan && (
              <OkfContextPlanCard
              plan={plan}
              stale={false}
              disabled={false}
              editable={false}
              onRemove={() => undefined}
              onAcceptRefresh={onRefresh}
              />
            )}
          </div>

          <footer className="okf-task-launcher__actions">
            <Dialog.Close className="btn ghost">Cancel</Dialog.Close>
            {status === "first-use" && (
              <button type="button" className="btn primary" onClick={onConnect}>Connect an agent</button>
            )}
            {status === "authentication" && (
              <button type="button" className="btn primary" onClick={onAuthenticate}>Authenticate</button>
            )}
            {status === "stale" && (
              <button type="button" className="btn primary" onClick={onRefresh}>Review refreshed plan</button>
            )}
            {(status === "ready" || status === "overflow" || status === "active-thread-conflict") && (
              <button type="button" className="btn primary" disabled={startDisabled} onClick={onStart}>
                {status === "active-thread-conflict" ? "Start separate thread" : status === "overflow" ? "Start with selected context" : "Start task"}
              </button>
            )}
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function launcherState(
  status: OkfTaskLauncherStatus,
  connectionName?: string,
): { title: string; description: string; role: "alert" | "status" } | null {
  switch (status) {
    case "first-use":
      return {
        title: "Connect an agent first",
        description: "The task and its origin will remain here while you choose an agent. Nothing connects automatically.",
        role: "status",
      };
    case "authentication":
      return {
        title: `${connectionName ?? "This agent"} needs authentication`,
        description: "Authenticate with the agent, then review this same bounded context plan before starting.",
        role: "status",
      };
    case "unsupported":
      return {
        title: "No supported OKF task for this object",
        description: "The selected object or current agent cannot run a compatible curated capability.",
        role: "alert",
      };
    case "stale":
      return {
        title: "The bundle changed",
        description: "Refresh the plan before starting so the agent receives the current bundle revision.",
        role: "alert",
      };
    case "overflow":
      return {
        title: "Some optional context does not fit",
        description: "The bounded plan shows exactly what will be included and omitted. Required context is never silently replaced.",
        role: "alert",
      };
    case "active-thread-conflict":
      return {
        title: "The current thread is busy",
        description: "This task will start in a separate thread so the active turn and its draft stay unchanged.",
        role: "status",
      };
    case "ready":
      return null;
  }
}
