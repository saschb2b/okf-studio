# ODSF commands

Each command is a verb over a bundle. They share one invariant: when a command finishes, `node odsf-validate.mjs <bundle>` still passes. The normative rules each step relies on are in [spec.md](./spec.md); ready-to-edit shells are in [templates.md](./templates.md). ODSF is a profile of OKF, so the OKF verbs (`init`, `add`, `enrich`, `link`, `index`, `log`, `validate`, `export`, `consume`) carry over; ODSF adds four design-specific ones: `token` and `asset` (its two new projections), `edit` (change an existing concept in place, with the ripple checklist), and `migrate` (adopt an existing OKF bundle).

## `init`: start a bundle

Create the skeleton an agent can navigate from the first file.

1. Choose the bundle root, ideally a directory in version control next to the product it styles (for example `design-system/`).
2. Write a bundle-root `index.md` whose frontmatter declares **both** `odsf_version: "0.2"` and `okf_version: "0.2"`. This is the only `index.md` allowed frontmatter.
3. Create the domain folders, not file-type folders: `foundations/`, `components/`, `patterns/`, `behaviors/`, `guidelines/`, `styles/`, and `references/` as needed.
4. Add an `overview.md` (`type: Design System`) with the system's principles, and a `log.md` with a single `Creation` entry dated today.
5. Seed `styles/tokens.css` with a `:root` block, even if empty, so examples have a stylesheet to link.

Touches: `index.md`, `overview.md`, `log.md`, `styles/tokens.css`, the directory tree. Validate before moving on.

## `add`: write one concept

Add a single concept document. Resist documenting ten components at once; one good concept with its example beats ten stubs.

1. Pick the path. The path is the identity, so `components/button.md` is the button. Never name a concept file `index.md` or `log.md`.
2. Pick a design `type` from the §5 vocabulary (`Color`, `Component`, `Pattern`, `Behavior`, `Guideline`, …). Pick the most specific that fits; invent one when none does.
3. Fill the recommended frontmatter you can stand behind: `title`, a one-sentence `description`, `tags`, `status`, `generated: { by, at }` naming the actor that wrote it and when, `sources` for anything it derives from, and where they apply `tokens`, `examples`, `stale_after`, and `applies_to`.
4. Body it with the per-type conventional headings (spec §7): a foundation gets `# Tokens` / `# Roles` / `# Usage` / `# Do & Don't`; a component gets `# Anatomy` / `# Tokens` / `# Variants & States` / `# Examples` / `# Behavior` / `# Accessibility` / `# Do & Don't`.
5. If the concept is a `Component`, `Pattern`, or `Guideline`, author its companion asset (see `asset`) and declare it in `examples`.
6. Link out to the concepts this one relates to (see `link`), add it to the directory's `index.md` (see `index`), and append a `log.md` `Creation` entry.

Touches: the new concept file, its asset(s), its directory `index.md`, `log.md`.

## `token`: define and project tokens

The first of ODSF's two additions. A token lives once and appears twice (spec §4); this command keeps the two in sync.

1. **Define** the token on the foundation concept that owns it, as frontmatter `tokens`. Group by category (`colors`, `spacing`, `typography`, `radius`, `motion`, …); a value is a string or a small map for a composite token (a type style). The foundation's frontmatter is the canonical definition.
2. **Reference, don't restate.** A component's `tokens` point at foundation tokens with the `{group.name}` syntax (`backgroundColor: "{colors.primary}"`), not a copied hex value. Express interactive states as separate suffixed entries (`button-primary`, `button-primary-hover`). A state that changes **no value** (a hover that only underlines) needs **no** entry, show it in the `# Variants & States` table and `components.css` instead.
3. **Project only the foundation tokens** to `styles/tokens.css`, each as its resolved literal value, by the mechanical rule: token path `a.b.c` → custom property `--a-b-c`, under `:root`. A **component** token entry does **not** project to a custom property; it is realized as a rule in `styles/components.css` that consumes the foundation property with `var(--…)` (`.btn--primary { background: var(--colors-primary); }`). A `{group.name}` reference never appears verbatim in CSS, emitting the literal `{…}` is always wrong (spec §4). The frontmatter is the source of truth; regenerate the affected lines whenever you add, rename, or change a token.
4. Mirror the token in the foundation's `# Tokens` table so a human reader sees name / value / role, then validate. The checker warns on any `{group.name}` that does not resolve to a defined token.

Touches: the foundation concept's frontmatter and `# Tokens` body, `styles/tokens.css`, and for every component that references the token, its `var(--…)` rule in `styles/components.css`. A *change* to an existing token ripples further, follow the `edit` checklist.

## `asset`: author a companion example

The second addition. An asset is what makes a concept *reproducible* rather than merely *described* (spec §6).

1. Name it by the concept basename plus a role suffix: `<concept>.example.html` (the canonical correct usage), `<concept>.do.html` / `<concept>.dont.html` (a contrastive pair), or `<concept>.css` (concept-specific styles).
2. **Write the CSS rules in `styles/components.css`** (the shared sheet), not inline in the HTML. This is where a component's `{group.name}` token entries become real rules: each consumes a foundation custom property with `var(--…)` (`.btn--primary { background: var(--colors-primary); }`), never a hard-coded value, so a token change re-renders every example. Use one class-naming convention across every asset, the default is BEM (`.btn`, `.btn--primary`, `.btn__label`); document it once in the `Design System` overview. A `<concept>.css` file is only for styles too specific for the shared sheet.
3. Make `*.example.html` a **complete, standalone HTML document** that renders on a double-click with no build step. Link the bundle stylesheets with **relative** paths (`../styles/tokens.css`, `../styles/components.css`) so it resolves over `file://` and when served. Keep it **minimal**: the markup for the one thing the concept teaches, with the exact element, class names, attributes, and ARIA an agent should emit, not a page of chrome.
4. **Snapshot a dynamic state** (loading, async, an open menu) the asset cannot animate: render it frozen with the right ARIA (`aria-busy="true"`) and a static indicator, or as a `*.do.html` / `*.dont.html` pair. For a `Guideline` (or a `Component` with a sharp failure mode), the do/don't pair shows both the intended result and the failure; the concept body explains *why* the don't is wrong.
5. **Cover every variant.** Each row in the component's `# Variants & States` table should have a matching element in the example, and vice versa, the validator checks that a declared asset exists, not that it is complete.
6. Declare the asset in the concept's `examples` frontmatter list and link it from an `# Examples` body section, then validate. The checker warns on a declared or linked asset that does not exist.

Touches: one or more `.html` assets, `styles/components.css`, the concept's `examples` frontmatter and `# Examples` body.

## `edit`: change an existing concept in place

The most common operation, and the one that silently rots a bundle if you skip a step. `add` writes a *new* concept; `edit` modifies one that exists (a new button variant, a retuned token, a deprecated state). Use this checklist as the ripple map: a token or variant change touches more files than the obvious one. Order matters, source of truth before projection.

Worked example, adding a `danger` button variant:

1. **Foundation token** (`foundations/color.md` frontmatter): add `danger: "#e03131"` and `on-danger: "#ffffff"` to the `colors` group, and the matching rows to its `# Tokens` table.
2. **`tokens.css`**: add `--colors-danger: #e03131;` and `--colors-on-danger: #ffffff;` under `:root` (the most-forgotten step).
3. **Component token** (`components/button.md` frontmatter): add the suffixed entry `button-danger` referencing `{colors.danger}` / `{colors.on-danger}`, plus the `-hover`/`-active`/`-disabled` siblings that the other variants carry, so `danger` is not a second-class variant. Add the rows to the component's `# Tokens` table.
4. **`components.css`**: add the `.btn--danger` rule consuming `var(--colors-danger)` / `var(--colors-on-danger)`. This is the rule that actually makes the button red.
5. **Example asset** (`components/button.example.html`): add a `<button class="btn btn--danger">` so the variant self-renders.
6. **`# Variants & States` table** (`components/button.md` body): add the `danger` row (keep it in sync with the example, step 5).
7. **Provenance**: refresh `generated` (both `by` and `at`) on *every* concept you touched, and drop any `verified` event whose subject you materially changed, here **both** `color.md` and `button.md` (a token change usually edits two concepts; the singular "the concept's `generated`" elsewhere means each one).
8. **`log.md`**: prepend a dated `**Update**` entry.
9. **What does *not* change for a variant**: `index.md` (no concept added/renamed/removed, so the listing is unchanged, per `index`), the `examples` frontmatter list (you edited an existing asset, did not add one), and cross-links (still component → color). Touch these only when the set of concepts or relationships actually changes.
10. **Validate.** `{colors.danger}` now resolves, so the warning you would have seen after step 3-but-not-step-1 is gone.

Touches (typical token/variant edit): a foundation concept, `tokens.css`, the component concept, `components.css`, the example asset, two `generated` blocks, `log.md`. Not the indexes or links unless a concept or relationship changed.

## `enrich`: turn a source into concepts

Two passes. Use this when pointing the skill at a real design system: a token export, a component library, a Storybook, a Figma spec, or a docs site.

1. **Walk the source.** Enumerate its units (every token group, every component, every documented pattern). One unit becomes one concept; one component becomes one concept plus its example asset.
2. **Structure pass.** For each unit, write one concept from the source's own data alone: a design `type`, the frontmatter you can derive (name, `description`, `status`), the `tokens` it defines or uses, and the per-type body headings. Project tokens to `tokens.css` (see `token`) and author the example (see `asset`).
3. **Web pass (optional).** Treat a list of seed URLs (the live site, a brand guideline, a design.md) as authoritative. Fetch each, and for each page either enrich existing concepts (confirm a hex, a class name, a state), mint a `references/<slug>.md` concept (`type: Reference`) for the page, or skip. Record what you read as `sources` entries, carrying `last_modified` where the page states it. Bound the crawl: cap pages and restrict to allowed hosts.
4. **Wire the graph.** Add cross-links (a component to its foundations and behaviors, a pattern to its components, any concept to the guidelines that constrain it), labeling each relationship in prose.
5. **Generate indexes and a log**, then validate. This is the heaviest command; do it in slices and validate between slices.

Touches: many concept files, their assets, `styles/tokens.css`, a `references/` subtree, `index.md` at each level, `log.md`.

## `link`: assert a relationship

Connect two concepts and say what the connection means.

1. Prefer a bundle-absolute target beginning with `/`, for example `/foundations/color.md`. It survives moving the source file within its directory. Relative targets are valid too.
2. Put the relationship in the prose around the link, not in the link. `Press darkening follows [press states only](/behaviors/press-states-only.md)` says what the edge means; the link alone does not. Wire the ODSF relationships (component → foundations and behaviors, pattern → components, anything → its guidelines).
3. A broken link is tolerated, not an error, so linking ahead of a concept you have not written yet is fine. Note it in `log.md` if you want to come back.

Touches: the source concept's body.

## `index`: refresh progressive disclosure

Keep each directory's `index.md` current so an agent can choose where to descend without reading everything.

1. For each directory, list its concepts as a bulleted set of links with a short description each, and link the example asset inline where one exists (`([example](button.example.html))`). Group under headings; link subdirectories with a trailing slash.
2. An `index.md` carries no frontmatter, except the bundle-root one, which keeps its `odsf_version` and `okf_version`.
3. Regenerate the affected `index.md` whenever you add, rename, remove, or re-describe a concept in that directory. A stale index is the most common drift.

Touches: one or more `index.md` files.

## `log`: record a change

Append a dated entry so consumers and humans can see what moved.

1. Use a `## YYYY-MM-DD` heading (ISO 8601, required), newest first.
2. Lead the entry with a bold word by convention: `**Creation**`, `**Update**`, `**Deprecation**`.
3. Log meaningful changes (a new component, a token change, a deprecated variant), not every typo. A token change is worth a line because it ripples to `tokens.css` and every example.

Touches: `log.md`.

## `validate`: check conformance

Run the script, then read the warnings with judgment.

```sh
node odsf-validate.mjs path/to/bundle
```

**Pass the bundle root itself** (the directory that contains the root `index.md`), not its parent. The version declaration is only recognized on the `index.md` at depth 0 of the path you give, so pointing the checker one level up reports a spurious `must declare odsf_version` error on an otherwise-perfect bundle. It exits non-zero only on the hard requirements. The reviewer's checklist behind it:

- **Errors (must fix).** Every non-reserved `.md` opens with frontmatter carrying a non-empty `type`, and the bundle-root `index.md` declares `odsf_version`.
- **Structure (should hold).** `index.md` has no frontmatter except the root's version declaration. `log.md` date headings are `YYYY-MM-DD`. Reserved names are not used for concepts.
- **Provenance (the inherited OKF v0.2 gate, `--strict` on a v0.2 container).** No leftover `timestamp` or `# Citations`, every `sources` entry has a `resource`, every `generated` has a `by`, and `status` is one of `draft|stable|deprecated|experimental`. Gated only once the root declares `okf_version: "0.2"`, so an ODSF bundle still on the v0.1 container stays clean.
- **Warnings (judgment).** A missing `okf_version` (recommended, never required, only `odsf_version` is the added hard rule), a referenced example asset that is absent, an unresolved `{group.name}` token reference, a broken cross-link, a non-ISO log date, an identity outside the actor convention, a `stale_after` that has passed, or a file that is not `.md`/`.html`/`.css`. None fail the bundle, because consumers tolerate them. Fix the real mistakes; leave the forward-references you meant.

`odsf-validate.mjs` runs the full OKF check plus the ODSF additions, so it is a strict superset of `okf-validate.mjs`, use it (not the OKF checker) on an ODSF bundle, or a missing `odsf_version` slips through silently. The one place it is deliberately laxer than the OKF checker is `status`, where it also accepts ODSF's `experimental` extension.

## `export`: produce a bundle from a source

The producer role: turn an existing design system into a bundle. (If your source is *already a conformant OKF bundle*, do not export, use `migrate`, it is one edit.)

**Structured sources** (a token JSON, a Tailwind config, a component library, a Storybook).

1. **Foundations first.** Map the token source to foundation concepts (a token group → a foundation), translate it into frontmatter `tokens`, and project to `styles/tokens.css`. Components reference these, so they must exist before you write components, do this pass first.
2. Map each component to a `components/<name>.md` (`type: Component`) and translate its metadata into the per-type body (`# Anatomy`, `# Variants & States`).
3. **Flatten framework markup to a vanilla asset.** A React/Vue/styled-component does not ship as-is; translate it: a styled-component or CSS-in-JS block → a `.btn`-style rule in `styles/components.css`; a `variant` prop → a modifier class (`.btn--primary`); a `theme.colors.primary` lookup → `var(--colors-primary)`; a boolean state (`loading`) → a snapshot with ARIA (spec §6). The `*.example.html` then carries the resulting class contract, the agent copies that, not your JSX.
4. **From a Storybook specifically**, the unit of truth is the story: each story's `args` seed the example markup, each `argTypes` variant becomes a `# Variants & States` row, and a `play`-function interaction becomes a `Behavior` concept.
5. Run `enrich` to add what the raw export lacks (behaviors, guidelines, accessibility), emit the tree, indexes, and a `log.md`, then validate. **At scale** (dozens of components), work in foundations-first slices and validate between them; keep the class vocabulary coherent across every example (spec §6) and the indexes fresh as you go, drift across many files is the failure mode here.

**Prose sources** (a design.md, a brand site, a docs page, a Figma spec). Fetch with your web-fetch tool, transform (don't paste) into structural concepts, mirror an external page as `references/<slug>.md` (`type: Reference`) with the URL in `resource`, a `generated: { by, at }` recording what fetched it and when, and a `sources` entry. A page is a moving target, so the concept is a dated snapshot; bound a multi-URL crawl with a page cap and an allowed-hosts list, and summarize-and-cite rather than copy a third party's text.

Note ODSF ships no turnkey DTCG/Tailwind importer or exporter, the compatibility is in the token shape (spec §12), so a conversion either way is a producer task you script per project.

The output of either path is a plain directory you can commit, tar, or drop into a larger repo.

## `migrate`: adopt an existing OKF bundle

For the natural adopter, an OKF user whose bundle already describes a design system. Because ODSF rule 1 *is* OKF conformance (spec §1), a conformant OKF bundle is one line short of ODSF. Do not rebuild it with `export`; upgrade it in place.

1. **Conform (required, one edit).** Add `odsf_version: "0.2"` to the bundle-root `index.md` frontmatter, beside the `okf_version` it already has. That alone makes `node odsf-validate.mjs` pass with zero errors, your bundle is now a conformant ODSF bundle. Switch your validator from `okf-validate.mjs` to `odsf-validate.mjs` (the strict superset) so the version rule is actually checked from here on.
2. **Enrich (optional, the upside).** Everything after step 1 is graceful gain, not conformance: lift hard-coded values out of prose into foundation `tokens` and project them with `token`; retype concepts to the §5 vocabulary (`Color`, `Component`, …); author `*.example.html` + `components.css` with `asset`; wire the graph with `link`; refresh indexes and log. Do as much or as little as you want, it is a valid bundle the whole way.

3. **If the OKF bundle is still on the v0.1 container**, run OKF's own `migrate` first (`timestamp` becomes `generated: { by, at }`, `# Citations` becomes `sources`, the root declares `okf_version: "0.2"`), then declare `odsf_version: "0.2"`. Both are cheap, and the rule that matters in both formats is the same one: name the actor truthfully and never backfill a `verified` event that did not happen.

Touches: `index.md` (the one required edit), then whatever enrichment you choose.

## `consume`: apply a bundle to a design task

The consumer role. Be forgiving by design (the spec requires it). Handed a task like "build a sign-up form, adhere to this design system":

1. **Orient** at the bundle-root `index.md` and the `Design System` overview for principles.
2. **Pull foundations:** load the relevant foundation tokens, or simply link/inline `styles/tokens.css`.
3. **Descend by need:** follow `index.md` and cross-links to the `Pattern`, `Component`, and `Behavior` concepts the task requires; don't read the whole bundle.
4. **Copy from the assets:** reproduce structure, class names, and attributes from the relevant `*.example.html`. The example *uses* the classes; `styles/components.css` *defines* them and `tokens.css` defines the values, so read `components.css` for the class contract and any layout primitives (`.stack`, `.row`) or state rules (`:focus-visible`) the example references but does not itself define.
5. **When a concept you need is absent, degrade, don't stall** (a partial bundle is normal): a missing `Pattern` → compose it from the `Component`s it would contain, stacked with the bundle's layout primitives; a missing `Component` → the nearest typed sibling (a password field is the text input with `type="password"`) or a primitive built from foundation tokens; a missing token → keep the `{ref}` literal or pick the closest value. Note what you improvised.
6. **Respect the rules:** honor the `Guideline` and `Accessibility` concepts in scope and the `*.dont.html` counter-examples.
7. **Stay forgiving:** tolerate missing tokens, absent assets, unknown types, and broken links; never refuse a bundle over them.

**Emitting into a host app** is not the same as linking from a bundle example: link or `@import` `tokens.css`, or inline only the `:root` subset you use, or translate to the app's token system, and do not paste a bundle stylesheet's `@import`s or global `body {}` rules into product code, take the custom properties, leave the chrome.

If you also modify the bundle while building (correcting a token, adding a state), you have become a producer too, follow the `edit` ripple checklist (`generated`, `tokens.css`, `components.css`, example, variant table, `log.md`), then validate.
