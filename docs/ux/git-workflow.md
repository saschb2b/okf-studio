---
type: UX Flow
title: Git Workflow
description: The repository review and commit loop inside the OKF workspace.
tags: [ux, git, staging, commit]
timestamp: 2026-07-19T17:15:00Z
---

# Why the workflow stays compact

The panel exists to finish knowledge work, not to expose Git plumbing. It should answer what changed, what the next commit contains, and what happened recently without turning the main workspace into a source-control dashboard. The design follows Zed's stable Changes/History structure while adapting its actions to Studio's folder grants and reviewed-write boundary.

# Open and close

Open Git from the branch item in the status bar, **Toggle Git panel** in the command palette, or `Ctrl/Cmd + Shift + G`. Focus moves to the active tab. Repeating the shortcut closes the panel and returns focus to the status-bar opener. Opening Agent closes Git, and opening Git closes Agent.

At narrow widths the Git panel takes the workspace instead of squeezing the graph and reader. Its header, tabs, and footer stay fixed; only the change or history list scrolls.

# Review and stage

Changes begin with **View diff**, Refresh, and either **Stage all** or **Unstage all**. A checkbox represents each path truthfully: unchecked for unstaged, checked for staged, and mixed when both forms exist. The short status code keeps the narrow row scannable; its full meaning is available to assistive technology and on hover.

Selecting a path opens its diff in the main workspace. The diff has one clear route back and presents loading, failure, no-text, and truncated states without nesting another scrollable panel inside Changes.

Conflicts sort first. A short notice explains that Studio does not edit merge conflicts: resolve the file in an editor or terminal, then stage it here. Commit remains disabled until conflicts are resolved.

# Bundle in a repository subfolder

Opening `docs/` directly grants Studio that bundle folder, not its unknown parent. If Git discovers that the repository starts above the granted folder, the panel explains the boundary and offers **Allow repository**. The operating-system folder dialog opens at the enclosing repository root. Confirming that exact folder authorizes repository-wide status and mutations while keeping the current bundle open; canceling leaves the narrower grant unchanged.

# Commit and recover

The fixed composer names its scope. **Commit staged** commits the current index. When the index is empty but tracked files changed, **Commit tracked** includes tracked modifications and deletions while leaving untracked files out. An empty message, unresolved conflict, or in-flight operation disables the action. `Ctrl/Cmd + Enter` invokes it from the composer.

After success, the draft clears and a bounded notice offers **Undo**. Undo works only while HEAD still matches the commit Studio just created and performs a soft reset, so working content is not discarded.

# History and remotes

History is a bounded page, not an infinite repository model. Each row carries subject, author, relative time, and short SHA; selection opens the commit diff. Empty and failed loads explain what happened and offer recovery where useful.

The footer shows branch and ahead/behind state. Fetch is visible; fast-forward Pull and Push sit in the adjacent menu. Only the named click starts network activity, and one operation runs at a time. Failures stay beside the action with a recovery-oriented message.

The complete behavior is specified in [Integrated Git](../features/integrated-git.md); security ownership is in [Git Integration Architecture](../architecture/git-integration.md).
