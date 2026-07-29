---
type: Feature
title: Bundle Home
description: Resume active concepts, review authored change activity, handle deterministic attention items, and return to repository work.
tags: [feature, home, activity, maintenance, git, navigation]
generated: { by: claude/unrecorded, at: 2026-07-23T21:24:41+02:00 }
---

# User job

Opening a familiar bundle should answer three questions: What was I working on? What changed? What needs attention now? Static counts do not help with those decisions, and bundle identity already has a clearer home in [Bundle details](metadata-inspector.md).

**Bundle Home** is the working start page for those daily questions. The Activity Bar, command launcher, and `O` shortcut open it from any concept or layout.

# Working sections

## Activity

The primary stream renders the newest bounded entries from the bundle's reserved `log.md`. Each item keeps its authored date and Creation, Update, Fix, or Deprecation kind. Markdown links remain direct routes to the named concept, directory, or external source. **Full log** opens the complete [Log View](log-view.md).

This is a bundle-authored history, not an operating-system audit. Studio does not invent an actor, time of day, or change reason it cannot derive. A bundle without `log.md` gets a useful empty state rather than a synthetic feed.

## Continue working

Home first lists unique concepts active in the current tab session and its navigation history. On a newly opened session, it falls back to the newest authored concept timestamps. Selecting a row leaves Home and opens that concept through the shared graph, reader, and navigation selection.

This current-session behavior does not create another persistent memory store. Cross-session task records remain owned by [Inspectable Workspace Memory](workspace-memory.md).

## Needs attention

The maintenance queue contains only deterministic findings with a direct next step:

- OKF errors or warnings open the full [Validation](validation.md) report.
- Concepts with broken links open at the affected concept.
- Unlinked concepts open individually, with a route to the graph when the bounded preview omits more.

The queue is not a second conformance summary. [Bundle details](metadata-inspector.md) owns the at-a-glance status; Home translates current findings into work. Optional external sources, relationship exchange, language conventions, and companion resources stay in [Bundle Connections](interoperability-lab.md) and the active concept reader. Home does not run that full filesystem-backed report while opening. [Knowledge Health](knowledge-health.md) remains the deeper advisory analysis and does not silently add heuristic items here.

## Work in progress

When the bundle is inside an authorized Git repository, Home shows the branch and bounded working-tree changes. Each row opens [Integrated Git](integrated-git.md), where review, staging, commits, history, and explicit remote operations remain owned. A clean tree says so plainly. A non-repository or unauthorized parent is omitted rather than presented as broken bundle knowledge.

# Why this replaced the inventory dashboard

The earlier [Bundle Overview & Health proposal](../proposals/bundle-overview.md) emphasized composition, hubs, counts, and a small recent list. Those were useful when no other orientation surfaces existed, but they became repetitive:

- identity, format, concept count, and conformance moved to Bundle details
- type composition belongs in [Search and Filter](search-and-filter.md)
- hubs and topology belong in the [Graph View](graph-view.md)
- the small recent list could not explain why a change mattered.

Home keeps every displayed item as a door into work and removes metrics that cannot change a decision.

# Design basis

The shape adapts current Atlassian patterns without copying their collaboration assumptions. [Confluence Home](https://support.atlassian.com/confluence-cloud/docs/use-home-to-jump-into-work-and-see-whats-happening/) combines recent work with a meaningful activity feed. [Jira's For you page](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/) prioritizes attention items, recently worked-on items, and resumable agent work. [Jira dashboard gadgets](https://support.atlassian.com/jira-cloud-administration/docs/use-dashboard-gadgets/) separate recent activity from work in progress and filter results. Studio uses the same decision order only where its local bundle, session, validator, and repository provide deterministic evidence.

# States and accessibility

Wide layouts use one activity column and one aligned work stack. Narrow layouts give Home the workspace instead of preserving a sidebar column that would squeeze it, while retaining the sidebar preference for the next concept or wider window. Resumable and urgent work then appears before the activity history. Lists keep visible focus rings, native buttons or links, text labels beside every colored mark, bounded overflow, and explicit no-activity, nothing-to-resume, no-maintenance, clean-tree, loading, and unavailable behavior.

Related behavior: [Browsing Layout](../ux/browsing-layout.md), [Command Palette](command-palette.md), [Live Reload](live-reload.md), and [Navigation](navigation.md).
