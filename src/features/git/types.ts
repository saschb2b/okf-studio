export type GitAvailability =
  | "ready"
  | "notRepository"
  | "gitUnavailable"
  | "scopeDenied";

export type GitChangeKind =
  | "conflict"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export interface GitChange {
  path: string;
  kind: GitChangeKind;
  staged: boolean;
  unstaged: boolean;
}

export interface GitRepositorySnapshot {
  availability: GitAvailability;
  message: string | null;
  repositoryName: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  headSha: string | null;
  changes: GitChange[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
}

export interface GitHistoryPage {
  commits: GitCommit[];
  hasMore: boolean;
}

export interface GitDiff {
  title: string;
  text: string;
  truncated: boolean;
}

export type GitRemoteOperation = "fetch" | "pull" | "push";
