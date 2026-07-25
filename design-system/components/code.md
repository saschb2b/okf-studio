---
type: Component
title: Code sample
description: A named file and its literal contents on one surface, in two levels of emphasis rather than a syntax rainbow.
tags: [components, code, media]
status: stable
applies_to: [web]
timestamp: 2026-07-25T00:00:00Z
examples:
  - /components/code.example.html
tokens:
  code:
    background: "{colors.surface}"
    border: "{colors.border}"
    radius: "{radius.lg}"
    font: "{font.mono}"
  code-head:
    background: "{colors.surface-2}"
    color: "{colors.text-muted}"
---

# When to use
When a claim about a file format is better shown than described. A page that says knowledge is "plain Markdown with frontmatter" should print eleven lines of it; the sample is the proof, and it costs less space than the paragraph that tries to stand in for it.

Also use it for a directory listing, which is the same thing: literal contents, named.

# Anatomy
`.code` wraps an optional `.code__head` (the file path or a short caption, in mono) over a `<pre><code>` block holding the literal text. Two inline elements mark emphasis inside the block:

| Element | Renders as | Use for |
|---------|-----------|---------|
| `<b>` | `colors.text`, medium weight | Structure: keys, folder names, the parts a reader should scan first. |
| `<i>` | `colors.text-dim`, upright | Annotations and comments. |
| (plain) | `colors.text-muted` | Everything else. |

# Two levels, not twelve
There is no syntax highlighting here. A themed highlighter puts four or five saturated hues on the page, which breaks the rule that [color](/foundations/color.md) marks what a reader can act on, and it competes with the screenshots for attention. Structure against contents against annotation is enough emphasis to make an eleven-line sample scan, and it keeps the sample legible for anyone who cannot separate the hues.

# Examples
- [code.example.html](/components/code.example.html)

# Accessibility
Keep the block real text, never an image, so it can be selected, searched, and read aloud. `<pre>` scrolls horizontally rather than wrapping, so indentation stays truthful; keep sample lines under about 60 characters so that scroll is rarely needed. The `<b>` and `<i>` emphasis is redundant with position and indentation, so nothing depends on color alone.

# Do & Don't
- **Do** show a real file, at real length, from the product's own bundle.
- **Do** name the file in `.code__head` so the sample has a place in the world.
- **Don't** add syntax colors.
- **Don't** paste more than about fifteen lines; excerpt, and say that it is an excerpt.
