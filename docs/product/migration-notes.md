---
type: Migration Guide
title: OKF Viewer to OKF Studio
description: What changes and what stays compatible when an existing OKF Viewer installation upgrades to OKF Studio.
tags: [product, migration, upgrade, compatibility, credentials]
timestamp: 2026-07-13T17:18:47Z
---

# Upgrade in place

OKF Studio keeps the existing application's technical identity while changing its visible name and capabilities. Install a Studio build over an existing OKF Viewer installation, or use the existing opt-in updater where the package supports it. No migration wizard or data-copy step is required.

The following compatibility names intentionally remain unchanged:

| Surface | Compatibility name | Upgrade behavior |
| --- | --- | --- |
| Tauri application identifier | `app.okfviewer.desktop` | Keeps the operating system's existing app-data and cache locations. |
| Store file | `okf-viewer.json` | Keeps settings, recent bundles, and saved agent-thread pointers. |
| Credential service | `app.okfviewer.desktop` | Keeps Studio Agent API keys reachable through the operating-system credential store. |
| Repository and updater | `saschb2b/okf-viewer` | Keeps release links and signed update discovery working. |
| Package name | `okf-viewer` | Keeps development, packaging, and repository tooling compatible. |

Do not rename these files, directories, keyring entries, or URLs to `okf-studio`. They are stable implementation identifiers, not stale product branding. A separate migration would be required before any of them could change safely.

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
4. Retest credentialed Studio Agent endpoints if the operating-system keyring requests access or reports a missing key.
5. Leave compatibility-named storage and repository paths unchanged.

For the underlying boundaries, see [Agent System](../architecture/agent-system.md), [IPC & Security](../architecture/ipc-and-security.md), [Settings & Preferences](../ux/settings.md), and the [OKF Studio Transformation](studio-roadmap.md).
