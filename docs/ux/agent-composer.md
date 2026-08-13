---
type: UX Flow
title: Agent Composer
description: The prompt input and the action bar under it, and the rule that decides what the bar is allowed to show.
tags: [ux, agent, composer, input]
generated: { by: claude/unrecorded, at: 2026-08-13T00:00:00Z }
---

# Goal

A user writes a prompt and sends it. Everything else in the composer earns its place or leaves.

# The rule

The action bar carries four things: the add-context button, the session controls that decide what the next turn does, a live status, and the send control. Anything else has to answer a question the user is asking at the moment they read it. A value that does not change, or that changes but cannot be acted on, belongs somewhere else.

This replaced a bar that carried six. It showed what the connection accepts ("Text and images"), which never changed while anyone read it. It showed the context percentage and the cumulative cost to four decimals from the first turn. On a narrow panel the two pushed the session controls into truncation, so the permission mode read "Default (recommend..." and the status read "A..".

# What each slot does

**Add context.** One button, bottom left, holding concepts, issues, files, images, and earlier threads. It grows by gaining entries, not by widening the bar. See [Attachment Picker](../features/agent-panel.md).

**Session controls.** Model, permission mode, and profile, next to send. These decide what happens when the user presses send, so they sit where the user is already looking. They never yield room: the text beside them gives way first.

**Status.** Present only while something is happening: "Agent is working", "Follow-up queued", "Starting turn". Idle shows nothing. Below 600 pixels of panel it drops out, because a running turn is already visible in the transcript and in the stop control.

**Context reading.** Present from 75 percent of the reported window upward, which is where [Context Pressure](../features/agent-panel.md) also offers the recovery command. Below that a percentage answers no question. Cumulative cost stays in the tooltip: it is an estimate, and a running total to four decimals is not something a user acts on mid-sentence.

**Send.** Inert until there is something to send. During a turn it becomes Queue and Stop appears beside it.

# Prior art

Claude Code renders no context indicator until the window is nearly spent, and pairs the warning with the command that fixes it. Claude.ai and ChatGPT keep additive controls behind one button on the left and the model next to send on the right, and neither shows cost or token usage in the composer at all. Anthropic's own guidance for embedded apps says to start simple and reveal complexity only when it is needed.

# States

[Storybook](../architecture/testing.md) carries the composer at both panel widths: empty, drafting, approaching and near the context ceiling, running, queued, submitting, stopping, and the Studio Agent variant. The crowded story fills every optional slot at 360 pixels, which is the width that decides how many labels the bar can hold.
