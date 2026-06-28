# Build and dev tooling

- [Biome](biome.md) - Biome is the maintained successor to Rome, a single Rust binary that does both lint and format, aiming to replace ESLint plus Prettier.
- [ESLint](eslint.md) - Flat config (`eslint.config.js`) became the default in v9 and is the only config system in v10, which removed the legacy `eslintrc` system entirely.
- [Node.js](node.md) - Node now strips TypeScript types natively and by default for `.ts` files (the experimental warning is gone).
- [Nx](nx.md) - "Project Crystal" (Nx 18) inverts configuration: plugins infer targets from the tool's own config files (`vite.config.ts`, `nest-cli.json`) instead of hand-written `project.json` targets.
- [Package managers (pnpm / npm / Bun)](package-managers.md) - pnpm went security-by-default in v10: no implicit pre/post-install scripts, plus a `minimumReleaseAge` cooldown to dodge zero-day supply-chain attacks.
- [Storybook](storybook.md) - Testing moved into the core via the Vitest addon: Storybook 9 rebuilt component testing on Vitest browser mode, running stories as real-browser tests, and slimmed the install by folding the former...
- [Turborepo](turborepo.md) - v2 renamed the `turbo.json` `pipeline` key to `tasks`, shipped first-class Watch Mode (`turbo watch`) and Boundaries (module-boundary enforcement), and the engine is fully Rust.
- [TypeScript](typescript.md) - Modern configs are ESM-first and strict, with verbatim module syntax.
- [Vite](vite.md) - Vite is ESM-only since v7.
