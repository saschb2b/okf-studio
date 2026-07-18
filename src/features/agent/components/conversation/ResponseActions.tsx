import { Check, CircleAlert, Copy, TextSelect } from "lucide-react";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import {
  copyCompleteResponse,
  copyResponseSelection,
  responseSelectionPayload,
} from "./responseClipboard.ts";
import "./ResponseActions.css";

export type ResponseCopyStatus = "idle" | "selection" | "response" | "error";

export interface ResponseActionsProps {
  selectionRootRef: RefObject<HTMLElement | null>;
  responseText: string;
}

export function ResponseActions({
  selectionRootRef,
  responseText,
}: ResponseActionsProps) {
  const [selectionAvailable, setSelectionAvailable] = useState(false);
  const [status, setStatus] = useState<ResponseCopyStatus>("idle");

  useEffect(() => {
    function updateSelection() {
      const container = selectionRootRef.current;
      setSelectionAvailable(
        container !== null && responseSelectionPayload(container, window.getSelection()) !== null,
      );
    }
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, [selectionRootRef]);

  async function copySelection() {
    const container = selectionRootRef.current;
    if (!container) return;
    try {
      setStatus(await copyResponseSelection(container) ? "selection" : "error");
    } catch {
      setStatus("error");
    }
  }

  async function copyResponse() {
    try {
      setStatus(await copyCompleteResponse(responseText) ? "response" : "error");
    } catch {
      setStatus("error");
    }
  }

  const statusLabel = {
    idle: null,
    selection: "Selection copied",
    response: "Response copied",
    error: "Copy failed",
  }[status];
  const StatusIcon = status === "error" ? CircleAlert : Check;
  return (
    <div className="agent-response-actions">
      {selectionAvailable && (
        <button type="button" className="btn ghost" onClick={() => void copySelection()}>
          <TextSelect size={14} aria-hidden="true" />
          Copy selection
        </button>
      )}
      <button type="button" className="btn ghost" onClick={() => void copyResponse()}>
        <Copy size={14} aria-hidden="true" />
        Copy response
      </button>
      <span className="agent-response-actions__status" aria-live="polite">
        {statusLabel && <><StatusIcon size={13} aria-hidden="true" />{statusLabel}</>}
      </span>
    </div>
  );
}
