# OKF Viewer

A cross-platform **desktop app** (Windows + Ubuntu, macOS for free) that you point at a folder; it **autodetects the OKF bundles inside** and renders each as an interactive graph of interconnected concept documents. Built with **Tauri 2.0** — a Rust core plus the system webview.

## Status: v1 implemented

The app is built: a Tauri 2 core (`crates/okf-core` + `src-tauri/`) and a React 19 + TypeScript frontend (`src/`). See the README for run/dev commands. The notes below capture the architecture and conventions; the build-order section is kept as the original plan and for reference.

**The spec in [`docs/`](docs/) remains the source of truth.** Read it before changing behavior, and keep it in sync when you do. Start at [`docs/index.md`](docs/index.md):

- **What it is / why:** [`docs/product/overview.md`](docs/product/overview.md), [`docs/product/principles.md`](docs/product/principles.md), [`docs/product/scope-and-non-goals.md`](docs/product/scope-and-non-goals.md)
- **What it does (v1):** the [`docs/features/`](docs/features/) concepts — folder autodetect, bundle browser, graph view, concept reader, search & filter, navigation, validation, live reload.
- **How it feels:** [`docs/ux/`](docs/ux/) — first run, browsing layout, keyboard shortcuts, theming.
- **How it's built:** [`docs/architecture/`](docs/architecture/) — tech stack, bundle detection, OKF parsing, data model, IPC & security.
- **External specs:** [`docs/reference/`](docs/reference/) — OKF spec summary, Tauri 2.0 notes, glossary.

If anything below conflicts with the bundle, the bundle wins; update this file to match.

## Always read `docs/`, and keep it in sync

`docs/` is the source of truth — an OKF bundle that specifies what the app does and why, and which the app renders as its built-in sample. This is a standing rule for every change, by humans and agents alike:

1. **Read the relevant concept(s) before you change behavior.** The reasoning for features, flows, and architecture lives in `docs/`, not in code comments. Start at [`docs/index.md`](docs/index.md) and follow the map above.
2. **Update the spec in the same change.** Any new or changed feature, flow, or decision updates the matching concept(s) so the spec never drifts from the code. On conflict, the bundle wins — change the code or the bundle so they agree.
3. **Record decisions in the bundle, not just the commit message.** A notable choice (a stack decision, a non-goal, a tradeoff) belongs in the relevant concept and a dated [`docs/log.md`](docs/log.md) entry.
4. **Leave it conformant.** Follow the checklist in [Keep the `docs/` bundle in sync](#keep-the-docs-bundle-in-sync-it-is-an-okf-v01-bundle) below and run `node scripts/okf-validate.mjs docs` (0 errors) before finishing.

## Reviewing your own work (be the critic, not the cheerleader)

Default stance: **assume the first attempt is mediocre** — code and UI both regress to the mean of training data — until proven otherwise against explicit criteria. The job of review is to find what is wrong, not to confirm what is right. A first-pass review that finds nothing is itself suspect; scan again.

1. **No vibe sign-offs.** "Looks clean / good / modern / polished / production-ready" is banned as evidence. "Clean" is a conclusion earned *after* a scan, never a first impression. Every claim about the UI must cite either a specific check that passed or a screenshot examined against named criteria.
2. **Run the skills, and treat their findings as a gate.** Before calling any UI change done:
   - **`visual-consistency`** — scan the changed/rendered surface against its catalog: spacing on a 4/8 scale via tokens, a bounded type scale with paired line-heights, alignment, repeated-element consistency (button size, radius, elevation), focus rings, touch targets, overflow, tables. Read the catalog first.
   - **`theme-colors`** — no hex/`rgba()`/`hsl()` literals in components; every color from a token. Literals live only in the theme definition (`src/styles.css` palette, `src/theme.ts`).
   - **`react-stinky`** — component/hook/TS smells and semantic markup (roles, labels, keyboard).
   - **`no-slop`** — for any human-facing prose (UI copy, docs, commit messages).
   Apply Safe findings; surface Judgment ones. Do not report "done" with an unaddressed Glaring finding.
3. **Verify with evidence, at two widths.** Screenshot the rendered screen at narrow (~360px) and wide, and check the loading, empty, and error states — not just the happy path. A green build is not visual proof. Prefer the real screen over reasoning about the code. (Fast path: `npm run dev` + the `agent-browser` skill — see the visual-verification note.)
4. **Measure against modern UX floors, not the training average.** Spacing from `--space-*` tokens (4/8); a bounded type scale (≤ ~7 sizes) with paired line-heights from tokens; WCAG AA contrast (4.5:1 text, 3:1 UI); one visible, consistent focus-ring token; touch targets ≥ 24px; `prefers-reduced-motion` respected; one radius and one elevation scale; empty/loading/error states actually designed. If you cannot point to the token or the criterion, it is not done.
5. **Pressure-test design calls — including the user's.** Name the tradeoffs and risks before implementing a direction; do not just agree. Reasoned disagreement is more useful than assent.
6. **Report the defects, not just the wins.** End a UI review with the findings list — each rated severity (Glaring/Untidy/Nitpick) and autonomy (Safe/Judgment) — what was fixed, and what remains. Honesty about what is still rough beats a clean-sounding summary.

## What to build (one paragraph)

A Tauri 2.0 app whose **Rust core** (`src-tauri/`) does all filesystem work — [scan a folder for bundles](docs/architecture/bundle-detection.md), [parse each into concepts/links/backlinks](docs/architecture/okf-parsing.md), [validate](docs/features/validation.md), and [watch for changes](docs/features/live-reload.md) — exposing a small [command/event surface](docs/architecture/ipc-and-security.md) that hands the **web frontend** (`src/`) ready-to-render JSON ([data model](docs/architecture/data-model.md)). The frontend renders a [force-directed graph](docs/features/graph-view.md) + [concept reader](docs/features/concept-reader.md) with [search](docs/features/search-and-filter.md), [navigation](docs/features/navigation.md), and [theming](docs/ux/theming.md). Read-only, offline, scoped to the chosen folder.

## Getting started (when you implement)

1. **Prerequisites** (see [`docs/reference/tauri-2.md`](docs/reference/tauri-2.md)): a stable **Rust** toolchain + **Node.js**. On Ubuntu also install `webkit2gtk` (4.1) dev libs, `build-essential`, `libssl-dev`, `librsvg2-dev`. On Windows: WebView2 runtime + MSVC build tools.
2. **Scaffold Tauri 2.0** *without clobbering `docs/`*:
   ```bash
   npm create tauri-app@latest        # choose the v2 template + React + TypeScript (Vite)
   ```
   Generate into the repo so `docs/` and this file are preserved (scaffold in a temp dir and move `src/`, `src-tauri/`, configs in if needed). Keep `docs/` exactly where it is — it doubles as the built-in sample bundle (see Dogfood below).
3. **Frontend stack:** React 19 + TypeScript, built with Vite; the React Compiler is enabled (no manual memoization). See [tech stack](docs/architecture/tech-stack.md).
4. **Add plugins:** `tauri-plugin-dialog`, `tauri-plugin-fs` (read-only), `tauri-plugin-store`; file watching via the `notify` crate. Wire up the [commands & events](docs/architecture/ipc-and-security.md).
5. **Capabilities:** grant least privilege in `src-tauri/capabilities/` — read-only `fs` scoped to the chosen folder, dialog open, store. **No network permission.**

### Expected project shape

```
okf-viewer/
  src/             # web frontend
  src-tauri/       # Rust core: Cargo.toml, tauri.conf.json, capabilities/, src/
  docs/            # the OKF product bundle (KEEP — also the built-in sample)
  scripts/         # okf-validate.mjs (vendored conformance checker)
  AGENTS.md  README.md  LICENSE
```

### Dev & build commands (after scaffolding)

```bash
npm install
npm run tauri dev      # run the app with hot reload
npm run tauri build    # produce installers: .msi/.exe (Windows), .deb/AppImage (Ubuntu)
```

## Build order (suggested)

1. **Rust core, headless:** `scan_bundles` + `read_bundle` returning the [data model](docs/architecture/data-model.md). Unit-test it against `docs/` (it must detect this bundle and produce its concepts/edges). Port the rules from `scripts/okf-validate.mjs`.
2. **Minimal frontend:** open-folder flow ([first run](docs/ux/first-run.md)) → render the concept list + reader.
3. **Graph view:** force-directed render, type colors, selection sync.
4. **Search/filter/navigation, validation panel, live reload.**
5. **Packaging** for Windows + Ubuntu.

## Dogfood / test fixture

`docs/` is a real, conformant OKF bundle. Use it as the **primary test fixture**: a correct build, pointed at the repo root or at `docs/`, must detect this bundle and render the very spec it was built from. The OKF reference repo's sample bundles (GA4, Stack Overflow, Bitcoin) are good additional fixtures.

## Keep the `docs/` bundle in sync (it is an OKF v0.1 bundle)

When you add or change a feature, decision, or flow, update the bundle **in the same change** so the spec never drifts from the code:

- Every concept needs frontmatter with a non-empty `type` (the one hard OKF rule).
- Refresh the concept's `timestamp` on meaningful edits.
- Append a dated entry to [`docs/log.md`](docs/log.md) (newest first, `## YYYY-MM-DD`, lead with **Creation**/**Update**/**Deprecation**).
- Regenerate the affected `index.md` when you add, rename, remove, or re-describe a concept.
- Link related concepts with bundle-relative markdown links, naming the relationship in prose; keep one fact in one place.
- **Validate before finishing:** `node scripts/okf-validate.mjs docs` must report **0 errors** (warnings are advisory).

## Conventions

- **Rust owns the filesystem; the frontend owns rendering.** The webview gets no direct fs/network access — only [commands/events](docs/architecture/ipc-and-security.md).
- **Read-only, offline, scoped** always (see [principles](docs/product/principles.md)). Opening an untrusted bundle must be safe.
- **Tolerant consumer:** never refuse a bundle for soft issues (missing fields, unknown `type`, broken links, missing `index.md`); surface them via [Validation](docs/features/validation.md) instead.
