# OKF Viewer

A cross-platform **desktop app** (Windows + Ubuntu, macOS for free) that you point at a folder; it **autodetects the OKF bundles inside** and renders each as an interactive graph of interconnected concept documents. Built with **Tauri 2.0** — a Rust core plus the system webview.

## How it's put together

The **Rust core** (`crates/okf-core` + `src-tauri/`) does all filesystem work — [scan a folder for bundles](docs/architecture/bundle-detection.md), [parse each into concepts/links/backlinks](docs/architecture/okf-parsing.md), [validate](docs/features/validation.md), and [watch for changes](docs/features/live-reload.md) — exposing a small [command/event surface](docs/architecture/ipc-and-security.md) that hands the **React 19 + TypeScript frontend** (`src/`, Vite, React Compiler enabled — no manual memoization) ready-to-render JSON ([data model](docs/architecture/data-model.md)). The frontend renders a [force-directed graph](docs/features/graph-view.md) + [concept reader](docs/features/concept-reader.md) with [search](docs/features/search-and-filter.md), [navigation](docs/features/navigation.md), and [theming](docs/ux/theming.md). Read-only, offline, scoped to the chosen folder.

```
okf-viewer/
  src/             # web frontend (React 19 + TS, Vite)
  src-tauri/       # Tauri shell: tauri.conf.json, capabilities/, commands
  crates/okf-core/ # Rust parsing/validation core (unit-tested against docs/)
  docs/            # the OKF product spec bundle — source of truth AND built-in sample
  design-system/   # ODSF bundle: the marketing site's visual language
  site/            # marketing/landing page (Astro) — see site/README.md
  scripts/         # okf-validate.mjs (vendored conformance checker), gen-icon.mjs
```

**The spec in [`docs/`](docs/) is the source of truth.** Read it before changing behavior, and keep it in sync when you do. Start at [`docs/index.md`](docs/index.md):

- **What it is / why:** [`docs/product/overview.md`](docs/product/overview.md), [`docs/product/principles.md`](docs/product/principles.md), [`docs/product/scope-and-non-goals.md`](docs/product/scope-and-non-goals.md)
- **What it does:** the [`docs/features/`](docs/features/) concepts — folder autodetect, bundle browser, graph view, concept reader, search & filter, navigation, validation, live reload.
- **How it feels:** [`docs/ux/`](docs/ux/) — first run, browsing layout, keyboard shortcuts, theming.
- **How it's built:** [`docs/architecture/`](docs/architecture/) — tech stack, bundle detection, OKF parsing, data model, IPC & security.
- **External specs:** [`docs/reference/`](docs/reference/) — OKF spec summary, Tauri 2.0 notes, glossary.

If anything in this file conflicts with the bundle, the bundle wins; update this file to match.

## Dev commands

Prerequisites (see [`docs/reference/tauri-2.md`](docs/reference/tauri-2.md)): stable Rust + Node.js with pnpm. On Ubuntu also `webkit2gtk` (4.1) dev libs, `build-essential`, `libssl-dev`, `librsvg2-dev`; on Windows the WebView2 runtime + MSVC build tools.

```bash
pnpm install
pnpm dev            # frontend only, in a browser (mock bundle) — fastest for UI work
pnpm tauri dev      # the full app with hot reload
pnpm tauri build    # installers: .msi/.exe (Windows), .deb/AppImage (Ubuntu)
```

## A user-facing feature ships on three surfaces

Every user-facing change lands on **code, spec, and site in the same change** — never code alone:

1. **Code** (`src/`, `crates/`, `src-tauri/`) — the behavior itself, plus the mock fixture (`src/mock/fixture.ts`) exercising it.
2. **Spec** (`docs/`) — the matching concept(s) and a `log.md` entry ([details below](#always-read-docs-and-keep-it-in-sync)).
3. **Site** (`site/`) — the marketing copy a visitor reads ([details below](#keep-the-marketing-site-in-sync-it-is-the-products-shop-window)).

A feature that exists only in code is invisible to the spec and unsold to visitors; treat a missing surface as an unfinished change.

## Always read `docs/`, and keep it in sync

`docs/` is the source of truth — an OKF bundle that specifies what the app does and why, and which the app renders as its built-in sample. This is a standing rule for every change, by humans and agents alike:

1. **Read the relevant concept(s) before you change behavior.** The reasoning for features, flows, and architecture lives in `docs/`, not in code comments. Start at [`docs/index.md`](docs/index.md) and follow the map above.
2. **Update the spec in the same change.** Any new or changed feature, flow, or decision updates the matching concept(s) so the spec never drifts from the code. On conflict, the bundle wins — change the code or the bundle so they agree.
3. **Record decisions in the bundle, not just the commit message.** A notable choice (a stack decision, a non-goal, a tradeoff) belongs in the relevant concept and a dated [`docs/log.md`](docs/log.md) entry.
4. **Leave it conformant.** Follow the checklist in [Keep the `docs/` bundle in sync](#keep-the-docs-bundle-in-sync-it-is-an-okf-v01-bundle) below and run `node scripts/okf-validate.mjs docs` (0 errors) before finishing.

## Keep the marketing site in sync (it is the product's shop window)

[`site/`](site/) is the landing/download page. It must always reflect what the product actually does — feature copy that lags the app undersells it, and copy that leads the app lies:

- **When a user-facing feature ships, update the site's copy in the same change** (the feature cards and showcase sections in `site/src/pages/index.astro`), the way `docs/` is updated in the same change.
- **Never describe what the screenshots don't show.** Screenshot-adjacent copy is bound to the image next to it; feature-card copy is not. When the app's look changes materially, recapture the shots (`site/public/`, 1760×1117, hand-captured from the desktop app).
- **Respect the site's own contract** ([`site/README.md`](site/README.md)): visual language comes from the [`design-system/`](design-system/) ODSF bundle via `sync-ds.mjs` — never edit `site/src/styles/design-system/*` by hand; copy is plain and concrete, no em dashes.
- **Gate it separately:** `pnpm --dir site build` (it deploys via the [Pages workflow](.github/workflows/pages.yml), not the app CI), and `node .claude/skills/odsf/odsf-validate.mjs design-system` (0 errors) when the design-system bundle changes.

## Reviewing your own work (be the critic, not the cheerleader)

Default stance: **assume the first attempt is mediocre** — code and UI both regress to the mean of training data — until proven otherwise against explicit criteria. The job of review is to find what is wrong, not to confirm what is right. A first-pass review that finds nothing is itself suspect; scan again.

1. **No vibe sign-offs.** "Looks clean / good / modern / polished / production-ready" is banned as evidence. "Clean" is a conclusion earned *after* a scan, never a first impression. Every claim about the UI must cite either a specific check that passed or a screenshot examined against named criteria.
2. **Run the skills, and treat their findings as a gate.** Before calling any UI change done:
   - **`visual-consistency`** — scan the changed/rendered surface against its catalog: spacing on a 4/8 scale via tokens, a bounded type scale with paired line-heights, alignment, repeated-element consistency (button size, radius, elevation), focus rings, touch targets, overflow, tables. Read the catalog first.
   - **`theme-colors`** — no hex/`rgba()`/`hsl()` literals in components; every color from a token. Literals live only in the theme definition (`src/styles.css` palette, `src/theme.ts`).
   - **`react-stinky`** — component/hook/TS smells and semantic markup (roles, labels, keyboard).
   - **`no-slop`** — for any human-facing prose (UI copy, docs, commit messages).
   Apply Safe findings; surface Judgment ones. Do not report "done" with an unaddressed Glaring finding.
3. **Verify with evidence, at two widths.** Screenshot the rendered screen at narrow (~360px) and wide, and check the loading, empty, and error states — not just the happy path. A green build is not visual proof. Prefer the real screen over reasoning about the code. (Fast path: `pnpm dev` + the `agent-browser` skill — see the visual-verification note.)
4. **Measure against modern UX floors, not the training average.** Spacing from `--space-*` tokens (4/8); a bounded type scale (≤ ~7 sizes) with paired line-heights from tokens; WCAG AA contrast (4.5:1 text, 3:1 UI); one visible, consistent focus-ring token; touch targets ≥ 24px; `prefers-reduced-motion` respected; one radius and one elevation scale; empty/loading/error states actually designed. If you cannot point to the token or the criterion, it is not done.
5. **Pressure-test design calls — including the user's.** Name the tradeoffs and risks before implementing a direction; do not just agree. Reasoned disagreement is more useful than assent.
6. **Report the defects, not just the wins.** End a UI review with the findings list — each rated severity (Glaring/Untidy/Nitpick) and autonomy (Safe/Judgment) — what was fixed, and what remains. Honesty about what is still rough beats a clean-sounding summary.

## Before you finish: run the checks locally (they mirror CI)

Do not push and let CI find failures you could have caught. Before committing or reporting a change done, run the same gate the [CI workflow](.github/workflows/ci.yml) runs, from the repo root, and get each to pass:

```bash
pnpm lint        # eslint . (type-aware: parse, type, and a11y issues)
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # tsc --noEmit && vite build
cargo clippy -p okf-core --all-targets -- -D warnings
cargo test -p okf-core
```

`pnpm lint` is the one that most often breaks on *new* files: a directory the root `tsconfig` does not cover, or an unignored config the type-aware parser cannot place. Run it after adding or moving files, not only after editing existing ones; if a new sub-project does not belong to the app's `tsconfig`, add it to `ignores` in `eslint.config.mjs`.

Separate sub-projects carry their own gate — see [the marketing-site section](#keep-the-marketing-site-in-sync-it-is-the-products-shop-window) for `site/` and the design system.

## Dogfood / test fixture

`docs/` is a real, conformant OKF bundle. Use it as the **primary test fixture**: a correct build, pointed at the repo root or at `docs/`, must detect this bundle and render the very spec it was built from. The OKF reference repo's sample bundles (GA4, Stack Overflow, Bitcoin) are good additional fixtures. For fast UI iteration, `pnpm dev` in a browser serves a mock bundle (`src/mock/fixture.ts`) — keep it exercising new reader features so they stay visually verifiable.

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
- **Capabilities stay least-privilege** (`src-tauri/capabilities/`): read-only `fs` scoped to the chosen folder, dialog open, store. Network only where a principle-level exception is recorded (updater, explicit open-from-URL fetch).
