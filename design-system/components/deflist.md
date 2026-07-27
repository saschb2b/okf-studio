---
type: Component
title: Definition rows
description: A set of named claims on one hairline-divided surface, term on the left and description on the right, for counts a card grid cannot fill.
tags: [components, list, layout]
status: stable
applies_to: [web]
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
examples:
  - /components/deflist.example.html
tokens:
  deflist:
    background: "{colors.surface}"
    border: "{colors.border}"
    radius: "{radius.xl}"
  deflist-term:
    color: "{colors.text}"
  deflist-desc:
    color: "{colors.text-muted}"
---

# When to use
A set of parallel named things: product boundaries, capabilities within one area, options, guarantees. Reach for it whenever the set is longer than about four entries, or whenever its length is not fixed.

Prefer a [feature card](/components/feature-card.md) grid when there are exactly enough items to fill its rows and each one deserves equal visual weight. Prefer this when the copy is the point.

# Anatomy
A `<dl class="deflist">` of `.deflist__row` wrappers, each holding a `<dt class="deflist__term">` and a `<dd class="deflist__desc">`. A row may end with one `.deflist__link` to a detail route. Rows are separated by a `colors.border` hairline; the surface's `radius.xl` clips the first and last.

Below 860px the row collapses to one column, term above description.

# It solves the ragged-row problem
A responsive card grid places its items into whole columns, so a set whose count is not a multiple of the column count ends with a hole. Five claims in three columns render as three cards and then two, and the empty third cell reads as a card that failed to load rather than as a considered layout. The home page's boundaries and three of the four capability pages had exactly this shape.

Rows have no such arithmetic. Five entries make five rows, twelve make twelve, and the surface stays flush at every width. The left column also gives every term the same starting x-position, so a reader can scan the terms alone and stop at the one they want, which is not possible across a grid of cards.

# Density is the other reason
A capability page carrying eighteen cards is a wall of boxes: eighteen borders, eighteen paddings, and eighteen radii between the reader and the sentences. The same eighteen entries as three lists of rows lose nothing factual and take roughly half the height.

# Examples
- [deflist.example.html](/components/deflist.example.html)

# Accessibility
Use real `<dl>`, `<dt>`, and `<dd>` elements so the pairing survives without the stylesheet, and keep exactly one `<dt>` per `<dd>`. The `.deflist__row` wrapper div is permitted inside a `<dl>` and is what carries the grid.

# Do & Don't
- **Do** keep terms to about four words, so the left column stays narrow and scannable.
- **Do** use one list per group, with the group's heading above it.
- **Don't** put more than one link in a row.
- **Don't** use it for two entries; that is a card grid, and it fills its row.
