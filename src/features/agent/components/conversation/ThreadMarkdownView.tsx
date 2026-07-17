import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import "./ThreadMarkdownView.css";

export interface ThreadMarkdownViewProps {
  title: string;
  markdown: string;
  onClose: () => void;
}

export function ThreadMarkdownView({ title, markdown, onClose }: ThreadMarkdownViewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
    return () => {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="agent-thread-markdown"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>Read-only Markdown. No bundle file is created or changed.</p>
        </div>
        <button type="button" className="btn ghost icon" aria-label="Close Markdown view" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <textarea
        aria-label="Thread Markdown source"
        value={markdown}
        readOnly
        spellCheck={false}
      />
    </dialog>
  );
}
