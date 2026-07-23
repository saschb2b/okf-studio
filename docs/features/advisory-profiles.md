---
type: Feature
title: Advisory Profiles
description: Resolve optional team conventions from local version-pinned descriptors without changing OKF conformance.
tags: [feature, profiles, metadata, diagnostics, authoring]
timestamp: 2026-07-23T14:55:00Z
---

# User job

A bundle maintainer wants Studio to understand the team's recommended fields, profile-required fields, relationship names, and deterministic health checks without making the bundle dependent on one application or changing what OKF requires.

The maintainer declares a namespaced, exact-version profile in the root `index.md`. Its descriptor travels inside the bundle. On the root folder home, Studio shows each profile's namespace, pinned version, local source, resolution state, field, relationship, and check counts. Advice names the source file and rule and can open the affected concept.

# Boundaries in the interface

The profile surface always says **Not OKF validation**. An active profile can produce information, recommendations, and warnings, but those findings do not enter the conformance count. The original declaration also remains visible in the [Metadata Inspector](metadata-inspector.md), including values Studio does not understand.

Profile expectations use two labels:

- **Recommended** describes useful team guidance.
- **Profile-required** means the selected profile expects the field. It does not mean OKF requires it.

Core OKF requirements keep the separate **OKF-required** label in validation and authoring review.

# Failure states

A declaration is **Unavailable** when its namespace or exact version is invalid; its descriptor is missing, oversized, malformed, outside the bundle, or reached through an escaping symbolic link; its schema is unsupported; its identity does not match the declaration; or a bounded descriptor item is invalid. The card states the reason and source path. The bundle remains open, unknown metadata stays inspectable, and Studio does not run checks it cannot interpret.

Profile resolution itself can also fail at the grant or task boundary. That state says **Bundle remains open** and does not replace the root content or metadata.

# Resolver and diagnostic contract

The [Advisory Profile Contract](../reference/advisory-profile-contract.md) defines the root declaration, descriptor schema, limits, and closed check kinds. Rust authorizes the exact open bundle, reads only a bounded JSON path inside it, and produces one typed report. Browser mock data exercises the same active and advice states.

Resolution runs no network request, registry search, code, hook, or expression. Unknown descriptor keys are retained for inspection but have no behavior. Profile diagnostics remain a separate collection from `Bundle.issues`, so no profile can weaken, strengthen, or hide core OKF validation.

# Relationships

An active descriptor can name a relationship vocabulary. Concepts opt in with bounded namespaced annotations over ordinary Markdown links; Studio then resolves labels and inverses for [Typed Relationships](typed-relationships.md). Unknown namespaces and types remain visible, while missing targets and missing prose links produce profile advice rather than OKF errors.

# Authoring

The active descriptor is the input to [Profile-Aware Authoring](profile-aware-authoring.md). Create, Revise, Audit, and migration tasks receive its fields, examples, relationships, and checks as bounded, fingerprinted context. Requirement labels distinguish what OKF requires from what the profile requires or recommends. Staged review displays OKF validation and profile checks independently, and a profile finding can start a reviewed migration without granting Apply.

Related behavior: [Validation](validation.md), [Compatibility Clinic](compatibility-clinic.md), [Native OKF Tasks](native-okf-tasks.md), and [IPC & Security](../architecture/ipc-and-security.md).
