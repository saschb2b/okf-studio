# OKF Studio product site

The product/download site at [saschb2b.github.io/okf-studio](https://saschb2b.github.io/okf-studio/), built with Astro. A small multi-page site shaped by [docs/product/site-evolution/](../docs/product/site-evolution/): the homepage tells one knowledge-work loop; capability depth lives on Product routes.

## Structure

- `src/pages/` - one file per route: home, `product/` (overview + explore/agents/review/git), `workflows/`, `okf/`, `download`, `404`.
- `src/data/` - the content model. `routes.ts` owns the route table, `site.ts` owns release metadata and external URLs, `nav.ts` owns primary and footer navigation, `families.ts` owns product capability copy, `workflows.ts` and `trust.ts` own the task and boundary records. Pages compose these records; a product claim has one canonical record and is never forked into page copy.
- `src/components/` - `Shell` (Base + skip link + header + footer + spotlight), `Header` (pill nav with the Product disclosure and mobile menu), `Footer` (directory), `FamilyPage` (shared capability-page shape), `CtaBand`, `Spotlight`.
- `src/layouts/Base.astro` - document head and the font imports; takes a `path` prop for per-route canonical URLs.
- `src/styles/site.css` - page and section layout composed from the token custom properties.
- `scripts/og-template.html` - the source of `public/og.png`, with its regeneration commands in the file header.

Adding a secondary capability should change one record in `src/data/families.ts` (or documentation), not the homepage. The homepage earns a change only when the product story itself changes.

## The design system is the source of truth

The visual language lives in the repo-root [`design-system/`](../design-system/) ODSF bundle, not here. `scripts/sync-ds.mjs` copies its `styles/tokens.css` and `styles/components.css` into `src/styles/design-system/` before every dev run and build, so:

- **Never edit `src/styles/design-system/*` by hand.** Change the bundle's `styles/` (and the matching concept docs) instead; the next build overwrites local edits.
- `site.css` composes page layout out of the token custom properties. No hard-coded colors, radii, or spacing; if a value doesn't exist as a token, add it to the bundle first (see `size.headline` for an example).
- After changing the bundle, validate it: `node ../.claude/skills/odsf/odsf-validate.mjs ../design-system` must report 0 errors.

Key patterns the pages compose (each documented in the bundle with a runnable example): the hero **canvas** and its floating **pill nav** with the Product **disclosure** and **mobile menu**, the **showcase section** (a two-column copy header over one full-width figure), **definition rows** for any set of parallel claims, the **code sample**, and the closing **download band**.

## Layout rules worth knowing before you edit

- **Section heads are left-aligned.** `.section__head--center` exists for the two composed surfaces only (the hero canvas and the download band), where the surface supplies the alignment.
- **Screenshots go full container width**, never in a half-width column. A 1760px capture at half of 1120px renders the app's labels at three or four pixels, which proves nothing. Story figures share one 16:9 frame cropped from the top.
- **A set of parallel items gets `.deflist` rows, not a card grid**, unless the count exactly fills the grid's rows at every breakpoint. Five cards in three columns leaves two orphans.
- **The accent (`colors.primary`) marks what a reader can click** and nothing else: links, the one primary button, focus. Not headlines, not eyebrows, not borders.

## Typography

Both typefaces are self-hosted through `@fontsource-variable/*` and imported once in `Base.astro`, so the site makes no third-party font request. Inter uses the `standard` build for its optical-size axis; only the latin subsets are downloaded, and the system stack stays behind them as the fallback.

## Commands

```bash
pnpm install
pnpm dev       # sync design system, then astro dev
pnpm build     # sync design system, then astro build (CI runs this)
pnpm preview   # serve dist/ (the site lives under /okf-studio/)
```

Deploys via the repo's Pages workflow on pushes to `main`; it is not part of the app's CI gate, so run `pnpm build` here before pushing site changes.

## Conventions

- Copy style: plain and concrete, no em dashes (matches the bundle's voice rule).
- Only claim what ships. The hero's platform line says "Windows and Linux builds; macOS from source" because there is no signed macOS build; if that changes, the line changes with it.
- Screenshots in `public/` are hand-captured from the desktop app and resized to 1760px wide (heights vary with the captured window). When the app's look changes materially, recapture them; the copy should never describe things the images don't show, and each `<img>` carries its file's real width/height. The review/Git story currently uses an honest flow diagram, not a screenshot; replace it with a real capture of the staged-review surface when one exists.
- `public/og.png` is generated from `scripts/og-template.html`, not hand-edited, so the social card cannot drift from the design system. Regenerate it whenever the headline or the hero screenshot changes.
- The version label lives once in `src/data/site.ts` and tracks the *next* release during development; download buttons always point at `releases/latest`.
- New routes must be added to `public/sitemap.xml` and get a `path` prop for their canonical URL.
