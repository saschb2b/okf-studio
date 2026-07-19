---
type: Architecture Decision
title: Git Integration Architecture
description: A bounded installed-Git service, repository watcher, and typed frontend state for integrated Git support.
tags: [architecture, git, tauri, security]
timestamp: 2026-07-19T17:15:00Z
---

# Decision

Studio uses the installed Git executable behind a typed Rust service. Git remains the source of truth for repository discovery, two-dimensional status, diffs, history, index mutation, commits, soft undo, and remotes. Reimplementing Git would create a second interpretation of repository state; embedding an unrestricted terminal would expand the webview's authority.

The implementation has three parts:

1. `src-tauri/src/git/repository.rs` validates the granted scope and command inputs, runs fixed Git operations, bounds output, and maps results to closed DTOs.
2. `src-tauri/src/git/watch.rs` watches the active work tree and authorized metadata roots, filters object and build noise, debounces bursts, and emits `git-state-changed` for the matching bundle.
3. `src/features/git/` owns the external repository snapshot, the dedicated diff workspace, and the right-docked panel. Components call typed wrappers in `src/shared/ipc.ts`; raw invoke strings do not appear in the feature.

# Authorization and process boundary

Repository discovery starts from an exact detected bundle root. Rust checks every persisted folder grant containing that bundle and chooses the narrowest one that also contains the discovered work tree. This matters because an OKF bundle will often be `repo/docs/` while the original folder grant is only `docs/`.

When no existing grant contains the repository, the snapshot returns a closed `scopeDenied` state. `pick_git_repository_folder` then discovers the enclosing root without returning it to the webview, opens a native folder confirmation at that location, and accepts only the exact discovered root. Cancellation changes nothing. Confirmation persists the repository folder grant, after which the same active bundle snapshot succeeds. Linked worktree metadata may live outside the work tree only when Git identifies it from the authorized repository; the watcher treats that metadata root as an internal implementation detail and never exposes it.

Every operation runs `git` directly, never through a shell. The command environment disables terminal prompts, pagers, credential prompts, optional locks, hooks, and external diff programs. User paths must be normalized repository-relative paths, cannot target `.git`, and follow `--` in path-taking commands. Revision input accepts only a narrow hexadecimal form. Remote failures are reduced to bounded display text; command lines, environment values, credentials, and absolute roots stay in Rust.

# Command shape

Read commands return one snapshot, a bounded history page, or a bounded diff. Mutation commands return a fresh repository snapshot so the UI never invents a successful state. Commit has two explicit modes: use the current index, or first add tracked modifications and deletions with `git add -u`. Undo requires the exact expected HEAD and uses a soft reset, preserving files and index content.

Fetch, Pull, and Push are separate user actions. Pull is `--ff-only`; divergence fails rather than creating an implicit merge commit. No remote command runs from repository discovery, watching, app startup, or panel refresh.

# Live state

The panel starts one watcher only while it is open and a bundle root is active. The low-frequency event carries only the bundle root. React then requests a fresh snapshot and retains panel tab, commit draft, and local view state. This is invalidation, not an event stream of filesystem contents, and replaces permanent polling.

# Verification

Temporary-repository tests cover status parsing, renames, history framing, tracking counts, scope denial, repository mutation, diffs, commit, and revision-bound undo. Watcher tests cover work-tree and linked-metadata relevance while excluding object and build noise. Frontend integration tests cover panel ownership, diff routing, and keyboard focus. Storybook covers clean, mixed, conflicted, long-content, missing-repository, unavailable-Git, pending failure, history, tracked-only commit, and diff pressure states.

See [IPC & Security](ipc-and-security.md), [Testing & Dogfooding](testing.md), and the user-facing [Integrated Git](../features/integrated-git.md) concept.
