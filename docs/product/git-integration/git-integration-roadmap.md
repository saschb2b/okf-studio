---
type: Product Roadmap
title: Integrated Git Support
description: Work packages for a Zed-inspired, repository-native Git workflow inside OKF Studio.
tags: [product, roadmap, git, workspace]
timestamp: 2026-07-19T12:30:00Z
---

# Outcome

OKF Studio users can inspect repository state, review changes, stage files, commit, browse history, and explicitly synchronize the repository that contains the active bundle without leaving the knowledge workspace. The implementation follows the [Git Experience Contract](git-experience-contract.md) and the source-level findings in [Zed Git Research](zed-git-research.md).

# Product stance

Git support is repository-native and workspace-scoped. It uses the installed Git executable behind typed Rust operations. The panel covers the common loop; unsupported history editing and merge workflows remain available through the user's terminal or editor. Network operations never run automatically.

This changes the former “not a git client” boundary. Studio remains neither a Git hosting product nor a general-purpose history-rewriting client. Git exists because OKF bundles are designed to live in repositories, reviewed agent writes need a natural checkpoint path, and users should not lose context merely to stage and commit accepted knowledge.

# Work packages

## G0: Research and experience freeze

- [x] Inspect Zed's current Git documentation and pinned `git` and `git_ui` source.
- [x] Record adopted, adapted, deferred, and rejected patterns.
- [x] Freeze surface ownership, narrow layout, pressure states, commit scope, network rules, and repository authorization before component work.

Exit: research has claim-level citations and the experience contract prevents nested panel workspaces, silent network activity, and ambiguous commit scope.

## G1: Typed Rust repository service

- [ ] Discover the Git executable and the repository containing the active bundle.
- [ ] Authorize the repository root against the persisted folder grant.
- [ ] Parse branch, upstream, ahead/behind, staged, unstaged, untracked, rename, deletion, and conflict state into closed DTOs.
- [ ] Return bounded history pages and unified diffs without absolute paths.
- [ ] Disable shell execution, hooks, pagers, external diffs, optional locks, and interactive prompts.
- [ ] Cover normal, unborn, missing-Git, non-repository, outside-grant, worktree, rename, conflict, binary, and oversized-output cases with temporary repositories.

Exit: read-only repository inspection is deterministic, bounded, and cannot expand filesystem authority.

## G2: Git panel shell

- [ ] Add a right-docked Git panel that is mutually exclusive with Agent.
- [ ] Add a status-bar opener showing the current branch when available.
- [ ] Implement fixed Changes/History tabs, one flexible list, and stable footer.
- [ ] Design loading, clean, unavailable, unsafe-scope, and retryable failure states.
- [ ] Add Storybook states and interactions before production mutation controls.

Exit: repository state is understandable at wide and 360-pixel widths with no overflow, hidden primary action, or competing scroll regions.

## G3: Changes, staging, and diff review

- [ ] Render one row per changed path with unchecked, checked, or mixed stage state.
- [ ] Stage or unstage one path, Stage All, and Unstage All through fixed IPC commands.
- [ ] Open a bounded read-only Git diff workspace for a file or all changes.
- [ ] Reuse Studio's semantic diff grammar without coupling Git state to agent staging.
- [ ] Keep conflicts explicit and explain their recovery path.

Exit: the index can be prepared entirely from the panel and every action refreshes against repository truth.

## G4: Commit workflow

- [ ] Keep a bounded commit draft at the panel foot.
- [ ] Distinguish Commit staged from Commit tracked and exclude untracked files from the latter.
- [ ] Validate empty messages and unresolved conflicts before the command crosses IPC.
- [ ] Run commits without hooks or an interactive editor.
- [ ] Offer revision-bound Undo commit through a soft reset and remove it when repository state moves.

Exit: the common stage, write message, commit, and recover loop works without a terminal and never hides what entered the commit.

## G5: History and explicit remotes

- [ ] Render bounded history pages with subject, author, time, and short SHA.
- [ ] Open a selected commit in the diff workspace.
- [ ] Add explicit Fetch, fast-forward-only Pull, and Push actions with one pending operation.
- [ ] Report missing remotes, credentials, divergence, and rejection in plain language without leaking command or environment detail.

Exit: users can inspect recent repository evolution and perform the ordinary remote loop without automatic network traffic.

## G6: Live repository state

- [ ] Watch repository index, HEAD, refs, and granted working-tree changes in Rust.
- [ ] Coalesce event bursts and emit one bounded invalidation event.
- [ ] Refresh only while the matching repository is active and preserve tab, selection, draft, and scroll state.
- [ ] Prove that terminal-side edits, staging, commits, checkouts, and fetches update the panel without reopening it.

Exit: repository truth has one owner and external Git activity appears promptly without a permanent polling loop.

## G7: Product integration and quality gates

- [ ] Add keyboard shortcuts, command-palette actions, accessible names, focus restoration, and reduced-motion behavior.
- [ ] Update product scope, principles, browsing layout, IPC/security, frontend architecture, testing, feature docs, and site copy.
- [ ] Run React Stinky, React Compiler, Tauri Stinky, theme-color, no-slop, and visual-consistency passes.
- [ ] Screen component isolation through Storybook MCP at wide and 360-pixel widths, including empty, long-content, pending, and error states.
- [ ] Pass frontend, Storybook, site, OKF, Rust core, and native-host gates.

Exit: all three shipping surfaces agree, every quality gate is green, and no temporary screenshot remains in the repository.

# Dependency order

```mermaid
flowchart LR
  G0[Research and experience] --> G1[Typed Rust service]
  G1 --> G2[Panel shell]
  G1 --> G3[Changes and diff]
  G2 --> G3
  G3 --> G4[Commit]
  G2 --> G5[History and remotes]
  G1 --> G6[Live state]
  G3 --> G7[Completion]
  G4 --> G7
  G5 --> G7
  G6 --> G7
```

# Deferred decisions

- Hunk and line staging wait for a revision-bound patch model.
- Merge-conflict editing waits for an editor-grade text surface.
- Branch creation, deletion, checkout, rebase, cherry-pick, stash, submodules, and worktree management need separate user-job and recovery contracts.
- Hosting-provider pull requests and issue integration remain separate from repository Git.
