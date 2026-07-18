# Architecture

* [Agent System](agent-system.md) - ACP agents, the native Studio Agent, credentials, scoped tools, permissions, and reviewed writes.

How OKF Studio is built. Enough decisions and contracts to start implementing without re-deriving them.

* [Tech Stack](tech-stack.md) - Tauri 2.0, the Rust core, the frontend, and why.
* [Bundle Detection](bundle-detection.md) - The algorithm that finds OKF bundles in a folder.
* [OKF Parsing](okf-parsing.md) - How concepts, links, and indexes are parsed into the data model.
* [Data Model](data-model.md) - Bundle, Concept, and Graph shapes shared across the IPC boundary.
* [Frontend Architecture](frontend-architecture.md) - The frontend as a thin client over the Rust command/event surface.
* [IPC & Security](ipc-and-security.md) - Typed Tauri commands for scoped reads, explicit network and process actions, and reviewed writes.
* [Performance & Scale](performance.md) - How the app stays fast, from the bounded scan to graph rendering.
* [Testing & Dogfooding](testing.md) - Frontend, Rust core, native host, accessibility, conformance, and Studio authoring gates.
* [OKF Agent Benchmarking](agent-benchmarking.md) - Frozen OKF task fixtures, deterministic contract checks, and opt-in provider evaluation.
* [Build & Release](build-and-release.md) - Versioning, per-OS packaging, releases, and opt-in updates.
