---
name: theme-colors
description: Audit and refactor UI code so every color value comes from the theme. Replace hex codes, rgba(), hsl(), oklch() literals, and named CSS colors with theme palette tokens (primary, secondary, error, warning, info, success, background, text) and the alpha() helper for transparency. Use when writing or reviewing any UI component, when starting a new MUI or design-system theme, when a designer hands off colors as hex annotations, when seeing color literals scattered across component files, or when an LLM produced styling with hardcoded hex values. Counterweight to LLM training corpora dominated by tutorial code that inlines hex codes and rgba literals instead of role-based theme tokens.
tags: [frontend, ui, css, refactor]
date: 2026-05-13
source_post: designer-meets-theme
---

# Theme Colors

## Rule

**Every color comes from the theme. No hex literals, no `rgba()` strings, no scattered values.**

A theme defines colors by role (primary, secondary, error, surface, text) once, in one place. Components reference the role, not the value. Brand changes update one file. Dark mode is the same theme with different values. Components derive their own hover, focus, and pressed transparencies from the role color via the `alpha()` helper.

The most common failure mode in LLM-generated UI is hex codes sprinkled through component files (`color: "#3B82F6"`, `bgcolor: "#1E293B"`, `background: "rgba(255,255,255,0.5)"`). Training corpora are dominated by tutorial code that hardcodes colors. The defaults skew wrong.

## The vocabulary, 10 roles

| Role | Meaning | Used for |
| --- | --- | --- |
| `primary` | Main brand color | Main buttons, active tabs, key highlights |
| `secondary` | Complementary accent | Switches, FABs, selection controls |
| `error` | Something wrong or destructive | Error messages, delete buttons |
| `warning` | Caution, not yet an error | Warning banners, risky-action confirmations |
| `info` | Neutral information, no urgency | Tooltips, info badges, help text |
| `success` | Positive outcome | Success notifications, completion |
| `background.default` | Page background ("the desk") | The app's base background |
| `background.paper` | Elevated surface ("paper on the desk") | Cards, dialogs, dropdowns, menus, drawers |
| `text.primary` | Main text, high emphasis | Headings, body text |
| `text.secondary` | De-emphasized text | Captions, timestamps, helper text |

Each role auto-derives `.light`, `.dark`, and `.contrastText`. Use the defaults; override only with a specific contrast or design reason.

## Default behavior when writing UI

Do this:

```tsx
<Box sx={{ color: "text.primary", bgcolor: "background.paper" }}>
  <Button color="primary">Save</Button>
</Box>
```

Not this:

```tsx
<Box sx={{ color: "#1E293B", bgcolor: "#FFFFFF" }}>
  <Button sx={{ bgcolor: "#3B82F6" }}>Save</Button>
</Box>
```

For transparency, use `alpha()` against a theme color, never a literal `rgba()`:

```tsx
import { alpha } from "@mui/material";

sx={(theme) => ({
  bgcolor: alpha(theme.palette.secondary.main, 0.08),
})}
```

For gradients and any other string-typed CSS that needs theme values, use the `sx` callback form so the theme is available:

```tsx
sx={(theme) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.accent.alt} 100%)`,
})}
```

## Three places where a hex literal IS appropriate

1. **The theme definition itself** (`createTheme({ palette: { primary: { main: "#6366F1" } } })`). The theme file is where hex values live, on purpose.
2. **Custom palette extensions** that do not fit a standard role: brand-specific accents, data-viz palettes with semantic meaning (e.g. green-up / red-down in finance). Add them to the theme as named entries, then reference by name from components.
3. **Inline SVG fragments** where the color belongs to an external asset (logos, icons not from the icon library). Keep the literal inside the asset itself, never scatter the same hex across other components.

Anything else gets a theme token.

## Audit workflow

1. **Grep the codebase** for color literals:
   ```sh
   grep -rEn '(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()' src/ app/ components/
   ```
2. **Classify each match.**
   - Inside the theme file or a SVG attribute, leave it.
   - Anywhere else, convert to a theme token.
3. **For `rgba(R, G, B, A)`**, identify the role the RGB approximates and replace with `alpha(theme.palette.<role>.<variant>, A)`. Use the `sx` callback when needed.
4. **For gradients with literal stops**, move them into an `sx={(theme) => ...}` callback and interpolate `theme.palette.<role>.<variant>`.
5. **For named colors used inline** (`color: "blue"`, `bg: "white"`), replace with the closest theme role.
6. **For "magic" colors not in the theme**, do not add an inline override. Either map to the closest existing role, or add a named entry to the theme and reference it from there.

## Rules of thumb

- Theme colors must be **opaque**. Transparency lives in the component via `alpha()`, not in the palette definition. A pre-diluted theme color stacks with hover/focus/pressed overlays and looks wrong.
- Resist manually overriding `.light` / `.dark` / `.contrastText` until you have a concrete contrast or design issue. The defaults are derived with perceptual contrast.
- The 10-role set is enough for most apps. Adding a 30-role palette turns the theme back into a spreadsheet of hex values with extra steps.

## Source

Based on [Why Developers Keep Asking for Primary Instead of Blue](https://saschb2b.com/blog/designer-meets-theme).
