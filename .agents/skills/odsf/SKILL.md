---
name: odsf
description: Author, validate, and maintain a design system for AI agents as a conformant Open Design System Format (ODSF) bundle, a profile (v0.1) of the Open Knowledge Format that adds design tokens, runnable HTML/CSS example assets, and design-oriented concept types. Commands init, add, token, asset, edit, enrich, link, index, log, validate, export, migrate, consume. Use when the user types /odsf or asks to package a design system for an agent, document design tokens, components, patterns, behaviors, or guidelines so an agent builds UI that matches it, make a design system or component library agent-readable or portable, adopt or migrate an OKF bundle, project tokens to CSS variables, or follow the ODSF spec. Also apply implicitly whenever you write or transform design-system knowledge an agent will build from (a token scale, a component spec, a do/don't rule), so it ships as a conformant bundle with a self-rendering example and a type per concept, and whenever you edit an existing ODSF bundle to keep it conformant.
tags: [ai-agents, design-systems, design-tokens]
date: 2026-06-23
---

# Open Design System Format (ODSF)

ODSF packages a **design system** as a self-contained *bundle* an AI agent can read, navigate, and apply to a task, with no SDK, no platform, and no lock-in. It is a strict **profile of the [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)**: everything OKF says about bundles, concepts, frontmatter, links, `index.md`, `log.md`, and versioning holds unchanged. On top of that container ODSF adds three things: a **token model** (machine-readable design tokens, design.md's seed), **companion HTML/CSS assets** so a concept ships a concrete self-rendering example, and a **design type vocabulary** so foundations, components, patterns, behaviors, and guidelines are first-class. The goal is a bundle you hand to an agent ("build this screen, adhere to this design system") that produces work that looks and behaves the way the system intends.

Use this skill two ways. Run a **command** on demand, or apply it **implicitly** whenever you shape design knowledge an agent will build from. The normative spec lives in [spec.md](./spec.md); per-command steps in [commands.md](./commands.md); copy-paste starting points in [templates.md](./templates.md).

## The two rules

A bundle is a conformant ODSF bundle when both hold: it is a **conformant OKF bundle** (every non-reserved `.md` concept opens with YAML frontmatter carrying a non-empty `type`), and the **bundle-root `index.md` declares `odsf_version`** in its frontmatter. That is the whole hard requirement: be a valid OKF bundle, and say you are an ODSF one. Everything else (the token model, the asset conventions, the type vocabulary, the body sections) is recommended structure a producer SHOULD follow and a consumer MUST tolerate the absence of. An OKF-only consumer reads an ODSF bundle and loses only the design niceties. Full conformance and the consumer contract are in [spec.md](./spec.md).

## Commands

Invoke as `/odsf <command> [target]`. Each is detailed in [commands.md](./commands.md).

| Command | What it does |
| --- | --- |
| `init` | Create a bundle. Make the directory, a root `index.md` declaring `odsf_version` and `okf_version`, and the domain folders (`foundations/`, `components/`, …). |
| `add` | Write one concept document. Pick a design `type` (§5), fill the recommended frontmatter, body it with the per-type headings (`# Tokens`, `# Anatomy`, `# Do & Don't`). |
| `token` | Define or update a foundation's `tokens` frontmatter and project it to `styles/tokens.css` (`colors.primary` → `--colors-primary`). Keep the two in sync; reference foundation tokens with `{group.name}`. |
| `asset` | Author a companion `*.example.html` (or `*.do.html` / `*.dont.html`) plus its `styles/components.css` rules (consuming tokens via `var(--…)`), that renders standalone and shows the minimal correct markup. |
| `edit` | Change an existing concept in place (a new variant, a retuned token). Follows the ripple checklist so a token change reaches `tokens.css`, `components.css`, the example, the variant table, timestamps, and the log, none skipped. |
| `enrich` | Turn a source (a token export, a component library, a docs site, a Figma spec) into concepts, then a second pass that adds tokens, assets, behaviors, and citations. |
| `link` | Connect concepts with markdown links and name the relationship in prose (a component to the foundations it uses, a pattern to the components it composes). |
| `index` | Generate or refresh `index.md` listings so an agent can navigate by progressive disclosure. |
| `log` | Append a dated `log.md` entry (Creation, Update, Deprecation), newest first. |
| `validate` | Run the conformance check. `node odsf-validate.mjs <bundle>`, or the manual checklist in [commands.md](./commands.md). |
| `export` | Convert an existing source into a conformant bundle: a token file, a component library, a Storybook, a brand site, or a design.md. The producer role. |
| `migrate` | Adopt an existing OKF bundle. Add `odsf_version` to the root `index.md` (the one required edit, since ODSF rule 1 is OKF conformance), then optionally enrich with tokens, assets, and types. |
| `consume` | Read a bundle to apply it to a design task. Orient at `index.md`, pull foundations, descend by need, copy from the example assets, honor the guidelines. |

## Implicit mode

Apply ODSF without being asked whenever design-system knowledge is being shaped for an agent to build from later:

- You are documenting a foundation (a color, typography, spacing, elevation, shape, or motion scale), a component, a pattern, a behavior, or a guideline an agent will reproduce. Write it as a concept with a design `type`, not loose prose, and ship its example asset.
- You are defining design tokens. Carry them as frontmatter `tokens` on the foundation that owns them and project them to `styles/tokens.css`, so the description and the runnable values never diverge.
- You are exporting or transforming a design system, a token set, or a component library for an agent. Emit a bundle, not a JSON blob or a screenshot.
- You are editing an existing ODSF bundle (a new variant, a retuned token, a deprecated state). Keep it conformant as you go, and follow the `edit` ripple checklist in [commands.md](./commands.md): a token change reaches the foundation, `tokens.css`, the component's tokens, `components.css`, the example asset, the `# Variants & States` table, every touched concept's `timestamp`, and `log.md` (the indexes and links only if the set of concepts or relationships changed). This is where bundles silently rot if you skip a step.

**Guard.** ODSF is for a design system an agent builds from, not human-only design prose. A brand deck, a Figma board, or a marketing page for people is not a bundle. When it is unclear whether an artifact is agent-facing, ask before converting it. Knowledge that is not design-specific (a data table, a runbook, an API) is plain [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), not ODSF.

## Concepts and assets at a glance

An ODSF bundle holds exactly three file kinds. A concept's identity is its path minus `.md`, so `components/button.md` is the concept `components/button`.

- **Concept** (`.md`, carries frontmatter, REQUIRED `type`). A unit of design knowledge. `type` is descriptive and open; the conventional values are the foundations (`Color`, `Typography`, `Spacing`, `Elevation`, `Shape`, `Motion`, `Layout`), the building blocks (`Component`, `Pattern`, `Behavior`, `Guideline`, `Accessibility`, `Voice`), and the containers (`Design System`, `Reference`). Recommended frontmatter beyond OKF's: `tokens` (§4), `examples` (asset paths), `status` (`stable`/`experimental`/`deprecated`), `applies_to`.
- **Asset** (`.html`, `.css`, no frontmatter). A concrete artifact a concept points at. A `<concept>.example.html` is the canonical correct usage; `<concept>.do.html` / `<concept>.dont.html` are a contrastive pair; `styles/tokens.css` and `styles/components.css` are the shared stylesheets. Assets are not concepts and are exempt from the `type` rule; they exist to be referenced. A bundle SHOULD contain no file types other than `.md`, `.html`, and `.css`.
- **Reserved** (`index.md`, `log.md`). Keep their OKF meaning at every level. Only the bundle-root `index.md` carries frontmatter, solely to declare the versions.

## The token model

Tokens live once and appear twice, so the agent and the code it writes consume the same values:

- **Frontmatter `tokens`** on the foundation concept that owns them is the canonical, agent-readable definition. It is a map of groups (`colors`, `spacing`, `typography`, `radius`, `motion`, …) to named values; a value may be a string or a small map for composite tokens. A component references foundation tokens with the `{group.name}` syntax rather than restating values, and expresses interactive states as separate suffixed entries (`button-primary`, `button-primary-hover`).
- **`styles/tokens.css`** is the mechanical projection of the **foundation** tokens as CSS custom properties: token path `a.b.c` → `--a-b-c`, each as its resolved literal value, under `:root`. A **component** token does not project to a custom property; it becomes a rule in **`styles/components.css`** that consumes the foundation property with `var(--…)` (`.btn--primary { background: var(--colors-primary); }`). A `{group.name}` reference never appears verbatim in CSS. Keep the projections in sync (`/odsf token`); the frontmatter is the source of truth. Example assets share one class-naming convention (BEM by default) so a consumer can copy across components coherently.

This is ODSF's core "more": design.md stopped at frontmatter tokens; ODSF also ships the runnable CSS and the example that links it, so describing the system and using it never diverge.

## Validate

Run the bundled checker against a bundle directory:

```sh
node odsf-validate.mjs path/to/bundle
```

It errors (exit 1) only on the hard requirements (a concept missing frontmatter or a non-empty `type`, or a root `index.md` that does not declare `odsf_version`) and warns, without failing, on the soft guidance a permissive consumer tolerates: a missing `okf_version`, a referenced example asset that is absent, an unresolved `{group.name}` token reference, a broken cross-link, a non-ISO `log.md` date, or a file that is not `.md`/`.html`/`.css`. The reviewer's checklist behind the script is in [commands.md](./commands.md).

## Files in this skill

- [spec.md](./spec.md). The full ODSF v0.1 normative reference (conformance, the token model, the type vocabulary, assets, body conventions, versioning, non-goals).
- [commands.md](./commands.md). Each command end to end, with the files it touches and the validate checklist.
- [templates.md](./templates.md). Concept shells per type (foundation, component, pattern, behavior, guideline, reference), root and sub `index.md`, `log.md`, plus the self-rendering example and `tokens.css` asset templates.
- [odsf-validate.mjs](./odsf-validate.mjs). The zero-dependency conformance checker.

## Source

ODSF is published at [saschb2b/Open-Design-System-Format](https://github.com/saschb2b/Open-Design-System-Format) (spec, philosophy, templates, a zero-dependency validator, a single-file viewer, and three browsable example bundles cloning Claude, GitHub Primer, and Vercel Geist). It builds on Google Cloud's [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog) (the container) and Google Labs' [design.md](https://github.com/google-labs-code/design.md) (the token model). ODSF v0.1 is an early, intentionally minimal standard designed for backward-compatible growth, so re-check the spec for fields added after this snapshot.
