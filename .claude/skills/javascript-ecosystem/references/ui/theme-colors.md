---
type: Library Notes
title: "Theme colors (full teachable reference)"
description: "Self-contained reference for role-based color so this skill teaches it without any other skill installed."
tags: [javascript, ui]
timestamp: 2026-06-05T00:00:00Z
---
# Theme colors (full teachable reference)

Self-contained reference for role-based color so this skill teaches it without any other skill installed. The standalone **theme-colors** skill is an optional deeper dive on the same material.

## Rule

Every color comes from the theme. No hex literals, no `rgba()` strings, no scattered values. Components reference a role; the theme defines the value once. The most common LLM failure mode is hex sprinkled through components (`color: "#3B82F6"`).

## The 10 roles

| Role | Used for |
| --- | --- |
| `primary` | Main buttons, active tabs, key highlights |
| `secondary` | Switches, FABs, selection controls |
| `error` | Error messages, delete buttons |
| `warning` | Warning banners, risky-action confirmations |
| `info` | Tooltips, info badges, help text |
| `success` | Success notifications, completion |
| `background.default` | The app's base background |
| `background.paper` | Cards, dialogs, dropdowns, menus, drawers |
| `text.primary` | Headings, body text |
| `text.secondary` | Captions, timestamps, helper text |

Each role auto-derives `.light`, `.dark`, and `.contrastText`. Use the defaults.

## Writing UI

```tsx
// Do
<Box sx={{ color: "text.primary", bgcolor: "background.paper" }}>
  <Button color="primary">Save</Button>
</Box>

// Not
<Box sx={{ color: "#1E293B", bgcolor: "#FFFFFF" }}>
  <Button sx={{ bgcolor: "#3B82F6" }}>Save</Button>
</Box>
```

For transparency, use `alpha()` against a theme color, never a literal `rgba()`:

```tsx
import { alpha } from "@mui/material";

sx={(theme) => ({ bgcolor: alpha(theme.palette.secondary.main, 0.08) })}
```

For gradients and other string-typed CSS, use the `sx` callback so the theme is available:

```tsx
sx={(theme) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
})}
```

## Three places a hex literal is appropriate

1. The theme definition itself (`createTheme({ palette: { primary: { main: "#6366F1" } } })`).
2. Custom palette extensions that do not fit a role (brand accents, data-viz palettes). Add them to the theme as named entries, then reference by name.
3. Inline SVG fragments where the color belongs to an external asset.

Everything else gets a theme token.

## Audit workflow

1. Grep for color literals:
   ```sh
   grep -rEn '(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()' src/ app/ components/
   ```
2. Leave matches inside the theme file or SVG attributes; convert everything else to a token.
3. For `rgba(R,G,B,A)`, find the role the RGB approximates and use `alpha(theme.palette.<role>.<variant>, A)` (via the `sx` callback).
4. For gradients, move stops into an `sx` callback and interpolate `theme.palette` values.
5. For named colors (`"blue"`, `"white"`), replace with the closest role.

Theme colors stay opaque; transparency lives in the component via `alpha()`.

## Source

From [Why Developers Keep Asking for Primary Instead of Blue](https://saschb2b.com/blog/designer-meets-theme). The standalone **theme-colors** skill covers the same material if installed.
