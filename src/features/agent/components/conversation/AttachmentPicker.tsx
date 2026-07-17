import type { AgentSourceInput } from "@/shared/ipc.ts";
import type { AgentThreadMetadata } from "@/features/agent/threadMetadata.ts";
import type { Issue } from "@/shared/types.ts";
import type { ReaderSelectionCapture } from "@/features/agent/readerSelection.ts";
import { ChevronLeft, FilePlus2, FileText, FolderPlus, History, ImagePlus, Paperclip, Plus, TextSelect, TriangleAlert } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { fetchAgentSourceUrl } from "@/shared/ipc.ts";
import { useEffect, useRef, useState } from "react";
import type { ThreadAttachSupport } from "./types.ts";
import { errorMessage, threadDateLabel, validationIssueKey } from "./helpers.ts";
import "@/features/agent/components/AgentConversation.css";

export type AttachmentView = "menu" | "concepts" | "issues" | "source" | "threads";
export type NativeSourcePicker = "files" | "folder" | "images";
export type ThreadPickerState =
  | { status: "loading" }
  | { status: "ready"; threads: readonly AgentThreadMetadata[] }
  | { status: "error"; message: string };

export interface AttachmentPickerProps {
  concepts: readonly { id: string; title: string; type: string }[];
  activeConceptId: string | null;
  attachedConcepts: readonly { id: string; title: string; type: string }[];
  issues: readonly Issue[];
  attachedIssueKeys: ReadonlySet<string>;
  sourceCount: number;
  onCaptureReaderSelection: () => ReaderSelectionCapture;
  disabled: boolean;
  bundleAttachmentsSupported: boolean;
  imageSupported: boolean;
  threadSupport: ThreadAttachSupport;
  onLoadThreads: () => Promise<AgentThreadMetadata[]>;
  onThreadAttach: (metadata: AgentThreadMetadata) => Promise<void>;
  nativePicker: NativeSourcePicker | null;
  onConceptAttach: (concept: { id: string; title: string; type: string }) => void;
  onIssueAttach: (issue: Issue, issueKey: string) => void;
  onSourceAttach: (source: AgentSourceInput, kind?: "selection") => void;
  onNativePick: (kind: NativeSourcePicker) => void;
}

export function AttachmentPicker({
  concepts,
  activeConceptId,
  attachedConcepts,
  issues,
  attachedIssueKeys,
  sourceCount,
  onCaptureReaderSelection,
  disabled,
  bundleAttachmentsSupported,
  imageSupported,
  threadSupport,
  onLoadThreads,
  onThreadAttach,
  nativePicker,
  onConceptAttach,
  onIssueAttach,
  onSourceAttach,
  onNativePick,
}: AttachmentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<AttachmentView>("menu");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"paste" | "url">("paste");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [threadPicker, setThreadPicker] = useState<ThreadPickerState>({ status: "loading" });
  const [attachingThreadId, setAttachingThreadId] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [readerSelection, setReaderSelection] = useState<ReaderSelectionCapture>({
    status: "unavailable",
    reason: "Select text in the reader first.",
  });
  const fetchRequestRef = useRef(0);
  const threadRequestRef = useRef(0);
  const menuFirstRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const isAtLimit = sourceCount >= 8;
  const canAttach = title.trim().length > 0 && content.trim().length > 0;
  const canFetch = url.trim().startsWith("https://") && !isFetching;

  useEffect(() => {
    if (!isOpen) return;
    let focusFrame = 0;
    const renderFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        if (view === "menu") {
          menuFirstRef.current?.focus();
          return;
        }
        popupRef.current
          ?.querySelector<HTMLElement>("[data-attachment-initial-focus]")
          ?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(renderFrame);
      cancelAnimationFrame(focusFrame);
    };
  }, [isOpen, mode, view]);

  const attachedIds = new Set(attachedConcepts.map((concept) => concept.id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingConcepts = concepts
    .filter((concept) => !attachedIds.has(concept.id))
    .filter((concept) =>
      normalizedQuery.length === 0
        ? true
        : `${concept.title} ${concept.id} ${concept.type}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
    )
    .sort((left, right) => {
      if (left.id === activeConceptId) return -1;
      if (right.id === activeConceptId) return 1;
      return left.title.localeCompare(right.title);
    });
  const availableIssues = issues.filter(
    (issue) => !attachedIssueKeys.has(validationIssueKey(issue)),
  );
  let issueExplanation = "Attach a validation finding to the next message.";
  if (!bundleAttachmentsSupported) {
    issueExplanation = "Use the local agent's read-only validation tool.";
  } else if (issues.length === 0) issueExplanation = "This bundle has no validation issues.";
  else if (availableIssues.length === 0) issueExplanation = "All validation issues are attached.";
  else if (isAtLimit) issueExplanation = "The source limit has been reached.";
  const selectionExplanation = !bundleAttachmentsSupported
    ? "Reader selections are not available to Studio Agent connections yet."
    : isAtLimit
      ? "The source limit has been reached."
      : readerSelection.status === "available"
        ? "Attach the selected text from the current concept"
        : readerSelection.reason;
  const threadExplanation = threadSupport === "unsupported"
    ? "This agent does not expose session history."
    : isAtLimit
      ? "The source limit has been reached."
      : threadSupport === "busy"
        ? "Wait for the active turn to finish."
        : "Attach a saved thread as source evidence";

  function close() {
    fetchRequestRef.current += 1;
    threadRequestRef.current += 1;
    setIsOpen(false);
    setView("menu");
    setQuery("");
    setMode("paste");
    setTitle("");
    setContent("");
    setUrl("");
    setUrlError(null);
    setIsFetching(false);
    setThreadPicker({ status: "loading" });
    setAttachingThreadId(null);
    setThreadError(null);
  }

  function openView(nextView: AttachmentView) {
    setView(nextView);
  }

  async function openThreads() {
    setView("threads");
    const requestId = ++threadRequestRef.current;
    setThreadPicker({ status: "loading" });
    setThreadError(null);
    try {
      const threads = await onLoadThreads();
      if (threadRequestRef.current !== requestId) return;
      setThreadPicker({ status: "ready", threads });
    } catch (error) {
      if (threadRequestRef.current !== requestId) return;
      setThreadPicker({ status: "error", message: errorMessage(error) });
    }
    // The list arrives after the subview rendered, so the mount-time focus
    // pass found nothing; move focus once results (or Back, when empty) exist.
    requestAnimationFrame(() => {
      const popup = popupRef.current;
      if (!popup || threadRequestRef.current !== requestId) return;
      const target = popup.querySelector<HTMLElement>("[data-attachment-initial-focus]")
        ?? popup.querySelector<HTMLElement>("button");
      target?.focus();
    });
  }

  async function attachThread(metadata: AgentThreadMetadata) {
    if (attachingThreadId) return;
    const requestId = ++threadRequestRef.current;
    setAttachingThreadId(metadata.sessionId);
    setThreadError(null);
    try {
      await onThreadAttach(metadata);
      if (threadRequestRef.current !== requestId) return;
      close();
    } catch (error) {
      if (threadRequestRef.current !== requestId) return;
      setAttachingThreadId(null);
      setThreadError(errorMessage(error));
    }
  }

  function attach() {
    if (!canAttach) return;
    onSourceAttach({ title: title.trim(), content });
    close();
  }

  async function fetchSource() {
    if (!canFetch) return;
    const requestId = ++fetchRequestRef.current;
    setIsFetching(true);
    setUrlError(null);
    try {
      const source = await fetchAgentSourceUrl(url.trim());
      if (fetchRequestRef.current !== requestId) return;
      onSourceAttach(source);
      close();
    } catch (error) {
      if (fetchRequestRef.current !== requestId) return;
      setUrlError(errorMessage(error));
      setIsFetching(false);
    }
  }

  function pickNative(kind: NativeSourcePicker) {
    close();
    onNativePick(kind);
  }

  const popupClass = view === "source"
    ? "ui-popover agent-attachment-picker agent-source-picker"
    : "ui-popover agent-attachment-picker";

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setIsOpen(true);
        else close();
      }}
    >
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon agent-attachment-trigger"
            aria-label="Add context or sources"
            title="Add context or sources"
            disabled={disabled || nativePicker !== null}
            onPointerDown={() => setReaderSelection(onCaptureReaderSelection())}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setReaderSelection(onCaptureReaderSelection());
              }
            }}
          >
            <Plus size={17} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup
            ref={popupRef}
            className={popupClass}
            aria-label="Add context or sources"
            initialFocus={menuFirstRef}
          >
            {view === "menu" && (
              <div className="agent-attachment-picker__menu">
                <button
                  ref={bundleAttachmentsSupported ? menuFirstRef : undefined}
                  type="button"
                  aria-label="Attach context"
                  title={bundleAttachmentsSupported
                    ? undefined
                    : "Use the local agent's read-only OKF tools."}
                  disabled={!bundleAttachmentsSupported || attachedConcepts.length >= 8}
                  onClick={() => openView("concepts")}
                >
                  <Paperclip size={16} aria-hidden="true" />
                  <span><strong>Bundle concepts</strong><small>Attach concepts from the active bundle</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Attach reader selection"
                  title={selectionExplanation}
                  disabled={!bundleAttachmentsSupported || isAtLimit || readerSelection.status === "unavailable"}
                  onClick={() => {
                    if (readerSelection.status !== "available") return;
                    onSourceAttach(readerSelection.source, "selection");
                    close();
                  }}
                >
                  <TextSelect size={16} aria-hidden="true" />
                  <span><strong>Reader selection</strong><small>{selectionExplanation}</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Attach issue"
                  title={issueExplanation}
                  disabled={!bundleAttachmentsSupported || isAtLimit || availableIssues.length === 0}
                  onClick={() => openView("issues")}
                >
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span><strong>Validation issue</strong><small>{issueExplanation}</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Attach previous thread"
                  title={threadExplanation}
                  disabled={isAtLimit || threadSupport !== "ready"}
                  onClick={() => void openThreads()}
                >
                  <History size={16} aria-hidden="true" />
                  <span><strong>Previous thread</strong><small>{threadExplanation}</small></span>
                </button>
                <button
                  ref={!bundleAttachmentsSupported ? menuFirstRef : undefined}
                  type="button"
                  aria-label="Add source"
                  disabled={isAtLimit}
                  onClick={() => openView("source")}
                >
                  <FileText size={16} aria-hidden="true" />
                  <span><strong>Text or URL</strong><small>Paste text or fetch a public HTTPS page</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Add files"
                  disabled={isAtLimit || nativePicker !== null}
                  onClick={() => pickNative("files")}
                >
                  <FilePlus2 size={16} aria-hidden="true" />
                  <span><strong>Files</strong><small>PDF, Markdown, text, HTML, CSV, or JSON</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Add folder"
                  disabled={isAtLimit || nativePicker !== null}
                  onClick={() => pickNative("folder")}
                >
                  <FolderPlus size={16} aria-hidden="true" />
                  <span><strong>Folder</strong><small>Discover supported files below one folder</small></span>
                </button>
                <button
                  type="button"
                  aria-label="Add images"
                  title={imageSupported ? undefined : "This agent does not accept image prompts."}
                  disabled={!imageSupported || isAtLimit || nativePicker !== null}
                  onClick={() => pickNative("images")}
                >
                  <ImagePlus size={16} aria-hidden="true" />
                  <span>
                    <strong>Images</strong>
                    <small>{imageSupported ? "PNG, JPEG, or WebP" : "This agent does not accept images"}</small>
                  </span>
                </button>
              </div>
            )}

            {view === "concepts" && (
              <>
                <AttachmentPickerHeader title="Bundle concepts" onBack={() => openView("menu")} />
                <input
                  data-attachment-initial-focus
                  type="search"
                  aria-label="Search concepts to attach"
                  placeholder="Search concepts..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="agent-context-picker__results">
                  {matchingConcepts.length > 0 ? matchingConcepts.map((concept) => (
                    <button
                      key={concept.id}
                      type="button"
                      aria-label={`Add ${concept.title} to context`}
                      onClick={() => {
                        onConceptAttach(concept);
                        close();
                      }}
                    >
                      <FileText size={14} aria-hidden="true" />
                      <span><strong>{concept.title}</strong><small>{concept.id}.md</small></span>
                      {concept.id === activeConceptId && <em>Current</em>}
                    </button>
                  )) : <p>No matching concepts.</p>}
                </div>
              </>
            )}

            {view === "issues" && (
              <>
                <AttachmentPickerHeader title="Validation issues" onBack={() => openView("menu")} />
                <div className="agent-context-picker__results">
                  {availableIssues.map((issue, index) => {
                    const key = validationIssueKey(issue);
                    const severity = issue.level === "error" ? "Error" : "Warning";
                    return (
                      <button
                        key={key}
                        type="button"
                        data-attachment-initial-focus={index === 0 ? "" : undefined}
                        title={issue.message}
                        aria-label={`Attach ${severity.toLowerCase()}: ${issue.message}`}
                        onClick={() => {
                          onIssueAttach(issue, key);
                          close();
                        }}
                      >
                        <TriangleAlert
                          className={issue.level === "error"
                            ? "agent-issue-picker__error-icon"
                            : "agent-context-chip__warning-icon"}
                          size={14}
                          aria-hidden="true"
                        />
                        <span><strong>{severity}</strong><small>{issue.message}</small></span>
                        {issue.conceptId && <em>{issue.conceptId}</em>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {view === "threads" && (
              <>
                <AttachmentPickerHeader title="Previous thread" onBack={() => openView("menu")} />
                {threadPicker.status === "loading" && (
                  <p role="status">Loading saved threads...</p>
                )}
                {threadPicker.status === "error" && (
                  <>
                    <p className="agent-source-picker__error" role="alert">
                      Saved threads unavailable. {threadPicker.message}
                    </p>
                    <div className="agent-source-picker__actions">
                      <button
                        type="button"
                        className="btn"
                        data-attachment-initial-focus
                        onClick={() => void openThreads()}
                      >
                        Retry
                      </button>
                    </div>
                  </>
                )}
                {threadPicker.status === "ready" && threadPicker.threads.length === 0 && (
                  <p>No saved thread exists for this bundle and agent.</p>
                )}
                {threadPicker.status === "ready" && threadPicker.threads.length > 0 && (
                  <>
                    <p>Attach a saved thread's replayed conversation as one source.</p>
                    <div className="agent-context-picker__results">
                      {threadPicker.threads.map((metadata, index) => {
                        const updatedAt = threadDateLabel(metadata.updatedAt);
                        const detail = attachingThreadId === metadata.sessionId
                          ? "Attaching..."
                          : [metadata.archived ? "Archived" : "Current", updatedAt]
                            .filter(Boolean)
                            .join(" · ");
                        return (
                          <button
                            key={metadata.sessionId}
                            type="button"
                            data-attachment-initial-focus={index === 0 ? "" : undefined}
                            title={metadata.title}
                            aria-label={`Attach previous thread: ${metadata.title}`}
                            disabled={attachingThreadId !== null}
                            onClick={() => void attachThread(metadata)}
                          >
                            <History size={14} aria-hidden="true" />
                            <span><strong>{metadata.title}</strong><small>{detail}</small></span>
                          </button>
                        );
                      })}
                    </div>
                    {threadError && (
                      <p className="agent-source-picker__error" role="alert">{threadError}</p>
                    )}
                  </>
                )}
              </>
            )}

            {view === "source" && (
              <>
                <AttachmentPickerHeader title="Text or URL" onBack={() => openView("menu")} />
                <p>Paste text or fetch a public HTTPS page for your next message.</p>
                <div className="agent-source-picker__modes" aria-label="Source input method">
              <button
                type="button"
                className="btn ghost"
                aria-pressed={mode === "paste"}
                disabled={isFetching}
                onClick={() => {
                  setMode("paste");
                  setUrlError(null);
                }}
              >
                Paste text
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-pressed={mode === "url"}
                disabled={isFetching}
                onClick={() => setMode("url")}
              >
                Fetch URL
              </button>
                </div>
                {mode === "paste" ? (
              <>
                <label>
                  <span>Title</span>
                  <input
                    data-attachment-initial-focus
                    value={title}
                    maxLength={256}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label>
                  <span>Content</span>
                  <textarea
                    value={content}
                    rows={8}
                    maxLength={64 * 1024}
                    onChange={(event) => setContent(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <label>
                <span>HTTPS URL</span>
                <input
                  data-attachment-initial-focus
                  type="url"
                  inputMode="url"
                  value={url}
                  maxLength={2_048}
                  placeholder="https://example.com/research.html"
                  disabled={isFetching}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setUrlError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void fetchSource();
                    }
                  }}
                />
              </label>
                )}
                {urlError && <p className="agent-source-picker__error" role="alert">{urlError}</p>}
                <div className="agent-source-picker__actions">
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              {mode === "paste" ? (
                <button type="button" className="btn primary" disabled={!canAttach} onClick={attach}>
                  Attach source
                </button>
              ) : (
                <button type="button" className="btn primary" disabled={!canFetch} onClick={() => void fetchSource()}>
                  {isFetching ? "Fetching..." : "Fetch and attach"}
                </button>
              )}
                </div>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function AttachmentPickerHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="agent-attachment-picker__header">
      <button
        type="button"
        className="btn ghost icon"
        aria-label="Back to add menu"
        onClick={onBack}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <h3>{title}</h3>
    </div>
  );
}
