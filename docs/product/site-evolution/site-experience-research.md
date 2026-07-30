---
type: Research Brief
title: OKF Studio Site Experience Research
description: Evidence and recommendations for evolving the one-page launch site into a scalable product site.
tags: [product, site, ux, information-architecture, research]
generated: { by: claude/unrecorded, at: 2026-07-19T19:24:23Z }
---

# Question

How should the OKF Studio site explain the current product and accommodate future capabilities without turning its homepage into a longer feature catalogue?

# Conclusion

The site should become a small multi-page product site. The homepage should explain one complete knowledge-work loop. The user understands a bundle, asks questions with inspectable evidence, improves knowledge through reviewed changes, and keeps the result in history. Product pages should carry capability depth. Workflow pages should start from a user's task. OKF, documentation, releases, and the project itself should have stable destinations outside the homepage.

This is an information-architecture change before it is a visual redesign. The current visual language can survive the transition. The one-page content model cannot.

# What the current site communicates

This review rendered the homepage at 1440 by 900 and 390 by 844 on 2026-07-19. Its source contains 13 general feature records and 16 agent records. Those 29 equal-weight cards appear before the visualization, reader, ODSF, and download sections. At the narrow viewport the document measured 18,051 pixels, about 21 viewport heights. The page remains usable, but scanning cost rises with every shipped capability.

The structure creates several product problems:

* **The product has no dominant story.** Retrieval, reviewed writes, Git, graph views, tabs, hover previews, settings, and Markdown rendering receive comparable visual weight. A visitor must infer which combination defines Studio.
* **The format precedes the job.** The first substantial section explains OKF and ODSF before the site has shown why a person would use Studio. Existing users may value that detail. A new visitor first needs the product outcome.
* **Mobile navigation removes orientation.** Below 640 pixels the text links disappear, leaving the brand and Download action. The CSS describes every omitted destination as one scroll away, but the page is now too long for that assumption.
* **The page is the content database.** Feature copy, navigation, release metadata, screenshots, and page composition live together in a 518-line `index.astro`. A new capability requires another homepage decision instead of a clear choice among homepage, product detail, workflow, documentation, or changelog.

The visual review also found a proof gap. The site has strong graph, reader, and ODSF imagery. The product's newer differentiators depend mostly on card copy: the Agent workspace, evidence inspection, reviewed writes, and Integrated Git. The site asks visitors to believe its most important new claims without showing the corresponding work.

## Visual audit findings

| Severity | Autonomy | Finding | State |
| --- | --- | --- | --- |
| Glaring | Judgment | At 640 pixels and below, primary navigation links are hidden without a replacement menu. Narrow-screen visitors lose every orientation path except Download. | Remains for the implementation pass. |
| Untidy | Judgment | Twenty-nine equal feature cards flatten the product hierarchy. Unrelated capabilities use the same container and spacing, so visual repetition substitutes for semantic grouping. | Remains; the contract replaces the grids with the knowledge-work loop and focused proof. |
| Untidy | Judgment | Current screenshots prove graph, reader, and ODSF behavior more strongly than the Agent workspace, evidence inspection, reviewed writes, and Git story now central to the product. | Remains; new proof images are required before the matching claims move to the homepage. |
| Untidy | Judgment | The narrow page becomes about 21 viewport heights because every desktop card becomes a full-width list item. The page reflows, but its information hierarchy does not adapt. | Remains; moving detail to routes removes the structural cause. |

This research pass changed no visual defect. The current page did not show horizontal document overflow at the reviewed narrow width. Implementation still needs a 320-pixel reflow check, keyboard traversal, focus review, and slow-image state before release.

# What the product now needs to explain

The [product overview](../overview.md) defines Studio as a local-first workspace for exploring, creating, curating, and querying connected OKF bundles with user-chosen agents. The [personas](../personas.md) range from a newcomer opening an unfamiliar bundle to a maintainer preparing knowledge for an agent. The [scope](../scope-and-non-goals.md) rules out a general editor, cloud sync service, autonomous operator, and general-purpose Git client.

Those boundaries point to a clearer public story. Studio is the desktop workspace around an OKF bundle. Its value is the connected loop between reading, asking, changing, checking, and versioning knowledge. Individual renderers and controls support that loop. They should not each define a homepage section.

# Comparative evidence

The review used current first-party product sites and one primary UX reference. The review inspected the sites on 2026-07-19.

| Source | Observed structure | Implication for Studio |
| --- | --- | --- |
| [Zed](https://zed.dev/) | The homepage selects a few differentiators and links to dedicated AI, Git, parallel-agent, roadmap, release, extension, and documentation pages. | Keep the homepage selective. Give a coherent capability family its own destination when it needs proof or explanation. |
| [Obsidian](https://obsidian.md/) | The core product, Sync, Publish, Canvas, plugins, help, changelog, and roadmap have separate routes. Local-first trust is part of the core product story. | Separate the desktop product from adjacent formats and resources. Treat local-first behavior as a reason to choose Studio, not a minor feature. |
| [Cursor](https://cursor.com/) | The homepage leads with task outcomes and routes technical depth to product, cloud-agent, automation, model, context, changelog, and documentation surfaces. | Describe the work a visitor can finish before listing implementation detail. Keep changing technical detail out of the main narrative. |
| [GitHub Copilot](https://github.com/features/copilot) | A local product-family navigation separates editor, agent, CLI, business, tutorial, and plan surfaces. | A broad agent product needs named capability families. Studio needs a smaller version grounded in its own jobs, not Copilot's commercial breadth. |
| [Raycast](https://www.raycast.com/) | The homepage routes into focused product pages, a store, a manual, developer material, and a changelog. | Extensible products scale through catalog and detail structures. Studio should reserve that pattern for future integrations without advertising a marketplace it does not have. |
| [Anytype](https://anytype.io/) | The homepage spends more space on privacy, ownership, composition, views, and performance than on a complete feature inventory. | The local-first trust model deserves a visible narrative block supported by concrete boundaries. |
| [Nielsen Norman Group, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | The initial view should carry core information while secondary features remain reachable through a clear hierarchy. The guidance applies to information-rich sites and becomes more important on small screens. | Keep the product promise and primary actions in the first layer. Move capability detail to predictable second-level pages instead of hiding it or appending it below the fold. |

# Patterns worth adopting

## One homepage claim

The homepage needs a product model rather than a list of components. The recommended model follows the knowledge-work loop:

1. Understand the bundle through its reader, graph, search, validation, and lineage.
2. Ask with bundle-aware methods and inspect the evidence behind an answer.
3. Improve the knowledge through structured work, checked writing, and reviewed changes.
4. Keep the result through validation, Git history, and portable files.

Together these stages explain why the reader, agent, review, and Git surfaces belong in one app.

## Two ways into product depth

Capability pages and workflow pages answer different questions. Product pages explain what a system does and where its boundaries are. Workflow pages help someone recognize their own task. Both can refer to the same underlying capability record without duplicating its canonical description.

## Stable resource destinations

Documentation, releases, roadmap, and GitHub should not compete with product sections in the page body. They need stable navigation and footer locations. This gives returning users direct routes and prevents launch history from distorting the homepage.

## Real mobile navigation

Narrow screens need the same information architecture as desktop. A menu can change presentation, but it must preserve Product, Workflows, OKF, Docs, GitHub, and Download. Hiding links because sections are technically present on the page no longer meets the navigation job.

# Patterns to reject

Studio should not copy the size of the comparison sites. Pricing, enterprise, account, cloud, marketplace, and business navigation would advertise products that do not exist. A mega-menu would also be premature. One compact Product disclosure and a direct set of resource links are enough for the first structure.

The site should not turn every release into a homepage section. It should not repeat the complete feature list across the homepage, product pages, and documentation. It should not use screenshots as decoration when the adjacent claim is about another surface.

# Evidence limits

This is an expert review of the current implementation and public comparison sites. It does not include traffic analytics, search logs, interviews, or task testing with prospective users. The proposed hierarchy therefore needs a small validation round before the team freezes copy and layout. Ask a newcomer to explain the product, find the agent trust model, and say whether Studio changes files automatically. Then ask the same person to locate Git behavior and download the correct build.

The comparison sites are larger commercial products. Their use of dedicated pages and stable resource navigation is relevant. Their page count and business taxonomy are not.

# Research fingerprint

The local review used repository commit `c2c047b57c8f776d235c265c8dd50450852b9c3b` with a clean working tree. The review inspected external sites on 2026-07-19. The rendered screenshots used for the audit remained outside the repository. They served this review as evidence rather than curated product documentation.
