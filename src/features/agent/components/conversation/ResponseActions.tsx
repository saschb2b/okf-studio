import { Check, CircleAlert, Copy, TextSelect } from "lucide-react";
import "./ResponseActions.css";

export type ResponseCopyStatus = "idle" | "selection" | "response" | "error";

export interface ResponseActionsProps {
  selectionAvailable: boolean;
  status: ResponseCopyStatus;
  onCopySelection: () => void;
  onCopyResponse: () => void;
}

export function ResponseActions({
  selectionAvailable,
  status,
  onCopySelection,
  onCopyResponse,
}: ResponseActionsProps) {
  const statusLabel = {
    idle: null,
    selection: "Selection copied",
    response: "Response copied",
    error: "Copy failed",
  }[status];
  const StatusIcon = status === "error" ? CircleAlert : Check;
  return (
    <div className="agent-response-actions">
      <button
        type="button"
        className="btn ghost"
        disabled={!selectionAvailable}
        onClick={onCopySelection}
      >
        <TextSelect size={14} aria-hidden="true" />
        Copy selection
      </button>
      <button type="button" className="btn ghost" onClick={onCopyResponse}>
        <Copy size={14} aria-hidden="true" />
        Copy response
      </button>
      <span className="agent-response-actions__status" aria-live="polite">
        {statusLabel && <><StatusIcon size={13} aria-hidden="true" />{statusLabel}</>}
      </span>
    </div>
  );
}
