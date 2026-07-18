---
type: Feature
title: Local OKF Routines and Attention Inbox
description: Run bounded offline bundle checks on demand or on a local schedule, with a Rust-owned recovery ledger and content-free attention notices.
tags: [feature, agents, routines, automation, health, local-first]
timestamp: 2026-07-18T14:20:00Z
---

# Purpose

Local routines turn repeatable OKF maintenance into visible, inspectable work. They do not turn Studio into an always-running service and do not give an agent standing authority. Routine schema v1 supports two deterministic tasks:

- a knowledge-health rescan over the current bundle snapshot;
- a SHA-256 fingerprint check over one or more explicitly named, bundle-relative source files.

Both tasks work without an agent, model, credential, tool call, network request, or staging grant. A routine never applies a bundle change.

# Why this exists

Health checks and source-drift checks only help when someone remembers to run them. In an occasionally opened local workspace, a bundle can become stale between editing sessions and remain unnoticed until an agent or reader depends on it. Solving that with a permanently running agent would introduce standing credentials, broad process lifetime, and unclear authority for work the model does while the user is absent.

Local routines automate only the checks Studio can execute and explain deterministically. The attention inbox makes missed maintenance visible when the workspace is next active, while the ledger distinguishes success, failure, skip, and interruption. This provides continuity without a background service, model cost, or unattended write access.

# Saved definition

Every definition names its bundle, task, trigger, timeout, catch-up choice, and complete effective scope. The v1 scope is closed to no agent, no model, no tools, offline network, selected bundle sources only, and no staging. Rust baselines source fingerprints when the routine is saved. Absolute paths, traversal, missing files, files outside the canonical bundle, and sources over 32 MiB are rejected.

A manual routine runs only from **Run now**. A scheduled routine uses a bounded interval between 15 minutes and seven days. Studio checks due work while the active granted bundle is open; it does not install a background service or wake the machine. After sleep or downtime, the saved catch-up choice either runs once or records an explicit skipped run. The default is skip.

Agent-backed routines are unavailable in schema v1. A later schema may add them only when a live-capable profile can be selected and its bundle grant, model, tools, network, sources, staging scope, timeout, and stop conditions can all be revalidated at execution time. A saved profile label is never authority.

# Execution and recovery

Rust re-authorizes the exact canonical bundle before every run and reparses the current snapshot. It serializes work by both routine and bundle, so two routines cannot overlap on one bundle. Revoked grants, removed bundles, missing sources, invalid definitions, and timeouts fail closed. Application exit ends the work because no external routine process or resident scheduler exists.

Before work begins, Rust writes an in-progress ledger receipt containing the scheduled time, actual start, bundle, routine, and SHA-256 scope fingerprint. Completion replaces that exact receipt with a closed outcome and recovery state. If Studio next opens with an in-progress receipt, it becomes an interrupted failure with **Run again**. A missing completion is never treated as success.

Definitions are capped at 32 and the newest 512 run receipts are retained outside the bundle. Corrupt or oversized storage cannot grant access or block bundle opening; invalid records are ignored. Routine deletion removes the definition but keeps its bounded run evidence until normal ledger retention removes it.

# Attention inbox and notifications

The active bundle's Settings surface shows saved routines and a local attention inbox. Each non-healthy result carries its reason, age, bundle context, routine, and next action. Healthy results remain in the ledger without adding inbox noise.

When desktop notifications are enabled and Studio is unfocused, a scheduled result may send only a generic count: **OKF routines need attention** and an instruction to open Studio. Bundle names, paths, findings, source identities, prompts, and knowledge content stay out of operating-system notification history.

This feature builds on [Knowledge Health](knowledge-health.md), stores routine-definition metadata alongside [Inspectable Workspace Memory](workspace-memory.md), and follows the Rust authority boundary in [Agent System](../architecture/agent-system.md).
