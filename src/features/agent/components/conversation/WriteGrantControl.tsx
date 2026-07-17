import type { AgentWriteGrantMode } from "@/features/agent/connection.ts";
import { Pencil } from "lucide-react";
import "./WriteGrantControl.css";

export interface WriteGrantControlProps {
  granted: boolean;
  activeMode: AgentWriteGrantMode | null;
  preferredMode: AgentWriteGrantMode;
  unattendedEligible: boolean;
  disabled: boolean;
  pending: boolean;
  onPreferredModeChange: (mode: AgentWriteGrantMode) => void;
  onToggle: () => void;
}

export function WriteGrantControl({
  granted,
  activeMode,
  preferredMode,
  unattendedEligible,
  disabled,
  pending,
  onPreferredModeChange,
  onToggle,
}: WriteGrantControlProps) {
  const effectiveMode = activeMode ?? preferredMode;
  const label = granted
    ? effectiveMode === "unattended"
      ? "Unattended edits"
      : "Edits allowed"
    : effectiveMode === "unattended"
      ? "Allow unattended"
      : "Allow edits";
  const accessibleLabel = granted
    ? effectiveMode === "unattended"
      ? "Unattended edits allowed in this thread"
      : "Edits allowed in this thread"
    : effectiveMode === "unattended"
      ? "Allow unattended edits in this thread for 30 minutes"
      : "Allow edits in this thread";
  const title = granted
    ? effectiveMode === "unattended"
      ? "Unattended staging is active for up to 30 minutes. Revoke it to change mode."
      : "Agent edits stage for review. Revoke access to change mode."
    : effectiveMode === "unattended"
      ? "Allow the isolated agent to stage edits for 30 minutes. Nothing is applied without review."
      : "Allow edits for this thread. Nothing is applied without review.";

  return (
    <div className="agent-write-grant" role="group" aria-label="Edit access">
      {unattendedEligible && (
        <select
          className="agent-write-grant__mode"
          aria-label="Edit access mode"
          title={granted ? "Revoke edit access before changing mode." : "Choose edit access mode."}
          value={effectiveMode}
          disabled={disabled || pending || granted}
          onChange={(event) =>
            onPreferredModeChange(event.target.value as AgentWriteGrantMode)}
        >
          <option value="interactive">Interactive</option>
          <option value="unattended">Unattended · 30 min</option>
        </select>
      )}
      <button
        type="button"
        className={`btn ghost agent-conversation__write-grant${granted ? " agent-conversation__write-grant--on" : ""}`}
        aria-pressed={granted}
        aria-label={accessibleLabel}
        title={title}
        disabled={disabled || pending}
        onClick={onToggle}
      >
        <Pencil aria-hidden="true" size={14} />
        <span className="agent-conversation__action-label">
          {pending ? "Updating..." : label}
        </span>
      </button>
    </div>
  );
}
