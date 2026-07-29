---
type: Feature
title: Create Bundle
description: A form-driven, agent-free way to start a new conformant OKF bundle and open it immediately.
tags: [feature, create, bundle, first-run]
generated: { by: claude/unrecorded, at: 2026-07-16T23:30:00Z }
sources:
  - resource: ../reference/okf-spec-summary.md
    title: OKF spec summary
---

# What it does

Turns a small form into a new OKF v0.1 bundle on disk, then opens it like any
picked folder, ready to work on. **No agent is involved: this is static
generation only.** The form collects a bundle title (which derives the folder name until the
user edits it), an optional one-sentence description, the first concept's
title and `type`, and whether to include a starter guide. On confirm, the OS
parent-folder picker appears; Studio writes the bundle inside the chosen
location and opens it.

# Entry points

- **First run**: the empty state's hero offers **Create New Bundle…** beside
  Open Folder ([First-Run Experience](../ux/first-run.md)).
- **No bundles found**: the "no OKF bundles in this folder" state offers
  creating one instead of only re-picking.
- **Existing users**: the [Bundle Switcher](bundle-switcher.md)'s footer gains
  **New bundle…** beside Open folder and Open from URL.

# What gets generated

A minimal, conformant starter the user grows from, never a scaffold to clean
up:

- a root `index.md` declaring `okf_version: "0.1"`, the title, the
  description, and listings for every generated concept;
- a dated `log.md` with the Creation entry
- the **first concept** (`concepts/<slug>.md`) with full frontmatter (`type`,
  `title`, `description`, `timestamp`) and a short body inviting real content;
- optionally a **starter guide** concept (`guide/working-in-this-bundle.md`,
  `type: Guide`) explaining how to add concepts, link them, keep the index
  current, and log changes. It cross-links with the first concept, so the
  starter graph holds together from day one, with no orphans.

# Guarantees

The Rust core owns the write ([IPC & Security](../architecture/ipc-and-security.md)):
it checks the folder name against path tricks and reserved names, bounds and
control-filters every input, and quotes titles so they round-trip under both
real YAML parsers and the tolerant frontmatter reader. It writes the tree
atomically, by renaming a temp directory into place: the destination appears
complete or not at all, and an existing folder stays untouched.
Before handing the bundle back, the generator **self-checks it with
`okf-core`**: zero conformance errors or the creation fails and cleans up.
The created folder is granted read scope exactly like a picked folder.

# What it is not

Not a template gallery, and not agent authoring. The [Agent Panel](agent-panel.md)'s
Create flow covers proposal-driven bundle drafts with review. This feature is
the fast, deterministic floor: a correct empty-ish bundle in seconds.
