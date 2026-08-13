# ODSF v0.2 normative reference

A faithful, structured distillation of the Open Design System Format v0.2 specification, the profile of [OKF v0.2](../okf/spec.md). Normative keywords (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, REQUIRED) carry their RFC 2119 force. When this snapshot and the [upstream spec](https://github.com/saschb2b/Open-Design-System-Format/blob/main/SPEC.md) disagree, the upstream spec wins.

ODSF packages a **design system** as a self-contained *bundle* an AI agent can read, navigate, and apply to a task with no SDK, no platform, and no lock-in. It is a strict **profile of the [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)**: everything OKF says about bundles, concepts, frontmatter, links, `index.md`, `log.md`, and versioning holds in ODSF unchanged. Where this spec is silent, the OKF spec governs; where the two conflict for a design concern, this spec governs within an ODSF bundle. On top of OKF's container, ODSF adds three things: a token model (§4), companion HTML/CSS assets (§6), and a design type vocabulary and body conventions (§5, §7).

The one-sentence framing: **OKF told us how to bundle knowledge for an agent; design.md told us how to write down a design token; ODSF bundles a whole design system the OKF way, linked into a graph an agent navigates from a task to the rule it needs.**

## 1. Conformance

A bundle is a **conformant ODSF bundle** when both hold:

1. It is a **conformant OKF bundle.** Every non-reserved `.md` file opens with a parseable YAML frontmatter block carrying a non-empty `type` field, and reserved files (`index.md`, `log.md`) follow their OKF structure.
2. The **bundle-root `index.md` declares `odsf_version`** in its frontmatter (a `<major>.<minor>` string, e.g. `"0.2"`).

That is the whole hard requirement: be a valid OKF bundle, and say you are an ODSF one. Note the asymmetry, `odsf_version` is the only added hard rule, while `okf_version` stays OKF's own *optional* declaration, so a missing `okf_version` is a warning, never a conformance failure. Everything else (the token model, the asset conventions, the type vocabulary, the body sections) is **recommended** structure a producer SHOULD follow and a consumer SHOULD exploit but MUST tolerate the absence of. A direct consequence: **any conformant OKF bundle is one `odsf_version` line away from satisfying rule 1**, since rule 1 *is* OKF conformance, so adopting ODSF over an existing OKF bundle is a single edit plus optional enrichment, not a rebuild.

The consumer contract is OKF's, extended. A consumer **MUST NOT** reject a bundle because of:

- any condition OKF already tolerates (missing optional fields, unknown `type` values, unknown keys, broken cross-links, missing `index.md`);
- a missing, partial, or unknown `tokens` block;
- a concept that references a companion asset (HTML/CSS) that is absent;
- an unknown ODSF concept type;
- a missing `styles/` directory or `tokens.css`.

Producers aim to be precise; consumers aim to be forgiving. An OKF-only consumer (a graph viewer, a generic agent) can read an ODSF bundle and lose only the design-specific niceties.

## 2. Bundle structure

An ODSF bundle is an OKF bundle whose directories are organized by **design domain**, with non-markdown **assets** (HTML, CSS) living beside the concepts they illustrate.

```
bundle/
  index.md                      bundle-root listing; declares odsf_version (+ okf_version)
  log.md                        chronological change history
  overview.md                   type: Design System (the bundle-level overview)
  foundations/                  the design language: tokens and their meaning
    color.md  typography.md  spacing.md  elevation.md  shape.md  motion.md  layout.md
  components/                   reusable UI elements, each with a runnable example
    button.md  button.example.html  card.md  card.example.html
  patterns/                     compositions of components solving a recurring need
    form.md  form.example.html
  behaviors/                    interaction and state rules
    focus-visible.md
  guidelines/                   do/don't principles with rationale
    color-not-alone.md  color-not-alone.dont.html
  styles/                       the token set projected as consumable CSS (assets)
    tokens.css  components.css
  references/                   external sources mirrored as concepts (OKF carryover)
    design-md.md                type: Reference
```

Domain folders are a recommendation, not a requirement; the real relationship graph is the links (§8), which cross the hierarchy freely. The folders above are the **conventional** top-level layout a consumer SHOULD expect.

### Concepts vs. assets

ODSF bundles contain exactly three file kinds:

| Kind | Extension | Frontmatter? | Role |
| --- | --- | --- | --- |
| **Concept** | `.md` | Yes (REQUIRED `type`) | A unit of design knowledge. The thing OKF conformance checks. |
| **Asset** | `.html`, `.css` | No | A concrete artifact a concept points at: a rendered example, a token stylesheet, component CSS. |

Assets are **not** concepts and are **not** subject to OKF's frontmatter rule. They exist only to be referenced by concepts (§6). A bundle SHOULD contain no file types other than `.md`, `.html`, and `.css`; a producer that needs another format (an image, a font) SHOULD link it by URL from a concept rather than embedding a fourth file type, keeping the bundle text-only, diffable, and portable. Reserved filenames (`index.md`, `log.md`) keep their OKF meaning at every level.

## 3. Concept documents

A concept is OKF's: a YAML frontmatter block followed by a structural-markdown body. Its identity is its path minus `.md` (`components/button.md` ⇒ concept `components/button`). ODSF uses OKF's recommended fields (`title`, `description`, `resource`, `tags`) unchanged, inherits the whole v0.2 provenance and trust layer (`sources`, `generated`, `verified`, `stale_after`, and the actor convention) unchanged, and adds these **recommended** keys, used where they apply:

| Field | Status | Type | Meaning |
| --- | --- | --- | --- |
| `type` | REQUIRED | string | The kind of design concept (§5). Descriptive, not registered. |
| `tokens` | recommended | map | Machine-readable design tokens defined or used by this concept (§4). |
| `examples` | recommended | list of paths | Companion asset files (HTML/CSS) that demonstrate this concept (§6). Bundle-absolute or relative paths. |
| `status` | recommended | string | Lifecycle. Now an OKF v0.2 key, so see the reconciliation below before using `experimental`. |
| `applies_to` | optional | list of strings | Platforms or surfaces this concept governs (e.g. `[web, ios]`). Absent means "all". |

As in OKF, producers **MAY** add any other keys, and consumers **SHOULD** preserve unknown keys and **MUST NOT** reject a document for having them. `tokens` and `examples` are conventions a design-aware consumer reads; an OKF-only consumer ignores them harmlessly.

### `status`, reconciled with OKF v0.2

ODSF v0.1 defined `status` as `stable | experimental | deprecated`. OKF v0.2 then claimed the same key with `draft | stable | deprecated`. The sets overlap on two values and disagree on one each, so a profile has to say which wins.

**OKF's set is normative; `experimental` survives as an ODSF extension.** A producer **SHOULD** prefer `draft`, `stable`, or `deprecated`, because those are what an OKF-only consumer understands and what OKF's own tooling checks. A producer **MAY** use `experimental` where the distinction is real, since design systems genuinely ship components that are neither drafts nor stable. A design-aware consumer **SHOULD** read `experimental` as "usable, but the API may move"; an OKF-only consumer sees an unrecognized value and, per OKF's tolerance contract, **MUST NOT** reject the document for it.

| Value | Meaning here | Portable to an OKF-only consumer |
| --- | --- | --- |
| `draft` | Not yet reviewed; may be incomplete | Yes |
| `stable` | Ready to build on. The default when `status` is absent | Yes |
| `experimental` | Shipped and usable, but the API may still move | ODSF only |
| `deprecated` | Kept for links and history; do not build on it | Yes |

Do not use `status` to carry freshness. That is `stale_after`, which ODSF inherits from OKF unchanged, and a token scale with a known review date should say so there rather than sitting at `experimental` forever.

## 4. The token model

A **design token** is a named, reusable design decision: a color, a font size, a spacing step, a radius, a shadow, a duration. ODSF carries tokens in **two projections of one source of truth**:

1. **Frontmatter `tokens`**, the human- and agent-readable definition, on the foundation concept that owns them (and, by reference, on the components that use them).
2. **`styles/tokens.css`**, the same tokens as CSS custom properties, ready to drop into real code or to be linked by the bundle's own example HTML.

A bundle SHOULD keep the two in sync; the foundation concept's frontmatter is the canonical definition and `tokens.css` is its mechanical projection.

**Frontmatter shape.** `tokens` is a map of **groups** to **named values**. A group is a token category (`colors`, `typography`, `spacing`, `radius`, `elevation`, `motion`, `breakpoints`, …); within it, each key is a token name and each value is a string or a small map of sub-properties (for composite tokens like a type style). The category names are conventional, mirroring design.md, and a consumer SHOULD recognize them; producers MAY add categories their system needs.

**Token references.** A token value, or prose, MAY reference another token with the **`{group.name}` syntax** (design.md's). A component's tokens point at foundation tokens rather than restating values:

```yaml
# components/button.md
tokens:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    radius: "{radius.md}"
    padding: "{spacing.sm} {spacing.md}"
```

A consumer SHOULD resolve `{group.name}` against the bundle's foundation tokens. An unresolved reference (the target token does not exist) is **tolerated**, like a broken link: the consumer keeps the literal `{…}` string rather than failing.

**The CSS projection.** Each token path maps to a CSS custom property by joining its segments with hyphens and prefixing `--`:

```
colors.primary            →  --colors-primary
spacing.md                →  --spacing-md
typography.body.fontSize  →  --typography-body-fontSize
```

`styles/tokens.css` SHOULD define these under `:root` so any example HTML (and any code the agent writes) consumes the identical values. This two-projection model is the core of ODSF's "more": design.md stopped at frontmatter tokens; ODSF also ships the runnable CSS, so the gap between *describing* the system and *using* it disappears.

**What projects, and what a reference becomes.** Only **foundation** tokens project to `tokens.css`, each as its **resolved literal value** (`--colors-primary: #3b5bdb`). A **component** token entry (`button-primary.backgroundColor: "{colors.primary}"`) does **not** get a `--button-primary-backgroundColor` custom property; it is realized as a rule in `styles/components.css` that consumes the foundation property with `var(--…)` (`.btn--primary { background: var(--colors-primary); }`). So a `{group.name}` reference never appears verbatim in CSS: in `tokens.css` it is already the literal value, and in `components.css` it is `var(--…)`. Emitting the literal `{…}` string into CSS is always wrong.

**The projection is forward-only.** The segment-join (`a.b.c → --a-b-c`) is a one-way emit, not a guaranteed-reversible mapping, because a hyphenated token name (`colors.on-primary → --colors-on-primary`) is indistinguishable from a nested split (`colors.on.primary`). Keep names from colliding with a group/name split, and treat the CSS as a projection of the frontmatter (the source of truth), not a round-trip origin. Composite sub-property keys project verbatim (`typography.body.fontSize → --typography-body-fontSize`); pick one casing convention for token and sub-property names and hold it, since custom properties are case-sensitive.

**Variants and states.** A component's interactive states are expressed as **separate token entries** (design.md's convention), suffixed by state: `button-primary`, `button-primary-hover`, `button-primary-active`, `button-primary-disabled`. This keeps each state machine-readable and lets `components.css` and the example HTML stay one-to-one with the tokens. A state that introduces **no new token value** (a hover that only adds an underline, a focus ring already covered by a behavior) needs **no token entry**; show it in the component's `# Variants & States` table and in `components.css`/the example asset instead. Add a token entry only when the state changes a value.

## 5. Concept type vocabulary

As in OKF, `type` is **descriptive and open**: there is no registry and a consumer MUST tolerate unknown values. The conventional ODSF types a consumer SHOULD recognize and route on. Pick the most specific that fits; invent one when none does.

**Foundations** (the design language): `Color` (palette, semantic roles, theming), `Typography` (families, scale, text roles), `Spacing` (the spacing/sizing scale), `Elevation` (shadow/depth), `Shape` (corner radii, borders), `Motion` (durations, easings), `Layout` (grid, breakpoints, responsive rules), `Token Set` (a token group that fits no category above).

**Building blocks and rules:** `Component` (a reusable UI element; usually ships an example asset), `Pattern` (a composition of components solving a recurring problem, like a form or an empty state), `Behavior` (an interaction or state rule spanning components, like focus or loading), `Guideline` (a do/don't principle with rationale), `Accessibility` (a requirement like contrast, focus order, ARIA, motion-reduction), `Voice` (tone and microcopy).

**Container and external:** `Design System` (the bundle-level overview concept), `Reference` (an external source mirrored into the bundle, OKF carryover, like design.md or a brand site).

## 6. Companion assets

The asset is what makes an ODSF bundle *transferable* rather than merely *descriptive*. A concept SHOULD ship one or more concrete artifacts an agent can read and copy.

**Naming convention.** An asset shares its concept's basename, plus a **role suffix**, plus its extension:

| Asset | Role |
| --- | --- |
| `<concept>.example.html` | The canonical, correct usage. SHOULD be self-rendering. |
| `<concept>.do.html` | A correct example in a do/don't pair. |
| `<concept>.dont.html` | The matching counter-example, the mistake the guideline forbids. |
| `<concept>.css` | Styles specific to this concept, when not in a shared stylesheet. |

A concept declares its assets in the `examples` frontmatter list and SHOULD link them from an `# Examples` body section so both an index and a reader find them. A counter-example (`*.dont.html`) is also declared under `examples`; the body distinguishes it from the correct one.

**The shared stylesheet.** `styles/components.css` is the asset that carries the actual CSS rules the example HTML renders with, the realization of every component's `tokens` entries (§4): each rule consumes the foundation custom properties from `tokens.css` with `var(--…)`, never a hard-coded value, so a token change re-renders every example. It is where a component's `{group.name}` tokens become real CSS. A `<concept>.css` file is for styles specific to one concept that do not belong in the shared sheet.

**Class-naming contract.** The example assets are the consumer's copy source (§11), so they SHOULD share one class-naming convention, or a multi-component bundle becomes incoherent to copy from. ODSF's default, shown throughout and used by the reference bundles, is BEM: a block (`.btn`), a modifier (`.btn--primary`), an element (`.btn__label`). A producer MAY choose another convention but SHOULD apply it uniformly across every example and document it in the `Design System` overview.

**Self-rendering examples.** An `*.example.html` file SHOULD be a **complete, standalone HTML document** that renders correctly when opened directly in a browser, with **no build step**. It SHOULD pull the system's tokens by linking the bundle stylesheets (`tokens.css` for the values, `components.css` for the class rules) rather than hard-coding values. An asset links its stylesheets with **relative** paths (`../styles/tokens.css`), not the bundle-absolute form recommended for concept cross-links (§8): a relative path resolves both over `file://` and when served, so the example renders on a double-click. Because the example links the stylesheets, it stays truthful automatically: change a token, and every example re-renders. Keep examples **minimal**: the markup for the one thing the concept teaches, not a page of chrome around it.

**Dynamic and transient states.** An asset carries no JavaScript, so a state with no static look (loading, async, an open menu) is **snapshotted**: render it frozen with the right ARIA (`aria-busy="true"` for loading, `aria-expanded` for a disclosure) and a static indicator, or show it as a `*.dont.html` / `*.do.html` pair. Document the state in the component's `# Variants & States` table either way.

**Do / Don't pairs.** A `Guideline` or `Component` MAY ship a `*.do.html` / `*.dont.html` pair so the agent sees both the intended result and the specific failure to avoid. The concept's body explains *why* the don't is wrong; the asset shows *what* it looks like.

**Keep the table and the asset in sync.** Every row in a component's `# Variants & States` table SHOULD have a matching element in its example asset, and every variant in the example SHOULD be documented in the table. The validator checks that a declared asset exists, not that it covers every variant, so this one is on the producer.

## 7. Body conventions

The body is structural markdown (OKF §4). Beyond OKF's `# Schema`, `# Examples`, and `# Computation`, ODSF defines **conventional headings per type**, used when they apply. Provenance is no longer a body section in either format: sources live in `sources` frontmatter, and a claim is attributed with a footnote keyed to a source `id`.

- **Foundation concepts** (`Color`, `Typography`, `Spacing`, …): `# Tokens` (a name / value / usage table), `# Roles` (semantic meaning of each token), `# Usage`, `# Do & Don't`.
- **`Component`:** `# Anatomy`, `# Tokens` (the component's tokens and the foundation tokens they resolve to), `# Variants & States`, `# Examples` (links to the example assets), `# Behavior` (links to `Behavior` concepts), `# Accessibility`, `# Do & Don't`.
- **`Pattern`:** `# When to use`, `# Composition` (the linked components it assembles), `# Example`, `# Do & Don't`.
- **`Behavior`:** `# Rule`, `# States`, `# Example`, `# Accessibility`.
- **`Guideline`:** `# Rule` (one sentence), `# Why`, `# Do`, `# Don't` (linking the do/don't assets).

A consistent `# Do & Don't` section, with linked `*.do.html` / `*.dont.html` assets, is the single highest-value convention for steering an agent away from plausible-but-wrong output.

## 8. Cross-linking

ODSF uses OKF's links unchanged. Concepts link with standard markdown links, **bundle-absolute** (`/foundations/color.md`, recommended for stability) or relative. A link asserts a relationship whose meaning lives in the surrounding prose; the link is the edge, the prose is the label. Broken links are tolerated.

Relationships a producer SHOULD wire and label in prose:

- a `Component` → the foundation `Color`/`Typography`/`Spacing` concepts whose tokens it uses;
- a `Component` → the `Behavior` concepts that govern its interaction;
- a `Pattern` → the `Component` concepts it composes;
- any concept → the `Guideline` and `Accessibility` concepts that constrain it.

The result is a graph an agent walks from a task ("build a sign-up form") to the patterns, components, tokens, behaviors, and rules it needs, the same progressive-disclosure traversal OKF defines, specialized to design.

## 9. index.md and log.md

Identical to OKF. An `index.md` MAY appear in any directory and carries no frontmatter, except the **bundle-root `index.md`**, which carries the version declaration (§10) and is the one place ODSF frontmatter on an index is permitted. Each `index.md` lists its directory's concepts as a bulleted set of described links for progressive disclosure. `log.md` is a flat, newest-first list of `## YYYY-MM-DD` (ISO 8601) date headings with prose entries (`**Creation**`, `**Update**`, `**Deprecation**` by convention).

## 10. Versioning

ODSF versions independently of OKF. The bundle-root `index.md` frontmatter declares **both**:

```yaml
---
odsf_version: "0.2"
okf_version: "0.2"
---
```

`odsf_version` is REQUIRED for ODSF conformance (§1); `okf_version` is OKF's own optional declaration and SHOULD be present so OKF consumers know which container version they hold. Both use `<major>.<minor>`; minor versions are backward-compatible additions, a major version signals a breaking change. A consumer that does not understand a declared version SHOULD attempt best-effort consumption rather than refuse the bundle.

**ODSF v0.2 tracks OKF v0.2.** The two numbers are kept aligned so "ODSF 0.2 profiles OKF 0.2" needs no lookup table, but they remain independent keys: a future ODSF revision against an unchanged OKF would move only `odsf_version`.

### Changes from ODSF v0.1

ODSF's own additions (the token model, assets, the design type vocabulary, the body headings) are unchanged. Everything that moved, moved because the OKF container underneath it did:

| v0.1 | v0.2 |
| --- | --- |
| `timestamp: <ISO>` on a concept | `generated: { by, at }`, with the actor convention |
| `# Citations` body section | `sources` frontmatter, with footnote attribution |
| `status: stable\|experimental\|deprecated` | OKF's `draft\|stable\|deprecated`, with `experimental` retained as an ODSF extension (§4) |
| no freshness signal | `stale_after`, inherited |
| no trust signal | `verified` and trust tiers, inherited |

Migrating an ODSF v0.1 bundle is therefore OKF's `migrate` procedure plus one line: bump `odsf_version` to `"0.2"`. The same caution applies most of all to `verified`. Do not backfill confirmations that never happened; an unreviewed component spec that claims human review is worse than one that admits it is unverified.

## 11. Consuming an ODSF bundle

How an agent SHOULD use a bundle when handed a design task:

1. **Orient.** Read the bundle-root `index.md` and the `Design System` overview concept for the system's principles and the lay of the land.
2. **Pull foundations.** Load the foundation tokens relevant to the task, or simply link/inline `styles/tokens.css`, the runnable projection of all of them.
3. **Descend by need.** Follow `index.md` listings and cross-links to the `Component`, `Pattern`, and `Behavior` concepts the task requires; don't read the whole bundle.
4. **Copy from the assets.** Reproduce structure, class names, and attributes from the relevant `*.example.html`. The example *uses* the classes; `styles/components.css` *defines* them (and `tokens.css` defines the values they consume), so read `components.css` for the class contract and any layout primitives (`.stack`, `.row`) and state rules (`:focus-visible`) the example references but does not itself define.
5. **When a concept you need is absent, degrade, don't stall.** A partial bundle is the normal case. If the **Pattern** you need is missing, compose it from the **Components** it would contain (stack them with the bundle's layout primitives). If a **Component** is missing, reach for the nearest typed sibling (a password field is the text input with `type="password"`) or build a primitive from foundation tokens. If a **token** is missing, keep the literal `{ref}` or pick the closest defined value. Note what you improvised.
6. **Respect the rules.** Honor the `Guideline` and `Accessibility` concepts in scope, and the `*.dont.html` counter-examples, so the output avoids the system's known failure modes.
7. **Stay forgiving.** Tolerate everything optional (missing tokens, absent assets, unknown types, broken links). Never refuse a bundle over them.

**Emitting into a host app.** Copying tokens into real product code is not the same as linking them from a bundle example. Prefer linking or `@import`-ing `tokens.css`, or inline only the `:root` subset you use, or translate to the app's own token system. A bundle stylesheet may carry `@import` and global rules (a `body {}`) you do not want to paste verbatim into a host app; take the custom properties, leave the page chrome.

An agent that also edits the bundle becomes a producer: it follows the ripple checklist (a token or variant change touches the foundation, `tokens.css`, the component's tokens, `components.css`, the example, the `# Variants & States` table, every changed concept's `generated`, `log.md`, and the indexes only if a concept was added/renamed/removed), then re-validates. The producer commands spell this out (see the `edit` command).

## 12. Non-goals

ODSF deliberately does not:

- **Define a closed taxonomy.** `type` and token categories are open by design (OKF's principle). The vocabulary in §5 is conventional, not exhaustive.
- **Replace a design-token standard.** ODSF *carries* tokens and stays *compatible* with the [W3C DTCG format](https://www.designtokens.org/) and Tailwind (the frontmatter shape is deliberately design.md-compatible, so values map cleanly both ways); it does not redefine them. That compatibility is a shape claim, not a turnkey exporter, there is no built-in DTCG/Tailwind import or export command, so a conversion is a producer task you script per project, and the forward-only projection (§4) means a CSS-to-token round-trip is best-effort, not lossless.
- **Be a component framework or runtime.** Example assets are vanilla HTML/CSS that teach structure and styling, not a React/Vue/Web-Components library. A bundle describes a system; it does not ship one.
- **Prescribe tooling or a platform.** A bundle is just files. No SDK, account, or service is required to read, write, or serve one.
- **Validate visual correctness.** The spec checks structure (is it a conformant bundle), not taste (is the design good). Contrast and reference checks are advisory lints, not gates.

## 13. Relationship to OKF and design.md

ODSF sits between the two it builds on. **OKF** gives the *container*: the bundle, the concept, the one-field conformance rule, links, indexes, logs, versioning, and the producer/consumer independence that makes a bundle portable; ODSF inherits all of it and stays a strict OKF profile, so OKF tooling reads ODSF bundles unchanged. **design.md** gives the *content seed*: frontmatter design tokens, the `{group.name}` reference syntax, variant/state entries, and the do/don't framing; ODSF embraces that token model and keeps it compatible. **ODSF adds the rest**: first-class `Pattern` / `Behavior` / `Guideline` / `Accessibility` concepts, the OKF-style graph that ties a task to exactly the design knowledge it needs, a runnable `tokens.css` projection, and companion HTML/CSS assets that make an example concrete rather than paraphrased.

## 14. Design principles

- **A profile, not a fork.** ODSF adds the minimum to OKF to make design systems first-class and keeps every ODSF bundle a valid OKF bundle. One new hard rule, the rest recommended.
- **Two projections, one truth.** Tokens live once and appear twice (agent-readable frontmatter and runnable CSS), so describing the system and using it never diverge.
- **Show, don't just tell.** Every concept can ship a concrete, self-rendering artifact. An agent copies a correct example far more reliably than it follows prose.
- **Forgiving by default.** A consumer degrades gracefully through every missing optional part, down to "a pile of typed markdown," which is still useful. Adoption beats enforcement.
- **Format, not platform.** No cloud, model, framework, or account is ever required to read, write, or serve a bundle. ODSF's value is in being a shared format, not in owning it.

## Reference material

The upstream repo ([saschb2b/Open-Design-System-Format](https://github.com/saschb2b/Open-Design-System-Format)) ships the full spec, a [philosophy doc](https://github.com/saschb2b/Open-Design-System-Format/blob/main/PHILOSOPHY.md), copy-paste [templates](https://github.com/saschb2b/Open-Design-System-Format/blob/main/TEMPLATES.md), a zero-dependency validator, a single-file HTML viewer (the reference consumer), and three browsable example bundles cloning Anthropic's Claude (a fixed warm brand), GitHub's Primer (a theme-able light/dark system), and Vercel's Geist (a monochrome 70-component library). They show the format spans a fixed brand voice, a multi-mode component library, and a comprehensive system, all in the same bundle shape.
