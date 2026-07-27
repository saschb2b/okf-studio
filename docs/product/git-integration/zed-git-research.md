---
type: Research Brief
title: Zed Git Research
description: Source-level findings from Zed's Git architecture and the decisions OKF Studio should adopt or adapt.
tags: [product, git, research, zed]
generated: { by: claude/unrecorded, at: 2026-07-19T12:30:00Z }
sources:
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git/src/repository.rs#L1216-L1360"
    id: 1
    title: "Zed `RealGitRepository`, pinned source"
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git/src/repository.rs#L3568-L3715"
    id: 2
    title: "Zed Git command builder, pinned source"
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git/src/status.rs#L10-L34"
    id: 3
    title: "Zed status types, pinned source"
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git_ui/src/git_panel.rs#L898-L960"
    id: 4
    title: "Zed `GitPanel` state, pinned source"
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git_ui/src/git_panel.rs#L4336-L4525"
    id: 5
    title: "Zed Git panel update scheduling, pinned source"
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git_ui/src/git_panel.rs#L431-L458"
    id: 6
    title: "Zed Changes and History implementation, pinned source"
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git_ui/src/git_panel.rs#L6290-L6505"
    title: history rendering
  - resource: "https://zed.dev/docs/git"
    id: 7
    title: Zed Git documentation
  - resource: "https://zed.dev/blog/git"
    title: native Git design note
  - resource: "https://github.com/zed-industries/zed/blob/0c51c7fd2481859e9da5c490ef8e41ddbcf1a341/crates/git_ui/src/project_diff.rs"
    id: 8
    title: "Zed Project Diff implementation, pinned source"
  - resource: "https://zed.dev/blog/git#under-the-hood"
    title: native Git implementation note
---

# Question

Which parts of Zed's Git implementation make its panel fast, understandable, and safe enough to adapt for OKF Studio?

# Conclusion

Zed treats Git as repository state exposed through a typed model, not as free-form command execution. Its panel owns quick status, staging, commit, branch, and remote actions. Detailed diffs open in a separate editor-native surface. History is a separate panel tab whose rows load commit detail on demand. Repository changes arrive through subscriptions, so CLI and filesystem activity update the same model.

Studio should keep those boundaries. The Rust host should invoke a discovered Git binary with fixed arguments, parse results into closed DTOs, and authorize the repository against the folder grant that contains the active bundle. The frontend should never receive a general Git command or an absolute repository path. Opening a local bundle remains read-only; each staging, commit, undo, fetch, pull, or push action requires a named user action.

# Source findings

## Repository boundary

Zed defines a `GitRepository` trait and implements it with `RealGitRepository`. The real implementation records the Git directory, common directory, working directory, available binary, background executor, and trust state. It uses the Git binary rather than reimplementing repository semantics. This keeps status, staging, history, and remote behavior aligned with the user's Git configuration while giving the product one typed boundary.[^1]

Its command builder supplies fixed safety and predictability flags. It disables filesystem monitors for internal commands, signature decoration for machine-parsed log output, optional locks, and paging. For an untrusted repository it also disables hooks, credential helpers, external diff programs, and the `ext` transport. Diff commands receive `--no-ext-diff`.[^2]

Studio should use the installed Git binary through `std::process::Command`, never a shell. Read operations and local mutations should disable hooks and external diff execution. Remote operations should remain non-interactive and explicit; Studio should report missing credentials instead of opening an invisible prompt.

## State model

Zed preserves Git's two-state model. `FileStatus::Tracked` contains separate index and working-tree codes, while untracked, ignored, and unmerged entries remain distinct variants.[^3] That distinction drives a tri-state staging control instead of flattening every file to a generic “modified” row.

Studio should return both `staged` and `unstaged` facts for every path and retain conflict state explicitly. A file may appear once while still communicating that part of its change is staged and part remains unstaged.

## Panel and update flow

`GitPanel` owns the active repository, commit editor, projected status entries, counts, pending commit and remote tasks, the selected tab, history state, and repository subscriptions.[^4] It observes project and repository changes, schedules a bounded refresh, and rebuilds its visible projection without moving selection arbitrarily.[^5]

The panel has two top-level tabs: Changes and History. History has explicit loading, loaded, empty, and error states. The visible history list fetches commit detail lazily and opens a commit diff elsewhere instead of expanding the row into a second browsing surface.[^6]

Studio should mirror the separation but fit its existing React shell. One docked Git panel owns the compact workflow. Diff inspection replaces the main workspace with a dedicated review view and provides a clear return path. Polling is acceptable for the first local implementation only when the panel is open and the window is visible; the completion package replaces it with Rust-owned repository notifications.

## Staging and commits

Zed makes Stage All or Unstage All the primary header action and keeps related operations in its dropdown. Individual entries expose their stage state. The commit composer stays at the panel foot with repository and branch context. When no explicit staged selection exists, the primary commit action can commit tracked changes, matching `git commit -a` rather than silently including untracked files.[^7]

Studio should preserve that rule. “Commit staged” commits only the index. “Commit tracked” first stages modifications and deletions to tracked files, never untracked files. Empty messages, unresolved unstaged conflicts, and empty commits stay blocked with a reason next to the action.

## Diffs and history

Zed's Project Diff is an editor item backed by multibuffers. It supports hunk staging because deleted and inserted text share the editor's coordinate model.[^8] Reproducing that editor substrate is outside Studio's role. Studio already has a bounded unified-diff language from reviewed agent writes and can reuse its visual grammar for read-only Git inspection. File-level staging is the first complete contract; hunk staging remains a later package only if the diff model gains revision-bound patch application.

# Adopt, adapt, defer

| Decision | Studio treatment | Reason |
| --- | --- | --- |
| Git binary behind a typed repository service | Adopt | Native semantics without a second Git implementation or a shell surface. |
| Separate index, working-tree, untracked, and conflict state | Adopt | Required for truthful staging controls. |
| Changes and History tabs | Adopt | Matches the two primary user jobs and keeps each list scannable. |
| Diff outside the narrow panel | Adopt | Prevents the panel from becoming a nested workspace. |
| Repository subscriptions | Adapt | Start with a bounded refresh loop, then replace it with Rust notifications before completion. |
| Editor-native editable multibuffer diffs | Defer | Studio is a knowledge workspace, not a text editor. Read-only unified diff meets the review job. |
| Arbitrary Git command entry | Reject | It would bypass typed IPC and make repository scope and network activity unclear. |
| Silent background fetch | Reject | Network activity remains tied to a named user action. |

# Unresolved questions

- Hunk staging requires a revision-bound patch model and should not be implied by file-level checkboxes.
- Credential prompts need an explicit desktop design. The first release uses existing non-interactive Git credentials and explains how to recover when they are unavailable.
- Multi-repository folders need a repository selector. The first release binds the panel to the repository containing the active bundle.
