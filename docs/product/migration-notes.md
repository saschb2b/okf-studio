---
type: Migration Guide
title: OKF Viewer to OKF Studio
description: What changes, including bundle-folder grants, and what stays compatible when OKF Viewer upgrades to OKF Studio.
tags: [product, migration, upgrade, compatibility, credentials]
generated: { by: claude/unrecorded, at: 2026-07-19T11:22:06Z }
---

# Upgrade in place

OKF Studio keeps the existing application's technical identity while changing its visible name and capabilities. Install a Studio build over an existing OKF Viewer installation, or use the existing opt-in updater where the package supports it. No migration wizard or data-copy step is required.

The following compatibility names intentionally remain unchanged:

| Surface | Compatibility name | Upgrade behavior |
| --- | --- | --- |
| Tauri application identifier | `app.okfviewer.desktop` | Keeps the operating system's existing app-data and cache locations. |
| Store file | `okf-viewer.json` | Keeps settings, recent bundles, and saved agent-thread pointers. |
| Credential service | `app.okfviewer.desktop` | Keeps Studio Agent API keys reachable through the operating-system credential store. |
| Package and binary name | `okf-viewer` | Keeps development, packaging, and repository tooling compatible. The built artifact and the `okf-viewer` command keep this name, so a `.deb` upgrade replaces the installed package instead of installing a second one beside it. |

Do not rename these files, directories, keyring entries, or command names to `okf-studio`. They are stable implementation identifiers, not stale product branding. A separate migration would be required before any of them could change safely.

# The repository moved to `saschb2b/okf-studio`

The GitHub repository was renamed after the table above was first written, so it is no longer a compatibility name. The move is safe for existing installations, and the reasoning is worth keeping:

- **Already-installed builds keep updating.** GitHub redirects a renamed repository's git, issue, and release traffic, including release asset downloads, so the updater endpoint compiled into a v0.5.0 or earlier binary still resolves. Verified against a renamed repository before the move: `…/releases/latest/download/latest.json` answers `301` to the new location.
- **That redirect is not permanent.** It stops the moment any repository is created under the old name. **Never create a `saschb2b/okf-viewer` repository**, not even an empty one and not to serve a redirect page: doing so silently breaks automatic updates for everyone running a build released before the rename.
- **The project site moved with it.** GitHub does not redirect project-page URLs, so `saschb2b.github.io/okf-viewer/` is gone and the site now lives at `saschb2b.github.io/okf-studio/`. Links published before the move do not resolve. A custom domain would make any future rename free; without one, the site's URL is the repository's name.

The application identity was untouched by the move. No user keeps settings, credentials, or app data in a location derived from the repository name.

# Data retained by an upgrade

An in-place upgrade continues to use:

- preferences and recent bundle locations in the app store;
- custom ACP profiles in the app-data `agents/custom-agents.json` file;
- Studio Agent endpoint profiles in `agents/local-models.json`;
- opaque current and archived ACP session pointers in the app store;
- managed Node and agent packages in the app cache's `agents` directory; and
- recoverable Apply transactions and the latest restore checkpoint in app data.

The stored ACP pointers contain no transcript, prompts, attachments, tool activity, permissions, usage, or credentials. Agent-owned conversation history remains with the connected agent. Live conversation state, staged drafts, thread write grants, attachment contents, and one-turn permission choices are memory-only and do not survive a restart.

OKF bundles need no content migration. Opening a bundle remains read-only. Files change only through a separately granted, reviewed, validated Apply action.

Installed Studio builds add the `okf-studio://` scheme through the ordinary application installer. It is an entry to a visible request preview, not stored user data or standing authority. Upgrade adds no background process, startup item, global shortcut, file association, or content index. Uninstalling through the platform package removes the scheme registration with the application.

One-shot MCP launch records are temporary, expire after 60 seconds, and are deleted when consumed. They are not profiles and do not need migration or rollback. Existing agent profiles, session pointers, staged checkpoints, settings, and bundle grants keep their current storage and meaning.

The curated OKF methods now belong to the built-in `okf-foundation@1.3.1` pack. The update adds the focused retrieval method and `okf_retrieve` tool while retaining the writing resource, author and revise capabilities, writing-revision schema, and generic-chat discovery of every active method. It does not rewrite an existing concept or bundle. First launch creates `agents/capability-pack-state.json` with the verified pack identity and digest. **Use Legacy 0.4.0** rolls routing back to the retained single-capability baseline; **Restore OKF Foundation** re-enables the curated methods. This receipt is independent. Neither migration nor rollback rewrites custom profiles, endpoint profiles, agent-owned session pointers, Apply checkpoints, the preference store, credentials, workspace memory, routines, or bundle grants. Removing the application may leave this ordinary app-data receipt for a later reinstall, like the other local settings.

Retrieval manifests are created lazily after the first bundle question and live only in the application cache under `retrieval-v1`. No bundle migration is required. Rolling back Studio may leave those disposable files; deleting that directory forces a rebuild and does not remove conversation pointers, credentials, grants, or bundle knowledge. See [Retrieval Operations](retrieval-intelligence/retrieval-operations.md).

# Bundle folder grants

Studio no longer treats a folder path in the frontend recent-bundle store as filesystem authority. A Rust-owned native picker records the canonical folder in a separate app-data grant file. Completed remote downloads register their cache roots through the same boundary. Scans, reads, assets, watchers, and agent sessions reject a path without a live matching grant.

Recent entries from a build before this boundary still appear after upgrade, but their stored paths cannot authorize access. Open each local folder once through **Open folder...** to establish its Rust grant. Use **Refresh from source** once for each retained remote recent so the completed fetch establishes its cache grant. These one-time actions are required because trusting old frontend data would defeat the boundary.

Forgetting the last inactive recent from a folder removes its remembered grant. A missing or moved folder fails closed and can be selected again at its new location.

# Credentials

External ACP agents own their sign-in and token storage. Studio does not copy those credentials.

For an API-key-backed Studio Agent profile, Rust stores the key in Windows Credential Manager, macOS Keychain, or Linux Secret Service under service `app.okfviewer.desktop` and account `studio-agent:<profile-id>`. The profile JSON records only that a credential exists. The key is not stored in the app store or returned to the webview.

Removing the endpoint profile from Studio also removes its stored API key. **Reset to defaults** resets preferences only; it does not delete agent profiles, managed packages, thread pointers, checkpoints, or credentials. If the operating-system keyring is locked or was cleared, retest the endpoint and enter the key again.

Before uninstalling, remove any API-key-backed endpoint profiles in Studio if the keys should be deleted too. Uninstallers remove application binaries but may leave app data, cache data, and operating-system credentials for a later reinstall.

# Billing and network ownership

Studio has no account, subscription, hosted inference service, or billing relationship.

- A subscription or token used by an external ACP agent is billed by that agent's provider.
- An API key used by Studio Agent is billed directly by the configured endpoint provider.
- A local endpoint uses the user's own machine or self-hosted service.
- Usage and cost shown in a thread are values reported by the agent or provider. They are not an invoice and Studio does not independently verify them.

Installing an ACP agent, connecting a remote provider, checking for updates, and importing a public URL are explicit network actions. Merely opening and reading a local bundle sends nothing.

# Upgrade checklist

1. Finish or cancel active turns. Apply or discard any staged draft that should not be lost.
2. Install the Studio build through [the supported update path](../architecture/build-and-release.md), or replace the existing installation with the release package for the same platform.
3. Start Studio and confirm the expected recent bundles, agent profiles, and saved thread pointers appear.
4. Open each retained local bundle folder once to create its Rust-owned grant. Use **Refresh from source** once for every retained remote recent.
5. Retest credentialed Studio Agent endpoints if the operating-system keyring requests access or reports a missing key.
6. Leave compatibility-named storage and repository paths unchanged.

For the underlying boundaries, see [Agent System](../architecture/agent-system.md), [IPC & Security](../architecture/ipc-and-security.md), [Settings & Preferences](../ux/settings.md), and the [OKF Studio Transformation](studio-roadmap.md).
