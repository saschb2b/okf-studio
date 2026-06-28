# okf-viewer

A cross-platform desktop app — **point it at a folder, read your knowledge as a graph.**

OKF Viewer autodetects the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF) bundles inside any folder and renders each as an interactive graph of interconnected concept documents: a force-directed graph colored by concept type, a markdown reader with frontmatter and "cited by" backlinks, search, filters, validation, and live reload. It is offline, read-only, and built with [Tauri 2](https://tauri.app/) (a Rust core + the system webview), targeting **Windows** and **Ubuntu**.

## Status

**v1 implemented.** A Tauri 2 desktop app with a Rust core ([`crates/okf-core`](crates/okf-core)) that does all filesystem work — bundle detection, OKF parsing, graph/backlinks, validation, file watching — and a React 19 + TypeScript frontend ([`src/`](src/), [`src-tauri/`](src-tauri/)) that renders the graph, reader, search, navigation, and panels.

The product specification lives as an OKF bundle in [`docs/`](docs/) and is the source of truth for what the app does and why; the app also renders that bundle as its **built-in sample** (it dogfoods itself). Start at [`docs/index.md`](docs/index.md).

## Develop & run

Prerequisites: a stable **Rust** toolchain and **Node.js 20.19+/22.12+**. On Ubuntu also install the Tauri Linux deps (`libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `librsvg2-dev`, and related GTK packages); on Windows, the WebView2 runtime + MSVC build tools.

```bash
npm install
npm run tauri dev      # run the app with hot reload
npm run tauri build    # installers: .deb/AppImage (Ubuntu), .msi/.exe (Windows)
```

Checks:

```bash
cargo test -p okf-core                 # Rust core unit + integration tests (against docs/)
npm test                               # frontend integration tests (Vitest)
node scripts/okf-validate.mjs docs     # OKF conformance of the spec bundle
```

## Repository layout

| Path | What |
|------|------|
| [`src/`](src/) | React 19 + TypeScript frontend (graph, reader, sidebar, panels). |
| [`src-tauri/`](src-tauri/) | Tauri 2 app shell: commands/events, plugins, capabilities, file watcher. |
| [`crates/okf-core/`](crates/okf-core) | Pure-Rust core: detection, parsing, graph, validation. No GUI deps; unit-tested. |
| [`docs/`](docs/) | The OKF product bundle — features, UX, architecture, reference. The source of truth and the built-in sample. |
| [`AGENTS.md`](AGENTS.md) | Architecture, build order, conventions. |
| `scripts/okf-validate.mjs` | Zero-dependency OKF conformance checker. |

## License

[MIT](LICENSE).
