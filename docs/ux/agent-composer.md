---
type: UX Flow
title: Agent Composer
description: The prompt input and the action bar under it, and the rule that decides what the bar is allowed to show.
tags: [ux, agent, composer, input]
generated: { by: claude/unrecorded, at: 2026-08-13T00:00:00Z }
---

# Goal

A user writes a prompt and sends it. Everything else in the composer earns its place or leaves.

# It is an object, not a region

The composer sits on its own raised surface, inset from the panel edges, with a border that carries the focus state. Before, it was a full-bleed strip marked off by one hairline under the transcript, which read as where the scroll ended rather than as somewhere to type, and focus showed as a colour change on that hairline at the far edge of the panel.

The box rests at about two lines and grows with the draft to a 260 pixel ceiling, then scrolls. It has no resize handle: that existed only to work around a box that never grew.

# The rule

The composer is three rows, in the order a user meets them: what is answering, what they are writing, and what to do with it. Anything that wants a place has to answer a question the user is asking at the moment they read it. A value that does not change, or that changes but cannot be acted on, belongs somewhere else.

This replaced a single row that carried six controls. It showed what the connection accepts ("Text and images"), which never changed while anyone read it. It showed the context percentage and the cumulative cost to four decimals from the first turn. Those two pushed the session controls into truncation, so the permission mode read "Default (recommend..." and the status read "A..".

# What each row does

**Session controls, above the input.** Model, permission mode, and profile. This is session state: set once, read often, and true of the whole thread rather than of the message being written. Sharing a row with the send actions made it compete for width against text it should never have lost to. On its own line it has the full panel and keeps its labels. The mode stays spelled out rather than becoming an icon, because a user has to see at a glance that agent writes are unguarded.

**Add context.** One button, bottom left, holding concepts, issues, files, images, and earlier threads. It grows by gaining entries, not by widening the bar. See [Attachment Picker](../features/agent-panel.md).

**Status.** Present only while something is happening: "Agent is working", "Follow-up queued", "Starting turn". Idle shows nothing. Below 420 pixels of panel it drops out, because a running turn is already visible in the transcript and in the stop control, while the context reading has no second home.

**Context reading.** Present from 75 percent of the reported window upward, which is where [Context Pressure](../features/agent-panel.md) also offers the recovery command. Below that a percentage answers no question. Cumulative cost stays in the tooltip: it is an estimate, and a running total to four decimals is not something a user acts on mid-sentence.

**Send.** Inert until there is something to send. During a turn it becomes Queue and Stop appears beside it.

# Prior art

Claude Code renders no context indicator until the window is nearly spent, and pairs the warning with the command that fixes it. Claude.ai and ChatGPT keep additive controls behind one button on the left and the model next to send on the right, and neither shows cost or token usage in the composer at all. Anthropic's own guidance for embedded apps says to start simple and reveal complexity only when it is needed.

Those two products can afford to put the model beside send because the model is their only such control. Studio has three, which is what breaks the pattern here. Lifting them onto their own line follows a layout seen in newer assistant interfaces, where the model and the active role sit on a quiet line above the input and the row under it holds only per-message actions.

# States

[Storybook](../architecture/testing.md) carries the composer at both panel widths: empty, drafting, approaching and near the context ceiling, running, queued, submitting, stopping, and the Studio Agent variant. The crowded story fills every optional slot at 360 pixels, which is the width that decides how many labels the bar can hold.
