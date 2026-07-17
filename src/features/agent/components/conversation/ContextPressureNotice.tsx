import type { AgentAvailableCommandInfo } from "@/features/agent/connection.ts";
import { CircleGauge, MessagesSquare, Minimize2 } from "lucide-react";
import type { AgentUsage } from "./types.ts";
import { contextPressureState } from "./contextRecovery.ts";
import "./ContextPressureNotice.css";

export interface ContextPressureNoticeProps {
  usage: AgentUsage;
  recoveryCommand: AgentAvailableCommandInfo | null;
  busy: boolean;
  canStartFresh: boolean;
  onRunCommand: (command: AgentAvailableCommandInfo) => void;
  onStartFresh: () => void;
}

export function ContextPressureNotice({
  usage,
  recoveryCommand,
  busy,
  canStartFresh,
  onRunCommand,
  onStartFresh,
}: ContextPressureNoticeProps) {
  const pressure = contextPressureState(usage);
  if (pressure.level === "normal" || pressure.percent === null) return null;
  const critical = pressure.level === "critical";
  return (
    <section
      className={`agent-context-pressure agent-context-pressure--${pressure.level}`}
      aria-label="Context recovery"
    >
      <CircleGauge size={18} aria-hidden="true" />
      <div className="agent-context-pressure__body">
        <strong>{critical ? "Context is almost full" : "Context is filling up"}</strong>
        <p>
          {pressure.percent}% of the agent&apos;s reported window is in use. Earlier details may
          fall out of context as this thread continues.
        </p>
        <p>
          {recoveryCommand
            ? `This agent advertised /${recoveryCommand.name}. Studio will run it as a visible turn and preserve the agent's reported result.`
            : "This agent has not advertised a compact or summary command. Start a fresh thread with a reviewable conversation draft instead."}
        </p>
      </div>
      <div className="agent-context-pressure__actions">
        {recoveryCommand && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onRunCommand(recoveryCommand)}
          >
            <Minimize2 size={14} aria-hidden="true" />
            Run /{recoveryCommand.name}
          </button>
        )}
        <button
          type="button"
          className="btn ghost"
          disabled={busy || !canStartFresh}
          title={canStartFresh
            ? "Open an unsent carry draft in a fresh thread"
            : "Close a live thread before starting another one"}
          onClick={onStartFresh}
        >
          <MessagesSquare size={14} aria-hidden="true" />
          New thread from context
        </button>
      </div>
    </section>
  );
}
