---
type: UX Specification
title: OKF Studio Site Experience Contract
description: Target site map, navigation, homepage story, content ownership, and implementation sequence for the Studio product site.
tags: [product, site, ux, information-architecture, navigation]
generated: { by: claude/unrecorded, at: 2026-07-19T19:24:23Z }
---

# Outcome

A first-time visitor can answer the questions that determine whether Studio fits their work:

* What is OKF Studio?
* What work does it help me finish?
* Why should I trust it with local knowledge and an agent?
* Where do I download it or learn the details?

A returning visitor can reach documentation, releases, GitHub, or a specific product area without scrolling through the homepage. Adding a feature normally changes one owned detail page or data record. It does not automatically add another homepage card.

# Information architecture

The first multi-page release uses this structure:

```text
Home
Product
  Overview
  Explore knowledge
  Work with agents
  Review and improve
  Version with Git
Workflows
  Understand an unfamiliar bundle
  Ask a bundle with evidence
  Create or improve knowledge
  Check and ship a bundle
OKF
  What is OKF?
  ODSF and design-system knowledge
Docs
Download
Project
  Releases
  Roadmap
  GitHub
```

`Product` groups durable capability families. `Workflows` starts from a user's objective and connects the relevant families. `OKF` explains the portable format after the product value is clear. `Docs` owns instructions and reference material. `Project` owns change over time.

The initial implementation does not need a page for every leaf on day one. The route and content model must support the tree, while thin workflow leaves may begin as sections on one Workflows page. A leaf becomes a dedicated page when it has distinct search intent, enough proof to stand alone, or a stable audience that needs a direct link.

# Primary navigation

Desktop navigation contains:

* **Product**, a compact disclosure containing the overview and capability families.
* **Workflows**, a direct link to the task-led overview.
* **OKF**, a direct link to the format explanation.
* **Docs**, a direct link to product documentation.
* **GitHub**, an external project link with an accessible external-destination label.
* **Download**, the persistent primary action.

The current anchor links disappear once their content moves to routes. The brand returns Home. The active route is visible. Product opens on click and keyboard, closes on Escape and outside interaction, and does not rely on hover.

At narrow widths, the bar keeps the brand, Download, and a labelled Menu button. The menu presents the same destinations and expands Product inline. It traps no focus, restores focus to the trigger on close, and never replaces navigation with a page-length scroll.

# Footer navigation

The footer is a durable directory rather than a repeat of the header:

| Group | Destinations |
| --- | --- |
| Product | Overview, Explore, Agents, Review, Git, Download |
| Learn | What is OKF, ODSF, Docs, Workflows |
| Project | GitHub, Releases, Roadmap, Issues |
| Terms | License, privacy statement if the site begins collecting data |

The footer must not imply telemetry, accounts, pricing, hosted services, or platform support that the product does not provide.

# Homepage story

## Hero

The first screen states that OKF Studio is a local-first desktop workspace for connected knowledge and user-chosen agents. The main action is Download. The secondary action is See how it works. One current product image supports the claim and shows enough of the reader, graph, and Agent workspace to establish that this is a desktop application.

The hero does not explain OKF syntax, enumerate providers, or list every renderer.

## The knowledge-work loop

The outcome blocks explain Understand, Ask, Improve, and Keep. Each block links to its product family and names only the capabilities needed to make the outcome credible. This replaces the general and agent feature-card grids.

## Product proof

The proof section shows the interfaces behind the main claims:

* Inspect a connected bundle through the reader and graph.
* Ask with bundle-aware context and inspect the evidence used.
* Review a proposed change, validate it, and keep it in Git history.

Each story pairs one screenshot with one claim and one detail link. Screenshots must show the surface described by the adjacent copy. Image dimensions remain explicit to avoid layout shift.

## Trust model

A dedicated section explains local files, explicit external activity, user-chosen agents, reviewed writes, and provider-owned credentials. These are product boundaries with user value: a visitor can tell what leaves the machine, what can change files, and who controls the agent account.

## The format

OKF and ODSF appear after the product loop and trust model. The section explains why portable, connected Markdown matters and routes to the deeper OKF pages. It does not require a new visitor to understand the format before understanding Studio.

## Download

The closing download surface keeps operating-system choices, current version, requirements, and links to release notes. Platform support and release metadata come from one shared source rather than duplicated literals across pages.

# Content placement rules

Every claim has one canonical home:

| Content | Canonical home | Homepage treatment |
| --- | --- | --- |
| Product promise and complete loop | Home | Full |
| Durable capability family | Product page | One short outcome or proof link when differentiating |
| Task spanning several capabilities | Workflow page | Mention only when it is a primary entry job |
| Setup, keyboard, compatibility, recovery | Docs | Link, no procedural copy |
| Release-specific behavior | Releases or changelog | Current version and one short recent-change link |
| Format semantics | OKF pages or specification | Plain-language reason and link |
| Planned behavior | Roadmap | Never presented as shipped product copy |

A capability earns homepage space only when it is broadly relevant, differentiates Studio, can be demonstrated with current product evidence, and is stable enough to survive several releases. Failing one condition sends it to a detail page, documentation, or the changelog.

# Content model

Astro pages should consume small typed content records instead of defining the product inventory inside `index.astro`. The model needs:

* navigation destinations and groups
* product families with stable identifiers, summaries, proof assets, documentation links, and related workflows
* workflow records referencing product-family identifiers
* release and download metadata
* shared trust claims tied to the matching product specification.

Navigation data has one owner. A product claim has one canonical record. Pages compose references to those records and may provide page-specific framing, but they do not fork the factual copy. The implementation may use TypeScript data modules first; Astro content collections become useful only when the number of editorial pages warrants schema validation and authoring outside components.

# Visual and responsive rules

The [design-system bundle](../../../design-system/) remains the visual source of truth. The structural change should reuse its type, spacing, button, surface, and focus roles before adding patterns.

The next layout must meet these floors:

* one shared content edge for comparable sections, with narrower measures for prose
* no horizontal page overflow at 320 CSS pixels
* body prose at least 16 pixels with a readable line length
* visible and consistent focus treatment for every navigation control
* at least 24 by 24 CSS-pixel targets, with larger primary targets on touch layouts
* explicit media dimensions or aspect ratios
* no desktop-only destination hidden at narrow widths
* reduced-motion behavior for nonessential movement.

Repeated cards remain appropriate for genuinely parallel workflow outcomes. They must not become the default container for unrelated product facts.

# Search and growth

The first restructuring does not need site search. The proposed hierarchy is small enough to navigate directly. Add search when documentation is published into the same site or when task testing shows that visitors cannot predict the correct destination. A search box should solve observed findability problems, not compensate for an unclear hierarchy.

The structure reserves places for integrations, extension methods, or a public capability catalogue without placing them in primary navigation now. If Studio later ships a real ecosystem surface, it belongs under Product or a new Extensions destination backed by browsable inventory and compatibility data.

# Implementation sequence

## SE0: Content inventory and routing contract

Map every existing homepage claim to Home, Product, Workflow, OKF, Docs, Download, or Releases. Mark duplicates and stale claims. Freeze route names, primary navigation labels, redirects, page titles, descriptions, and canonical URLs before changing layout.

Exit: every current claim has an owner, no shipped claim is lost, and future or unsupported copy is removed.

## SE1: Multi-page foundation

Extract navigation, product families, and release metadata from `index.astro`. Add shared header, mobile menu, footer, page shell, and route-aware metadata. Preserve the existing GitHub Pages base path and direct-route behavior.

Exit: every primary destination works by keyboard at wide and narrow widths; direct URLs and the existing homepage URL build correctly.

## SE2: Homepage replacement

Build the hero, knowledge-work loop, selected proof stories, trust model, format bridge, and download close. Remove the feature-card walls. Capture current screenshots for claims that lack visual proof.

Exit: a visitor can state the product, its main loop, and its safety boundary from the homepage alone. No homepage section exists only to preserve old copy.

## SE3: Product and workflow depth

Create the Product overview and capability-family pages. Add the Workflows overview and promote individual workflow pages only where content and search intent justify them. Link instructions to existing documentation instead of copying them.

Exit: each primary capability and task has one stable shareable destination, and all detail pages route back to Download and relevant Docs.

## SE4: OKF, project, and release routes

Move the format explanation to OKF pages. Add lightweight Releases and Roadmap routes backed by existing repository sources, or link directly to those sources until they can be published without duplication.

Exit: returning users can reach format, documentation, release, and project information without traversing the homepage.

## SE5: Experience verification

Test the complete site at 320, 390, 768, and a wide desktop width. Cover menu open and closed states, missing or slow images, keyboard traversal, reduced motion, direct routes, 404 behavior, and platform download choices. Run a short task test with people unfamiliar with the current page.

Exit: the Astro build, link check, accessibility scan, page metadata check, and responsive visual review pass. Any remaining issue is recorded with severity and an owner.

# Measures

The rework succeeds when:

* all primary desktop destinations remain available on mobile
* each top-level user job is reachable after one navigation choice
* each shipped claim has one canonical content owner
* a new secondary capability can ship without editing the homepage
* task-test participants can identify the product, agent/file boundary, documentation, and correct download path without assistance
* homepage length remains a consequence of the story, not the number of shipped features.

# Deferred decisions

* Whether Docs becomes a first-party site route or remains a direct link to repository documentation.
* Whether Releases and Roadmap are generated from repository data or link to GitHub until a stable publishing pipeline exists.
* Whether Workflows needs separate child routes after task testing.
* Whether a future integrations catalogue warrants a new primary destination.
