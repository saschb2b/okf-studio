import { ArrowLeft, FileDiff, LoaderCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { closeGitDiff, useGitDiff } from "@/features/git/gitRepositoryStore.ts";
import type { GitDiff } from "@/features/git/types.ts";
import "./GitDiffWorkspace.css";

export function GitDiffWorkspace() {
  const state = useGitDiff();
  if (!state.open) return null;
  return (
    <GitDiffWorkspaceView
      diff={state.diff}
      loading={state.loading}
      error={state.error}
      onClose={closeGitDiff}
    />
  );
}

export function GitDiffWorkspaceView({
  diff,
  loading,
  error,
  onClose,
}: {
  diff: GitDiff | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <main className="git-diff-workspace" aria-label="Git diff">
      <header className="git-diff-header">
        <button type="button" onClick={onClose}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to workspace
        </button>
        <div>
          <strong>{diff?.title ?? "Changes"}</strong>
          {diff?.truncated ? <span>Preview truncated</span> : null}
        </div>
      </header>
      {loading ? (
        <GitDiffState icon={<LoaderCircle className="spin" />} title="Loading diff" />
      ) : error ? (
        <GitDiffState icon={<RotateCcw />} title="Diff unavailable" detail={error} />
      ) : diff?.text ? (
        <div className="git-diff-scroll" role="region" aria-label={diff.title}>
          <pre className="git-diff-code">
            {diff.text.split("\n").map((line, index) => (
              <span className={diffLineClass(line)} key={`${index}:${line.slice(0, 24)}`}>
                <span className="git-diff-line-number" aria-hidden="true">{index + 1}</span>
                <span>{line || " "}</span>
              </span>
            ))}
          </pre>
        </div>
      ) : (
        <GitDiffState icon={<FileDiff />} title="No diff to show" detail="The selected change has no text diff." />
      )}
    </main>
  );
}

function GitDiffState({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="git-diff-state">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("@@")) return "is-hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "is-file";
  if (line.startsWith("+")) return "is-addition";
  if (line.startsWith("-")) return "is-deletion";
  return "";
}
