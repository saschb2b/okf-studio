# okf-viewer

A cross-platform desktop app — **point it at a folder, read your knowledge as a graph.**

OKF Viewer autodetects the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF) bundles inside any folder and renders each as an interactive graph of interconnected concept documents: a force-directed graph colored by concept type, a markdown reader with frontmatter and "cited by" backlinks, search, filters, and live reload. It is offline, read-only, and built with [Tauri 2.0](https://tauri.app/) (a Rust core + the system webview), targeting **Windows** and **Ubuntu**.

## Status

Greenfield — the application isn't built yet. The repository currently holds the **product specification as an OKF bundle** in [`docs/`](docs/) (which the finished app will also use as its built-in sample). The bundle itself is the spec: start at [`docs/index.md`](docs/index.md).

Building the app? Read [`AGENTS.md`](AGENTS.md) for the plan, stack, and conventions.

## Repository layout

| Path | What |
|------|------|
| [`docs/`](docs/) | The OKF product bundle — features, UX, architecture, reference. The source of truth. |
| [`AGENTS.md`](AGENTS.md) | How to continue: scaffold, build order, commands, conventions. |
| `scripts/okf-validate.mjs` | Zero-dependency OKF conformance checker. Run: `node scripts/okf-validate.mjs docs`. |

## License

[MIT](LICENSE).
