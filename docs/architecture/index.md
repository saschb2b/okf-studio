# Architecture

How OKF Viewer is built. Enough decisions and contracts to start implementing without re-deriving them.

* [Tech Stack](tech-stack.md) - Tauri 2.0, the Rust core, the frontend, and why.
* [Bundle Detection](bundle-detection.md) - The algorithm that finds OKF bundles in a folder.
* [OKF Parsing](okf-parsing.md) - How concepts, links, and indexes are parsed into the data model.
* [Data Model](data-model.md) - Bundle, Concept, and Graph shapes shared across the IPC boundary.
* [Frontend Architecture](frontend-architecture.md) - The frontend as a thin client over the Rust command/event surface.
* [IPC & Security](ipc-and-security.md) - Tauri commands and the read-only, scoped capability model.
* [Performance & Scale](performance.md) - How the app stays fast, from the bounded scan to graph rendering.
* [Testing & Dogfooding](testing.md) - The test strategy — unit tests, golden link tests, validator parity, and fixtures.
* [Build & Release](build-and-release.md) - Building, per-OS packaging, versioning, and shipping — offline.
