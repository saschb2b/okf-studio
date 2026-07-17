import type { AgentSecurityScopeInfo } from "@/features/agent/connection.ts";
import type { AgentThreadMetadata, AgentThreadWorkflow } from "@/features/agent/threadMetadata.ts";
import type { RefObject, SubmitEvent } from "react";
import { Archive as ArchiveIcon, Bot, CircleAlert, Ellipsis, FileDown, FileText, History, Pencil, ShieldQuestion, X } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { useId, useRef, useState } from "react";
import type { SavedThreadState } from "./types.ts";
import { THREAD_STARTERS, MAX_THREAD_TITLE_CHARS, errorMessage, threadDateLabel, SECURITY_PROFILE_NAMES, SECURITY_FILE_SCOPE, SECURITY_NETWORK_SCOPE, SECURITY_WRITE_SCOPE, SECURITY_CREDENTIAL_SCOPE, SECURITY_STOP_LABELS, readableSecurityStops, securityEvidenceCopy } from "./helpers.ts";
import "@/features/agent/components/AgentConversation.css";

export function SavedThreadWelcome({
  state,
  actionRef,
  onResume,
  onDismiss,
  onRetry,
  onStartNew,
}: {
  state: Exclude<SavedThreadState, { status: "none" }>;
  actionRef: RefObject<HTMLButtonElement | null>;
  onResume: (metadata: AgentThreadMetadata) => void;
  onDismiss: (metadata: AgentThreadMetadata) => void;
  onRetry: () => void;
  onStartNew: () => void;
}) {
  if (state.status === "loading") {
    return (
      <>
        <History size={24} aria-hidden="true" />
        <h3>Checking saved work</h3>
        <p role="status">Looking for a previous thread for this bundle and agent.</p>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <CircleAlert size={24} aria-hidden="true" />
        <h3>Saved thread unavailable</h3>
        <p role="alert">{state.message}</p>
        <div className="agent-saved-thread__recovery">
          <button
            ref={actionRef}
            type="button"
            className="btn primary"
            onClick={onRetry}
          >
            Retry
          </button>
          <button type="button" className="btn ghost" onClick={onStartNew}>
            Start new thread
          </button>
          {state.metadata && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (state.metadata) onDismiss(state.metadata);
              }}
            >
              {state.metadata.archived ? "Forget" : "Dismiss"}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <History size={24} aria-hidden="true" />
      <h3>Pick up where you left off</h3>
      <p>
        Resume saved work, or start a new thread. Starting fresh keeps the saved
        conversation available in History.
      </p>
      <div className="agent-saved-threads">
        {state.metadata.map((metadata, index) => {
          const isResuming = state.status === "resuming" &&
            state.sessionId === metadata.sessionId;
          const titleId = `agent-saved-thread-title-${index}`;
          const updatedAt = threadDateLabel(metadata.updatedAt);
          return (
            <section
              key={`${metadata.sessionId}-${metadata.archived ? "archived" : "current"}`}
              className="agent-saved-thread"
              aria-labelledby={titleId}
            >
              {metadata.archived
                ? <ArchiveIcon size={16} aria-hidden="true" />
                : <History size={16} aria-hidden="true" />}
              <div>
                <h4 id={titleId}>
                  {metadata.archived ? "Archived thread" : "Continue previous thread"}
                </h4>
                <span title={metadata.title}>{metadata.title}</span>
                {updatedAt && <small>Updated {updatedAt}</small>}
              </div>
              <div className="agent-saved-thread__actions">
                <button
                  ref={index === 0 ? actionRef : undefined}
                  type="button"
                  className={index === 0 ? "btn primary" : "btn"}
                  disabled={state.status === "resuming"}
                  onClick={() => onResume(metadata)}
                >
                  {isResuming ? "Resuming..." : "Resume"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={state.status === "resuming"}
                  onClick={() => onDismiss(metadata)}
                >
                  {metadata.archived ? "Forget" : "Dismiss"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <button
        type="button"
        className="btn ghost agent-saved-thread__start-new"
        disabled={state.status === "resuming"}
        onClick={onStartNew}
      >
        Start new thread
      </button>
    </>
  );
}
export function EmptyThreadWelcome({
  isStudioAgent,
  onSelectStarter,
}: {
  isStudioAgent: boolean;
  onSelectStarter: (prompt: string, workflow: AgentThreadWorkflow) => void;
}) {
  return (
    <>
      <Bot size={24} aria-hidden="true" />
      <h3>{isStudioAgent ? "Chat with Studio Agent" : "Ask about this bundle"}</h3>
      <p>
        {isStudioAgent
          ? "Studio gives the model canonical OKF guidance, bounded bundle and source tools, and reviewed staging. Proposed files stay in memory until you validate, review, and apply them."
          : "Studio attaches OKF context, read-only access to this bundle, and tools to inspect concepts, trace sources, and validate structure."}
      </p>
      <div className="agent-starters" role="group" aria-label="Start a guided thread">
        {THREAD_STARTERS.map((starter) => {
          const Icon = starter.icon;
          return (
            <button
              key={starter.title}
              type="button"
              className="agent-starter"
              aria-label={`${starter.title}: ${starter.description}`}
              onClick={() => onSelectStarter(starter.prompt, starter.workflow)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>
                <strong>{starter.title}</strong>
                <small>{starter.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}


export function ThreadSecurityScope({
  bundleName,
  scope,
}: {
  bundleName: string | null;
  scope: AgentSecurityScopeInfo;
}) {
  const profile = scope.profile;
  const profileName = SECURITY_PROFILE_NAMES[profile.id];
  const fileScope = SECURITY_FILE_SCOPE[profile.effectiveMounts];
  const networkScope = SECURITY_NETWORK_SCOPE[profile.networkPolicy];
  const writeScope = SECURITY_WRITE_SCOPE[profile.writableRoots];
  const credentialScope = SECURITY_CREDENTIAL_SCOPE[profile.credentialExposure];
  const processScope = {
    "in-process": "No external ACP process runs.",
    "posix-process-group": "Studio owns the agent's POSIX process group and stops it on disconnect.",
    "windows-job-object": "Studio owns a kill-on-close Windows Job Object and stops it on disconnect.",
  }[scope.processContainment];
  const evidenceScope = securityEvidenceCopy(scope);
  const stopConditions = readableSecurityStops(
    profile.stopConditions.map((condition) => SECURITY_STOP_LABELS[condition]),
  );
  const lifetimeScope = stopConditions
    ? `Connection only. Stops on ${stopConditions}.`
    : "Connection only. No stop conditions were reported.";
  const profileScope = `${profileName}. ${profile.unattendedEligible
    ? "Eligible for unattended work."
    : "Unattended work is locked."}`;

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Thread security scope"
            title="Thread security scope"
          >
            <ShieldQuestion size={14} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover agent-security-scope"
            aria-label="Thread security scope"
            tabIndex={0}
          >
            <strong>Thread security scope</strong>
            <dl>
              <div>
                <dt>Bundle</dt>
                <dd>{bundleName ?? "No bundle selected"}</dd>
              </div>
              <div>
                <dt>Profile</dt>
                <dd>{profileScope}</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{fileScope}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{networkScope}</dd>
              </div>
              <div>
                <dt>Writes</dt>
                <dd>{writeScope}</dd>
              </div>
              <div>
                <dt>Credentials</dt>
                <dd>{credentialScope}</dd>
              </div>
              <div>
                <dt>Process</dt>
                <dd>{processScope}</dd>
              </div>
              <div>
                <dt>Lifetime</dt>
                <dd>{lifetimeScope}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{evidenceScope}</dd>
              </div>
            </dl>
            {scope.profile.id === "external-interactive-unrestricted-v1" && (
              <p>This proves process-tree ownership, not a filesystem or network sandbox.</p>
            )}
            {profile.unattendedEligible && (
              <p>Unattended edit access expires after 30 minutes. Staged changes still require review and Apply.</p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface ThreadTitleEditorProps {
  title: string;
  onTitleChange: (title: string) => void;
}

export function ThreadTitleEditor({ title, onTitleChange }: ThreadTitleEditorProps) {
  const titleInputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) setDraft(title);
  }

  function saveTitle(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = draft.replace(/\s+/g, " ").trim();
    if (!nextTitle) return;
    onTitleChange(nextTitle);
    setIsOpen(false);
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon agent-conversation__rename"
            aria-label={`Rename thread: ${title}`}
            title="Rename thread"
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover agent-thread-title"
            aria-label="Rename thread"
            initialFocus={inputRef}
          >
            <form onSubmit={saveTitle}>
              <label htmlFor={titleInputId}>Thread title</label>
              <input
                ref={inputRef}
                id={titleInputId}
                maxLength={MAX_THREAD_TITLE_CHARS}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="agent-thread-title__actions">
                <button type="button" className="btn ghost" onClick={() => setIsOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!draft.trim()}>
                  Save title
                </button>
              </div>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ThreadSurfaceClose({
  disabled,
  onClose,
}: {
  disabled: boolean;
  onClose: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [closeState, setCloseState] = useState<"idle" | "closing">("idle");
  const [closeError, setCloseError] = useState<string | null>(null);

  async function closeThread() {
    setCloseState("closing");
    setCloseError(null);
    try {
      await onClose();
    } catch (error: unknown) {
      setCloseError(errorMessage(error));
      setCloseState("idle");
    }
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Close thread surface"
            title={disabled
              ? "Finish the current thread operation before closing it."
              : "Close this live thread surface"}
            disabled={disabled}
          >
            <X size={14} aria-hidden="true" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover agent-thread-close"
            aria-label="Close thread surface"
          >
            <strong>Close this live thread?</strong>
            <p>
              Its in-memory transcript, draft, and staged review will be removed.
              Agent-owned history is not deleted.
            </p>
            {closeError && <p className="agent-thread-close__error" role="alert">{closeError}</p>}
            <div className="agent-thread-close__actions">
              <button
                type="button"
                className="btn ghost"
                disabled={closeState === "closing"}
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={closeState === "closing"}
                onClick={() => void closeThread()}
              >
                {closeState === "closing" ? "Closing..." : "Close thread"}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface ThreadActionsMenuProps {
  historyAvailable: boolean;
  historyDisabled: boolean;
  exportAvailable: boolean;
  exportDisabled: boolean;
  exportPending: boolean;
  markdownAvailable: boolean;
  markdownDisabled: boolean;
  archiveAvailable: boolean;
  archiveDisabled: boolean;
  archiveTitle: string;
  changeDisabled: boolean;
  onOpenHistory: () => void;
  onOpenMarkdown: () => void;
  onExport: () => void;
  onArchive: () => void;
  onChangeAgent: () => void;
}

export function ThreadActionsMenu({
  historyAvailable,
  historyDisabled,
  exportAvailable,
  exportDisabled,
  exportPending,
  markdownAvailable,
  markdownDisabled,
  archiveAvailable,
  archiveDisabled,
  archiveTitle,
  changeDisabled,
  onOpenHistory,
  onOpenMarkdown,
  onExport,
  onArchive,
  onChangeAgent,
}: ThreadActionsMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="btn ghost icon"
        data-agent-initial-focus
        aria-label="More thread actions"
        title="More thread actions"
      >
        <Ellipsis aria-hidden="true" size={15} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Menu.Popup className="ui-popover agent-thread-actions" aria-label="Thread actions">
            {historyAvailable && (
              <Menu.Item
                className="agent-thread-actions__item"
                disabled={historyDisabled}
                onClick={onOpenHistory}
              >
                <History aria-hidden="true" size={14} />
                <span>History</span>
              </Menu.Item>
            )}
            {exportAvailable && (
              <Menu.Item
                className="agent-thread-actions__item"
                disabled={exportDisabled}
                onClick={onExport}
              >
                <FileDown aria-hidden="true" size={14} />
                <span>{exportPending ? "Exporting..." : "Export thread"}</span>
              </Menu.Item>
            )}
            {markdownAvailable && (
              <Menu.Item
                className="agent-thread-actions__item"
                disabled={markdownDisabled}
                onClick={onOpenMarkdown}
              >
                <FileText aria-hidden="true" size={14} />
                <span>Open as Markdown</span>
              </Menu.Item>
            )}
            {archiveAvailable && (
              <Menu.Item
                className="agent-thread-actions__item"
                disabled={archiveDisabled}
                title={archiveTitle}
                onClick={onArchive}
              >
                <ArchiveIcon aria-hidden="true" size={14} />
                <span>Archive thread</span>
              </Menu.Item>
            )}
            <Menu.Item
              className="agent-thread-actions__item"
              disabled={changeDisabled}
              onClick={onChangeAgent}
            >
              <Bot aria-hidden="true" size={14} />
              <span>Change agent</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

