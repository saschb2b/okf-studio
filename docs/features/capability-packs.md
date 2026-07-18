---
type: Feature
title: Declarative OKF Capability Packs
description: Package Studio's curated OKF skills, templates, artifact contract, and tool requirements as one inspectable and reversible built-in unit.
tags: [feature, agents, skills, capability-pack, security, migration]
timestamp: 2026-07-18T17:20:00Z
---

# Purpose

OKF specialization ships as the built-in `okf-foundation@1.1.0` capability pack. The pack binds the curated skill catalog, shared Markdown and writing resources, the JSON Schemas for the `okf-artifact-v1` envelope and `writing-revision-v1` claim ledger, and the complete closed set of Studio tool IDs those skills may require.

Settings shows the pack identity, version, publisher, provenance, compatibility, conflicts, resource IDs, SHA-256 digest, activation state, and the capabilities it currently exposes. This disclosure identifies what Studio selected. It does not claim that an external agent loaded or followed a resource.

# Why this exists

Before the pack, OKF specialization was spread across skill files, templates, artifact schemas, tool routing, and native code. Those parts could evolve together in source control, but the installed product had no single identity for the method it was running. A user could not inspect the complete unit, compare an upgrade, or return to the earlier behavior without changing the application itself.

The pack makes specialization a versioned product boundary. One digest ties the method to its required resources and tools, while activation state provides a reversible upgrade path. The closed declarative format also creates a safe extension point for future packs without treating arbitrary executable plugins as documentation.

# Closed v1 format

The v1 manifest accepts only:

- stable pack identity, version, name, description, and publisher;
- `built-in` provenance;
- minimum Studio, capability-schema, and artifact-schema versions;
- conflicting pack IDs;
- one digest-bound capability manifest;
- declarative Markdown templates and JSON artifact schemas; and
- required tool IDs from Studio's compiled allowlist.

Unknown fields fail deserialization. The format has no fields for scripts, hooks, binaries, installers, environment values, arbitrary paths, or MCP commands. Resources resolve only through compile-time paths below the shipped OKF skill bundle. Both the build script and the runtime repeat the schema, compatibility, path, media-type, conflict, tool, size, and digest checks before the pack becomes active.

# Upgrade, rollback, and removal

Studio stores one small activation receipt in `agents/capability-pack-state.json`. A first launch without that file migrates directly from the former single-skill behavior to the verified built-in pack. A changed built-in digest records the previous digest only after the new candidate passes the compiled and runtime checks.

**Use Legacy 0.3.0** deactivates the pack and leaves only `okf-core`. **Restore OKF Foundation** reactivates the verified pack. Deactivation removes its task capabilities from routing; it does not delete the immutable resource bytes from the application package. Invalid state is quarantined and rebuilt without blocking bundle opening.

The pack receipt is separate from the app store, custom agent profiles, native model profiles, agent-owned session pointers, staged Apply checkpoints, credentials, workspace memory, routine records, and bundle grants. Migration and rollback tests keep representative files from each independent state class byte-for-byte unchanged.

# Support boundary

Studio 0.3 ships one built-in pack. It does not install third-party pack files or fetch pack updates from a registry. Imported executable skills, hooks, binaries, and third-party MCP servers remain deferred until they have a separate authenticity, sandbox, permission, update, and removal design.

The pack builds on [Native OKF Tasks](native-okf-tasks.md), [Structured Agent Work](structured-agent-work.md), and the [Agent System](../architecture/agent-system.md). Provider limits and evaluation evidence are defined by [OKF Agent Benchmarking](../architecture/agent-benchmarking.md).
