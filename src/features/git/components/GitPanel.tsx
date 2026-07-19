import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import {
  gitCommit,
  gitRemoteOperation,
  gitRepositoryHistory,
  gitStageAll,
  gitStagePaths,
  gitUndoCommit,
  gitUnstageAll,
  gitUnstagePaths,
} from "@/shared/ipc.ts";
import {
  openGitDiff,
  refreshGitRepository,
  useGitRepository,
} from "@/features/git/gitRepositoryStore.ts";
import type {
  GitChange,
  GitHistoryPage,
  GitRemoteOperation,
  GitRepositorySnapshot,
} from "@/features/git/types.ts";
import "./GitPanel.css";

type GitPanelTab = "changes" | "history";

interface GitFeedback {
  tone: "success" | "error";
  message: string;
  undoHead?: string;
}

export interface GitPanelViewProps {
  open: boolean;
  snapshot: GitRepositorySnapshot | null;
  loading: boolean;
  error: string | null;
  tab: GitPanelTab;
  history: GitHistoryPage | null;
  historyLoading: boolean;
  historyError: string | null;
  message: string;
  pending: string | null;
  feedback: GitFeedback | null;
  onClose: () => void;
  onTabChange: (tab: GitPanelTab) => void;
  onRefresh: () => void;
  onToggleChange: (change: GitChange) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onOpenChange: (change: GitChange) => void;
  onOpenAllChanges: () => void;
  onOpenCommit: (sha: string) => void;
  onLoadMoreHistory: () => void;
  onRetryHistory: () => void;
  onMessageChange: (message: string) => void;
  onCommit: (includeTracked: boolean) => void;
  onUndo: (head: string) => void;
  onRemote: (operation: GitRemoteOperation) => void;
}

export function GitPanel() {
  const { state, actions } = useApp();
  const open = state.panels.git;
  const root = state.activeRoot;
  const repository = useGitRepository(root);
  const [tab, setTab] = useState<GitPanelTab>("changes");
  const [history, setHistory] = useState<GitHistoryPage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<GitFeedback | null>(null);

  useEffect(() => {
    if (!open || !root) return;
    const refresh = () => void refreshGitRepository(root, true);
    const interval = window.setInterval(refresh, 2500);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [open, root]);

  async function loadInitialHistory(): Promise<void> {
    if (!root || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await gitRepositoryHistory(root, 0, 50));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error));
    }
    setHistoryLoading(false);
  }

  async function runOperation(
    name: string,
    operation: () => Promise<GitRepositorySnapshot>,
    success?: (snapshot: GitRepositorySnapshot) => void,
  ): Promise<void> {
    setPending(name);
    setFeedback(null);
    try {
      const snapshot = await operation();
      success?.(snapshot);
      await refreshGitRepository(root, true);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    setPending(null);
  }

  async function loadMoreHistory(): Promise<void> {
    if (!root || !history || historyLoading || !history.hasMore) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const next = await gitRepositoryHistory(root, history.commits.length, 50);
      setHistory({
        commits: [...history.commits, ...next.commits],
        hasMore: next.hasMore,
      });
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error));
    }
    setHistoryLoading(false);
  }

  const viewProps: GitPanelViewProps = {
    open,
    snapshot: repository.snapshot,
    loading: repository.loading,
    error: repository.error,
    tab,
    history,
    historyLoading,
    historyError,
    message,
    pending,
    feedback,
    onClose: () => actions.togglePanel("git", false),
    onTabChange: (nextTab) => {
      setTab(nextTab);
      if (nextTab === "history" && !history) void loadInitialHistory();
    },
    onRefresh: () => void refreshGitRepository(root, true),
    onToggleChange: (change) => {
      if (!root) return;
      const unstage = change.staged;
      void runOperation(
        unstage ? `unstage:${change.path}` : `stage:${change.path}`,
        () => unstage
          ? gitUnstagePaths(root, [change.path])
          : gitStagePaths(root, [change.path]),
      );
    },
    onStageAll: () => {
      if (root) void runOperation("stage-all", () => gitStageAll(root));
    },
    onUnstageAll: () => {
      if (root) void runOperation("unstage-all", () => gitUnstageAll(root));
    },
    onOpenChange: (change) => {
      if (root) {
        void openGitDiff(root, {
          path: change.path,
          staged: change.staged && !change.unstaged,
        });
      }
    },
    onOpenAllChanges: () => {
      if (root) void openGitDiff(root, { staged: false });
    },
    onOpenCommit: (sha) => {
      if (root) void openGitDiff(root, { commit: sha });
    },
    onLoadMoreHistory: () => void loadMoreHistory(),
    onRetryHistory: () => void loadInitialHistory(),
    onMessageChange: setMessage,
    onCommit: (includeTracked) => {
      if (!root) return;
      void runOperation(
        "commit",
        () => gitCommit(root, message, includeTracked),
        (snapshot) => {
          setMessage("");
          setHistory(null);
          setFeedback({
            tone: "success",
            message: "Commit created.",
            undoHead: snapshot.headSha ?? undefined,
          });
        },
      );
    },
    onUndo: (head) => {
      if (!root) return;
      void runOperation("undo", () => gitUndoCommit(root, head), () => {
        setFeedback({ tone: "success", message: "Commit undone. Changes are staged." });
        setHistory(null);
      });
    },
    onRemote: (operation) => {
      if (!root) return;
      void runOperation(operation, () => gitRemoteOperation(root, operation), () => {
        setFeedback({
          tone: "success",
          message: operation === "fetch"
            ? "Remote state updated."
            : operation === "pull"
              ? "Fast-forward pull completed."
              : "Push completed.",
        });
      });
    },
  };

  return <GitPanelView {...viewProps} />;
}

export function GitPanelView(props: GitPanelViewProps) {
  if (!props.open) return null;
  const snapshot = props.snapshot;
  const changes = snapshot?.changes ?? [];
  const stagedCount = changes.filter((change) => change.staged).length;
  const trackedUnstagedCount = changes.filter(
    (change) => change.unstaged && change.kind !== "untracked",
  ).length;
  const hasConflicts = changes.some((change) => change.kind === "conflict");
  const includeTracked = stagedCount === 0 && trackedUnstagedCount > 0;
  const canCommit = Boolean(
    props.message.trim() && !props.pending && !hasConflicts &&
    (stagedCount > 0 || trackedUnstagedCount > 0),
  );

  return (
    <aside className="git-panel" aria-label="Git">
      <header className="git-panel__header">
        <span className="git-panel__title">
          <GitBranch size={17} aria-hidden="true" />
          Git
        </span>
        <button className="git-icon-button" type="button" onClick={props.onClose} aria-label="Close Git panel">
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="git-panel__tabs" role="tablist" aria-label="Git views">
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === "changes"}
          className={props.tab === "changes" ? "is-active" : ""}
          onClick={() => props.onTabChange("changes")}
        >
          Changes{changes.length > 0 ? ` ${changes.length}` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === "history"}
          className={props.tab === "history" ? "is-active" : ""}
          onClick={() => props.onTabChange("history")}
        >
          History
        </button>
      </div>

      {props.loading && !snapshot ? <GitPanelState icon={<LoaderCircle className="spin" />} title="Reading repository" /> : null}
      {props.error && !snapshot ? <GitPanelState title="Git status unavailable" detail={props.error} action="Retry" onAction={props.onRefresh} /> : null}
      {snapshot && snapshot.availability !== "ready" ? (
        <GitPanelState title={availabilityTitle(snapshot.availability)} detail={snapshot.message ?? undefined} />
      ) : null}

      {snapshot?.availability === "ready" && props.tab === "changes" ? (
        <ChangesView
          changes={changes}
          pending={props.pending}
          onRefresh={props.onRefresh}
          onToggle={props.onToggleChange}
          onOpen={props.onOpenChange}
          onOpenAll={props.onOpenAllChanges}
          onStageAll={props.onStageAll}
          onUnstageAll={props.onUnstageAll}
        />
      ) : null}

      {snapshot?.availability === "ready" && props.tab === "history" ? (
        <HistoryView
          page={props.history}
          loading={props.historyLoading}
          error={props.historyError}
          onOpen={props.onOpenCommit}
          onLoadMore={props.onLoadMoreHistory}
          onRetry={props.onRetryHistory}
        />
      ) : null}

      {snapshot?.availability === "ready" ? (
        <footer className="git-panel__footer">
          <RepositoryFooter snapshot={snapshot} pending={props.pending} onRemote={props.onRemote} />
          {props.feedback ? (
            <div className={`git-feedback is-${props.feedback.tone}`} role={props.feedback.tone === "error" ? "alert" : "status"}>
              <span>{props.feedback.message}</span>
              {props.feedback.undoHead ? (
                <button type="button" onClick={() => props.onUndo(props.feedback?.undoHead ?? "")}>
                  <RotateCcw size={14} aria-hidden="true" /> Undo
                </button>
              ) : null}
            </div>
          ) : null}
          <label className="git-commit-message">
            <span className="sr-only">Commit message</span>
            <textarea
              value={props.message}
              onChange={(event) => props.onMessageChange(event.target.value)}
              placeholder="Enter commit message"
              rows={3}
              disabled={Boolean(props.pending)}
            />
          </label>
          {hasConflicts ? <p className="git-commit-hint">Resolve conflicts before committing.</p> : null}
          <button
            type="button"
            className="git-commit-button"
            disabled={!canCommit}
            onClick={() => props.onCommit(includeTracked)}
          >
            {props.pending === "commit" ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <GitCommitHorizontal size={16} aria-hidden="true" />}
            {includeTracked ? "Commit tracked" : "Commit staged"}
          </button>
          {includeTracked ? <p className="git-commit-hint">Untracked files stay out of this commit.</p> : null}
        </footer>
      ) : null}
    </aside>
  );
}

function ChangesView({
  changes,
  pending,
  onRefresh,
  onToggle,
  onOpen,
  onOpenAll,
  onStageAll,
  onUnstageAll,
}: {
  changes: GitChange[];
  pending: string | null;
  onRefresh: () => void;
  onToggle: (change: GitChange) => void;
  onOpen: (change: GitChange) => void;
  onOpenAll: () => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
}) {
  const hasUnstaged = changes.some((change) => change.unstaged);
  const hasStaged = changes.some((change) => change.staged);
  return (
    <section className="git-panel__body" aria-label="Repository changes">
      <div className="git-panel__toolbar">
        <button type="button" onClick={onOpenAll} disabled={changes.length === 0}>
          View diff
        </button>
        <span className="git-panel__toolbar-spacer" />
        <button className="git-icon-button" type="button" onClick={onRefresh} aria-label="Refresh changes" title="Refresh changes">
          <RefreshCw size={15} aria-hidden="true" />
        </button>
        {hasUnstaged ? <button type="button" onClick={onStageAll} disabled={Boolean(pending)}>Stage all</button> : null}
        {!hasUnstaged && hasStaged ? <button type="button" onClick={onUnstageAll} disabled={Boolean(pending)}>Unstage all</button> : null}
      </div>
      {changes.length === 0 ? (
        <GitPanelState icon={<Check />} title="No changes to commit" detail="Your working tree is up to date." />
      ) : (
        <ul className="git-change-list">
          {changes.map((change) => (
            <li key={change.path}>
              <StageCheckbox change={change} disabled={Boolean(pending)} onToggle={() => onToggle(change)} />
              <button type="button" className="git-change-row" onClick={() => onOpen(change)}>
                <span className="git-change-path" title={change.path}>{change.path}</span>
                <span className={`git-change-kind is-${change.kind}`}>{changeCode(change.kind)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StageCheckbox({
  change,
  disabled,
  onToggle,
}: {
  change: GitChange;
  disabled: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const mixed = change.staged && change.unstaged;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      className="git-stage-checkbox"
      type="checkbox"
      checked={change.staged && !mixed}
      disabled={disabled}
      aria-label={`${change.staged ? "Unstage" : "Stage"} ${change.path}`}
      onChange={onToggle}
    />
  );
}

function HistoryView({
  page,
  loading,
  error,
  onOpen,
  onLoadMore,
  onRetry,
}: {
  page: GitHistoryPage | null;
  loading: boolean;
  error: string | null;
  onOpen: (sha: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="git-panel__body" aria-label="Commit history">
      {loading && !page ? <GitPanelState icon={<LoaderCircle className="spin" />} title="Loading history" /> : null}
      {error ? <GitPanelState title="History unavailable" detail={error} action="Retry" onAction={onRetry} /> : null}
      {page?.commits.length === 0 ? <GitPanelState icon={<History />} title="No commits yet" /> : null}
      {page?.commits.length ? (
        <ol className="git-history-list">
          {page.commits.map((commit) => (
            <li key={commit.sha}>
              <button type="button" onClick={() => onOpen(commit.sha)}>
                <span className="git-history-subject">{commit.subject}</span>
                <span className="git-history-meta">
                  {commit.authorName} · {formatCommitTime(commit.timestamp)} · <code>{commit.shortSha}</code>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {page?.hasMore ? <button className="git-load-more" type="button" onClick={onLoadMore} disabled={loading}>Load older commits</button> : null}
    </section>
  );
}

function RepositoryFooter({
  snapshot,
  pending,
  onRemote,
}: {
  snapshot: GitRepositorySnapshot;
  pending: string | null;
  onRemote: (operation: GitRemoteOperation) => void;
}) {
  return (
    <div className="git-repository-footer">
      <div className="git-branch-line" title={snapshot.repositoryName ?? undefined}>
        <GitBranch size={14} aria-hidden="true" />
        <span>{snapshot.branch ?? "Detached HEAD"}</span>
        {snapshot.ahead > 0 ? <span title={`${snapshot.ahead} ahead`}><ArrowUp size={12} aria-hidden="true" />{snapshot.ahead}</span> : null}
        {snapshot.behind > 0 ? <span title={`${snapshot.behind} behind`}><ArrowDown size={12} aria-hidden="true" />{snapshot.behind}</span> : null}
      </div>
      <div className="git-remote-actions">
        <button type="button" disabled={Boolean(pending)} onClick={() => onRemote("fetch")}>Fetch</button>
        <details>
          <summary aria-label="More remote actions"><ChevronDown size={14} aria-hidden="true" /></summary>
          <div>
            <button type="button" disabled={Boolean(pending)} onClick={() => onRemote("pull")}>Pull (fast-forward)</button>
            <button type="button" disabled={Boolean(pending)} onClick={() => onRemote("push")}>Push</button>
          </div>
        </details>
      </div>
    </div>
  );
}

function GitPanelState({
  icon,
  title,
  detail,
  action,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="git-panel-state">
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

function availabilityTitle(availability: GitRepositorySnapshot["availability"]): string {
  switch (availability) {
    case "notRepository": return "No Git repository";
    case "gitUnavailable": return "Git is not installed";
    case "scopeDenied": return "Open the repository folder";
    case "ready": return "Repository ready";
  }
}

function changeCode(kind: GitChange["kind"]): string {
  switch (kind) {
    case "conflict": return "!";
    case "modified": return "M";
    case "added": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    case "untracked": return "U";
  }
}

function formatCommitTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}
