---
type: UX Contract
title: Git Experience Contract
description: Surface ownership, interaction rules, pressure states, and safety boundaries for integrated Git support.
tags: [product, git, ux, quality-gate]
generated: { by: claude/unrecorded, at: 2026-07-19T17:15:00Z }
---

# User job

The Git panel answers three questions without making the user interpret Git plumbing:

1. What changed in the repository that contains this bundle?
2. What will the next commit contain?
3. What happened recently, and what changed in a selected commit?

The first release covers the common local loop and explicit remote synchronization. It does not attempt to replace the terminal for rebase, cherry-pick, bisect, submodule management, or history rewriting.

# Surface ownership

| Job | Owner | Must not appear in |
| --- | --- | --- |
| Repository, branch, ahead/behind state | Git panel footer and status-bar opener | Every changed-file row |
| Changed files and stage state | Changes tab | History tab |
| Stage All or Unstage All | Changes header | Commit composer |
| File diff | Dedicated Git diff workspace | Expanding inside the changed-file list |
| Commit message and primary commit action | Stable panel footer | Scrolling changes list |
| Recent commits | History tab | Changes list |
| Commit diff | Dedicated Git diff workspace | Expanded history row |
| Fetch, pull, push | Explicit remote action menu | Background startup or automatic refresh |
| Operation progress and failure | The action that started it plus one bounded panel notice | Toast-only feedback |

# Layout

The Git panel docks on the right and is mutually exclusive with the Agent panel. Opening either keeps one stable workspace plus one auxiliary dock. The panel uses a fixed header, a flexible list, and a fixed footer. Changes and History share the same tab strip. Switching tabs does not move repository or branch context.

The Changes header contains **View diff** and one split primary action. That action is **Stage all** when any unstaged change exists, and **Unstage all** when the index is non-empty. The list is the only flexible scroll region. The commit composer stays visible at the foot and grows only to a bounded height.

At 360 pixels, labels may shorten but the stage control, file name, status, primary action, and focus ring remain visible. Long repository names, branches, paths, messages, authors, and errors truncate with a full-text title or wrap only in dedicated detail views.

# Changes

Each changed path appears once. Its control has three truthful states:

- unchecked: only unstaged changes exist
- checked: the index holds every change for the path
- mixed: staged and unstaged changes both exist.

The row shows a compact status code so paths retain space at narrow widths. Its full label, such as Modified, Added, Deleted, Renamed, Untracked, or Conflict, remains available to assistive technology and on hover. Selecting the row opens the relevant diff. The stage control changes only that path and remains disabled while its operation is pending.

Unresolved conflicts remain visible at the top and block commit while any conflict has unstaged content. Studio does not offer merge-resolution editing in the first release. The notice tells the user to resolve the file in an editor or terminal, then stage it here.

# Commit

The primary label states its scope:

- **Commit staged** when the index contains changes
- **Commit tracked** when the index is empty but tracked files changed
- disabled when no change is committable.

Commit tracked mirrors `git commit -a`: it includes modifications and deletions to tracked files and excludes untracked files. The message is required. `Ctrl/Cmd + Enter` invokes the current primary action while the composer has focus. A successful commit clears the draft and shows one recoverable **Undo commit** action until repository state moves past that commit. Undo is a soft reset and never discards working-tree content.

# History

History rows show subject, author, relative time, and short SHA. The list has loading, empty, and retryable error states. Selecting a row opens its commit diff. History loads a bounded first page and requests more near the end. The panel never renders the full repository history at once.

# Remote actions

Fetch, pull, and push are explicit. The panel never fetches at startup or on a timer. Only one remote operation runs at a time. Pull uses fast-forward-only behavior in the first release so Studio cannot create an implicit merge commit. Missing credentials, divergence, rejected pushes, and unavailable remotes stay in the panel with the command name and a recovery hint. Raw environment variables, credentials, command lines, and absolute paths do not cross IPC.

# Repository scope and trust

The active bundle first proves a Rust-owned folder grant. Studio then discovers the enclosing repository and accepts it only when its root remains within one persisted grant that also contains the bundle. If the user opened the bundle as a repository subfolder, the panel may ask for the exact enclosing repository root in a native folder dialog. It cannot grant that parent silently or accept a different selected folder. A bundle opened from a downloaded cache can show local Git state only when that cache is itself a repository. Opening a remote cache does not manufacture a clone.

Every Git command is a fixed Rust operation invoked without a shell. Rust validates user-controlled paths as repository-relative and passes them after `--`. Local operations disable hooks, pagers, and external diff programs. Remote operations are non-interactive and run only from the named button. The frontend receives display names and repository-relative paths, never absolute roots or `.git` content.

Git support does not weaken the agent boundary. `.git` remains inaccessible to agents and protected from staged bundle writes. The Git service is a separate user-operated host capability.

# Pressure states

Storybook and integration tests must cover:

- repository with no changes
- mixed staged, unstaged, untracked, deleted, renamed, and conflicted entries
- long paths and branch names at wide and 360-pixel widths
- no enclosing repository
- repository outside the persisted folder grant
- Git executable unavailable
- empty history and unborn branch
- pending and failed stage, commit, fetch, pull, and push operations
- commit draft with no message and tracked-only scope
- diff loading, binary file, truncation, and failure.

# Acceptance gate

The feature is complete only when all of these hold:

- The Rust command boundary has fixture repositories for every mutation.
- The frontend stories pass interaction and accessibility tests.
- The rendered panel passes wide and 360-pixel visual review.
- External CLI changes appear without reopening the bundle.
- Docs and site describe only shipped behavior.
- Every ordinary CI lane is green.
