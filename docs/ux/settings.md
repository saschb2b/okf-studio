---
type: Reference
title: Settings and preferences
description: The searchable local settings workspace for appearance, reading, agents, bundle knowledge, discovery, updates, and reset.
tags: [ux, settings, preferences]
generated: { by: claude/unrecorded, at: 2026-07-24T12:00:00Z }
---

# Why Settings is a workspace

Settings began as a short modal for theme, motion, reader size, scan depth, updates, and reset. Agent notifications, capability packs, workspace memory, local routines, and external bundle access later joined the same column. The controls remained correct, but their placement did not: later settings fell below the fold, unrelated concerns touched each other, and a user had to remember where an item appeared.

The settings workspace gives each concern a stable place and adds search across names, descriptions, keywords, and categories. Navigation, search, the current category, and the footer remain in view while only category content scrolls. This preserves orientation as the product adds settings and reduces the time needed to find a rarely used control.

# Opening Settings

Settings opens from the Settings action at the foot of the [Activity Bar](browsing-layout.md), with `Ctrl/Cmd + ,` from the [keyboard map](keyboard-shortcuts.md), or from the [command palette](../features/command-palette.md). The workspace is a large bounded dialog rather than a separate application window, so closing it returns focus to the previous workspace context.

Preferences take effect immediately and persist on this device. The fixed footer states that changes are saved automatically and keeps Reset to defaults and Done in reach.

# Information architecture

| Category | User job | Settings and surfaces |
| --- | --- | --- |
| General | Control bundle discovery | Scan depth |
| Appearance | Control the interface | Theme, reduce motion |
| Reading | Control concept prose | Reader text size |
| Agents | Control agent attention and inspect supplied methods | Background notifications, notification sound, OKF capability pack |
| Knowledge | Manage state and access for the open bundle | Workspace memory, local routines, one-shot OKF MCP grant |
| Updates | Notice and apply a new release | New release badge, check, install and restart, or download |

These categories describe tasks that Studio supports. The workspace does not show account scopes, project overrides, or a settings file because Studio has no account, cloud preference layer, or editable settings document.

# Search and navigation

The desktop layout has a search field and persistent category rail on the left. Selecting a category updates the title, description, and scrollable content pane without moving the workspace frame.

Search returns compact results instead of mounting every matching settings panel at once. Each result names its category, setting, and effect. Selecting it opens the owning category and moves focus to the exact row or panel. If no setting matches, the empty state suggests broader terms and leaves the search field available.

At narrow widths the category rail becomes a labelled category selector. Setting rows stack their controls under the description, the footer stays fixed, and the content pane remains the only scroll owner. The layout reflows to 320 CSS pixels without horizontal scrolling.

# Setting behavior

## General

Bundle scan depth controls how far [folder autodetect](../features/folder-autodetect.md) descends below the folder the user opened. The fixed ignore list still skips `.git`, `node_modules`, `target`, `dist`, `build`, `.venv`, and hidden directories. An editable ignore list remains a [later refinement](../product/scope-and-non-goals.md).

Recent bundles are managed in the [Bundle Switcher](../features/bundle-switcher.md), where they are part of the context-switching job rather than a global preference.

## Appearance

Theme supports System, Light, and Dark and follows the operating system by default; see [Theming](theming.md). Reduce motion overrides the operating-system motion preference for Studio and applies the contract in [Accessibility](accessibility.md).

## Reading

Reader text size scales the [concept reader](../features/concept-reader.md) without scaling the graph or application chrome. `Ctrl/Cmd +`, `-`, and `0` change the same value when focus is outside the graph. Browser page zoom remains suppressed, including the GTK gesture path described in [Theming](theming.md).

The reader's `Aa` control owns measure width, line spacing, font choice, and dyslexia-friendly reading aids. Those preferences use the same local settings store but remain next to the content they change.

## Agents

Background agent notifications are off by default. Enabling them requests operating-system permission. Studio can then notify only when an unfocused background thread completes, fails, or waits for permission. The payload includes a bounded thread title, agent name, and generic state. Prompt, response, source, concept, finding, path, permission, and staged content stay out of the notification.

Notification sound is available only after notifications are enabled. The operating system decides whether sound plays and whether focus suppresses it. Permission failures remain beside these controls with a direct explanation.

The OKF capability pack exposes the built-in pack's provenance, Studio and schema compatibility, conflicts, templates, artifact schemas, required tools, digest, activation state, and per-capability resources. **Use Legacy 0.4.0** retains only `okf-core`; **Restore OKF Foundation** returns the curated methods. Either choice leaves profiles, sessions, checkpoints, preferences, and grants unchanged. See [Declarative OKF Capability Packs](../features/capability-packs.md).

## Knowledge

Knowledge settings require an open bundle because each item is scoped to one Rust-granted root. Without a bundle, the category explains that requirement instead of showing disabled controls without context.

Workspace memory shows every bounded local preference and deterministic task record with origin, owner, validation state, last use, retention, exact context effect, and deletion. It stores no conversation or knowledge bodies; see [Inspectable Workspace Memory](../features/workspace-memory.md).

Local routines create manual or daily deterministic health rescans and source-fingerprint checks. Each routine shows its schedule, timeout, catch-up policy, next run, exact scope, Run now, and Delete. Non-healthy, skipped, blocked, interrupted, and failed receipts appear in the local attention inbox; see [Local OKF Routines and Attention Inbox](../features/local-routines.md).

Use this bundle from another agent creates a copyable standard MCP descriptor. The descriptor expires after 60 seconds, works once, exposes only bounded read-only OKF tools, and carries no bundle path. Creating or copying it does not connect or prompt an agent; see [Guarded External Entry Points](../features/external-entry-points.md).

## Updates

Installing or downloading a release is always an explicit user action. Once shortly after launch, Studio quietly reads GitHub's release manifest to learn whether a newer version exists. The only surface of that check is a small warning-colored dot on the Settings icon in the [Activity Bar](browsing-layout.md) and on the Updates category inside this workspace, so a new release gets noticed without a dialog, toast, or sound. The dot animates once on arrival and then rests still; reduce motion removes the animation. A failed or offline check reports nothing, so an offline launch looks identical to an up-to-date one. The New release badge setting turns the launch check off entirely, restoring strictly on-demand checking.

Opening the Updates category acknowledges the release: the dots disappear and stay away for that version across launches, returning only for a newer release. Check for updates remains available as an explicit action. A newer AppImage or Windows build can install and restart in place. A `.deb` installation offers the same version notice and a Download action because the operating-system package manager owns replacement. Development and web builds report that updates are unavailable and never run the launch check; see [Build and release](../architecture/build-and-release.md).

# States and accessibility

The workspace uses the Base UI dialog contract for focus containment, Escape, backdrop, scroll lock, and focus return. Search, category buttons, category selector, toggles, selects, number controls, reset, and close actions have accessible names and visible focus indicators.

Loading, empty, and error states remain inside the category that owns them. Capability inspection, workspace memory, routines, grants, notification permission, and update checks retain their existing recovery action and do not displace the workspace frame. See [Empty and error states](empty-and-error-states.md).

# Persistence and reset

Preferences persist through Tauri's local store plugin; see [IPC and security](../architecture/ipc-and-security.md) and [Tauri 2](../reference/tauri-2.md). No account or cloud sync exists, following the [local-first principle](../product/principles.md).

Reset to defaults restores the shipped preference values, including System theme, default reader size, scan depth 8, motion enabled, the new release badge on, and agent notifications and sound off. It does not delete bundle memory, routines, profiles, sessions, credentials, checkpoints, or grants.

# Out of scope

User-configurable keybindings remain post-v1 work; see [Scope and non-goals](../product/scope-and-non-goals.md).
