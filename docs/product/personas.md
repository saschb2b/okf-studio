---
type: Product
title: Personas and Use Cases
description: The handful of concrete people OKF Studio is built for, framed by the job each hires it to do.
tags: [product, personas, use-cases]
generated: { by: claude/unrecorded, at: 2026-07-13T18:51:16Z }
---

# Who this is for

The [Overview](overview.md) sketches the audience in three lines. This concept makes it concrete: four people, the job each hires OKF Studio to do, and the [features](../features/) that matter most to them. These personas are the reason the product is [scoped](scope-and-non-goals.md) the way it is.

# The data / platform engineer

**Context.** Keeps table docs, runbooks, and metric definitions as OKF bundles checked into a repo, alongside the code they describe. Lives in a terminal and an editor. Does not want to start a web server or a cloud account just to read docs.

**Job to be done.** *When I open a repo full of OKF markdown, I want to see how the table docs, runbooks, and metrics relate. No build step, no browser tab pointed at localhost. Then I can find the right doc and trust it is current.*

**What matters most.**

- [Folder Autodetect](../features/folder-autodetect.md): point at the repo, get every bundle.
- [Live Reload](../features/live-reload.md): the view tracks the files as `git pull` or edits change them.
- [Search and Filter](../features/search-and-filter.md): jump straight to a metric or runbook by name or type.
- [Agent Panel](../features/agent-panel.md): investigate a dataset or request a reviewed documentation change without granting direct writes.

# The AI / agent builder

**Context.** Curates agent-readable knowledge so an agent can traverse it at runtime. The bundle *is* the agent's context window source. Its link graph is the path the agent will walk.

**Job to be done.** *When I author the knowledge my agent will consume, I want to see the relationship graph it will traverse, meaning which concepts cite which. Then I can spot orphans, dead ends, and missing links before the agent does.*

**What matters most.**

- [Graph View](../features/graph-view.md): the traversal graph made visible, type-colored.
- [Navigation](../features/navigation.md): follow links and "cited by" backlinks the way an agent would.
- [Validation](../features/validation.md): catch broken links and missing `type` fields non-blockingly.
- [Agent Panel](../features/agent-panel.md): create or enhance a conformant bundle from explicit sources through the packaged OKF guidance and staged review.

# The newcomer to an unfamiliar bundle

**Context.** Received a bundle they did not write (a repo subdirectory, a teammate's folder, a downloaded tarball) and needs to understand it fast.

**Job to be done.** *When someone hands me a bundle I did not write, I want to grasp its shape in a couple of minutes, without a tour. That means the big concepts, how they connect, and where to start reading.*

**What matters most.**

- [Graph View](../features/graph-view.md): the shape of the whole bundle at a glance.
- [Search and Filter](../features/search-and-filter.md): find a foothold by keyword or type.
- [Navigation](../features/navigation.md): start at the root and descend by progressive disclosure.
- [Agent Panel](../features/agent-panel.md): ask a cited question against the active bundle without moving it to another workspace.

# The OKF producer / maintainer

**Context.** Authors and maintains their own OKF bundle. Wants to dogfood it the way a consumer will, checking conformance and structure while writing rather than after.

**Job to be done.** *While I author my bundle, I want a live, tolerant view of it as it really is. Show me broken links, untyped concepts, and orphaned files as I go. Then I can fix problems in the same session I create them.*

**What matters most.**

- [Live Reload](../features/live-reload.md): save in the editor, see the result instantly.
- [Validation](../features/validation.md): soft issues surfaced, never blocking the read.
- [Graph View](../features/graph-view.md): confirm the structure matches the intent.
- [Agent Panel](../features/agent-panel.md): enrich the bundle from new evidence, inspect the diff, and apply only a validated revision.

# Why these four

Together these personas define the complete Studio loop. Open and understand existing knowledge, query it with evidence, create or enhance it from sources, and review every proposed write. The [Scope and Non-Goals](scope-and-non-goals.md) keeps that loop bundle-focused rather than turning Studio into a general editor, sync service, git client, or autonomous computer operator.
