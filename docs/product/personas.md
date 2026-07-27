---
type: Product
title: Personas & Use Cases
description: The handful of concrete people OKF Studio is built for, framed by the job each hires it to do.
tags: [product, personas, use-cases]
generated: { by: claude/unrecorded, at: 2026-07-13T18:51:16Z }
---

# Who this is for

The [Overview](overview.md) sketches the audience in three lines. This concept makes it concrete: four people, the job each hires OKF Studio to do, and the [features](../features/) that matter most to them. These personas are the reason the product is [scoped](scope-and-non-goals.md) the way it is.

# The data / platform engineer

**Context.** Keeps table docs, runbooks, and metric definitions as OKF bundles checked into a repo, alongside the code they describe. Lives in a terminal and an editor; allergic to standing up a web server or a cloud account just to read docs.

**Job to be done.** *When I open a repo full of OKF markdown, I want to see how the table docs, runbooks, and metrics relate — without a build step or a browser tab pointed at localhost — so I can find the right doc and trust it is current.*

**What matters most.**

- [Folder Autodetect](../features/folder-autodetect.md) — point at the repo, get every bundle.
- [Live Reload](../features/live-reload.md) — the view tracks the files as `git pull` or edits change them.
- [Search & Filter](../features/search-and-filter.md) — jump straight to a metric or runbook by name or type.
- [Agent Panel](../features/agent-panel.md) — investigate a dataset or request a reviewed documentation change without granting direct writes.

# The AI / agent builder

**Context.** Curates agent-readable knowledge so an agent can traverse it at runtime. The bundle *is* the agent's context window source; its link graph is the path the agent will walk.

**Job to be done.** *When I author the knowledge my agent will consume, I want to see the relationship graph it will traverse — which concepts cite which — so I can spot orphans, dead ends, and missing links before the agent does.*

**What matters most.**

- [Graph View](../features/graph-view.md) — the traversal graph made visible, type-colored.
- [Navigation](../features/navigation.md) — follow links and "cited by" backlinks the way an agent would.
- [Validation](../features/validation.md) — catch broken links and missing `type` fields non-blockingly.
- [Agent Panel](../features/agent-panel.md) — create or enhance a conformant bundle from explicit sources through the packaged OKF guidance and staged review.

# The newcomer to an unfamiliar bundle

**Context.** Was handed a bundle they did not write — a repo subdirectory, a teammate's folder, a downloaded tarball — and needs to understand it fast.

**Job to be done.** *When I am dropped into someone else's bundle, I want to grasp its shape — the big concepts, how they connect, where to start reading — in a couple of minutes, without a tour.*

**What matters most.**

- [Graph View](../features/graph-view.md) — the shape of the whole bundle at a glance.
- [Search & Filter](../features/search-and-filter.md) — find a foothold by keyword or type.
- [Navigation](../features/navigation.md) — start at the root and descend by progressive disclosure.
- [Agent Panel](../features/agent-panel.md) — ask a cited question against the active bundle without moving it to another workspace.

# The OKF producer / maintainer

**Context.** Authors and maintains their own OKF bundle and wants to dogfood it the way a consumer will — checking conformance and structure as they write, not after.

**Job to be done.** *While I author my bundle, I want a live, tolerant view of it as it really is — broken links, untyped concepts, orphaned files surfaced as I go — so I can fix problems in the same session I create them.*

**What matters most.**

- [Live Reload](../features/live-reload.md) — save in the editor, see the result instantly.
- [Validation](../features/validation.md) — soft issues surfaced, never blocking the read.
- [Graph View](../features/graph-view.md) — confirm the structure matches the intent.
- [Agent Panel](../features/agent-panel.md) — enrich the bundle from new evidence, inspect the diff, and apply only a validated revision.

# Why these four

Together these personas define the complete Studio loop: open and understand existing knowledge, query it with evidence, create or enhance it from sources, and review every proposed write. The [Scope & Non-Goals](scope-and-non-goals.md) keeps that loop bundle-focused rather than turning Studio into a general editor, sync service, git client, or autonomous computer operator.
