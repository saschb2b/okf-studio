---
type: Feature
title: Ignore Rules
description: Keep generated, private, or irrelevant paths out of Studio's bundle views and agent context through one visible root rule file.
tags: [feature, privacy, ignore, filesystem, agents]
timestamp: 2026-07-23T20:15:52+02:00
---

# What it does

A bundle may place a `.okfignore` file at its root. Studio applies that file to concept parsing, validation inventory, synthesized navigation, live reload, selected-folder source intake, retrieval inputs derived from the parsed bundle, and recipient projections. The **Ignore rules** view in **Bundle details** names the rule source, applied-rule count, platform case behavior, excluded-path count, bounded diagnostics, and up to 128 excluded paths. The Info action beside Share opens it from every concept and layout.

The same matcher keeps each surface from quietly inventing a different privacy boundary. A path excluded from the parsed bundle cannot enter search, retrieval, or an agent's bundle context because those systems consume the same parsed concept set.

# Rule contract

The syntax is a bounded Git-ignore-style subset:

- blank lines and lines beginning with `#` are comments;
- `*` matches within one path segment, `?` matches one character, and `**` crosses directories;
- a leading `/` anchors a rule to the bundle root;
- a trailing `/` addresses a directory and its descendants;
- a leading `!` negates an earlier rule, and the last matching rule wins;
- `\#` and `\!` address a literal leading marker.

Patterns stay relative to the bundle root. The file is limited to 64 KiB, 512 applied rules, and 512 characters per pattern. Controls, absolute paths, and parent traversal are rejected with visible diagnostics. Matching follows the host filesystem convention: case-sensitive on Linux and macOS, case-insensitive on Windows.

Studio always excludes hidden directories and the common `.git`, `node_modules`, `target`, `dist`, `build`, and `.venv` directories. Symbolic links are never followed. Authored rules may restore a child of an authored exclusion, so the core does not prune those directories before it has evaluated a later negation.

# Security boundary

Ignore rules reduce what Studio displays, retrieves, watches, passes to an agent, and copies into a projection. They do not encrypt a file, change its operating-system permissions, revoke an existing folder grant, or prevent another process with filesystem access from reading it.

The ignore report itself is available only after Rust confirms the existing bundle grant. A change to `.okfignore` is always watched, even when the new rules would otherwise hide that path, so Studio can refresh the complete boundary. Opening a source folder remains an explicit user action; its root rules can only reduce that selected intake.

# Failure and scale behavior

An unreadable, oversized, or partly invalid rule file never stops the bundle from opening. Studio applies the valid bounded prefix, reports what it could not apply, and keeps its built-in noise exclusions. Reports count every excluded entry but return only the first 128 sorted paths.

Pure matcher tests cover nested globs, last-match negation, platform case behavior, default exclusions, and symbolic links. Parser, source-intake, and watcher tests prove that the same decision reaches their boundaries.

Related behavior: [OKF Parsing](../architecture/okf-parsing.md), [Live Reload](live-reload.md), [Retrieval Intelligence](retrieval-intelligence.md), [Agent System](../architecture/agent-system.md), and the [OKF Ecosystem Response](../product/okf-ecosystem-response-roadmap.md).
