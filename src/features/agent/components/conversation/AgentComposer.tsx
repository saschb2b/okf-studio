// The prompt input and its action bar, split out of AgentConversation so the
// surface a user types into can be seen on its own. The component is
// presentational: it owns no session state and reaches for no IPC. The two
// rich controls arrive as slots, because both carry their own data loading.
//
// The bar holds one line of transient status, the context reading, the
// slotted controls, and the send control. A permanent capability label used
// to sit in the status slot ("Text and images"), which spent the composer's
// quietest row on something that never changed. See docs/ux/agent-composer.md.

import { Send, Square } from "lucide-react";
import type * as React from "react";
import "@/shared/styles/chrome.css";

export interface ComposerUsage {
  /** The short reading in the bar, e.g. "12% context". */
  visible: string;
  /** The long form for assistive technology and the tooltip. */
  detail: string;
}

export interface AgentComposerProps {
  inputId: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  placeholder: string;
  /** Blocks typing while a prompt is in flight or a follow-up is queued. */
  disabled?: boolean;
  /** Shown only while something is happening. Null the rest of the time. */
  status?: string | null;
  usage?: ComposerUsage | null;
  /** The attachment picker. */
  attachments?: React.ReactNode;
  /** Model, permission, and profile controls. */
  sessionControls?: React.ReactNode;
  /** A turn in flight swaps Send for Queue, and adds Stop. */
  turnActive?: boolean;
  sendDisabled?: boolean;
  isSubmitting?: boolean;
  queued?: boolean;
  isCancelling?: boolean;
  onStop?: () => void;
}

const MAX_PROMPT_CHARS = 128 * 1024;

export function AgentComposer({
  inputId,
  inputRef,
  value,
  onValueChange,
  onKeyDown,
  placeholder,
  disabled = false,
  status = null,
  usage = null,
  attachments,
  sessionControls,
  turnActive = false,
  sendDisabled = false,
  isSubmitting = false,
  queued = false,
  isCancelling = false,
  onStop,
}: AgentComposerProps) {
  return (
    <div className="agent-composer__input-shell">
      <label className="sr-only" htmlFor={inputId}>Message the agent</label>
      <textarea
        ref={inputRef}
        id={inputId}
        name="prompt"
        rows={3}
        maxLength={MAX_PROMPT_CHARS}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="agent-composer__actions">
        <div className="agent-composer__leading-actions">
          {attachments}
          {status && (
            <span className="agent-composer__status" title={status}>
              {status}
            </span>
          )}
          {usage && (
            <span
              className="agent-composer__usage"
              aria-label={usage.detail}
              title={usage.detail}
            >
              {usage.visible}
            </span>
          )}
        </div>
        {sessionControls}
        {turnActive ? (
          <div className="agent-composer__turn-actions">
            <button
              type="submit"
              className="btn primary icon"
              aria-label={queued ? "Queued" : "Queue"}
              title={queued ? "Queued" : "Queue"}
              disabled={sendDisabled}
            >
              <Send size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn icon"
              aria-label={isCancelling ? "Stopping..." : "Stop"}
              title={isCancelling ? "Stopping..." : "Stop"}
              disabled={isCancelling}
              onClick={onStop}
            >
              <Square size={15} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="submit"
            className="btn primary icon"
            aria-label={isSubmitting ? "Sending..." : "Send"}
            title={isSubmitting ? "Sending..." : "Send"}
            disabled={sendDisabled}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
