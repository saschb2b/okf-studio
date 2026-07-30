# Architecture

How OKF Studio is built. These decisions and contracts are enough to implement against without re-deriving the system.

# Core and rendering

* [Tech Stack](tech-stack.md) - Tauri 2.0, the Rust core, the frontend, and why.
* [Bundle Detection](bundle-detection.md) - The algorithm that finds OKF bundles in a folder.
* [OKF Parsing](okf-parsing.md) - How concepts, links, and indexes become the data model.
* [Data Model](data-model.md) - Bundle, Concept, and Graph shapes shared across the IPC boundary.
* [Frontend Architecture](frontend-architecture.md) - The frontend as a thin client over the Rust command and event surface.

# Safety and operations

* [IPC and Security](ipc-and-security.md) - Typed Tauri commands for scoped reads, explicit external actions, and reviewed writes.
* [Performance and Scale](performance.md) - How bounded scanning and rendering keep the app responsive.
* [Testing and Dogfooding](testing.md) - Frontend, Rust core, native host, accessibility, conformance, and authoring gates.
* [Build and Release](build-and-release.md) - Versioning, per-OS packaging, releases, and opt-in updates.

# Agent and repository systems

* [Agent System](agent-system.md) - ACP agents, the native Studio Agent, credentials, scoped tools, permissions, and reviewed writes.
* [Retrieval Engine](retrieval-engine.md) - Revision-bound local retrieval, coherent evidence packets, receipts, optional providers, and the granted MCP boundary.
* [Git Integration](git-integration.md) - A bounded installed-Git service, repository watcher, and typed frontend state.
* [OKF Agent Benchmarking](agent-benchmarking.md) - Frozen OKF task fixtures, deterministic contract checks, and opt-in provider evaluation.
