# Contributing to OKF Studio

Issues and pull requests are welcome. This file covers what a complete contribution looks like here; [`AGENTS.md`](AGENTS.md) carries the full architecture and conventions, and links to the concept that explains each one.

## Reporting an issue

- **Bugs:** include the OKF Studio version (Settings, or the release you installed), your operating system, and the steps that reproduce the problem. If a bundle is involved, say whether it is one of the repository's own (`docs/`, `design-system/`) or your own, and what makes it unusual.
- **Feature requests:** describe the reader or author job that is currently hard, not the control you imagine. The product's boundaries are deliberate and documented in [`docs/product/scope-and-non-goals.md`](docs/product/scope-and-non-goals.md); a request that crosses one is still worth filing, with the reason.

## Before changing behavior

**[`docs/`](docs/) is the source of truth, not the code.** It is a conformant OKF bundle specifying what the app does and why, and the app renders it as its built-in sample. The reasoning behind a feature or a decision lives there rather than in code comments.

Read the relevant concept first, starting at [`docs/index.md`](docs/index.md). If the code and the bundle disagree, the bundle wins: change one or the other so they agree, and say which in your pull request.

## What a complete change looks like

A user-facing change lands on **three surfaces in the same pull request**:

1. **Code** (`src/`, `crates/`, `src-tauri/`), including the mock fixture in `src/mock/fixture.ts` that exercises the new behavior so it stays visually verifiable.
2. **Spec** (`docs/`): the matching concept or concepts, plus a dated entry in [`docs/log.md`](docs/log.md). Every concept needs a non-empty `type` in its frontmatter, a refreshed timestamp on meaningful edits, and a regenerated `index.md` when concepts are added, renamed, removed, or re-described.
3. **Site** (`site/`): the copy a visitor reads. Copy that lags the app undersells it, and copy that leads the app is false. Never describe something the adjacent screenshot does not show.

A change that exists only in code is unfinished. Internal refactors and fixes with no user-visible effect need only the surfaces they touch.

## Before opening a pull request

Set up and run the app with [Develop and run](README.md#develop-and-run) in the README, then run the local gate documented in the same section. It mirrors CI, including `pnpm lint`, `pnpm typecheck`, `pnpm check:theme`, the three test lanes, the Rust clippy and test passes, and `node scripts/okf-validate.mjs docs`, which must report 0 errors.

Run it locally rather than letting CI find the failures. `pnpm lint` is the check that most often breaks on newly added files.

For UI work, [`AGENTS.md`](AGENTS.md) sets the floors that are enforced rather than suggested: spacing from tokens, WCAG AA contrast, a visible focus ring, touch targets of at least 24px, `prefers-reduced-motion` respected, and no color literals outside the theme definition. `pnpm check:theme` and `pnpm test:stories` gate most of it.

## Commit messages and pull requests

Everything published to this repository is read by people outside it, months later, without the context that produced it. The house style is specified in [Writing for the repository](AGENTS.md#writing-for-the-repository-not-for-the-thread); in short:

- **Conventional-commit titles:** `feat(reader): …`, `fix(agent): …`, `docs: …`, `chore(release): …`.
- **Describe the change, not the reader.** State a requirement as a requirement rather than as an instruction addressed to whoever opens the page.
- **A description answers four questions:** what changed, why, what a reviewer should check, and what is not covered. Investigation narrative belongs in the `docs/` concept and its log entry, which the description links to.
- **Write what stays true after the merge.** Leave out what was running or pending at the time of writing.
- **Claims name their evidence:** the command and its result, so a reviewer can rerun it.

## Review

Pull requests are reviewed against the criteria above, and a review will ask for the missing surface when only one of three is present. Reasoned disagreement about a design call is more useful than assent; name the tradeoff in the pull request rather than working around it silently.

## Licensing

Contributions are accepted under the repository's [MIT license](LICENSE).
