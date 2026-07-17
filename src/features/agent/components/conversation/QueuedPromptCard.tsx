import type { Ref } from "react";
import type { QueuedPrompt } from "./types.ts";
import "./QueuedPromptCard.css";

export interface QueuedPromptCardProps {
  prompt: QueuedPrompt;
  recallButtonRef?: Ref<HTMLButtonElement>;
  onRecall: () => void;
  onRemove: () => void;
}

export function QueuedPromptCard({
  prompt,
  recallButtonRef,
  onRecall,
  onRemove,
}: QueuedPromptCardProps) {
  const attachmentCount = prompt.concepts.length + prompt.sources.length;

  return (
    <section className="agent-queue" aria-labelledby={`queued-prompt-${prompt.id}`}>
      <div>
        <strong id={`queued-prompt-${prompt.id}`}>Next message</strong>
        <span>
          {attachmentCount > 0
            ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
            : "No attachments"}
        </span>
      </div>
      <p title={prompt.text}>{prompt.text}</p>
      <div className="agent-queue__actions">
        <button
          ref={recallButtonRef}
          type="button"
          className="btn ghost"
          onClick={onRecall}
        >
          Recall draft
        </button>
        <button type="button" className="btn ghost" onClick={onRemove}>
          Remove
        </button>
      </div>
    </section>
  );
}
