# ODSF templates

Copy, fill, validate. Every example uses bundle-absolute links (beginning with `/`) for stability; relative links are equally valid. The rules behind these shapes are in [spec.md](./spec.md); the per-command steps are in [commands.md](./commands.md). `type` is the only required field on any concept; the bundle-root `index.md` additionally must declare `odsf_version`. Drop a recommended field you cannot stand behind rather than guessing, and add domain-specific keys freely.

## Bundle-root index.md

The one `index.md` that carries frontmatter, solely to declare the versions.

```markdown
---
odsf_version: "0.1"
okf_version: "0.1"
---

# <System name>

# Overview
* [<System name>](overview.md) - Principles and how to use this bundle.

# Foundations
* [Color](foundations/color.md) - Palette and semantic color roles.
* [Typography](foundations/typography.md) - Type families, scale, and text roles.
* [Spacing](foundations/spacing.md) - The spacing and sizing scale.

# Components
* [Button](components/button.md) - Primary action control, with example.

# Patterns
* [Form](patterns/form.md) - The standard field-and-submit composition.

# Subdirectories
* [foundations/](foundations/) - The design language as tokens.
* [components/](components/) - Reusable UI elements, each with a runnable example.
* [styles/](styles/) - Runnable token and component CSS.
```

## Sub-directory index.md

No frontmatter below the root. Link the example asset inline where one exists.

```markdown
# Components

* [Button](button.md) - Primary action control. ([example](button.example.html))
```

## log.md

Newest first, ISO 8601 date headings.

```markdown
## 2026-06-23
* **Update**: Added the loading state to the button component and its example.

## 2026-06-20
* **Creation**: Documented the color and typography foundations.
```

---

## Overview concept (the Design System)

`overview.md`. The bundle-level concept an agent reads first to orient.

```markdown
---
type: Design System
title: <System name>
description: <one sentence on what the system is and its voice>
tags: [overview, design-system]
status: stable
timestamp: <YYYY-MM-DDThh:mm:ssZ>
---

# Principles
<the few convictions that explain the look and behavior>

# How to use this bundle
Start here, pull foundations from [`/styles/tokens.css`](/styles/tokens.css), descend to the
[components](/components/) and [patterns](/patterns/) the task needs, copy from the example
assets, and honor the [guidelines](/guidelines/).
```

## Foundation concept (token set)

`foundations/<name>.md`. A foundation owns a token group and is its canonical definition; keep it in sync with `/styles/tokens.css` (see `/odsf token`).

```markdown
---
type: Color            # or Typography, Spacing, Elevation, Shape, Motion, Layout, Token Set
title: Color
description: <one sentence>
tags: [foundations, color, tokens]
status: stable
timestamp: <YYYY-MM-DDThh:mm:ssZ>
tokens:
  colors:
    primary: "#3b5bdb"
    primary-hover: "#3149c0"
    on-primary: "#ffffff"
    surface: "#ffffff"
    text: "#1a1b1e"
---

# Tokens
| Token | Value | Role |
|-------|-------|------|
| `colors.primary` | `#3b5bdb` | Primary action color. |
| `colors.primary-hover` | `#3149c0` | Primary on hover. |
| `colors.on-primary` | `#ffffff` | Text/icon on a primary fill. |

# Roles
<the semantic meaning of each token, grouped>

# Usage
<when and how to apply these tokens>

# Do & Don't
- **Do** <the intended use>.
- **Don't** <the failure to avoid>.

# Citations
[1] [<source>](<url>)
```

## Component concept

`components/<name>.md`, with a `components/<name>.example.html` beside it. Reference foundation tokens with `{group.name}` rather than restating values; express states as separate entries. Every `{group.name}` here must resolve to a token defined in some foundation in the same bundle (`radius.md` below assumes a `Shape` foundation that defines it), or `odsf-validate` warns. A component's tokens do not project to `tokens.css`; they are realized as CSS rules in `styles/components.css` that consume the foundation custom properties with `var(--…)` (see the components.css template below).

```markdown
---
type: Component
title: Button
description: <one sentence>
tags: [components, button]
status: stable
applies_to: [web]
timestamp: <YYYY-MM-DDThh:mm:ssZ>
examples:
  - /components/button.example.html
tokens:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    radius: "{radius.md}"        # requires a Shape foundation defining radius.md
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
---

# Anatomy
<the parts and the class contract>

# Tokens
| Token | Resolves to |
|-------|-------------|
| `button-primary.backgroundColor` | `{colors.primary}` |

# Variants & States
<the variant/state matrix>

# Examples
- [button.example.html](/components/button.example.html) - <what it shows>.

# Behavior
- Focus follows [focus-visible](/behaviors/focus-visible.md).

# Accessibility
<requirements>

# Do & Don't
- **Do** <…>.
- **Don't** <…>.
```

## Pattern concept

`patterns/<name>.md`, optionally with `patterns/<name>.example.html`.

```markdown
---
type: Pattern
title: Form
description: <one sentence>
tags: [patterns, form]
status: stable
timestamp: <YYYY-MM-DDThh:mm:ssZ>
examples:
  - /patterns/form.example.html
---

# When to use
<the situations this pattern is for>

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Fields | [Text input](/components/text-input.md) | <notes> |
| Submit | [Button](/components/button.md) | Primary variant. |

# Example
- [form.example.html](/patterns/form.example.html)

# Do & Don't
- **Do** <…>.
- **Don't** <…>.
```

## Behavior concept

`behaviors/<name>.md`. A rule that spans components, defined once.

```markdown
---
type: Behavior
title: Focus visible
description: <one sentence>
tags: [behaviors, focus, accessibility]
status: stable
timestamp: <YYYY-MM-DDThh:mm:ssZ>
---

# Rule
<the one-rule statement, with the CSS/markup that implements it>

# States
<the states and their signals>

# Accessibility
<requirements>
```

## Guideline concept

`guidelines/<name>.md`, optionally with a `guidelines/<name>.dont.html` counter-example.

```markdown
---
type: Guideline
title: <principle>
description: <one sentence>
tags: [guidelines, do-and-dont]
status: stable
timestamp: <YYYY-MM-DDThh:mm:ssZ>
examples:
  - /guidelines/<name>.dont.html
---

# Rule
<one sentence>

# Why
<the rationale>

# Do
<the correct approach>

# Don't
<the mistake, linking the dont asset>

# Citations
[1] [<source>](<url>)
```

## External reference concept

`references/<slug>.md`. Mirror an external source (design.md, a brand site) as a concept (OKF carryover). `resource` is the live URL, `timestamp` is when you fetched it; summarize, don't paste.

```markdown
---
type: Reference
title: <source title>
description: <one sentence>
resource: <url>
tags: [reference, external]
status: stable
timestamp: <YYYY-MM-DDThh:mm:ssZ>
---

# Summary
<a transformed summary, not a copy>

# Key points
* <point>

# Citations
[1] [<source>](<url>)
```

---

## Asset: a self-rendering example

`components/<name>.example.html`. A complete, standalone document that renders in a browser with no build step, pulling the system's tokens by linking the bundle stylesheets with **relative** paths (so it renders over `file://` too). Keep the markup minimal, only the thing the concept teaches.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><System> · <Concept></title>
  <link rel="stylesheet" href="../styles/tokens.css">
  <link rel="stylesheet" href="../styles/components.css">
</head>
<body>
  <!-- The minimal, correct markup an agent should reproduce. -->
  <button type="button" class="btn btn--primary">Save changes</button>
</body>
</html>
```

## Asset: tokens.css (the token projection)

`styles/tokens.css`. The mechanical CSS projection of every foundation's `tokens` frontmatter. Token path `a.b.c` → custom property `--a-b-c`, under `:root`.

```css
:root {
  --colors-primary: #3b5bdb;
  --colors-primary-hover: #3149c0;
  --colors-on-primary: #ffffff;
  --spacing-md: 16px;
  --radius-md: 8px;
}
```

Only foundation tokens project here, as their resolved literal values. Component tokens stay as `{group.name}` entries in their concept and become rules in `components.css` below.

## Asset: components.css (the shared component styles)

`styles/components.css`. The CSS rules the example assets actually render with. It is where a component's `{group.name}` token entries are realized: each rule consumes the foundation custom properties from `tokens.css` with `var(--…)`, never a hard-coded value, so a token change re-renders every example. Use one consistent class-naming convention across every example asset (BEM is the default the templates show: `.block`, `.block--modifier`, `.block__element`); the example HTML is the consumer's copy source, so the vocabulary must stay coherent across components.

```css
/* Button: .btn base + one modifier class per variant, states via pseudo-classes. */
.btn {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 0;
  border-radius: var(--radius-md);
  font: inherit;
  cursor: pointer;
}
.btn--primary { background: var(--colors-primary); color: var(--colors-on-primary); }
.btn--primary:hover { background: var(--colors-primary-hover); }
.btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
```

A variant that the design adds (a `danger` button) is a new `.btn--danger` rule here, a `button-danger` token entry on the component, and a `--colors-danger` line in `tokens.css`. A transient state with no static look (loading) is snapshotted: show it with `aria-busy="true"` and a frozen indicator, or as a `*.dont.html` counter-example, since the asset carries no JavaScript.

---

Validate after any change:

```sh
node odsf-validate.mjs <bundle-dir>
```
