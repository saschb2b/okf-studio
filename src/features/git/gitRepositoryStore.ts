import { useEffect, useSyncExternalStore } from "react";
import {
  gitRepositorySnapshot,
  gitRepositoryDiff,
} from "@/shared/ipc.ts";
import type { GitDiff, GitRepositorySnapshot } from "@/features/git/types.ts";

interface RepositoryState {
  root: string | null;
  snapshot: GitRepositorySnapshot | null;
  loading: boolean;
  error: string | null;
}

interface DiffState {
  open: boolean;
  loading: boolean;
  error: string | null;
  diff: GitDiff | null;
}

let repositoryState: RepositoryState = {
  root: null,
  snapshot: null,
  loading: false,
  error: null,
};
let diffState: DiffState = {
  open: false,
  loading: false,
  error: null,
  diff: null,
};
let repositoryRequest = 0;
let diffRequest = 0;
const repositoryListeners = new Set<() => void>();
const diffListeners = new Set<() => void>();

function emitRepository(): void {
  repositoryListeners.forEach((listener) => listener());
}

function emitDiff(): void {
  diffListeners.forEach((listener) => listener());
}

function subscribeRepository(listener: () => void): () => void {
  repositoryListeners.add(listener);
  return () => repositoryListeners.delete(listener);
}

function subscribeDiff(listener: () => void): () => void {
  diffListeners.add(listener);
  return () => diffListeners.delete(listener);
}

export async function refreshGitRepository(
  root: string | null,
  force = false,
): Promise<void> {
  if (!root) {
    repositoryRequest += 1;
    repositoryState = {
      root: null,
      snapshot: null,
      loading: false,
      error: null,
    };
    emitRepository();
    return;
  }
  if (
    !force &&
    repositoryState.root === root &&
    (repositoryState.loading || repositoryState.snapshot)
  ) {
    return;
  }
  const request = ++repositoryRequest;
  repositoryState = {
    root,
    snapshot: repositoryState.root === root ? repositoryState.snapshot : null,
    loading: true,
    error: null,
  };
  emitRepository();
  try {
    const snapshot = await gitRepositorySnapshot(root);
    if (request !== repositoryRequest) return;
    repositoryState = { root, snapshot, loading: false, error: null };
  } catch (error) {
    if (request !== repositoryRequest) return;
    repositoryState = {
      root,
      snapshot: repositoryState.snapshot,
      loading: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  emitRepository();
}

export function useGitRepository(root: string | null): RepositoryState {
  const state = useSyncExternalStore(
    subscribeRepository,
    () => repositoryState,
    () => repositoryState,
  );
  useEffect(() => {
    void refreshGitRepository(root);
  }, [root]);
  return state.root === root
    ? state
    : { root, snapshot: null, loading: Boolean(root), error: null };
}

export async function openGitDiff(
  root: string,
  options: { path?: string; staged?: boolean; commit?: string },
): Promise<void> {
  const request = ++diffRequest;
  diffState = { open: true, loading: true, error: null, diff: null };
  emitDiff();
  try {
    const diff = await gitRepositoryDiff(root, options);
    if (request !== diffRequest) return;
    diffState = { open: true, loading: false, error: null, diff };
  } catch (error) {
    if (request !== diffRequest) return;
    diffState = {
      open: true,
      loading: false,
      error: error instanceof Error ? error.message : String(error),
      diff: null,
    };
  }
  emitDiff();
}

export function closeGitDiff(): void {
  diffRequest += 1;
  diffState = { open: false, loading: false, error: null, diff: null };
  emitDiff();
}

export function useGitDiff(): DiffState {
  return useSyncExternalStore(subscribeDiff, () => diffState, () => diffState);
}
