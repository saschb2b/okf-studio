# OKF Studio marketing site

The landing/download page at [saschb2b.github.io/okf-viewer](https://saschb2b.github.io/okf-viewer/), built with Astro. One page (`src/pages/index.astro`), one layout (`src/layouts/Base.astro`), and page styles in `src/styles/site.css`.

## The design system is the source of truth

The visual language lives in the repo-root [`design-system/`](../design-system/) ODSF bundle, not here. `scripts/sync-ds.mjs` copies its `styles/tokens.css` and `styles/components.css` into `src/styles/design-system/` before every dev run and build, so:

- **Never edit `src/styles/design-system/*` by hand.** Change the bundle's `styles/` (and the matching concept docs) instead; the next build overwrites local edits.
- `site.css` composes page layout out of the token custom properties. No hard-coded colors, radii, or spacing; if a value doesn't exist as a token, add it to the bundle first (see `size.canvas` for an example).
- After changing the bundle, validate it: `node ../.claude/skills/odsf/odsf-validate.mjs ../design-system` must report 0 errors.

Key patterns the page composes (each documented in the bundle with a runnable example): the hero **canvas** and its floating **pill nav**, the **showcase panels** with flush media, and the closing **download band**.

## Commands

```bash
pnpm install
pnpm dev       # sync design system, then astro dev
pnpm build     # sync design system, then astro build (CI runs this)
pnpm preview   # serve dist/ (the site lives under /okf-viewer/)
```

Deploys via the repo's Pages workflow on pushes to `main`; it is not part of the app's CI gate, so run `pnpm build` here before pushing site changes.

## Conventions

- Copy style: plain and concrete, no em dashes (matches the bundle's voice rule).
- Screenshots in `public/` are hand-captured from the desktop app and resized to 1760px wide (heights vary with the captured window). When the app's look changes materially, recapture them; the copy should never describe things the images don't show, and each `<img>` carries its file's real width/height.
- The version label in `index.astro` (and `softwareVersion` in `Base.astro`) tracks the *next* release during development; download buttons always point at `releases/latest`.
