---
type: Feature
title: Integrated Git
description: Review, stage, commit, inspect history, and explicitly synchronize the repository around an OKF bundle.
tags: [feature, git, repository, review]
generated: { by: claude/unrecorded, at: 2026-07-19T18:30:00Z }
---

# Why this exists

OKF work is usually repository work. Studio applying a reviewed agent revision does not finish it. The user still needs to understand the repository delta, choose what belongs together, and create a durable checkpoint. Sending that loop to another application breaks the connection between the knowledge under review and the files that record it.

Integrated Git keeps the ordinary repository loop beside the bundle. It is not a hosting client or a history editor. It covers the frequent path from "these knowledge files changed" to "this exact set is committed". Rebase, merge resolution, branching, stash, cherry-pick, and other advanced operations stay with a terminal or editor.

# What the user can do

The right-docked Git panel has two stable views:

- **Changes** shows each repository-relative path once with its staged, unstaged, or mixed state. Users can stage one path, stage or unstage all, open a file or repository diff, and commit either the index or tracked modifications. Untracked files never enter **Commit tracked**.
- **History** pages through recent commits with subject, author, relative time, and short SHA. Selecting a commit opens its bounded read-only diff in the main workspace.

The footer keeps branch, upstream distance, commit draft, and explicit remote actions in one place. Fetch, fast-forward-only Pull, and Push never run at startup or on a timer. A successful commit offers a revision-bound soft undo while repository state still matches it.

Conflicts remain at the top of Changes and block commit. Studio explains that resolution belongs in an editor or terminal, after which the user stages the resolved file in the panel.

# Repository truth

The installed Git executable is authoritative. Studio parses Git's machine-readable output into closed states instead of inferring repository state in React. A Rust watcher observes the granted working tree plus its Git index, HEAD, and refs, coalesces event bursts, and invalidates the panel. External terminal staging, commits, checkouts, and fetches therefore appear without reopening the bundle.

The panel opens from the status bar, the command palette, or `Ctrl/Cmd + Shift + G`. Git and Agent are mutually exclusive right docks so the main workspace never gets squeezed between two auxiliary panels. `Ctrl/Cmd + Enter` commits from the message field when the current commit action is valid.

# Boundaries

Repository discovery cannot silently widen the folder grant that opened the bundle. When the user opened a bundle such as `repo/docs/` directly, the panel offers **Allow repository**. Studio opens a native folder confirmation at the enclosing repository root and accepts only that exact folder. After confirmation, the existing bundle stays active and Git refreshes against the broader, now explicit grant. Commands use fixed arguments without a shell. Studio validates every path as repository-relative. It disables hooks, pagers, external diffs, optional locks, and interactive prompts. Absolute paths and Git metadata never cross IPC.

Git stays in the background on Windows. Repository discovery, live refresh, reads, and explicit actions must not open terminal windows or interrupt the active workspace.

The detailed command and trust rules live in [Git Integration Architecture](../architecture/git-integration.md). The interaction contract is [Git Workflow](../ux/git-workflow.md), and the source research and package history are in the [Integrated Git Support roadmap](../product/git-integration/).
