<p align="center">
  <img src="src-tauri/icons/icon.png" width="104" alt="">
</p>

<h1 align="center">OKF Studio</h1>

<p align="center"><strong>Explore connected knowledge with the agents you already use.</strong></p>

<p align="center">
  <a href="https://saschb2b.github.io/okf-studio/">Homepage</a>
  &nbsp;·&nbsp;
  <a href="https://saschb2b.github.io/okf-studio/download/">Download</a>
  &nbsp;·&nbsp;
  <a href="https://saschb2b.github.io/okf-studio/product/">Product</a>
  &nbsp;·&nbsp;
  <a href="docs/index.md">Docs</a>
</p>

<p align="center">
  <a href="https://saschb2b.github.io/okf-studio/">
    <img src="site/public/screenshot-graph.webp" width="840" alt="OKF Studio showing a concept graph and reader beside an agent thread answering a question about the open bundle">
  </a>
</p>

OKF Studio is a local-first desktop workspace for [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) bundles. Open a folder of Markdown as a graph and a reader. Question it with the agent you already use, and review every proposed change before it touches a file.

A bundle stays what it was: plain Markdown with YAML frontmatter, on your disk, readable without this app. Opening a folder is read-only. The app reaches the network only when you act, and no agent can apply its own change. There is no account and no telemetry.

Free and open source under the [MIT license](LICENSE). Built with [Tauri 2](https://tauri.app/): a Rust core plus the system webview.

## Download

Current builds are on the [releases page](https://github.com/saschb2b/okf-studio/releases/latest), with install options on the [download page](https://saschb2b.github.io/okf-studio/download/).

| Platform | Formats |
|----------|---------|
| Windows | `.msi` or NSIS `.exe` (x64) |
| Linux | `.deb` or AppImage (x86_64) |
| macOS | Build from source, see [Develop and run](#develop-and-run) |

There is no macOS build in the release matrix. Builds are not code-signed, so your OS may show an "unverified publisher" prompt on first launch.

## What it does

**Understand.** A force-directed graph of concepts and links, colored by type, sits beside a Markdown reader. The reader shows frontmatter, syntax-highlighted code, and a relationship panel naming what a concept links to and what cites it. Treemap, sunburst, and circle-packing views compare a bundle's composition. Full-text search, type and tag filters, a command palette, and live reload when files change on disk. A pacing mode reads a concept word by word, with rereading and non-prose blocks kept in reach.

**Ask.** Connect a subscription agent, a custom [ACP](https://agentclientprotocol.com/) command, an API-key-backed endpoint, or a fully local model, and run parallel threads beside the bundle. Retrieval routes a question through local evidence and hands back a receipt for every selection. Tools, permissions, and proposed writes stay visible, and credentials live in the operating system's credential store rather than in the app.

**Improve.** Proposed changes land in a staged tree, never on your files. Each diff hunk is reviewable, deterministic validation runs against the OKF spec, and applying is one transaction you can restore. Moves, retirements, and redirects go through the same path.

**Keep.** Review, stage, commit, and inspect history for the bundle's repository from inside the workspace. Fetch, pull, and push happen only when you ask for them.

The complete, specified feature set lives in [`docs/features/`](docs/features/).

## Built on an open format

[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) is Google's open, vendor-neutral spec for packaging knowledge that an agent or a person can read. It is plain Markdown with YAML frontmatter, organized as a portable bundle. No SDK, no database, no lock-in.

Studio reads any conformant bundle from any producer, and never refuses one for soft issues. Problems surface as [validation](docs/features/validation.md) findings instead.

[Open Design System Format](https://saschb2b.github.io/Open-Design-System-Format/) is a profile of OKF for design systems. It adds machine-readable tokens and runnable HTML and CSS examples, so an agent produces UI that matches the system. Open one and Studio renders its tokens and examples inline.

This project's own site comes from an ODSF bundle, [`design-system/`](design-system/), which Studio can open and preview.

## Develop and run

Prerequisites: rustup, which installs the Rust toolchain pinned in `rust-toolchain.toml`, Node.js 20.19+ or 22.12+ with pnpm, and platform build tools:

- **macOS:** the Xcode Command Line Tools (`xcode-select --install`).
- **Ubuntu/Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `librsvg2-dev`, and the related GTK packages.
- **Windows:** the WebView2 runtime and MSVC C++ build tools.

```bash
pnpm install
pnpm dev            # frontend only, in a browser against a mock bundle
pnpm tauri dev      # the full desktop app with hot reload
pnpm storybook      # component playground on :6006
pnpm tauri build    # installers for host platform (.app/.dmg on macOS, .deb/AppImage on Linux, .msi/.exe on Windows)
```

Before finishing a change, run the gate that mirrors CI:

```bash
pnpm lint                                       # eslint, type-aware
pnpm typecheck                                  # tsc --noEmit
pnpm check:theme                                # tokens, AA contrast, design-system sync
pnpm test                                       # unit and component lanes
pnpm test:integration                           # full-app and axe journeys
pnpm test:stories                               # every story headless in Chromium
pnpm build                                      # production frontend build
cargo clippy -p okf-core --all-targets -- -D warnings
cargo test -p okf-core                          # core tests, run against docs/
cargo clippy -p okf-viewer --all-targets -- -D warnings
cargo test -p okf-viewer --no-fail-fast         # agent, source, and transaction tests
node scripts/okf-validate.mjs docs              # OKF conformance of the spec bundle
```

The site under [`site/`](site/) builds separately with `pnpm --dir site build` and deploys to GitHub Pages.

## Repository layout

| Path | Contents |
|------|----------|
| [`src/`](src/) | React 19 and TypeScript frontend, organized by domain: graph, reader, agent panel, Git, shell. |
| [`src-tauri/`](src-tauri/) | Tauri 2 app shell: commands and events, plugins, capabilities, file watcher, agent host. |
| [`crates/okf-core/`](crates/okf-core) | Pure-Rust core: detection, parsing, graph, validation. No GUI dependencies. |
| [`docs/`](docs/) | The OKF product bundle: features, UX, architecture, reference. The source of truth, and the app's built-in sample. |
| [`design-system/`](design-system/) | The ODSF bundle the site's visual language comes from. |
| [`site/`](site/) | Astro marketing and download site. |
| [`scripts/`](scripts/) | Repository tooling, including the zero-dependency OKF conformance checker. |
| [`AGENTS.md`](AGENTS.md) | Architecture, conventions, and the local check gate, for human and agent contributors alike. |

## The spec lives in `docs/`

[`docs/`](docs/) is a conformant OKF bundle specifying what OKF Studio does and why. The app renders it as its built-in sample, so the product dogfoods the format it reads. It is the source of truth for humans and agents:

- Read the relevant concept before changing behavior. Start at [`docs/index.md`](docs/index.md).
- Update the spec in the same change, so it never drifts from the code. On a conflict, the bundle wins.
- Record decisions in the bundle, with a dated entry in [`docs/log.md`](docs/log.md), rather than only in a commit message.
- Validate before finishing. `node scripts/okf-validate.mjs docs` must report 0 errors.

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for what a complete change looks like, and [`AGENTS.md`](AGENTS.md) for the full architecture and conventions. The short version:

- A user-facing change lands on three surfaces in one change: code, the `docs/` spec, and the site's copy.
- Run the local gate under Develop and run before opening a pull request. CI runs the same checks.
- Commit messages and pull request descriptions follow the house style in `AGENTS.md`: conventional-commit titles, and prose written for a reader outside the repository.

## License

[MIT](LICENSE)
