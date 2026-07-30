---
type: UX Review
title: Agent Workspace Dogfood
description: Journey evidence and open findings from the WP10A Agent Panel refinement.
tags: [ux, agent-panel, dogfood, accessibility]
generated: { by: claude/unrecorded, at: 2026-07-18T19:54:10Z }
---

# Scope

This review exercises the Agent Panel as a workspace, not as a collection of isolated controls. It covers first connection, saved work, research, creation, enhancement, permission, failure recovery, parallel threads, and a narrow panel. The deterministic [state gallery](../architecture/testing.md) supplies repeatable blocking and width states. The browser mock supplies real starter, thread-switching, and staged-review navigation.

# Review baseline and result

The baseline at commit `de9977a`, before the workspace hierarchy pass, repeated thread, agent, and bundle identity in one toolbar. Secondary actions stayed visible, and a full plan card competed with the transcript.

The current workspace assigns bundle, agent, and thread identity to stable owners. The selected thread and its actions now share one conversation toolbar instead of two stacked bands. The transcript receives the flexible height, and each prompt and its event stream read as one turn. Completed activity collapses, and secondary actions share one menu. The staged surface owns its recovery action above its internal file scroll.

# Journey results

| Journey | Path tested | Result | Hunt, backtrack, or hidden state |
| --- | --- | --- | --- |
| First use | Open the panel with a bundle and no connection | **Connect an agent** is the only task action. No session, history, edit, or composer controls appear. | None. The bundle remains visible in the global switcher and the panel states that connecting is explicit. |
| Resume | Reconnect an agent with current and archived saved sessions | The current session is first and owns the primary **Resume** action. Archived recovery remains visible with secondary emphasis. **Start new thread** is separate and preserves saved work in History. | Fixed during this review: both Resume buttons previously used primary emphasis. |
| Deep research | Start new work, choose **Deep research**, and inspect the composer | The starter fills an editable prompt with evidence, citation, Sources, and Inferences requirements. It does not send, grant writes, or open another result surface. | None. The user supplies the question in the same composer and can inspect the whole prompt first. |
| Create | Choose **Create bundle**, grant edits, generate a reviewed proposal, then enter staging | The workflow stays in one normal thread. The edit boundary appears for the editing task, and Generate, Validate, Review, Reject, and Discard remain with the proposal or stage that owns them. | None. The staged-operation failure remains above the internally scrolling file list and does not hide recovery. |
| Enhance | Choose **Enhance bundle** and inspect the prepared prompt and staged transaction | The prompt requires additive changes and preservation of authored facts. Existing-file decisions remain blocked on explicit Keep or Reject review before Apply. | None. Research-only export guidance and unrelated controls remain absent. |
| Permission | Open a waiting tool request with a failed response delivery | The request card owns the decision, failure, **Allow once**, **Reject**, and exact-request checkbox. The composer remains reachable below it. | None. There is one blocking owner and no detached error banner. |
| Failure recovery | Stop the final connected process, then inspect the retained panel state | One connection notice keeps the agent name, bounded reason, **Review connections**, and **Dismiss**. The remaining space says that bundle browsing is unaffected. | Fixed before this review: the empty space previously competed with a second connection action. |
| Parallel thread | Start a second thread, return to the staged first thread, then return to the prepared research prompt | The agent strip and combined conversation toolbar remain stable. Each navigation level has one add action. The staged state and unsent prompt survive switching. | None. Long labels truncate visually but retain their complete accessible names. |
| Narrow panel | Render permission at 360px, active queue at 440px, and staged review at 560px | All three widths keep `clientWidth` equal to `scrollWidth`; the composer stays visible; the smallest visible control is 28px; focus uses the shared two-pixel ring. | None. The strips scroll their focused item into view instead of moving controls to a different row. |

# Live-work pressure result

The WP10C pressure fixture mounts a failed permission response, an expanded three-step plan, three staged files, and one queued follow-up at once.

At 360px, 440px, and 560px, the panel has no horizontal overflow and the composer remains fully visible. The blocking and non-blocking bands both become internal scroll owners under pressure. Visible buttons stay at least 28px high. The permission checkbox label supplies a 24px hit area.

Tabbing from the collapse control reaches **Allow once** first. Collapsing retains focus on that control, keeps the blocking permission mounted, and removes the plan, staged review, and queue from the tab order. The shelf contains one deliberate delivery-failure alert and no additional `aria-live` regions.

# Transcript navigation result

The WP10D transcript surface keeps its three jump controls docked outside the scroll viewport. The controls therefore do not cover Markdown at an intermediate landing point.

At both widths, the transcript and page have no horizontal overflow and every navigation control is 28px high. In the 440px fixture, Home lands at scroll position 0. Shift+Home lands on the latest user prompt at 172, and End lands at the 253px tail. Focus remains on the transcript for keyboard jumps and on the activated button for pointer use. A focused unit fixture proves that a streamed content update preserves a manually chosen scroll position. Tail following resumes only after an explicit bottom jump.

# Conversation hierarchy result

The earlier transcript rendered the ACP event stream accurately but gave every agent prose segment its own response controls. Long successful tool output and completed plans also stayed expanded. One request could therefore look like several unrelated assistant replies, while protocol evidence competed with the answer for reading space.

The turn fixture now groups one user prompt with its ordered prose, tool calls, plan, and result. It retains interleaving around tool calls, and exposes one **Copy response** action for the complete turn. It shows **Copy selection** only for an active selection inside that turn. Successful detailed tools and completed plans collapse by default. Running and failed activity remains open. Read activity stays a compact row, and a title that already names its concept path does not repeat the same path beside it.

Rendered Storybook fixtures at 440px and 360px showed one response footer, a collapsed staged edit, a collapsed completed plan, and no horizontal overflow. A separate toolbar fixture at both widths kept live-thread navigation and thread actions in one band. The 360px edit summary originally wrapped **Change staged for review** across two lines. The visible state is now **Staged**, with the full boundary in its title.

Prompt reuse copies the submitted text and visible attachments into a new draft rather than editing history. The `@` menu covers the common active-bundle and concept paths without replacing the complete context picker. Follow mode is off by default and changes only reader selection for exact active-bundle concept locations.

# Findings

- **Untidy, Safe, fixed:** current and archived sessions both used primary Resume styling. Only the newest current candidate now receives primary emphasis.
- **Untidy, Safe, fixed before capture:** staged-operation recovery could start below the staged file scroll, and a final-process failure could present two competing connection actions.
- **Glaring, Safe, fixed:** the shelf used a non-shrinking flex basis. That clipped the composer when all four work sections were present in a short 360px panel. It now yields height to the composer and keeps both shelf bands scrollable.
- **Glaring, Safe, fixed:** the permission checkbox label provided an 18px-high target. Its labelled hit area now meets the 24px floor.
- **Untidy, Safe, fixed:** the first transcript-navigation strip floated over the scroll viewport and covered part of a response at the latest-prompt landing. It now docks below the viewport without reducing the composer's reachability.
- **Glaring, Safe, fixed:** one accepted turn could render several response footers because tool calls split agent prose into separate protocol segments. Turn grouping preserves that order and owns one footer.
- **Untidy, Safe, fixed:** successful command output, edit diffs, and completed plans remained open after they stopped needing attention. They now rest collapsed. Running and failed work stays open.
- **Untidy, Safe, fixed:** thread navigation and thread actions occupied separate stacked bands. One conversation toolbar now owns both groups and returns the removed band to transcript height.
- **Glaring, Safe, fixed during narrow capture:** a legacy 420px rule gave the toolbar actions the complete row and reduced thread navigation to zero width. The navigation and action groups now retain bounded shares and scroll their own overflow.
- **Untidy, Safe, fixed:** the staged-change state wrapped at 360px. The visible label is now **Staged**, with the complete review boundary available as explanatory text.
- **Nitpick, Judgment, retained:** staged graph labels use 9px text. They supplement the textual staged-file list. Increasing them to the 12px text floor makes dense preview nodes overlap.

No Glaring finding remains in these journeys. The retained staged-graph label is outside the conversation hierarchy changed here.
